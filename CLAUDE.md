# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web scraper that collects Ottawa City Council voting records from the Ottawa eScribe system, stores them in a DuckDB database, and exports per-councillor vote history as CSV files. Scraped data is validated against manually curated CSV files from horizonottawa.

## Setup

```bash
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Common Commands

### Run the scraper
```bash
python -m ottawa_city_scraper.cli --start-date 2026-02-25 --end-date 2026-02-26 --meeting-name "City Council"
```

Key CLI flags: `--meeting-name` (supports wildcards `*` and `?`, case-insensitive), `--output-root` (default: `datasets`), `--db-path` (default: `ottawa_city_scraper.duckdb`), `--verify-cert`.

### Export councillor votes
```bash
python -m ottawa_city_scraper.export_councillor_votes "Ariel Troster"   # by name
python -m ottawa_city_scraper.export_councillor_votes --all --output-dir ./exports
python -m ottawa_city_scraper.export_councillor_votes --list
```

### Run tests
```bash
pytest                                              # all tests
pytest tests/test_csv_vote_validation.py           # validation tests only
pytest tests/test_csv_vote_validation.py::test_all_csv_meetings_scraped  # single test
pytest -v                                          # verbose
```

## Architecture

Data flow: **eScribe REST API → CLI → HTML scraper → DuckDB → CSV export**

1. **`cli.py`** — fetches the meeting calendar via REST, filters meetings by name pattern using `fnmatch`, finds PostMinutes HTML documents in English, then calls the scraper for each meeting.

2. **`meeting_minutes_scraper.py`** — downloads and parses meeting HTML with BeautifulSoup. Key functions: `parse_header()` (attendance), `parse_agenda_items()` (recursive descent for nested items), `parse_motion_voters()` (for/against tallies and individual voter names), `normalize_councillor_name()` (strips titles/suffixes).

3. **`db/`** — DuckDB storage layer:
   - `schema.py`: table definitions (`councillors`, `meetings`, `meeting_attendance`, `agenda_items`, `motions`, `votes`)
   - `upsert.py`: idempotent INSERT OR REPLACE logic; `agenda_items` and `motions` use deterministic hash-based IDs
   - `connection.py`: connection management

4. **`export_councillor_votes.py`** — queries votes by councillor (accepts full name, slug `ariel-troster`, or initial format `A. Troster`), outputs CSV matching horizonottawa format.

5. **`reference_data/current_councillors.json`** — static councillor metadata (names, wards, contact info).

## Test Infrastructure

Tests in `tests/` validate scraped data against reference CSVs in `datasets/horizonottawa/votes_by_councillor/csv/`.

**`conftest.py`** fixtures (session-scoped):
- `csv_votes` — loads all reference CSVs, filters to last 6 months (hardcoded cutoff), normalizes vote directions and councillor name formats
- `db` — read-only connection to `ottawa_city_scraper.duckdb`

The validation tests (`test_csv_vote_validation.py`) check that meeting URLs exist in the DB, vote tallies match, individual vote directions match, and there are no phantom votes. The `testing_scraped` branch is currently used for this validation work.

## Key Design Decisions

- **Idempotent scraping**: all upserts use INSERT OR REPLACE so re-running doesn't duplicate data.
- **Deterministic IDs**: `agenda_items.item_id` and `motions.motion_id` are hashes of content, not auto-increments, enabling stable upserts across runs.
- **Name normalization**: councillor names are sanitized at scrape time (`normalize_councillor_name()`) to handle inconsistencies in the source HTML.
- **Pattern matching**: meeting name filtering uses `fnmatch` (shell-style wildcards), not regex.
