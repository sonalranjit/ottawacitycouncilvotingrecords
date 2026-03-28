import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import duckdb

logger = logging.getLogger(__name__)

_COUNCILLORS_JSON = Path(__file__).parent.parent / "reference_data" / "current_councillors.json"


def _hash(*parts: str) -> str:
    """Stable MD5 hex digest used as a surrogate key."""
    key = "|".join(parts)
    return hashlib.md5(key.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Councillors
# ---------------------------------------------------------------------------

def seed_councillors(con: duckdb.DuckDBPyConnection) -> None:
    """Load councillors from the reference JSON into the DB (idempotent)."""
    councillors = json.loads(_COUNCILLORS_JSON.read_text(encoding="utf-8"))
    for c in councillors:
        con.execute(
            """
            INSERT OR REPLACE INTO councillors
                (full_name, first_name, last_name, first_name_initial,
                 title, ward_number, ward_name, telephone, fax, email)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                c.get("full_name", ""),
                c.get("first_name", ""),
                c.get("last_name", ""),
                c.get("first_name_initial", ""),
                c.get("title", ""),
                c.get("ward_number", ""),
                c.get("ward_name", ""),
                c.get("telephone", ""),
                c.get("fax", ""),
                c.get("email", ""),
            ],
        )
    logger.info("Seeded %d councillors", len(councillors))


# ---------------------------------------------------------------------------
# Meeting + all child records
# ---------------------------------------------------------------------------

def insert_meeting(
    con: duckdb.DuckDBPyConnection,
    meeting_id: str,
    calendar_meeting: dict[str, Any],
    scraped_minutes: dict[str, Any],
) -> None:
    """
    Upsert a meeting and all its child records (attendance, agenda items,
    motions, votes).  Safe to call multiple times for the same meeting.
    """
    con.execute(
        """
        INSERT OR REPLACE INTO meetings
            (meeting_id, meeting_number, meeting_date, meeting_start_time,
             meeting_location, meeting_name, meeting_type, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            meeting_id,
            scraped_minutes.get("meeting_number"),
            scraped_minutes.get("meeting_date"),
            scraped_minutes.get("meeting_start_time"),
            scraped_minutes.get("meeting_location"),
            calendar_meeting.get("name"),
            calendar_meeting.get("meeting_type"),
            scraped_minutes.get("source_url") or scraped_minutes.get("source"),
        ],
    )

    _insert_attendance(con, meeting_id, scraped_minutes)

    agenda_items_data = scraped_minutes.get("agenda_items", {})
    items = agenda_items_data.get("agenda_items", []) if isinstance(agenda_items_data, dict) else []
    for item in items:
        _insert_agenda_item(con, meeting_id, item)

    logger.info("Upserted meeting %s (%s)", meeting_id, calendar_meeting.get("name"))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _insert_attendance(
    con: duckdb.DuckDBPyConnection,
    meeting_id: str,
    scraped_minutes: dict[str, Any],
) -> None:
    for name in scraped_minutes.get("present_attendees", []):
        if name:
            con.execute(
                """
                INSERT OR REPLACE INTO meeting_attendance (meeting_id, councillor_name, status)
                VALUES (?, ?, 'present')
                """,
                [meeting_id, name],
            )
    for name in scraped_minutes.get("absent_attendees", []):
        if name:
            con.execute(
                """
                INSERT OR REPLACE INTO meeting_attendance (meeting_id, councillor_name, status)
                VALUES (?, ?, 'absent')
                """,
                [meeting_id, name],
            )


def _insert_agenda_item(
    con: duckdb.DuckDBPyConnection,
    meeting_id: str,
    item: dict[str, Any],
) -> None:
    agenda_item_number = item.get("agenda_item_number", "")
    title = item.get("title", "")
    item_id = _hash(meeting_id, agenda_item_number, title)

    con.execute(
        """
        INSERT OR REPLACE INTO agenda_items
            (item_id, meeting_id, agenda_item_number, title, description, minutes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            item_id,
            meeting_id,
            agenda_item_number,
            title,
            item.get("description", ""),
            item.get("minutes", ""),
        ],
    )

    for motion in item.get("motions", []):
        _insert_motion(con, meeting_id, item_id, motion)

    # Recurse into sub-items (nested agenda structure)
    for sub_item in item.get("sub_agendas_items", []):
        _insert_agenda_item(con, meeting_id, sub_item)


def _reconstruct_dissent_votes(
    con: duckdb.DuckDBPyConnection,
    meeting_id: str,
    dissenters: list[str],
) -> dict[str, Any]:
    """
    Build a for/against vote dict from dissent-only notation.

    Attendance has already been inserted before motions are processed, so we can
    join meeting_attendance with councillors to get the initial-format names that
    match what the structured MotionVoters tables produce.
    """
    # Join on full_name first; fall back to matching on last name alone to handle
    # councillors whose HTML attendance name differs from the reference full_name
    # (e.g. "Matt Luloff" in HTML vs "Matthew Luloff" in the reference data).
    # All councillor last names are unique so last-name matching is unambiguous.
    rows = con.execute(
        """
        SELECT c.first_name_initial
        FROM meeting_attendance ma
        JOIN councillors c
          ON ma.councillor_name = c.full_name
          OR SPLIT_PART(ma.councillor_name, ' ', 2) = SPLIT_PART(c.full_name, ' ', 2)
        WHERE ma.meeting_id = ? AND ma.status = 'present'
        """,
        [meeting_id],
    ).fetchall()
    present_initials = [r[0] for r in rows]
    for_voters = [name for name in present_initials if name not in dissenters]
    return {
        "for": {"councillors": for_voters, "count": len(for_voters)},
        "against": {"councillors": dissenters, "count": len(dissenters)},
    }


def _insert_motion(
    con: duckdb.DuckDBPyConnection,
    meeting_id: str,
    item_id: str,
    motion: dict[str, Any],
) -> None:
    motion_number = motion.get("motion_number", "")
    motion_text = motion.get("motion_text", "")
    motion_id = _hash(item_id, motion_number, motion.get("motion_moved_by", ""), motion_text[:100])

    motion_votes = motion.get("motion_votes", {})
    dissent_voters = motion.get("dissent_voters", [])
    if not motion_votes and dissent_voters:
        motion_votes = _reconstruct_dissent_votes(con, meeting_id, dissent_voters)
    for_data = motion_votes.get("for", {})
    against_data = motion_votes.get("against", {})

    con.execute(
        """
        INSERT OR REPLACE INTO motions
            (motion_id, item_id, meeting_id, motion_number, motion_moved_by,
             motion_seconded_by, motion_text, motion_result, for_count, against_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            motion_id,
            item_id,
            meeting_id,
            motion_number,
            motion.get("motion_moved_by", ""),
            motion.get("motion_seconded_by", ""),
            motion_text,
            motion.get("motion_result", ""),
            for_data.get("count", 0),
            against_data.get("count", 0),
        ],
    )

    for name in for_data.get("councillors", []):
        if name:
            con.execute(
                """
                INSERT OR REPLACE INTO votes (motion_id, councillor_name, vote)
                VALUES (?, ?, 'for')
                """,
                [motion_id, name],
            )

    for name in against_data.get("councillors", []):
        if name:
            con.execute(
                """
                INSERT OR REPLACE INTO votes (motion_id, councillor_name, vote)
                VALUES (?, ?, 'against')
                """,
                [motion_id, name],
            )
