"""Unit tests for attachment link verification and whole-meeting repair.

No network: the minutes page scrape is patched and the calendar is a fake.
"""

from datetime import date, datetime, timedelta
from unittest.mock import patch

import duckdb
import pytest

from ottawa_city_scraper import attachment_links as al
from ottawa_city_scraper.db import upsert
from ottawa_city_scraper.db.schema import create_tables

BASE = "https://pub-ottawa.escribemeetings.com"
NOW = datetime(2026, 11, 16, 9, 0, 0)


@pytest.fixture
def con():
    con = duckdb.connect(":memory:")
    create_tables(con)
    yield con
    con.close()


@pytest.fixture(autouse=True)
def no_sleep():
    with patch.object(al.time, "sleep"):
        yield


def _link(document_id: int) -> str:
    return f"{BASE}/filestream.ashx?DocumentId={document_id}"


def _scraped(meeting_id: str, document_ids: list[int], *, motion_text: str = "Approve the report") -> dict:
    """A minutes page as scrape_minutes_page returns it: one item with a motion
    and a recorded vote, and a nested sub-item carrying the last attachment."""
    attachments = [
        {"link": _link(i), "attachment_title": f"Document {n}.pdf"}
        for n, i in enumerate(document_ids, start=1)
    ]
    return {
        "source_url": f"{BASE}/Meeting.aspx?Id={meeting_id}&Agenda=PostMinutes&lang=English",
        "meeting_number": 1,
        "meeting_date": "2026-05-19",
        "present_attendees": ["Ada Lovelace"],
        "absent_attendees": [],
        "agenda_items": {
            "total_agenda_items": 1,
            "agenda_items": [
                {
                    "agenda_item_number": "1",
                    "title": "Reports",
                    "attachments": attachments[:-1],
                    "motions": [
                        {
                            "motion_number": "1",
                            "motion_moved_by": "A. Lovelace",
                            "motion_text": motion_text,
                            "motion_result": "Carried",
                            "motion_votes": {
                                "for": {"councillors": ["A. Lovelace"], "count": 1},
                                "against": {"councillors": [], "count": 0},
                            },
                        }
                    ],
                    "sub_agendas_items": [
                        {
                            "agenda_item_number": "1.1",
                            "title": "Sub-report",
                            "attachments": attachments[-1:],
                            "motions": [],
                        }
                    ],
                }
            ],
        },
    }


def _seed(con, meeting_id: str, document_ids: list[int], meeting_date: str = "2026-05-19") -> None:
    scraped = {**_scraped(meeting_id, document_ids), "meeting_date": meeting_date}
    upsert.insert_meeting(con, meeting_id, {"name": "City Council", "meeting_type": "Council"}, scraped)


def _stored_urls(con, meeting_id: str) -> set[str]:
    return {a["link"] for a in al.stored_attachments(con, meeting_id)}


def _check_row(con, meeting_id: str) -> dict:
    cur = con.execute("SELECT * FROM meeting_link_checks WHERE meeting_id = ?", [meeting_id])
    row = cur.fetchone()
    return dict(zip([d[0] for d in cur.description], row)) if row else {}


def _due(con, **kwargs) -> dict:
    kwargs.setdefault("now", NOW)
    return al.select_due_meetings(con, kwargs.pop("fingerprints", {}), kwargs.pop("budget", None), **kwargs)[0]


def _calendar_meeting(meeting_id: str, minutes_pdf_id: int) -> dict:
    return {
        "id": meeting_id,
        "documents": [
            {"type": "PostMinutes", "format": ".pdf", "language_id": "9",
             "url": f"/FileStream.ashx?DocumentId={minutes_pdf_id}"},
            {"type": "PostMinutes", "format": "HTML", "language_id": "9",
             "url": f"/Meeting.aspx?Id={meeting_id}&Agenda=PostMinutes&lang=English"},
            {"type": "Video", "format": "Video", "language_id": "0", "url": "./Players/x"},
        ],
    }


# ---------------------------------------------------------------------------
# Calendar fingerprint
# ---------------------------------------------------------------------------

def test_fingerprint_ignores_document_order_and_video():
    meeting = _calendar_meeting("m1", 100)
    reordered = {"id": "m1", "documents": list(reversed(meeting["documents"]))[1:]}  # drops Video
    assert al.calendar_fingerprint(meeting) == al.calendar_fingerprint(reordered)


def test_fingerprint_changes_when_a_document_link_changes():
    assert al.calendar_fingerprint(_calendar_meeting("m1", 100)) != al.calendar_fingerprint(
        _calendar_meeting("m1", 200)
    )


def test_fetch_calendar_fingerprints_covers_stored_range_and_survives_a_failed_chunk(con):
    _seed(con, "old", [1, 2], meeting_date="2025-01-10")
    _seed(con, "new", [3, 4], meeting_date="2026-05-19")
    calls = []

    def fetch(start, end):
        calls.append((start, end))
        if len(calls) == 1:
            raise RuntimeError("calendar down")
        return [_calendar_meeting("new", 100)]

    fingerprints = al.fetch_calendar_fingerprints(con, fetch, today=date(2026, 6, 1))

    assert calls[0][0] == "2025-01-10"
    assert calls[-1][1] == "2026-06-02"
    assert all(a[1] == b[0] for a, b in zip(calls, calls[1:]))  # contiguous chunks
    assert fingerprints == {"new": al.calendar_fingerprint(_calendar_meeting("new", 100))}


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

def test_due_order_is_changed_then_unverified_then_oldest_verified(con):
    for meeting_id in ("changed", "unverified", "stale", "fresh"):
        _seed(con, meeting_id, [1, 2])
    al.record_fresh_scrape(con, "changed", "fp-old", now=NOW - timedelta(days=1))
    al.record_fresh_scrape(con, "stale", "fp", now=NOW - timedelta(days=30))
    al.record_fresh_scrape(con, "fresh", "fp", now=NOW - timedelta(days=2))
    fingerprints = {"changed": "fp-new", "stale": "fp", "fresh": "fp", "unverified": "fp"}

    due = al.select_due_meetings(con, fingerprints, None, now=NOW)
    assert [m["meeting_id"] for m in due] == ["changed", "unverified", "stale", "fresh"]

    capped = al.select_due_meetings(con, fingerprints, 2, now=NOW)
    assert [m["meeting_id"] for m in capped] == ["changed", "unverified"]


def test_due_skips_given_meetings_and_backs_off_repeated_failures(con):
    for meeting_id in ("just-scraped", "failing", "failed-long-ago", "normal"):
        _seed(con, meeting_id, [1, 2])
    for _ in range(al.FAILURE_BACKOFF_THRESHOLD):
        al._record_check(con, "failing", status=al.STATUS_FAILED, now=NOW - timedelta(days=1), detail="x")
        al._record_check(con, "failed-long-ago", status=al.STATUS_FAILED, now=NOW - timedelta(days=8), detail="x")

    due = al.select_due_meetings(con, {}, None, skip_meeting_ids=["just-scraped"], now=NOW)
    assert {m["meeting_id"] for m in due} == {"failed-long-ago", "normal"}

    # Naming a meeting explicitly bypasses the backoff.
    explicit = al.select_due_meetings(con, {}, 0, meeting_ids=["failing"], now=NOW)
    assert [m["meeting_id"] for m in explicit] == ["failing"]


# ---------------------------------------------------------------------------
# Link comparison
# ---------------------------------------------------------------------------

def test_flatten_live_attachments_collects_nested_sub_items():
    live = al.flatten_live_attachments(_scraped("m1", [1, 2, 3]))
    assert [a["link"] for a in live] == [_link(1), _link(2), _link(3)]


def test_diff_links_pairs_by_title_and_reports_the_rest():
    stored = [
        {"link": _link(1), "attachment_title": "Report.pdf"},
        {"link": _link(2), "attachment_title": "Draft minutes.pdf"},
        {"link": _link(3), "attachment_title": "Unchanged.pdf"},
    ]
    live = [
        {"link": _link(11), "attachment_title": "Report.pdf"},
        {"link": _link(3), "attachment_title": "Unchanged.pdf"},
        {"link": _link(12), "attachment_title": "Confirmed minutes.pdf"},
    ]
    diff = al.diff_links(stored, live)
    assert diff["replaced"] == [{"attachment_title": "Report.pdf", "old_url": _link(1), "new_url": _link(11)}]
    assert diff["removed"] == [{"attachment_title": "Draft minutes.pdf", "url": _link(2)}]
    assert diff["added"] == [{"attachment_title": "Confirmed minutes.pdf", "url": _link(12)}]


# ---------------------------------------------------------------------------
# verify_meeting
# ---------------------------------------------------------------------------

def test_unchanged_links_are_marked_ok_without_rewriting_the_meeting(con):
    _seed(con, "m1", [1, 2, 3])
    scraped_at = con.execute("SELECT scraped_at FROM meetings").fetchone()[0]

    with patch.object(al, "scrape_minutes_page", return_value=_scraped("m1", [1, 2, 3])), \
            patch.object(al.upsert, "replace_meeting") as replace:
        result = al.verify_meeting(con, None, _due(con), "fp1", now=NOW)

    assert result["status"] == al.STATUS_OK
    replace.assert_not_called()
    assert con.execute("SELECT scraped_at FROM meetings").fetchone()[0] == scraped_at
    row = _check_row(con, "m1")
    assert (row["status"], row["verified_at"], row["calendar_fingerprint"]) == ("ok", NOW, "fp1")


def test_changed_links_replace_the_whole_meeting(con):
    _seed(con, "m1", [1, 2, 3])
    republished = _scraped("m1", [101, 102, 103], motion_text="Approve the report as amended")

    with patch.object(al, "scrape_minutes_page", return_value=republished):
        result = al.verify_meeting(con, None, _due(con), "fp2", now=NOW)

    assert result["status"] == al.STATUS_REPAIRED
    assert _stored_urls(con, "m1") == {_link(101), _link(102), _link(103)}
    assert len(result["links"]["replaced"]) == 3
    assert result["before"] == result["after"] == {"agenda_items": 2, "motions": 1, "votes": 1, "attachments": 3}
    # The rest of the meeting came from the live page too.
    assert con.execute("SELECT motion_text FROM motions").fetchall() == [("Approve the report as amended",)]
    row = _check_row(con, "m1")
    assert (row["status"], row["repair_count"], row["last_repaired_at"]) == ("repaired", 1, NOW)
    assert (row["calendar_fingerprint"], row["consecutive_failures"]) == ("fp2", 0)


def test_fetch_failure_leaves_the_meeting_untouched_and_stays_due(con):
    _seed(con, "m1", [1, 2, 3])
    al.record_fresh_scrape(con, "m1", "fp-old", now=NOW - timedelta(days=10))

    with patch.object(al, "scrape_minutes_page", side_effect=RuntimeError("403 Client Error")):
        result = al.verify_meeting(con, None, _due(con), "fp-new", now=NOW)

    assert result["status"] == al.STATUS_FAILED and result["fetch_failed"]
    assert _stored_urls(con, "m1") == {_link(1), _link(2), _link(3)}
    row = _check_row(con, "m1")
    assert (row["status"], row["consecutive_failures"], row["checked_at"]) == ("failed", 1, NOW)
    # Fingerprint and verified_at are not advanced, so the meeting is still flagged as changed.
    assert (row["calendar_fingerprint"], row["verified_at"]) == ("fp-old", NOW - timedelta(days=10))
    assert _due(con, fingerprints={"m1": "fp-new"})["reason"] == "calendar links changed"


@pytest.mark.parametrize("empty_page", [
    {"agenda_items": {"total_agenda_items": 0, "agenda_items": []}},
    {"agenda_items": {"agenda_items": [{"agenda_item_number": "1", "title": "Reports",
                                        "attachments": [], "motions": []}]}},
])
def test_a_page_that_parses_to_nothing_never_replaces_stored_data(con, empty_page):
    _seed(con, "m1", [1, 2, 3])
    with patch.object(al, "scrape_minutes_page", return_value=empty_page):
        result = al.verify_meeting(con, None, _due(con), None, now=NOW)

    assert result["status"] == al.STATUS_FAILED and not result["fetch_failed"]
    assert _stored_urls(con, "m1") == {_link(1), _link(2), _link(3)}
    assert con.execute("SELECT count(*) FROM votes").fetchone()[0] == 1


def test_dry_run_reports_the_change_and_writes_nothing(con):
    _seed(con, "m1", [1, 2, 3])
    with patch.object(al, "scrape_minutes_page", return_value=_scraped("m1", [101, 102, 103])):
        result = al.verify_meeting(con, None, _due(con), "fp", dry_run=True, now=NOW)

    assert result["status"] == al.STATUS_CHANGED
    assert _stored_urls(con, "m1") == {_link(1), _link(2), _link(3)}
    assert _check_row(con, "m1") == {}


# ---------------------------------------------------------------------------
# replace_meeting
# ---------------------------------------------------------------------------

def test_replace_meeting_rolls_back_when_the_insert_fails(con):
    _seed(con, "m1", [1, 2, 3])
    with patch.object(upsert, "_insert_motion", side_effect=RuntimeError("boom")):
        with pytest.raises(RuntimeError):
            upsert.replace_meeting(con, "m1", {"name": "City Council"}, _scraped("m1", [101, 102, 103]))

    assert _stored_urls(con, "m1") == {_link(1), _link(2), _link(3)}
    assert con.execute("SELECT count(*) FROM motions").fetchone()[0] == 1
    assert con.execute("SELECT count(*) FROM votes").fetchone()[0] == 1
    assert con.execute("SELECT count(*) FROM meeting_attendance").fetchone()[0] == 1


def test_a_failed_store_is_reported_and_leaves_the_meeting_untouched(con):
    _seed(con, "m1", [1, 2, 3])
    with patch.object(al, "scrape_minutes_page", return_value=_scraped("m1", [101, 102, 103])), \
            patch.object(upsert, "_insert_motion", side_effect=RuntimeError("boom")):
        result = al.verify_meeting(con, None, _due(con), "fp", now=NOW)

    assert result["status"] == al.STATUS_FAILED
    assert _stored_urls(con, "m1") == {_link(1), _link(2), _link(3)}
    assert _check_row(con, "m1")["status"] == "failed"


# ---------------------------------------------------------------------------
# verify_and_repair
# ---------------------------------------------------------------------------

def test_run_repairs_only_changed_meetings_and_reports_them(con):
    _seed(con, "same", [1, 2])
    _seed(con, "republished", [11, 12])
    pages = {"same": _scraped("same", [1, 2]), "republished": _scraped("republished", [111, 112])}

    def scrape(*, url, **_):
        return pages[url.split("Id=")[1].split("&")[0]]

    with patch.object(al, "scrape_minutes_page", side_effect=scrape):
        report = al.verify_and_repair(con, None, fingerprints={}, budget=10, now=NOW)

    assert report["totals"] == {
        "due": 2, "checked": 2, "unchanged": 1, "repaired": 1, "would_repair": 0, "failed": 0,
    }
    assert report["repaired_meeting_ids"] == ["republished"]
    assert _stored_urls(con, "republished") == {_link(111), _link(112)}
    assert _stored_urls(con, "same") == {_link(1), _link(2)}

    # A second run finds nothing to repair.
    pages["republished"] = _scraped("republished", [111, 112])
    with patch.object(al, "scrape_minutes_page", side_effect=scrape):
        again = al.verify_and_repair(con, None, fingerprints={}, budget=10, now=NOW + timedelta(days=1))
    assert again["totals"]["repaired"] == 0 and again["totals"]["unchanged"] == 2


def test_run_stops_after_consecutive_fetch_failures(con):
    for n in range(al.MAX_CONSECUTIVE_FETCH_FAILURES + 3):
        _seed(con, f"m{n}", [n * 10 + 1, n * 10 + 2])

    with patch.object(al, "scrape_minutes_page", side_effect=RuntimeError("challenged")) as scrape:
        report = al.verify_and_repair(con, None, fingerprints={}, budget=None, now=NOW)

    assert report["aborted"] is True
    assert scrape.call_count == al.MAX_CONSECUTIVE_FETCH_FAILURES
    assert report["totals"]["failed"] == al.MAX_CONSECUTIVE_FETCH_FAILURES
