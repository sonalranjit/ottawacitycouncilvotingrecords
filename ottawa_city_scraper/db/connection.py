import duckdb
from pathlib import Path


def get_connection(db_path: str | Path) -> duckdb.DuckDBPyConnection:
    """Open (or create) a persistent on-disk DuckDB database."""
    return duckdb.connect(str(db_path))
