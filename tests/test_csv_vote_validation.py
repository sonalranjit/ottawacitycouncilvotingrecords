"""
Validates scraped votes in the DuckDB against the manually curated CSV files in
datasets/horizonottawa/votes_by_councillor/csv/.

Matching strategy:
  - Meeting:  strip the URL fragment (#:~:text=...) from CSV meeting_link → matches meetings.source_url
  - Motion:   parse vote_tally (e.g. "17 Yes / 7 No") → matches motions.for_count + against_count
              within that meeting, restricted to motions with recorded votes (for_count > 0).
              Not every motion has a recorded vote; consent items are stored as 0Y/0N and excluded.
"""

import pytest


def test_all_csv_meetings_scraped(csv_votes, db):
    """Every meeting URL referenced in the CSVs must exist in the DB."""
    csv_urls = set(csv_votes["meeting_url"].unique())
    db_urls = {
        r[0] for r in db.execute("SELECT source_url FROM meetings").fetchall()
    }
    missing = csv_urls - db_urls
    assert not missing, f"Meetings in CSVs but not scraped into DB:\n" + "\n".join(sorted(missing))


def test_vote_tallies_match(csv_votes, db):
    """
    For every unique (meeting_url, for_count, against_count) group in the CSVs,
    a matching motion must exist in the DB with the same counts.
    """
    motion_keys = (
        csv_votes[["meeting_url", "for_count", "against_count"]]
        .drop_duplicates()
    )

    missing = []
    for _, row in motion_keys.iterrows():
        result = db.execute(
            """
            SELECT m.motion_id
            FROM motions m
            JOIN meetings mt ON m.meeting_id = mt.meeting_id
            WHERE mt.source_url = ?
              AND m.for_count     = ?
              AND m.against_count = ?
              AND m.for_count > 0
            """,
            [row.meeting_url, int(row.for_count), int(row.against_count)],
        ).fetchall()

        if not result:
            missing.append(
                f"tally={int(row.for_count)}Y/{int(row.against_count)}N  "
                f"meeting={row.meeting_url}"
            )

    assert not missing, (
        f"{len(missing)} motion tally(s) in CSVs not found in DB:\n" + "\n".join(missing)
    )


def test_councillor_vote_directions(csv_votes, db):
    """
    For every row in the CSVs, the councillor's vote direction (for/against)
    must match what was scraped.
    """
    failures = []

    for _, row in csv_votes.iterrows():
        rows = db.execute(
            """
            SELECT v.vote
            FROM votes v
            JOIN motions m  ON v.motion_id  = m.motion_id
            JOIN meetings mt ON m.meeting_id = mt.meeting_id
            WHERE mt.source_url     = ?
              AND m.for_count       = ?
              AND m.against_count   = ?
              AND m.for_count       > 0
              AND v.councillor_name = ?
            """,
            [
                row.meeting_url,
                int(row.for_count),
                int(row.against_count),
                row.councillor_name,
            ],
        ).fetchall()

        label = f"{row.councillor} | {row.date} | {str(row.motion)[:50]}"

        if len(rows) == 0:
            failures.append(f"MISSING  {label}")
        elif len(rows) > 1:
            failures.append(f"AMBIGUOUS (multiple motions with same tally)  {label}")
        elif rows[0][0] != row.vote_normalised:
            failures.append(
                f"WRONG VOTE  {label}\n"
                f"  expected={row.vote_normalised}  got={rows[0][0]}"
            )

    assert not failures, (
        f"{len(failures)} vote mismatch(es):\n" + "\n".join(failures)
    )


def test_no_phantom_votes_in_db(csv_votes, db):
    """
    For each scraped meeting that appears in the CSVs, the total vote count
    in the DB must equal the total rows in the CSVs for that meeting.
    """
    mismatches = []

    for meeting_url in csv_votes["meeting_url"].unique():
        csv_count = int((csv_votes["meeting_url"] == meeting_url).sum())
        db_count = db.execute(
            """
            SELECT COUNT(*)
            FROM votes v
            JOIN motions m  ON v.motion_id  = m.motion_id
            JOIN meetings mt ON m.meeting_id = mt.meeting_id
            WHERE mt.source_url = ?
            """,
            [meeting_url],
        ).fetchone()[0]

        if db_count != csv_count:
            mismatches.append(
                f"meeting={meeting_url}\n"
                f"  DB={db_count} votes  CSV={csv_count} votes"
            )

    assert not mismatches, (
        f"{len(mismatches)} meeting(s) with vote count mismatch:\n"
        + "\n".join(mismatches)
    )
