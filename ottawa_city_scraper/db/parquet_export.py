import logging
from pathlib import Path

import duckdb

logger = logging.getLogger(__name__)

# Tables exported in dependency order (meetings before attendance/items, etc.)
_TABLES = {
    "meetings": "SELECT * FROM meetings WHERE meeting_id IN ({placeholders})",
    "meeting_attendance": "SELECT * FROM meeting_attendance WHERE meeting_id IN ({placeholders})",
    "agenda_items": "SELECT * FROM agenda_items WHERE meeting_id IN ({placeholders})",
    "motions": "SELECT * FROM motions WHERE meeting_id IN ({placeholders})",
    "votes": """
        SELECT v.* FROM votes v
        JOIN motions m ON v.motion_id = m.motion_id
        WHERE m.meeting_id IN ({placeholders})
    """,
}


def export_run_parquet(
    con: duckdb.DuckDBPyConnection,
    run_dir: Path,
    meeting_ids: list[str],
) -> Path:
    """
    Export rows for the given meeting_ids to per-table Parquet files under
    {run_dir}/parquet/. Returns the parquet/ subdirectory path.

    Safe to call even if meeting_ids is empty — writes no files in that case.
    """
    if not meeting_ids:
        logger.info("No meeting IDs to export; skipping Parquet export.")
        return run_dir / "parquet"

    parquet_dir = run_dir / "parquet"
    parquet_dir.mkdir(exist_ok=True)

    placeholders = ", ".join("?" * len(meeting_ids))

    for table_name, query_template in _TABLES.items():
        query = query_template.format(placeholders=placeholders)
        out_path = parquet_dir / f"{table_name}.parquet"
        con.execute(
            f"COPY ({query}) TO '{out_path}' (FORMAT PARQUET)",
            meeting_ids,
        )
        row_count = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{out_path}')"
        ).fetchone()[0]
        logger.info("  %s.parquet — %d rows", table_name, row_count)

    logger.info("Parquet export complete: %s", parquet_dir)
    return parquet_dir
