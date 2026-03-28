"""
Replay a scrape run's Parquet files into any DuckDB instance.

Reads {run_dir}/parquet/*.parquet and upserts each table using INSERT OR REPLACE,
so it is safe to replay multiple times without creating duplicate rows.

The councillors table is not included in Parquet exports — it is seeded from
current_councillors.json as normal.

Usage:
    python -m ottawa_city_scraper.load_parquet \\
        --run-dir datasets/runs/2026-03-28_to_2026-03-29_20260328T090000 \\
        --db-path ottawa_city_scraper.duckdb
"""
import argparse
import logging
import sys
from pathlib import Path

import duckdb

from .db.connection import get_connection
from .db.schema import create_tables
from .db.upsert import seed_councillors

logging.basicConfig(level="INFO", format="%(message)s")
logger = logging.getLogger(__name__)

# Must be replayed in this order to respect logical dependencies
_TABLE_ORDER = [
    "meetings",
    "meeting_attendance",
    "agenda_items",
    "motions",
    "votes",
]


def load_parquet(run_dir: Path, con: duckdb.DuckDBPyConnection) -> None:
    parquet_dir = run_dir / "parquet"
    if not parquet_dir.exists():
        sys.exit(f"No parquet/ directory found in {run_dir}")

    for table in _TABLE_ORDER:
        parquet_file = parquet_dir / f"{table}.parquet"
        if not parquet_file.exists():
            logger.warning("  %s.parquet not found — skipping", table)
            continue
        con.execute(f"""
            INSERT OR REPLACE INTO {table}
            SELECT * FROM read_parquet('{parquet_file}')
        """)
        row_count = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{parquet_file}')"
        ).fetchone()[0]
        logger.info("  %s — %d rows upserted", table, row_count)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replay a scrape run's Parquet files into a DuckDB database."
    )
    parser.add_argument(
        "--run-dir", required=True,
        help="Path to the run directory containing a parquet/ subdirectory",
    )
    parser.add_argument(
        "--db-path", default="ottawa_city_scraper.duckdb",
        help="Path to the target DuckDB file (default: ottawa_city_scraper.duckdb)",
    )
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        sys.exit(f"Run directory not found: {run_dir}")

    con = get_connection(args.db_path)
    create_tables(con)
    seed_councillors(con)
    logger.info("Database ready: %s", args.db_path)
    logger.info("Loading Parquet files from: %s", run_dir / "parquet")

    load_parquet(run_dir, con)

    con.close()
    logger.info("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
