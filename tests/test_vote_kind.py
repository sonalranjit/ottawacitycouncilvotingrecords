"""Unit tests for the motions.vote_kind classification and schema migration."""

import duckdb
import pytest

from ottawa_city_scraper.db.schema import create_tables, migrate_schema
from ottawa_city_scraper.db.upsert import _insert_motion


@pytest.fixture
def con():
    con = duckdb.connect(":memory:")
    create_tables(con)
    yield con
    con.close()


def _seed_attendance(con, meeting_id: str, councillors: list[tuple[str, str]]) -> None:
    """Seed councillors + present attendance. councillors = [(full_name, initial), ...]"""
    for full_name, initial in councillors:
        con.execute(
            """
            INSERT INTO councillors (full_name, municipality, first_name, last_name, first_name_initial)
            VALUES (?, 'ottawa', ?, ?, ?)
            """,
            [full_name, full_name.split()[0], full_name.split()[1], initial],
        )
        con.execute(
            "INSERT INTO meeting_attendance (meeting_id, councillor_name, status) VALUES (?, ?, 'present')",
            [meeting_id, full_name],
        )


def _get_motion(con):
    return con.execute(
        "SELECT vote_kind, for_count, against_count FROM motions"
    ).fetchone()


def test_recorded_vote_sets_vote_kind_recorded(con):
    _insert_motion(
        con,
        "meeting-1",
        "item-1",
        {
            "motion_number": "1",
            "motion_text": "Test motion",
            "motion_result": "Carried (2 to 1)",
            "motion_votes": {
                "for": {"councillors": ["A. Troster", "S. Menard"], "count": 2},
                "against": {"councillors": ["G. Gower"], "count": 1},
            },
            "dissent_voters": [],
        },
    )
    assert _get_motion(con) == ("recorded", 2, 1)


def test_dissent_only_sets_vote_kind_dissent_and_reconstructs_votes(con):
    _seed_attendance(
        con,
        "meeting-1",
        [("Ariel Troster", "A. Troster"), ("Shawn Menard", "S. Menard"), ("Glen Gower", "G. Gower")],
    )
    _insert_motion(
        con,
        "meeting-1",
        "item-1",
        {
            "motion_number": "1",
            "motion_text": "Test motion",
            "motion_result": "Carried",
            "motion_votes": {},
            "dissent_voters": ["G. Gower"],
        },
    )
    assert _get_motion(con) == ("dissent", 2, 1)
    votes = dict(con.execute("SELECT councillor_name, vote FROM votes").fetchall())
    assert votes == {"A. Troster": "for", "S. Menard": "for", "G. Gower": "against"}


def test_no_votes_sets_vote_kind_none(con):
    _insert_motion(
        con,
        "meeting-1",
        "item-1",
        {
            "motion_number": "1",
            "motion_text": "Test motion",
            "motion_result": "Carried",
            "motion_votes": {},
            "dissent_voters": [],
        },
    )
    assert _get_motion(con) == ("none", 0, 0)
    assert con.execute("SELECT count(*) FROM votes").fetchone()[0] == 0


def test_migration_backfills_existing_rows():
    con = duckdb.connect(":memory:")
    # Old schema: motions without vote_kind, as in pre-migration databases.
    con.execute("""
        CREATE TABLE motions (
            motion_id VARCHAR PRIMARY KEY, item_id VARCHAR, meeting_id VARCHAR,
            motion_number VARCHAR, motion_moved_by VARCHAR, motion_seconded_by VARCHAR,
            motion_text VARCHAR, motion_result VARCHAR,
            for_count INTEGER, against_count INTEGER
        )
    """)
    con.execute("""
        CREATE TABLE votes (
            motion_id VARCHAR, councillor_name VARCHAR, vote VARCHAR,
            PRIMARY KEY (motion_id, councillor_name)
        )
    """)
    con.execute("""
        INSERT INTO motions VALUES
            ('m-recorded', 'i1', 'mt1', '1', '', '', 'text', 'Carried (2 to 1)', 2, 1),
            ('m-voice',    'i2', 'mt1', '2', '', '', 'text', 'Carried', 0, 0)
    """)
    con.execute("INSERT INTO votes VALUES ('m-recorded', 'A. Troster', 'for')")

    migrate_schema(con)
    kinds = dict(con.execute("SELECT motion_id, vote_kind FROM motions").fetchall())
    assert kinds == {"m-recorded": "recorded", "m-voice": "none"}

    # Second run is a no-op: manually reclassified rows are not overwritten.
    con.execute("UPDATE motions SET vote_kind = 'dissent' WHERE motion_id = 'm-voice'")
    migrate_schema(con)
    kinds = dict(con.execute("SELECT motion_id, vote_kind FROM motions").fetchall())
    assert kinds == {"m-recorded": "recorded", "m-voice": "dissent"}
    con.close()
