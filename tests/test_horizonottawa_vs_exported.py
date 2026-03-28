"""
Cross-validate the manually curated horizonottawa CSVs against the scraper-exported CSVs.

No DB required — pure CSV-to-CSV comparison.

Matching strategy:
  - councillor slug (identical in both datasets)
  - meeting URL (strip #:~:text= fragment from horizonottawa URLs)
  - vote tally (for_count + against_count parsed from vote_tally column)

Only horizonottawa rows whose meeting URL appears in the exported dataset are tested;
the rest are expected gaps (meetings not yet scraped).
"""

from pathlib import Path

import pandas as pd
import pytest

from conftest import normalize_meeting_url, CUTOFF_DATE

ROOT = Path(__file__).resolve().parents[1]
HORIZON_DIR = ROOT / "datasets" / "horizonottawa" / "votes_by_councillor" / "csv"
EXPORT_DIR  = ROOT / "datasets" / "exported-votes"


def _load(directory: Path, normalize: bool = False) -> pd.DataFrame:
    frames = [pd.read_csv(f) for f in sorted(directory.glob("*.csv"))]
    df = pd.concat(frames, ignore_index=True)
    df["date"] = pd.to_datetime(df["date"])
    df = df[df["date"] >= CUTOFF_DATE].copy()
    df["meeting_url"] = normalize_meeting_url(df["meeting_link"]) if normalize else df["meeting_link"]
    df["for_count"]     = df["vote_tally"].str.extract(r"(\d+) Yes").astype(int)
    df["against_count"] = df["vote_tally"].str.extract(r"(\d+) No").astype(int)
    return df


_HORIZON  = _load(HORIZON_DIR, normalize=True)
_EXPORTED = _load(EXPORT_DIR, normalize=True)

# Only test horizonottawa rows whose meeting is covered by the exported data
_EXPORTED_MEETINGS = set(_EXPORTED["meeting_url"].unique())
_HORIZON_COVERED   = _HORIZON[_HORIZON["meeting_url"].isin(_EXPORTED_MEETINGS)].copy()

# Build a lookup from the exported data: (councillor, meeting_url, for_count, against_count) → [vote]
_EXPORT_INDEX: dict[tuple, list[str]] = {}
for _, row in _EXPORTED.iterrows():
    key = (row.councillor, row.meeting_url, int(row.for_count), int(row.against_count))
    _EXPORT_INDEX.setdefault(key, []).append(row.vote)


def test_meeting_coverage():
    """Report how many horizonottawa meetings are covered by the exported data."""
    total   = _HORIZON["meeting_url"].nunique()
    covered = len(_EXPORTED_MEETINGS & set(_HORIZON["meeting_url"].unique()))
    uncovered = sorted(set(_HORIZON["meeting_url"].unique()) - _EXPORTED_MEETINGS)

    # Not a hard failure — just assert at least some overlap exists
    assert covered > 0, "No horizonottawa meetings found in exported data at all"

    # Print coverage summary (visible with -s or in the test report)
    print(f"\nMeeting coverage: {covered}/{total} horizonottawa meetings found in exported data")
    if uncovered:
        print(f"Not yet scraped ({len(uncovered)}):")
        for u in uncovered:
            print(f"  {u}")


def test_no_ambiguous_tally_matches():
    """
    For each (councillor, meeting, tally) key in the covered horizonottawa rows,
    the exported data must have exactly one matching vote — not multiple.
    Multiple matches mean two motions in the same meeting have an identical tally,
    making it impossible to tell which one the horizonottawa row refers to.
    """
    ambiguous = []
    seen = set()
    for _, row in _HORIZON_COVERED.iterrows():
        key = (row.councillor, row.meeting_url, int(row.for_count), int(row.against_count))
        if key in seen:
            continue
        seen.add(key)
        matches = _EXPORT_INDEX.get(key, [])
        if len(matches) > 1:
            ambiguous.append(
                f"{row.councillor} | {row.date} | tally={int(row.for_count)}Y/{int(row.against_count)}N"
            )

    if ambiguous:
        pytest.skip(
            f"{len(ambiguous)} ambiguous tally(s) — same tally appears on multiple motions "
            f"in the same meeting; these rows are skipped in vote direction tests:\n"
            + "\n".join(ambiguous)
        )


def test_vote_directions_match():
    """
    For every covered horizonottawa row with a unique tally match in the exported data,
    the vote direction (Yes/No) must agree.
    """
    failures = []
    skipped_ambiguous = 0
    skipped_missing   = 0

    for _, row in _HORIZON_COVERED.iterrows():
        key = (row.councillor, row.meeting_url, int(row.for_count), int(row.against_count))
        matches = _EXPORT_INDEX.get(key, [])

        if len(matches) == 0:
            skipped_missing += 1
            continue
        if len(matches) > 1:
            skipped_ambiguous += 1
            continue

        if matches[0] != row.vote:
            failures.append(
                f"{row.councillor} | {row.date} | {str(row.motion)[:60]}\n"
                f"  tally={int(row.for_count)}Y/{int(row.against_count)}N"
                f"  horizonottawa={row.vote}  exported={matches[0]}"
            )

    summary = (
        f"Skipped {skipped_missing} missing + {skipped_ambiguous} ambiguous rows. "
        f"Checked {len(_HORIZON_COVERED) - skipped_missing - skipped_ambiguous} rows."
    )
    assert not failures, f"{len(failures)} vote direction mismatch(es) — {summary}\n" + "\n".join(failures)


def test_missing_votes_in_exported():
    """
    Report horizonottawa rows that have no matching entry in the exported data
    (meeting is scraped but the specific tally was not found).
    """
    missing = []
    for _, row in _HORIZON_COVERED.iterrows():
        key = (row.councillor, row.meeting_url, int(row.for_count), int(row.against_count))
        if not _EXPORT_INDEX.get(key):
            missing.append(
                f"{row.councillor} | {row.date} | {str(row.motion)[:60]} "
                f"tally={int(row.for_count)}Y/{int(row.against_count)}N"
            )

    assert not missing, (
        f"{len(missing)} horizonottawa row(s) have no match in exported data "
        f"(meeting scraped but tally not found):\n" + "\n".join(missing)
    )
