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
pytest tests/test_terms.py                          # council term tests only
pytest tests/test_terms.py::test_term_for_date_boundaries  # single test
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

5. **`terms.py` + `reference_data/terms.json`, `reference_data/councillors.json`**: council terms (date ranges) and one record per councillor with a `terms` array (title/ward per term, optional mid-term `start`/`end`). `CouncillorResolver` maps a minutes name (`"A. Troster"`) plus meeting date to a person. Every export uses it, so the same initial in different terms isn't merged.

6. **`export_web_data.py`**: writes static JSON for the frontend. Every date, vote, motion and alignment row carries a `term`, and the frontend filters by the `?term=` URL param (`frontend/src/hooks/useTerm.ts`).

## Test Infrastructure

`tests/test_terms.py` covers term resolution and per-term vote attribution. `tests/test_vote_kind.py` covers vote classification. `tests/test_horizonottawa_vs_exported.py` cross-checks exported CSVs (`datasets/exported-votes/`) against reference CSVs in `datasets/horizonottawa/votes_by_councillor/csv/`; both directories are gitignored and must exist locally.

`conftest.py` provides `normalize_meeting_url()` and `CUTOFF_DATE`, and writes a Horizon Ottawa comparison report when the session ends.

## Key Design Decisions

- **Idempotent scraping**: all upserts use INSERT OR REPLACE so re-running doesn't duplicate data.
- **Deterministic IDs**: `agenda_items.item_id` and `motions.motion_id` are hashes of content, not auto-increments, enabling stable upserts across runs.
- **Name normalization**: councillor names are sanitized at scrape time (`normalize_councillor_name()`) to handle inconsistencies in the source HTML.
- **Pattern matching**: meeting name filtering uses `fnmatch` (shell-style wildcards), not regex.
- **Terms are derived, not stored on rows**: a meeting's term comes from its date and `terms.json`, so adding a term or councillor needs no re-scrape or migration.
