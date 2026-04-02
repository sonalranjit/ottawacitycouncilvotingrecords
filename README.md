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
| `--municipality` | `ottawa` | Municipality slug to tag scraped meetings with |
| `--min-delay` | `1.0` | Minimum seconds to wait between meeting scrapes |
| `--max-delay` | `3.0` | Maximum seconds to wait between meeting scrapes |
| `--verify-cert` | off | Enforce TLS certificate verification |
| `--no-parquet` | off | Skip Parquet export after scraping |
| `--enrich` | off | After scraping, enrich new motions with AI-generated summaries and tags (requires `ANTHROPIC_API_KEY`) |
| `--enrich-api-key` | env var | Anthropic API key for `--enrich` (overrides `ANTHROPIC_API_KEY`) |

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

## AI enrichment (summaries and tags)

Motions can be enriched with plain-English summaries and thematic tags using Claude. Enrichments are stored in the `motion_ai_enrichment` table and used by the web UI.

### Enrich while scraping

Pass `--enrich` to the scraper to automatically enrich newly scraped motions after each run:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python -m ottawa_city_scraper.cli \
  --start-date 2026-03-01 \
  --end-date 2026-03-18 \
  --meeting-name "City Council" \
  --enrich
```

### Bulk-enrich existing data

To enrich all motions already in the database:

```bash
python -m ottawa_city_scraper.tag_motions

# Preview the first batch without making API calls
python -m ottawa_city_scraper.tag_motions --dry-run

# Re-process motions that are already enriched
python -m ottawa_city_scraper.tag_motions --re-enrich

# Custom DB path or batch size
python -m ottawa_city_scraper.tag_motions --db datasets/ottawa_city_scraper.duckdb --batch-size 10
```

Enrichment is idempotent by default — already-enriched motions are skipped unless `--re-enrich` is passed.

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
| `agenda_item_attachments` | Attachment URLs linked to agenda items |
| `motions` | One row per motion with for/against counts |
| `votes` | One row per councillor per motion |
| `motion_ai_enrichment` | AI-generated summaries and thematic tags per motion (kept separate so re-scraping does not overwrite enrichments) |

All upserts use `INSERT OR REPLACE` with deterministic hash-based IDs — re-scraping the same meeting never creates duplicate records.

---

## Frontend web UI

A React/TypeScript single-page app for browsing the scraped data. It reads static JSON files exported from the database and requires no server.

### Setup

```bash
cd frontend
npm install
```

### Export static data

Generate the JSON files that the UI reads from the database:

```bash
# From the repo root
python -m ottawa_city_scraper.export_web_data

# Or via npm script (from frontend/)
npm run export-data
```

This writes the following files to `frontend/public/data/<municipality>/`:

| File | Contents |
|---|---|
| `index.json` | All dates with motion data + active councillor list |
| `dates/{YYYY-MM-DD}.json` | Meetings → agenda items → motions → votes for one date |
| `councillors/{slug}.json` | Full vote history for one councillor |
| `feed.xml` | RSS 2.0 feed of the most recent 100 motions |
| `tags/index.json` | All topic tags with motion counts |
| `tags/{slug}.json` | Motions for one topic tag |

Options: `--db <path>` (default: `datasets/ottawa_city_scraper.duckdb`), `--output-dir <path>` (default: `frontend/public/data/ottawa`).

#### Tag slugs

Tag slugs are generated from the tag name: lowercased, `&` replaced with `and`, special characters stripped, and spaces replaced with `-`. For example:

| Tag | Slug |
|---|---|
| `Budget & Finance` | `budget-and-finance` |
| `Housing & Zoning` | `housing-and-zoning` |
| `Arts Culture & Events` | `arts-culture-and-events` |

#### `tags/index.json` shape

```json
{
  "tags": [
    { "tag": "Budget & Finance", "slug": "budget-and-finance", "motion_count": 42 }
  ]
}
```

#### `tags/{slug}.json` shape

```json
{
  "tag": "Budget & Finance",
  "slug": "budget-and-finance",
  "motions": [
    {
      "motion_id": "...",
      "summary": "Plain-English summary of what council decided.",
      "motion_text": "Full motion text...",
      "motion_result": "Carried",
      "for_count": 18,
      "against_count": 5,
      "item_title": "2026 Operating Budget",
      "agenda_item_number": "3.1",
      "date": "2026-03-12",
      "meeting_name": "City Council",
      "source_url": "https://...",
      "tags": ["Budget & Finance"]
    }
  ]
}
```

### Dev server

```bash
cd frontend
npm run dev
```

### Pages

- **Motions by date** (`/`) — pick a date to see all meetings, agenda items, and motions with vote tallies and individual votes.
- **Councillor history** (`/councillors/:slug`) — select a councillor to see their full vote history in a sortable table.
- **Topics** (`/tags`) — browse motions grouped by thematic tag (e.g. Budget & Finance, Housing & Zoning). Populated from AI enrichment data.

### Build

```bash
cd frontend
npm run build   # outputs to frontend/dist/
npm run preview # serve the production build locally
```

### Tests

```bash
cd frontend
npm test
```

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
