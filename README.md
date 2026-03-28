# Ottawa City Council Voting Records

Tools to automate the tracking of Ottawa City Councillor voting records. The scraper pulls meeting minutes from the Ottawa eScribe system, stores votes in a persistent DuckDB database, and exports per-councillor vote history as CSV files.

## Setup

### 1) Prerequisites

- Python 3.12+
- `git`

### 2) Clone the repository

```bash
git clone <repository-url>
cd ottawacitycouncilvotingrecords
```

### 3) Create and activate a virtual environment

```bash
python3.12 -m venv venv
source venv/bin/activate
```

### 4) Install dependencies

```bash
pip install -r requirements.txt
```

---

## Running the scraper

```bash
python -m ottawa_city_scraper.cli \
  --start-date 2026-03-01 \
  --end-date 2026-03-18 \
  --meeting-name "City Council"
```

### CLI arguments

| Argument | Default | Description |
|---|---|---|
| `--start-date` | today | Date range start (`YYYY-MM-DD`) |
| `--end-date` | tomorrow | Date range end (`YYYY-MM-DD`) |
| `--meeting-name` | _(required)_ | One or more meeting name patterns. Supports wildcards (`*`, `?`). e.g. `"City Council" "*Committee*"` |
| `--db-path` | `ottawa_council.duckdb` | Path to the persistent DuckDB file |
| `--output-root` | `datasets` | Base directory for run output folders |
| `--min-delay` | `1.0` | Minimum seconds to wait between meeting scrapes |
| `--max-delay` | `3.0` | Maximum seconds to wait between meeting scrapes |
| `--verify-cert` | off | Enforce TLS certificate verification |

A random delay between `--min-delay` and `--max-delay` is applied after each meeting scrape to avoid rate limiting. For large date ranges, consider increasing these values.

### What the scraper does

1. Fetches the Ottawa eScribe calendar meetings for the requested date range.
2. Filters meetings by name pattern and to English `PostMinutes` HTML documents.
3. Scrapes and parses each meeting minutes page.
4. Upserts all data (meetings, attendance, agenda items, motions, votes) into DuckDB.

Run outputs are written under:

```
<output-root>/runs/<start>_to_<end>_<timestamp>/
```

---

## Exporting councillor votes

Export a councillor's votes as CSV (matching the horizonottawa format):

```bash
# By full name
python -m ottawa_city_scraper.export_councillor_votes "Ariel Troster"

# By slug
python -m ottawa_city_scraper.export_councillor_votes ariel-troster

# By initial format
python -m ottawa_city_scraper.export_councillor_votes "A. Troster"

# Write to file
python -m ottawa_city_scraper.export_councillor_votes "Ariel Troster" --output ariel-troster.csv

# Export all councillors to a directory
python -m ottawa_city_scraper.export_councillor_votes --all --output-dir ./exports

# List all known councillors
python -m ottawa_city_scraper.export_councillor_votes --list
```

---

## Database

Votes are stored in a DuckDB file (`ottawa_council.duckdb` by default) with the following tables:

| Table | Description |
|---|---|
| `councillors` | Reference data seeded from `current_councillors.json` |
| `meetings` | One row per scraped meeting |
| `meeting_attendance` | Present/absent status per councillor per meeting |
| `agenda_items` | Flattened agenda items (supports nested sub-items) |
| `motions` | One row per motion with for/against counts |
| `votes` | One row per councillor per motion |

All upserts use `INSERT OR REPLACE` with deterministic hash-based IDs — re-scraping the same meeting never creates duplicate records.

---

## Automated scraping (GitHub Actions)

The workflow in `.github/workflows/get-new-data.yml` runs daily at 09:00 UTC. It scrapes the previous day's meetings, commits any new data, and cherry-picks the commit onto the `data` branch.

You can also trigger it manually from the Actions tab via `workflow_dispatch`.

---

## Running tests

```bash
pytest
```

Tests validate scraped data against reference CSVs in `datasets/horizonottawa/votes_by_councillor/csv/`.

---

## Deactivate virtual environment

```bash
deactivate
```
