"""
Keep stored attachment links in step with eScribe.

eScribe periodically republishes a meeting, which gives every attachment on it
a new ``filestream.ashx?DocumentId=N`` URL and leaves the stored ones dead.
This module notices that and re-scrapes the meeting.

A meeting is verified by re-fetching its minutes page and comparing the
attachment URLs on it with the stored ones. The attachment files themselves
are never requested: that endpoint answers scripts with a Cloudflare challenge
(403) whether the document exists or not, so it can't tell a dead link from a
live one.

Which meetings get verified in a run, in priority order:

1. the meeting's calendar document links changed since it was last verified
   (a cheap republish signal, but it misses some cases);
2. meetings never verified;
3. meetings verified longest ago.

State lives in the ``meeting_link_checks`` table.

Usage:
    python -m ottawa_city_scraper.attachment_links --db-path datasets/ottawa_city_scraper.duckdb
    python -m ottawa_city_scraper.attachment_links --db-path ... --budget 2000 --dry-run
    python -m ottawa_city_scraper.attachment_links --db-path ... --meeting-id <id> [<id> ...]
"""
import argparse
import hashlib
import json
import logging
import random
import time
from collections.abc import Callable, Iterable
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import duckdb
import requests

from .db import upsert
from .db.connection import get_connection
from .db.schema import create_tables
from .meeting_minutes_scraper import scrape_minutes_page

logger = logging.getLogger(__name__)

STATUS_OK = "ok"
STATUS_REPAIRED = "repaired"
STATUS_FAILED = "failed"
# Dry runs only: the links differ and the meeting would be re-scraped.
STATUS_CHANGED = "changed"

DEFAULT_BUDGET = 60
# A meeting that keeps failing is retried at most once per backoff window.
FAILURE_BACKOFF_THRESHOLD = 3
FAILURE_BACKOFF = timedelta(days=7)
# Stop a run after this many fetch failures in a row (site down or challenged).
MAX_CONSECUTIVE_FETCH_FAILURES = 5
CALENDAR_CHUNK = timedelta(days=183)

# (start_date, end_date) as YYYY-MM-DD -> meetings as returned by cli.parse_meetings_payload
FetchMeetings = Callable[[str, str], list[dict[str, Any]]]


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Calendar fingerprint (fast-path republish signal)
# ---------------------------------------------------------------------------

def calendar_fingerprint(meeting: dict[str, Any]) -> str:
    """Hash of a calendar meeting's document links.

    The PDF links carry DocumentIds that are re-issued when eScribe republishes
    the meeting, so a changed fingerprint means the stored attachment links are
    probably stale. Takes a meeting as parsed by cli.parse_meetings_payload,
    with its documents unfiltered.
    """
    parts = sorted(
        "|".join(str(doc.get(key) or "") for key in ("type", "format", "language_id", "url"))
        for doc in (meeting.get("documents") or [])
        if doc.get("type") != "Video"
    )
    return hashlib.md5("\n".join(parts).encode()).hexdigest()


def fetch_calendar_fingerprints(
    con: duckdb.DuckDBPyConnection,
    fetch_meetings: FetchMeetings,
    today: date | None = None,
) -> dict[str, str]:
    """Fingerprint every calendar meeting from the earliest stored meeting to today.

    A failed calendar request only costs the fast path for the meetings in that
    chunk; they are still covered by the rolling sweep.
    """
    row = con.execute(
        "SELECT min(substr(meeting_date, 1, 10)) FROM meetings WHERE meeting_date IS NOT NULL"
    ).fetchone()
    if not row or not row[0]:
        return {}
    start = date.fromisoformat(row[0])
    end = (today or date.today()) + timedelta(days=1)

    fingerprints: dict[str, str] = {}
    chunk_start = start
    while chunk_start < end:
        chunk_end = min(chunk_start + CALENDAR_CHUNK, end)
        try:
            meetings = fetch_meetings(chunk_start.isoformat(), chunk_end.isoformat())
        except Exception as exc:
            logger.warning("Calendar request %s..%s failed: %s", chunk_start, chunk_end, exc)
        else:
            for meeting in meetings:
                if meeting.get("id"):
                    fingerprints[meeting["id"]] = calendar_fingerprint(meeting)
        chunk_start = chunk_end
    return fingerprints


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

def select_due_meetings(
    con: duckdb.DuckDBPyConnection,
    fingerprints: dict[str, str],
    budget: int | None = DEFAULT_BUDGET,
    *,
    meeting_ids: Iterable[str] | None = None,
    skip_meeting_ids: Iterable[str] = (),
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Meetings to verify this run, most urgent first, capped at ``budget``.

    ``meeting_ids`` selects exactly those meetings, ignoring budget and backoff.
    ``budget=None`` means no cap.
    """
    now = now or _now()
    rows = con.execute(
        """
        SELECT m.meeting_id, m.meeting_name, m.meeting_type, m.meeting_date,
               m.municipality, m.source_url,
               c.calendar_fingerprint, c.checked_at, c.verified_at, c.consecutive_failures
        FROM meetings m
        LEFT JOIN meeting_link_checks c ON c.meeting_id = m.meeting_id
        WHERE m.source_url IS NOT NULL AND m.source_url <> ''
        """
    ).fetchall()
    columns = (
        "meeting_id", "meeting_name", "meeting_type", "meeting_date", "municipality",
        "source_url", "stored_fingerprint", "checked_at", "verified_at", "consecutive_failures",
    )
    meetings = [dict(zip(columns, row)) for row in rows]

    if meeting_ids is not None:
        wanted = set(meeting_ids)
        return sorted(
            (m for m in meetings if m["meeting_id"] in wanted),
            key=lambda m: m["meeting_date"] or "",
        )

    skip = set(skip_meeting_ids)
    changed: list[dict[str, Any]] = []
    unverified: list[dict[str, Any]] = []
    verified: list[dict[str, Any]] = []
    for m in meetings:
        if m["meeting_id"] in skip:
            continue
        backing_off = (
            (m["consecutive_failures"] or 0) >= FAILURE_BACKOFF_THRESHOLD
            and m["checked_at"] is not None
            and now - m["checked_at"] < FAILURE_BACKOFF
        )
        if backing_off:
            continue
        current = fingerprints.get(m["meeting_id"])
        if m["stored_fingerprint"] and current and current != m["stored_fingerprint"]:
            m["reason"] = "calendar links changed"
            changed.append(m)
        elif m["verified_at"] is None:
            m["reason"] = "never verified"
            unverified.append(m)
        else:
            m["reason"] = "routine re-check"
            verified.append(m)

    changed.sort(key=lambda m: m["meeting_date"] or "", reverse=True)
    unverified.sort(key=lambda m: m["meeting_date"] or "", reverse=True)
    verified.sort(key=lambda m: m["verified_at"])
    due = changed + unverified + verified
    return due if budget is None else due[:max(budget, 0)]


# ---------------------------------------------------------------------------
# Comparing stored links with the live page
# ---------------------------------------------------------------------------

def _walk_items(scraped: dict[str, Any]) -> Iterable[dict[str, Any]]:
    agenda_items_data = scraped.get("agenda_items", {})
    items = agenda_items_data.get("agenda_items", []) if isinstance(agenda_items_data, dict) else []
    stack = list(reversed(items))
    while stack:
        item = stack.pop()
        yield item
        stack.extend(reversed(item.get("sub_agendas_items", [])))


def flatten_live_attachments(scraped: dict[str, Any]) -> list[dict[str, str]]:
    """Every {'link', 'attachment_title'} on a freshly scraped minutes page,
    including those on nested sub-items."""
    return [
        attachment
        for item in _walk_items(scraped)
        for attachment in item.get("attachments", [])
        if attachment.get("link")
    ]


def stored_attachments(con: duckdb.DuckDBPyConnection, meeting_id: str) -> list[dict[str, str]]:
    rows = con.execute(
        """
        SELECT a.url, a.attachment_title
        FROM agenda_item_attachments a
        JOIN agenda_items ai ON ai.item_id = a.item_id
        WHERE ai.meeting_id = ?
        ORDER BY a.attachment_title, a.url
        """,
        [meeting_id],
    ).fetchall()
    return [{"link": url, "attachment_title": title or ""} for url, title in rows]


def diff_links(stored: list[dict[str, str]], live: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    """Describe how a meeting's links changed, for the run report.

    Links present on only one side are paired by attachment title (titles
    survive a republish; DocumentIds don't). Whatever can't be paired is
    reported as removed or added.
    """
    stored_urls = {a["link"] for a in stored}
    live_urls = {a["link"] for a in live}
    new_by_title: dict[str, list[str]] = {}
    for a in live:
        if a["link"] not in stored_urls:
            new_by_title.setdefault(a.get("attachment_title", ""), []).append(a["link"])

    replaced: list[dict[str, str]] = []
    removed: list[dict[str, str]] = []
    for a in stored:
        if a["link"] in live_urls:
            continue
        title = a.get("attachment_title", "")
        candidates = new_by_title.get(title)
        if candidates:
            replaced.append({"attachment_title": title, "old_url": a["link"], "new_url": candidates.pop(0)})
        else:
            removed.append({"attachment_title": title, "url": a["link"]})
    added = [
        {"attachment_title": title, "url": url}
        for title, urls in new_by_title.items()
        for url in urls
    ]
    return {"replaced": replaced, "removed": removed, "added": added}


def _stored_counts(con: duckdb.DuckDBPyConnection, meeting_id: str) -> dict[str, int]:
    def count(query: str) -> int:
        return con.execute(query, [meeting_id]).fetchone()[0]

    return {
        "agenda_items": count("SELECT count(*) FROM agenda_items WHERE meeting_id = ?"),
        "motions": count("SELECT count(*) FROM motions WHERE meeting_id = ?"),
        "votes": count(
            "SELECT count(*) FROM votes v JOIN motions m ON m.motion_id = v.motion_id WHERE m.meeting_id = ?"
        ),
        "attachments": count(
            """
            SELECT count(*) FROM agenda_item_attachments a
            JOIN agenda_items ai ON ai.item_id = a.item_id WHERE ai.meeting_id = ?
            """
        ),
    }


# ---------------------------------------------------------------------------
# Tracking
# ---------------------------------------------------------------------------

def _record_check(
    con: duckdb.DuckDBPyConnection,
    meeting_id: str,
    *,
    status: str,
    now: datetime,
    fingerprint: str | None = None,
    detail: str | None = None,
) -> None:
    """Write the outcome of one verification attempt to meeting_link_checks.

    A failure keeps the stored fingerprint and verified_at, so the meeting
    stays due until a later attempt succeeds.
    """
    row = con.execute(
        """
        SELECT calendar_fingerprint, verified_at, consecutive_failures, last_repaired_at, repair_count
        FROM meeting_link_checks WHERE meeting_id = ?
        """,
        [meeting_id],
    ).fetchone()
    stored_fingerprint, verified_at, failures, last_repaired_at, repair_count = row or (None, None, 0, None, 0)

    if status == STATUS_FAILED:
        failures = (failures or 0) + 1
    else:
        failures = 0
        verified_at = now
        stored_fingerprint = fingerprint or stored_fingerprint
        if status == STATUS_REPAIRED:
            last_repaired_at = now
            repair_count = (repair_count or 0) + 1

    con.execute(
        """
        INSERT OR REPLACE INTO meeting_link_checks
            (meeting_id, calendar_fingerprint, checked_at, verified_at, status, detail,
             consecutive_failures, last_repaired_at, repair_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [meeting_id, stored_fingerprint, now, verified_at, status, detail,
         failures, last_repaired_at, repair_count or 0],
    )


def record_fresh_scrape(
    con: duckdb.DuckDBPyConnection,
    meeting_id: str,
    fingerprint: str | None,
    now: datetime | None = None,
) -> None:
    """Mark a meeting that was just scraped as verified: its links came off the
    live page a moment ago."""
    _record_check(con, meeting_id, status=STATUS_OK, now=now or _now(), fingerprint=fingerprint)


# ---------------------------------------------------------------------------
# Verify + repair
# ---------------------------------------------------------------------------

def verify_meeting(
    con: duckdb.DuckDBPyConnection,
    session: requests.Session | None,
    meeting: dict[str, Any],
    fingerprint: str | None,
    *,
    verify_cert: bool = False,
    dry_run: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Compare one meeting's stored attachment links with its live minutes page
    and re-scrape the whole meeting if they differ.

    The page is fetched and parsed before anything is deleted, and the replace
    is transactional, so a failure at any point leaves the stored meeting as it
    was. With ``dry_run`` nothing is written, tracking included.
    """
    now = now or _now()
    meeting_id = meeting["meeting_id"]
    result: dict[str, Any] = {
        "meeting_id": meeting_id,
        "meeting_name": meeting.get("meeting_name"),
        "meeting_date": meeting.get("meeting_date"),
        "source_url": meeting.get("source_url"),
        "reason": meeting.get("reason"),
    }

    def fail(detail: str, *, fetch_failed: bool = False) -> dict[str, Any]:
        if not dry_run:
            _record_check(con, meeting_id, status=STATUS_FAILED, now=now, detail=detail)
        return {**result, "status": STATUS_FAILED, "detail": detail, "fetch_failed": fetch_failed}

    try:
        scraped = scrape_minutes_page(
            url=meeting["source_url"], verify_cert=verify_cert, session=session
        )
    except Exception as exc:
        return fail(f"could not fetch or parse the minutes page: {exc}", fetch_failed=True)

    stored = stored_attachments(con, meeting_id)
    live = flatten_live_attachments(scraped)
    if {a["link"] for a in stored} == {a["link"] for a in live}:
        if not dry_run:
            _record_check(con, meeting_id, status=STATUS_OK, now=now, fingerprint=fingerprint)
        return {**result, "status": STATUS_OK}

    # The links differ. Don't replace a stored meeting with a page that parsed
    # to nothing: that is a broken page, not a republished one.
    before = _stored_counts(con, meeting_id)
    live_items = list(_walk_items(scraped))
    live_motions = sum(len(item.get("motions", [])) for item in live_items)
    if not live_items:
        return fail("live minutes page has no agenda items")
    if before["motions"] and not live_motions:
        return fail(f"live minutes page has no motions (stored: {before['motions']})")

    result["links"] = diff_links(stored, live)
    result["before"] = before
    if dry_run:
        return {**result, "status": STATUS_CHANGED}

    try:
        upsert.replace_meeting(
            con,
            meeting_id,
            {"name": meeting.get("meeting_name"), "meeting_type": meeting.get("meeting_type")},
            scraped,
            meeting.get("municipality") or "ottawa",
        )
    except Exception as exc:
        return fail(f"re-scrape could not be stored: {exc}")

    _record_check(con, meeting_id, status=STATUS_REPAIRED, now=now, fingerprint=fingerprint)
    return {**result, "status": STATUS_REPAIRED, "after": _stored_counts(con, meeting_id)}


def verify_and_repair(
    con: duckdb.DuckDBPyConnection,
    session: requests.Session | None,
    *,
    fingerprints: dict[str, str],
    budget: int | None = DEFAULT_BUDGET,
    verify_cert: bool = False,
    dry_run: bool = False,
    min_delay: float = 1.0,
    max_delay: float = 3.0,
    meeting_ids: Iterable[str] | None = None,
    skip_meeting_ids: Iterable[str] = (),
    now: datetime | None = None,
) -> dict[str, Any]:
    """Verify the meetings that are due and re-scrape those whose links changed.

    Returns the run report. ``repaired_meeting_ids`` lists the meetings whose
    stored records were replaced.
    """
    due = select_due_meetings(
        con, fingerprints, budget,
        meeting_ids=meeting_ids, skip_meeting_ids=skip_meeting_ids, now=now,
    )
    logger.info("Verifying attachment links for %d meeting(s)...", len(due))

    results: list[dict[str, Any]] = []
    fetch_failures_in_a_row = 0
    aborted = False
    for index, meeting in enumerate(due):
        result = verify_meeting(
            con, session, meeting, fingerprints.get(meeting["meeting_id"]),
            verify_cert=verify_cert, dry_run=dry_run, now=now,
        )
        results.append(result)
        label = f"{meeting.get('meeting_date') or ''} {meeting.get('meeting_name') or meeting['meeting_id']}".strip()
        if result["status"] == STATUS_FAILED:
            logger.warning("  FAILED %s — %s", label, result["detail"])
        elif result["status"] in (STATUS_REPAIRED, STATUS_CHANGED):
            links = result["links"]
            logger.info(
                "  %s %s — %d link(s) replaced, %d removed, %d added",
                "RE-SCRAPED" if result["status"] == STATUS_REPAIRED else "WOULD RE-SCRAPE",
                label, len(links["replaced"]), len(links["removed"]), len(links["added"]),
            )

        fetch_failures_in_a_row = fetch_failures_in_a_row + 1 if result.get("fetch_failed") else 0
        if fetch_failures_in_a_row >= MAX_CONSECUTIVE_FETCH_FAILURES:
            logger.warning(
                "Stopping link verification: %d minutes pages in a row could not be fetched",
                fetch_failures_in_a_row,
            )
            aborted = True
            break

        if index < len(due) - 1:
            delay = random.uniform(min_delay, max_delay)
            if delay > 0:
                time.sleep(delay)

    def with_status(status: str) -> list[dict[str, Any]]:
        return [r for r in results if r["status"] == status]

    report = {
        "run_at": (now or _now()).isoformat(),
        "dry_run": dry_run,
        "aborted": aborted,
        "totals": {
            "due": len(due),
            "checked": len(results),
            "unchanged": len(with_status(STATUS_OK)),
            "repaired": len(with_status(STATUS_REPAIRED)),
            "would_repair": len(with_status(STATUS_CHANGED)),
            "failed": len(with_status(STATUS_FAILED)),
        },
        "repaired_meeting_ids": [r["meeting_id"] for r in with_status(STATUS_REPAIRED)],
        "repaired": with_status(STATUS_REPAIRED),
        "would_repair": with_status(STATUS_CHANGED),
        "failed": with_status(STATUS_FAILED),
    }
    logger.info("Attachment link verification: %s", report["totals"])
    return report


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare stored attachment links with the live eScribe minutes pages and "
            "re-scrape meetings whose links changed."
        )
    )
    parser.add_argument(
        "--db-path", default="ottawa_council.duckdb",
        help="Path to the persistent DuckDB file (default: ottawa_council.duckdb)",
    )
    parser.add_argument(
        "--budget", type=int, default=DEFAULT_BUDGET,
        help=f"Maximum number of minutes pages to re-fetch (default: {DEFAULT_BUDGET})",
    )
    parser.add_argument(
        "--meeting-id", nargs="+", metavar="ID", default=None,
        help="Verify exactly these meetings, ignoring the budget and the queue order",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report which meetings would be re-scraped without writing to the database",
    )
    parser.add_argument(
        "--verify-cert", action="store_true",
        help="Verify TLS certificates (default: disabled for self-signed certificates)",
    )
    parser.add_argument("--min-delay", type=float, default=1.0,
                        help="Minimum seconds between minutes page fetches (default: 1.0)")
    parser.add_argument("--max-delay", type=float, default=3.0,
                        help="Maximum seconds between minutes page fetches (default: 3.0)")
    parser.add_argument(
        "--report-dir", default="datasets/attachment_reports",
        help="Directory to write the JSON report to (default: datasets/attachment_reports)",
    )
    return parser.parse_args(argv)


def write_report(report_dir: str | Path, report: dict[str, Any]) -> Path:
    report_dir = Path(report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)
    output_path = report_dir / f"attachment_links_{datetime.now():%Y%m%dT%H%M%S}.json"
    output_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    return output_path


def main(args: argparse.Namespace) -> int:
    # Imported here, not at module level: cli imports this module.
    from .cli import _build_session, calendar_meetings_fetcher

    if not Path(args.db_path).exists():
        logger.error("Database not found: %s", args.db_path)
        return 2
    con = get_connection(args.db_path)
    create_tables(con)
    session = _build_session()

    fingerprints = fetch_calendar_fingerprints(con, calendar_meetings_fetcher(session, args.verify_cert))
    report = verify_and_repair(
        con, session,
        fingerprints=fingerprints,
        budget=args.budget,
        verify_cert=args.verify_cert,
        dry_run=args.dry_run,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        meeting_ids=args.meeting_id,
    )
    con.close()

    logger.info("Report written to %s", write_report(args.report_dir, report))
    return 1 if report["totals"]["failed"] or report["aborted"] else 0


if __name__ == "__main__":
    logging.basicConfig(level="INFO", format="%(message)s")
    raise SystemExit(main(parse_args()))
