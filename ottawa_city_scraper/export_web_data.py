"""
Export DuckDB voting data as static JSON files for the frontend web UI.

Generates:
  {output_dir}/index.json                         — all dates, council terms + councillor list
  {output_dir}/dates/{YYYY-MM-DD}.json            — per-date meetings/motions/votes
  {output_dir}/councillors/{slug}.json            — per-councillor vote history and motions moved
  {output_dir}/feed.xml                           — RSS feed of recent motions
  {output_dir}/tags/index.json                    — all tags with motion counts
  {output_dir}/tags/{slug}.json                   — motions per tag

Every date, vote, motion and alignment row carries the council `term` it falls in
(see terms.py); the frontend filters by term rather than reading per-term files.

Motion summaries and tags are sourced from the motion_ai_enrichment table.
If that table is empty, motions export with summary="" and tags=[].

Usage:
    python -m ottawa_city_scraper.export_web_data
    python -m ottawa_city_scraper.export_web_data --db datasets/ottawa_city_scraper.duckdb
    python -m ottawa_city_scraper.export_web_data --output-dir frontend/public/data
"""

import argparse
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

import duckdb

from .terms import CouncillorResolver, current_term, latest_term_entry, load_councillors, load_terms, term_for_date

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "datasets" / "ottawa_city_scraper.duckdb"
DEFAULT_MUNICIPALITY = "ottawa"
DEFAULT_OUTPUT = ROOT / "frontend" / "public" / "data" / DEFAULT_MUNICIPALITY


def _to_slug(name: str) -> str:
    n = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode("ascii")
    n = n.lower().replace("&", "and")
    n = re.sub(r"[^\w\s-]", "", n)
    n = re.sub(r"[\s_]+", "-", n)
    return re.sub(r"-+", "-", n).strip("-")


def _councillor_meta(councillor: dict, terms: list[dict], current: str) -> dict:
    """Councillor fields shared by index.json and councillors/{slug}.json.

    Top-level title/ward come from the latest term served; `terms` lists every term.
    `active` means the councillor sits in the current term.
    """
    latest = latest_term_entry(councillor, terms)
    return {
        "slug": _to_slug(councillor["full_name"]),
        "full_name": councillor["full_name"],
        "first_name_initial": councillor["first_name_initial"],
        "title": latest.get("title") or "",
        "ward_number": latest.get("ward_number") or "",
        "ward_name": latest.get("ward_name") or "",
        "email": councillor.get("email") or "",
        "telephone": councillor.get("telephone") or "",
        "active": any(e["term"] == current for e in councillor.get("terms", [])),
        "terms": [
            {
                "term": e["term"],
                "title": e.get("title") or "",
                "ward_number": e.get("ward_number") or "",
                "ward_name": e.get("ward_name") or "",
                "start": e.get("start"),
                "end": e.get("end"),
            }
            for e in councillor.get("terms", [])
        ],
    }


def _write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _load_enrichments(con: duckdb.DuckDBPyConnection) -> dict[str, dict]:
    """Load all AI enrichments from motion_ai_enrichment into a dict keyed by motion_id.

    Returns an empty dict if the table doesn't exist yet or has no rows.
    Motions missing from this dict will export with summary="" and tags=[].
    """
    try:
        rows = con.execute(
            "SELECT motion_id, summary, tags FROM motion_ai_enrichment"
        ).fetchall()
    except Exception:
        return {}
    return {
        row[0]: {"summary": row[1] or "", "tags": list(row[2]) if row[2] else []}
        for row in rows
    }


# ---------------------------------------------------------------------------
# index.json
# ---------------------------------------------------------------------------

def export_index(
    con: duckdb.DuckDBPyConnection,
    councillors: list[dict],
    terms: list[dict],
    output_dir: Path,
    municipality: str,
) -> list[str]:
    """Write index.json; return sorted-descending list of dates with motion data."""
    dates = [
        row[0]
        for row in con.execute(
            """
            SELECT DISTINCT strftime('%Y-%m-%d', CAST(m.meeting_date AS DATE))
            FROM meetings m
            JOIN motions mo ON m.meeting_id = mo.meeting_id
            WHERE m.municipality = ?
            ORDER BY 1 DESC
            """,
            [municipality],
        ).fetchall()
    ]

    current = current_term(terms)
    # Everyone who has served in any term; the frontend narrows the list to the selected term.
    councillors_meta = [_councillor_meta(c, terms, current) for c in councillors]
    # Sort: Mayor first (no ward_number), then by ward_number ascending
    councillors_meta.sort(
        key=lambda c: (0 if not c["ward_number"] else 1, int(c["ward_number"]) if c["ward_number"] else 0)
    )

    _write_json(output_dir / "index.json", {
        "dates": dates,
        "terms": [{"slug": t["slug"], "label": t["label"], "start": t["start"], "end": t["end"]} for t in terms],
        "current_term": current,
        "councillors": councillors_meta,
    })
    print(f"  index.json  ({len(dates)} dates, {len(terms)} terms, {len(councillors_meta)} councillors)", file=sys.stderr)
    return dates


# ---------------------------------------------------------------------------
# dates/{YYYY-MM-DD}.json
# ---------------------------------------------------------------------------

def export_date_file(
    con: duckdb.DuckDBPyConnection,
    date: str,
    output_dir: Path,
    municipality: str,
    terms: list[dict],
    enrichments: dict[str, dict] | None = None,
) -> None:
    """Write dates/{date}.json with all meetings → agenda_items → motions → votes."""
    if enrichments is None:
        enrichments = {}

    # Fetch all meetings on this date that have at least one motion
    meetings_rows = con.execute(
        """
        SELECT DISTINCT
            m.meeting_id,
            m.meeting_name,
            m.meeting_number,
            strftime('%Y-%m-%d', CAST(m.meeting_date AS DATE)) AS meeting_date,
            m.meeting_start_time,
            m.meeting_location,
            m.source_url
        FROM meetings m
        JOIN motions mo ON m.meeting_id = mo.meeting_id
        WHERE strftime('%Y-%m-%d', CAST(m.meeting_date AS DATE)) = ?
          AND m.municipality = ?
        ORDER BY m.meeting_name
        """,
        [date, municipality],
    ).fetchall()

    if not meetings_rows:
        return

    meeting_ids = [r[0] for r in meetings_rows]
    placeholders = ", ".join("?" * len(meeting_ids))

    # Fetch attendance for these meetings
    attendance_rows = con.execute(
        f"""
        SELECT meeting_id, councillor_name, status
        FROM meeting_attendance
        WHERE meeting_id IN ({placeholders})
        ORDER BY meeting_id, councillor_name
        """,
        meeting_ids,
    ).fetchall()
    attendance_by_meeting: dict[str, list[dict]] = {r[0]: [] for r in meetings_rows}
    for att_meeting_id, councillor_name, status in attendance_rows:
        if att_meeting_id in attendance_by_meeting:
            attendance_by_meeting[att_meeting_id].append({"councillor_name": councillor_name, "status": status})

    # Fetch all agenda items for these meetings
    items_rows = con.execute(
        f"""
        SELECT
            ai.item_id,
            ai.meeting_id,
            ai.agenda_item_number,
            ai.title
        FROM agenda_items ai
        WHERE ai.meeting_id IN ({placeholders})
        ORDER BY ai.meeting_id, ai.agenda_item_number
        """,
        meeting_ids,
    ).fetchall()

    # Fetch all attachments for these agenda items
    item_ids = [r[0] for r in items_rows]
    attachments_by_item: dict[str, list[dict]] = {r[0]: [] for r in items_rows}
    if item_ids:
        att_placeholders = ", ".join("?" * len(item_ids))
        att_rows = con.execute(
            f"""
            SELECT item_id, url, attachment_title
            FROM agenda_item_attachments
            WHERE item_id IN ({att_placeholders})
            ORDER BY item_id, attachment_title
            """,
            item_ids,
        ).fetchall()
        for att_item_id, url, title in att_rows:
            if att_item_id in attachments_by_item:
                attachments_by_item[att_item_id].append({"url": url, "title": title})

    # Fetch all motions for these meetings
    motions_rows = con.execute(
        f"""
        SELECT
            mo.motion_id,
            mo.item_id,
            mo.meeting_id,
            mo.motion_number,
            mo.motion_text,
            mo.motion_moved_by,
            mo.motion_seconded_by,
            mo.motion_result,
            mo.for_count,
            mo.against_count,
            mo.vote_kind
        FROM motions mo
        WHERE mo.meeting_id IN ({placeholders})
        ORDER BY mo.item_id, mo.motion_number
        """,
        meeting_ids,
    ).fetchall()

    motion_ids = [r[0] for r in motions_rows]

    # Fetch all votes for these motions (may be empty for motions without recorded votes)
    votes_by_motion: dict[str, list[dict]] = {r[0]: [] for r in motions_rows}
    if motion_ids:
        vote_placeholders = ", ".join("?" * len(motion_ids))
        vote_rows = con.execute(
            f"""
            SELECT motion_id, councillor_name, vote
            FROM votes
            WHERE motion_id IN ({vote_placeholders})
            ORDER BY motion_id, councillor_name
            """,
            motion_ids,
        ).fetchall()
        for motion_id, councillor_name, vote in vote_rows:
            if motion_id in votes_by_motion:
                votes_by_motion[motion_id].append({"councillor_name": councillor_name, "vote": vote})

    # Build motions grouped by item_id
    motions_by_item: dict[str, list[dict]] = {}
    for (motion_id, item_id, meeting_id, motion_number, motion_text,
         motion_moved_by, motion_seconded_by, motion_result, for_count, against_count,
         vote_kind) in motions_rows:
        enrichment = enrichments.get(motion_id, {})
        votes = votes_by_motion.get(motion_id, [])
        motions_by_item.setdefault(item_id, []).append({
            "motion_id": motion_id,
            "motion_number": motion_number,
            "motion_text": (motion_text or "").strip(),
            "motion_moved_by": motion_moved_by or "",
            "motion_seconded_by": motion_seconded_by or "",
            "motion_result": motion_result or "",
            "for_count": for_count or 0,
            "against_count": against_count or 0,
            "vote_kind": vote_kind or ("recorded" if votes else "none"),
            "votes": votes,
            "summary": enrichment.get("summary", ""),
            "tags": enrichment.get("tags", []),
        })

    # Build agenda items grouped by meeting_id
    items_by_meeting: dict[str, list[dict]] = {}
    for item_id, meeting_id, agenda_item_number, title in items_rows:
        motions = motions_by_item.get(item_id, [])
        if not motions:
            continue  # skip items with no motions
        items_by_meeting.setdefault(meeting_id, []).append({
            "item_id": item_id,
            "agenda_item_number": agenda_item_number or "",
            "title": (title or "").strip(),
            "motions": motions,
            "attachments": attachments_by_item.get(item_id, []),
        })

    # Assemble meetings
    meetings = []
    for (meeting_id, meeting_name, meeting_number, meeting_date,
         meeting_start_time, meeting_location, source_url) in meetings_rows:
        agenda_items = items_by_meeting.get(meeting_id, [])
        meetings.append({
            "meeting_id": meeting_id,
            "meeting_name": meeting_name or "",
            "meeting_number": meeting_number,
            "meeting_date": meeting_date,
            "start_time": str(meeting_start_time) if meeting_start_time else "",
            "location": meeting_location or "",
            "source_url": source_url or "",
            "attendance": attendance_by_meeting.get(meeting_id, []),
            "agenda_items": agenda_items,
        })

    _write_json(output_dir / "dates" / f"{date}.json", {
        "date": date,
        "term": term_for_date(terms, date),
        "meetings": meetings,
    })


def export_all_dates(
    con: duckdb.DuckDBPyConnection,
    dates: list[str],
    output_dir: Path,
    municipality: str,
    terms: list[dict],
    enrichments: dict[str, dict] | None = None,
) -> None:
    for date in dates:
        export_date_file(con, date, output_dir, municipality, terms, enrichments=enrichments)
    print(f"  dates/  ({len(dates)} files)", file=sys.stderr)


# ---------------------------------------------------------------------------
# councillors/{slug}.json
# ---------------------------------------------------------------------------

def export_councillor_file(
    con: duckdb.DuckDBPyConnection,
    councillor: dict,
    output_dir: Path,
    terms: list[dict],
    resolver: CouncillorResolver,
    enrichments: dict[str, dict] | None = None,
) -> int:
    """Write councillors/{slug}.json; return number of votes written.

    Votes and motions are matched by name, then kept only when the meeting falls
    inside one of the councillor's term memberships, so a different person with
    the same "F. Lastname" in another term is not credited to them.
    """
    if enrichments is None:
        enrichments = {}
    full_name = councillor["full_name"]
    initial = councillor["first_name_initial"]
    slug = _to_slug(councillor["full_name"])

    rows = con.execute(
        """
        SELECT
            strftime('%Y-%m-%d', CAST(mt.meeting_date AS DATE)) AS date,
            mt.meeting_name,
            mt.meeting_id,
            mt.source_url,
            ai.agenda_item_number,
            ai.title AS item_title,
            m.motion_id,
            m.motion_number,
            m.motion_text,
            m.motion_result,
            m.for_count,
            m.against_count,
            v.vote
        FROM votes v
        JOIN motions m      ON v.motion_id  = m.motion_id
        JOIN meetings mt    ON m.meeting_id  = mt.meeting_id
        JOIN agenda_items ai ON m.item_id    = ai.item_id
        WHERE v.councillor_name = ?
        ORDER BY mt.meeting_date DESC, m.motion_number
        """,
        [initial],
    ).fetchall()

    votes = []
    for (date, meeting_name, meeting_id, source_url, agenda_item_number, item_title,
         motion_id, motion_number, motion_text, motion_result, for_count, against_count, vote) in rows:
        if resolver.resolve(initial, date) != full_name:
            continue
        enrichment = enrichments.get(motion_id, {})
        votes.append({
            "date": date,
            "term": term_for_date(terms, date),
            "meeting_name": meeting_name or "",
            "meeting_id": meeting_id,
            "source_url": source_url or "",
            "agenda_item_number": agenda_item_number or "",
            "item_title": (item_title or "").strip(),
            "motion_id": motion_id,
            "motion_number": motion_number,
            "motion_text": (motion_text or "").strip(),
            "motion_result": motion_result or "",
            "for_count": for_count or 0,
            "against_count": against_count or 0,
            "vote": vote,
            "summary": enrichment.get("summary", ""),
            "tags": enrichment.get("tags", []),
        })

    mover_rows = con.execute(
        r"""
        SELECT
            strftime('%Y-%m-%d', CAST(mt.meeting_date AS DATE)) AS date,
            mt.meeting_name,
            mt.source_url,
            ai.agenda_item_number,
            ai.title AS item_title,
            m.motion_id,
            m.motion_number,
            m.motion_text,
            m.motion_result,
            m.for_count,
            m.against_count,
            m.vote_kind,
            m.motion_moved_by
        FROM motions m
        JOIN agenda_items ai ON m.item_id = ai.item_id
        JOIN meetings mt    ON m.meeting_id = mt.meeting_id
        WHERE TRIM(REGEXP_REPLACE(m.motion_moved_by, '^(member|councillor|vice-chair|chair)\s+', '', 'i'))
              IN (?, ?)
        ORDER BY mt.meeting_date DESC, m.motion_number
        """,
        [initial, councillor["full_name"]],
    ).fetchall()

    motions_moved = []
    for (date, meeting_name, source_url, agenda_item_number, item_title,
         motion_id, motion_number, motion_text, motion_result, for_count, against_count,
         vote_kind, motion_moved_by) in mover_rows:
        if resolver.resolve_mover(motion_moved_by, date) != full_name:
            continue
        enrichment = enrichments.get(motion_id, {})
        motions_moved.append({
            "date": date,
            "term": term_for_date(terms, date),
            "meeting_name": meeting_name or "",
            "source_url": source_url or "",
            "agenda_item_number": agenda_item_number or "",
            "item_title": (item_title or "").strip(),
            "motion_id": motion_id,
            "motion_number": motion_number,
            "motion_text": (motion_text or "").strip(),
            "motion_result": motion_result or "",
            "for_count": for_count or 0,
            "against_count": against_count or 0,
            "vote_kind": vote_kind or ("recorded" if (for_count or against_count) else "none"),
            "summary": enrichment.get("summary", ""),
            "tags": enrichment.get("tags", []),
        })

    data = {
        "councillor": _councillor_meta(councillor, terms, current_term(terms)),
        "votes": votes,
        "motions_moved": motions_moved,
    }

    _write_json(output_dir / "councillors" / f"{slug}.json", data)
    return len(votes)


def export_all_councillors(
    con: duckdb.DuckDBPyConnection,
    councillors: list[dict],
    output_dir: Path,
    terms: list[dict],
    resolver: CouncillorResolver,
    enrichments: dict[str, dict] | None = None,
) -> None:
    total_votes = 0
    for councillor in sorted(councillors, key=lambda c: c["last_name"]):
        n = export_councillor_file(con, councillor, output_dir, terms, resolver, enrichments=enrichments)
        total_votes += n
        slug = _to_slug(councillor["full_name"])
        if n == 0:
            print(f"    skipped {slug} — no recorded votes", file=sys.stderr)
    print(f"  councillors/  ({len(councillors)} files, {total_votes} total votes)", file=sys.stderr)


# ---------------------------------------------------------------------------
# feed.xml
# ---------------------------------------------------------------------------

SITE_URL = "https://howtheyvoted.ca"


def export_rss_feed(con: duckdb.DuckDBPyConnection, output_dir: Path, municipality: str) -> None:
    """Write feed.xml with the most recent 100 motions as an RSS 2.0 feed."""
    rows = con.execute(
        """
        SELECT m.motion_id, m.motion_text, m.motion_result, m.for_count, m.against_count,
               m.vote_kind,
               a.title AS item_title, a.agenda_item_number,
               strftime('%Y-%m-%d', CAST(mt.meeting_date AS DATE)) AS meeting_date,
               mt.meeting_name, mt.source_url
        FROM motions m
        JOIN agenda_items a ON m.item_id = a.item_id
        JOIN meetings mt ON m.meeting_id = mt.meeting_id
        WHERE mt.municipality = ?
        ORDER BY mt.meeting_date DESC, mt.meeting_id, a.agenda_item_number, m.motion_id
        LIMIT 100
        """,
        [municipality],
    ).fetchall()

    feed_url = f"{SITE_URL}/data/ottawa/feed.xml"
    ET.register_namespace("atom", "http://www.w3.org/2005/Atom")

    rss = ET.Element("rss", {"version": "2.0"})
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = "Ottawa City Council Voting Records"
    ET.SubElement(channel, "link").text = SITE_URL
    ET.SubElement(channel, "description").text = "Motions voted on by Ottawa City Council"
    ET.SubElement(channel, "language").text = "en-ca"
    ET.SubElement(channel, "lastBuildDate").text = format_datetime(datetime.now(tz=timezone.utc))
    atom_link = ET.SubElement(channel, "{http://www.w3.org/2005/Atom}link")
    atom_link.set("href", feed_url)
    atom_link.set("rel", "self")
    atom_link.set("type", "application/rss+xml")

    for (motion_id, motion_text, motion_result, for_count, against_count, vote_kind,
         item_title, agenda_item_number, meeting_date, meeting_name, source_url) in rows:

        no_recorded_vote = vote_kind == "none" or (vote_kind is None and not (for_count or against_count))
        result_str = motion_result or "No result recorded"
        if (no_recorded_vote and motion_result
                and motion_result.lower().startswith("carried")
                and not re.search(r"\(\d+\s+to\s+\d+\)", motion_result)):
            result_str = f"{motion_result} Unanimously"
        item_label = f"{agenda_item_number} \u2013 {(item_title or '').strip()}".strip(" \u2013") if item_title else (agenda_item_number or "")
        title_text = f"{result_str}: {item_label}" if item_label else result_str

        if no_recorded_vote:
            desc_lines = [f"Result: {result_str}"]
        else:
            desc_lines = [f"Result: {result_str} (For: {for_count or 0}, Against: {against_count or 0})"]
        if motion_text:
            desc_lines.append((motion_text or "").strip())
        if source_url:
            desc_lines.append(f"Source: {source_url}")

        dt = datetime.strptime(meeting_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = title_text
        ET.SubElement(item, "link").text = f"{SITE_URL}/#/ottawa?date={meeting_date}"
        ET.SubElement(item, "description").text = "\n\n".join(desc_lines)
        ET.SubElement(item, "pubDate").text = format_datetime(dt)
        ET.SubElement(item, "guid", isPermaLink="false").text = motion_id
        ET.SubElement(item, "category").text = meeting_name or ""

    ET.indent(rss, space="  ")
    out_path = output_dir / "feed.xml"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        ET.ElementTree(rss).write(f, encoding="unicode", xml_declaration=False)

    print(f"  feed.xml  ({len(rows)} items)", file=sys.stderr)


# ---------------------------------------------------------------------------
# tags/index.json and tags/{slug}.json
# ---------------------------------------------------------------------------

def export_tags(
    con: duckdb.DuckDBPyConnection,
    enrichments: dict[str, dict],
    output_dir: Path,
    municipality: str,
    terms: list[dict],
) -> None:
    """Write tags/index.json and tags/{slug}.json for each tag that has motions."""
    from collections import Counter

    if not enrichments:
        print("  tags/  (skipped — no enrichments)", file=sys.stderr)
        return

    # Count motions per tag
    tag_counts: Counter = Counter()
    for e in enrichments.values():
        for tag in (e.get("tags") or []):
            tag_counts[tag] += 1

    if not tag_counts:
        print("  tags/  (skipped — no tags in enrichment data)", file=sys.stderr)
        return

    # Per-term counts so the tag list can follow the selected term
    motion_terms = {
        motion_id: term_for_date(terms, date)
        for motion_id, date in con.execute(
            """
            SELECT m.motion_id, strftime('%Y-%m-%d', CAST(mt.meeting_date AS DATE))
            FROM motions m JOIN meetings mt ON m.meeting_id = mt.meeting_id
            WHERE mt.municipality = ?
            """,
            [municipality],
        ).fetchall()
    }
    tag_term_counts: dict[str, Counter] = {}
    for motion_id, e in enrichments.items():
        term = motion_terms.get(motion_id)
        if term is None:
            continue
        for tag in (e.get("tags") or []):
            tag_term_counts.setdefault(tag, Counter())[term] += 1

    tags_meta = sorted(
        [
            {
                "tag": tag,
                "slug": _to_slug(tag),
                "motion_count": count,
                "counts_by_term": dict(tag_term_counts.get(tag, {})),
            }
            for tag, count in tag_counts.items()
        ],
        key=lambda x: -x["motion_count"],
    )

    _write_json(output_dir / "tags" / "index.json", {"tags": tags_meta})

    # Build per-tag motion files
    # Collect motion_ids per tag
    tag_to_motion_ids: dict[str, list[str]] = {}
    for motion_id, e in enrichments.items():
        for tag in (e.get("tags") or []):
            tag_to_motion_ids.setdefault(tag, []).append(motion_id)

    tag_files_written = 0
    for tag_info in tags_meta:
        tag = tag_info["tag"]
        slug = tag_info["slug"]
        motion_ids = tag_to_motion_ids.get(tag, [])
        if not motion_ids:
            continue

        placeholders = ", ".join("?" * len(motion_ids))
        rows = con.execute(
            f"""
            SELECT
                m.motion_id,
                m.motion_text,
                m.motion_result,
                m.for_count,
                m.against_count,
                m.vote_kind,
                ai.title AS item_title,
                ai.agenda_item_number,
                strftime('%Y-%m-%d', CAST(mt.meeting_date AS DATE)) AS meeting_date,
                mt.meeting_name,
                mt.source_url
            FROM motions m
            JOIN agenda_items ai ON m.item_id = ai.item_id
            JOIN meetings mt ON m.meeting_id = mt.meeting_id
            WHERE m.motion_id IN ({placeholders})
              AND mt.municipality = ?
            ORDER BY mt.meeting_date DESC, ai.agenda_item_number, m.motion_id
            """,
            motion_ids + [municipality],
        ).fetchall()

        fetched_motion_ids = [r[0] for r in rows]
        votes_by_motion: dict[str, list[dict]] = {mid: [] for mid in fetched_motion_ids}
        if fetched_motion_ids:
            vote_placeholders = ", ".join("?" * len(fetched_motion_ids))
            vote_rows = con.execute(
                f"""
                SELECT motion_id, councillor_name, vote
                FROM votes
                WHERE motion_id IN ({vote_placeholders})
                ORDER BY motion_id, councillor_name
                """,
                fetched_motion_ids,
            ).fetchall()
            for v_motion_id, councillor_name, vote in vote_rows:
                votes_by_motion[v_motion_id].append({"councillor_name": councillor_name, "vote": vote})

        motions = []
        for (motion_id, motion_text, motion_result, for_count, against_count, vote_kind,
             item_title, agenda_item_number, meeting_date, meeting_name, source_url) in rows:
            enrichment = enrichments.get(motion_id, {})
            votes = votes_by_motion.get(motion_id, [])
            motions.append({
                "motion_id": motion_id,
                "summary": enrichment.get("summary", ""),
                "motion_text": (motion_text or "").strip(),
                "motion_result": motion_result or "",
                "for_count": for_count or 0,
                "against_count": against_count or 0,
                "vote_kind": vote_kind or ("recorded" if votes else "none"),
                "item_title": (item_title or "").strip(),
                "agenda_item_number": agenda_item_number or "",
                "date": meeting_date,
                "term": term_for_date(terms, meeting_date),
                "meeting_name": meeting_name or "",
                "source_url": source_url or "",
                "tags": enrichment.get("tags", []),
                "votes": votes,
            })

        _write_json(output_dir / "tags" / f"{slug}.json", {"tag": tag, "slug": slug, "motions": motions})
        tag_files_written += 1

    print(f"  tags/  ({tag_files_written} tag files, {sum(tag_counts.values())} total tag assignments)", file=sys.stderr)


# ---------------------------------------------------------------------------
# committees/
# ---------------------------------------------------------------------------

def export_committees(
    con: duckdb.DuckDBPyConnection,
    enrichments: dict[str, dict],
    output_dir: Path,
    municipality: str,
    terms: list[dict],
) -> None:
    """Write committees/index.json and committees/{slug}.json for each meeting body."""
    from collections import Counter

    committee_rows = con.execute(
        """
        SELECT mt.meeting_name, COUNT(DISTINCT m.motion_id) AS motion_count
        FROM motions m
        JOIN meetings mt ON m.meeting_id = mt.meeting_id
        WHERE mt.municipality = ? AND mt.meeting_name IS NOT NULL AND mt.meeting_name != ''
        GROUP BY mt.meeting_name
        ORDER BY motion_count DESC
        """,
        [municipality],
    ).fetchall()

    committees_meta = [
        {"committee": name, "slug": _to_slug(name), "motion_count": count, "counts_by_term": {}}
        for name, count in committee_rows
    ]

    committee_files_written = 0
    for committee_info in committees_meta:
        committee = committee_info["committee"]
        slug = committee_info["slug"]

        rows = con.execute(
            """
            SELECT
                m.motion_id,
                m.motion_text,
                m.motion_result,
                m.for_count,
                m.against_count,
                m.vote_kind,
                ai.title AS item_title,
                ai.agenda_item_number,
                strftime('%Y-%m-%d', CAST(mt.meeting_date AS DATE)) AS meeting_date,
                mt.meeting_name,
                mt.source_url
            FROM motions m
            JOIN agenda_items ai ON m.item_id = ai.item_id
            JOIN meetings mt ON m.meeting_id = mt.meeting_id
            WHERE mt.meeting_name = ? AND mt.municipality = ?
            ORDER BY mt.meeting_date DESC, ai.agenda_item_number, m.motion_id
            """,
            [committee, municipality],
        ).fetchall()

        fetched_motion_ids = [r[0] for r in rows]
        votes_by_motion: dict[str, list[dict]] = {mid: [] for mid in fetched_motion_ids}
        if fetched_motion_ids:
            vote_placeholders = ", ".join("?" * len(fetched_motion_ids))
            vote_rows = con.execute(
                f"""
                SELECT motion_id, councillor_name, vote
                FROM votes
                WHERE motion_id IN ({vote_placeholders})
                ORDER BY motion_id, councillor_name
                """,
                fetched_motion_ids,
            ).fetchall()
            for v_motion_id, councillor_name, vote in vote_rows:
                votes_by_motion[v_motion_id].append({"councillor_name": councillor_name, "vote": vote})

        motions = []
        for (motion_id, motion_text, motion_result, for_count, against_count, vote_kind,
             item_title, agenda_item_number, meeting_date, meeting_name, source_url) in rows:
            enrichment = enrichments.get(motion_id, {})
            votes = votes_by_motion.get(motion_id, [])
            motions.append({
                "motion_id": motion_id,
                "summary": enrichment.get("summary", ""),
                "motion_text": (motion_text or "").strip(),
                "motion_result": motion_result or "",
                "for_count": for_count or 0,
                "against_count": against_count or 0,
                "vote_kind": vote_kind or ("recorded" if votes else "none"),
                "item_title": (item_title or "").strip(),
                "agenda_item_number": agenda_item_number or "",
                "date": meeting_date,
                "term": term_for_date(terms, meeting_date),
                "meeting_name": meeting_name or "",
                "source_url": source_url or "",
                "tags": enrichment.get("tags", []),
                "votes": votes,
            })

        committee_info["counts_by_term"] = dict(Counter(m["term"] for m in motions if m["term"]))
        _write_json(output_dir / "committees" / f"{slug}.json", {"committee": committee, "slug": slug, "motions": motions})
        committee_files_written += 1

    _write_json(output_dir / "committees" / "index.json", {"committees": committees_meta})

    print(f"  committees/  ({committee_files_written} committee files)", file=sys.stderr)


# ---------------------------------------------------------------------------
# alignment.json
# ---------------------------------------------------------------------------

def export_alignment(
    con: duckdb.DuckDBPyConnection,
    output_dir: Path,
    municipality: str,
    terms: list[dict],
    resolver: CouncillorResolver,
) -> None:
    """Write alignment.json: per term, how often each councillor voted for motions moved by each other councillor."""
    motion_rows = con.execute(
        """
        SELECT m.motion_id, m.motion_moved_by, strftime('%Y-%m-%d', CAST(mt.meeting_date AS DATE))
        FROM motions m
        JOIN meetings mt ON m.meeting_id = mt.meeting_id
        WHERE mt.municipality = ? AND m.motion_moved_by IS NOT NULL
        """,
        [municipality],
    ).fetchall()

    # motion_id -> (term, mover full_name, date)
    moved: dict[str, tuple[str, str, str]] = {}
    total_moved: dict[tuple[str, str], int] = {}
    for motion_id, moved_by, date in motion_rows:
        term = term_for_date(terms, date)
        mover = resolver.resolve_mover(moved_by, date)
        if term is None or mover is None:
            continue
        moved[motion_id] = (term, mover, date)
        total_moved[(term, mover)] = total_moved.get((term, mover), 0) + 1

    # (term, mover, voter) -> [voted_for, total_votes]
    tallies: dict[tuple[str, str, str], list[int]] = {}
    for motion_id, councillor_name, vote in con.execute(
        """
        SELECT v.motion_id, v.councillor_name, v.vote
        FROM votes v
        JOIN motions m ON v.motion_id = m.motion_id
        JOIN meetings mt ON m.meeting_id = mt.meeting_id
        WHERE mt.municipality = ? AND m.motion_moved_by IS NOT NULL
        """,
        [municipality],
    ).fetchall():
        if motion_id not in moved:
            continue
        term, mover, date = moved[motion_id]
        voter = resolver.resolve(councillor_name, date)
        if voter is None or voter == mover:
            continue
        tally = tallies.setdefault((term, mover, voter), [0, 0])
        tally[0] += vote == "for"
        tally[1] += 1

    records = [
        {
            "term": term,
            "mover": mover,
            "voter": voter,
            "total_motions_moved": total_moved[(term, mover)],
            "voted_for": voted_for,
            "total_votes": total_votes,
            "alignment_pct": round(100.0 * voted_for / total_votes, 1),
        }
        for (term, mover, voter), (voted_for, total_votes) in tallies.items()
    ]
    records.sort(key=lambda r: (r["term"], r["mover"], -r["alignment_pct"]))
    _write_json(output_dir / "alignment.json", records)
    print(f"  alignment.json  ({len(records)} councillor pairs across terms)", file=sys.stderr)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export DuckDB voting data as static JSON files for the web UI."
    )
    parser.add_argument(
        "--db", default=str(DB_PATH),
        help=f"Path to DuckDB file (default: {DB_PATH})",
    )
    parser.add_argument(
        "--municipality", "-m", default=DEFAULT_MUNICIPALITY,
        help=f"Municipality slug to export (default: {DEFAULT_MUNICIPALITY})",
    )
    parser.add_argument(
        "--output-dir", "-o", default=None,
        help="Output directory for JSON files (default: frontend/public/data/<municipality>)",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        sys.exit(f"Database not found: {db_path}")

    output_dir = Path(args.output_dir) if args.output_dir else ROOT / "frontend" / "public" / "data" / args.municipality
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Exporting municipality={args.municipality} from {db_path} → {output_dir}", file=sys.stderr)

    councillors = load_councillors(args.municipality)
    terms = load_terms(args.municipality)
    resolver = CouncillorResolver(councillors, terms)
    con = duckdb.connect(str(db_path), read_only=True)

    enrichments = _load_enrichments(con)
    enriched_count = len(enrichments)
    if enriched_count:
        print(f"  Loaded {enriched_count} AI enrichments.", file=sys.stderr)
    else:
        print("  No AI enrichments found — motions will export without summaries/tags.", file=sys.stderr)

    dates = export_index(con, councillors, terms, output_dir, args.municipality)
    export_all_dates(con, dates, output_dir, args.municipality, terms, enrichments=enrichments)
    export_all_councillors(con, councillors, output_dir, terms, resolver, enrichments=enrichments)
    export_rss_feed(con, output_dir, args.municipality)
    export_tags(con, enrichments, output_dir, args.municipality, terms)
    export_committees(con, enrichments, output_dir, args.municipality, terms)
    export_alignment(con, output_dir, args.municipality, terms, resolver)

    con.close()
    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
