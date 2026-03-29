"""
Export DuckDB voting data as static JSON files for the frontend web UI.

Generates:
  {output_dir}/index.json                         — all dates + councillor list
  {output_dir}/dates/{YYYY-MM-DD}.json            — per-date meetings/motions/votes
  {output_dir}/councillors/{slug}.json            — per-councillor vote history

Usage:
    python -m ottawa_city_scraper.export_web_data
    python -m ottawa_city_scraper.export_web_data --db datasets/ottawa_city_scraper.duckdb
    python -m ottawa_city_scraper.export_web_data --output-dir frontend/public/data
"""

import argparse
import json
import sys
import unicodedata
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
COUNCILLORS_JSON = Path(__file__).parent / "reference_data" / "current_councillors.json"
DB_PATH = ROOT / "datasets" / "ottawa_city_scraper.duckdb"
DEFAULT_MUNICIPALITY = "ottawa"
DEFAULT_OUTPUT = ROOT / "frontend" / "public" / "data" / DEFAULT_MUNICIPALITY


def _to_slug(name: str) -> str:
    n = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode("ascii")
    return n.lower().replace(" ", "-")


def _load_councillors() -> list[dict]:
    return json.loads(COUNCILLORS_JSON.read_text(encoding="utf-8"))


def _write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# ---------------------------------------------------------------------------
# index.json
# ---------------------------------------------------------------------------

def export_index(con: duckdb.DuckDBPyConnection, councillors: list[dict], output_dir: Path, municipality: str) -> list[str]:
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

    active_councillors = [
        {
            "slug": _to_slug(c["full_name"]),
            "full_name": c["full_name"],
            "first_name_initial": c["first_name_initial"],
            "title": c["title"],
            "ward_number": c.get("ward_number") or "",
            "ward_name": c.get("ward_name") or "",
            "email": c.get("email") or "",
            "telephone": c.get("telephone") or "",
            "active": c.get("active", True),
        }
        for c in councillors
        if c.get("active", True)
    ]
    # Sort: Mayor first (no ward_number), then by ward_number ascending
    active_councillors.sort(
        key=lambda c: (0 if not c["ward_number"] else 1, int(c["ward_number"]) if c["ward_number"] else 0)
    )

    _write_json(output_dir / "index.json", {"dates": dates, "councillors": active_councillors})
    print(f"  index.json  ({len(dates)} dates, {len(active_councillors)} councillors)", file=sys.stderr)
    return dates


# ---------------------------------------------------------------------------
# dates/{YYYY-MM-DD}.json
# ---------------------------------------------------------------------------

def export_date_file(con: duckdb.DuckDBPyConnection, date: str, output_dir: Path, municipality: str) -> None:
    """Write dates/{date}.json with all meetings → agenda_items → motions → votes."""

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
            mo.against_count
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
         motion_moved_by, motion_seconded_by, motion_result, for_count, against_count) in motions_rows:
        motions_by_item.setdefault(item_id, []).append({
            "motion_id": motion_id,
            "motion_number": motion_number,
            "motion_text": (motion_text or "").strip(),
            "motion_moved_by": motion_moved_by or "",
            "motion_seconded_by": motion_seconded_by or "",
            "motion_result": motion_result or "",
            "for_count": for_count or 0,
            "against_count": against_count or 0,
            "votes": votes_by_motion.get(motion_id, []),
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

    _write_json(output_dir / "dates" / f"{date}.json", {"date": date, "meetings": meetings})


def export_all_dates(con: duckdb.DuckDBPyConnection, dates: list[str], output_dir: Path, municipality: str) -> None:
    for date in dates:
        export_date_file(con, date, output_dir, municipality)
    print(f"  dates/  ({len(dates)} files)", file=sys.stderr)


# ---------------------------------------------------------------------------
# councillors/{slug}.json
# ---------------------------------------------------------------------------

def export_councillor_file(con: duckdb.DuckDBPyConnection, councillor: dict, output_dir: Path) -> int:
    """Write councillors/{slug}.json; return number of votes written."""
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

    votes = [
        {
            "date": date,
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
        }
        for (date, meeting_name, meeting_id, source_url, agenda_item_number, item_title,
             motion_id, motion_number, motion_text, motion_result, for_count, against_count, vote) in rows
    ]

    data = {
        "councillor": {
            "slug": slug,
            "full_name": councillor["full_name"],
            "first_name_initial": councillor["first_name_initial"],
            "title": councillor["title"],
            "ward_number": councillor.get("ward_number") or "",
            "ward_name": councillor.get("ward_name") or "",
            "email": councillor.get("email") or "",
            "telephone": councillor.get("telephone") or "",
            "active": councillor.get("active", True),
        },
        "votes": votes,
    }

    _write_json(output_dir / "councillors" / f"{slug}.json", data)
    return len(votes)


def export_all_councillors(
    con: duckdb.DuckDBPyConnection, councillors: list[dict], output_dir: Path
) -> None:
    active = [c for c in councillors if c.get("active", True)]
    total_votes = 0
    for councillor in sorted(active, key=lambda c: c["last_name"]):
        n = export_councillor_file(con, councillor, output_dir)
        total_votes += n
        slug = _to_slug(councillor["full_name"])
        if n == 0:
            print(f"    skipped {slug} — no recorded votes", file=sys.stderr)
    print(f"  councillors/  ({len(active)} files, {total_votes} total votes)", file=sys.stderr)


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

    councillors = _load_councillors()
    con = duckdb.connect(str(db_path), read_only=True)

    dates = export_index(con, councillors, output_dir, args.municipality)
    export_all_dates(con, dates, output_dir, args.municipality)
    export_all_councillors(con, councillors, output_dir)

    con.close()
    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
