# ottawacitycouncilvotingrecords

Tools to automate the tracking of Ottawa City Councillor voting records.

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

### 5) Run the scraper

```bash
python -m ottawa_city_scraper.cli --start-date 2026-03-01 --end-date 2026-03-18
```

Optional arguments:

- `--output-root`: base directory for outputs (default: `datasets`)
- `--meeting-name`: only scrape meetings whose name exactly matches the provided value, case-insensitive
- `--verify-cert`: enforce TLS certificate verification (default currently disables cert validation for self-signed endpoints)

Run outputs are written under:

```
<output-root>/runs/<start>_to_<end>_<timestamp>/
```

## CLI Usage

You can run the CLI either as a module or as a script:

```bash
python -m ottawa_city_scraper.cli --start-date 2026-02-25 --end-date 2026-02-26
```

```bash
python ottawa_city_scraper/cli.py --start-date 2026-02-25 --end-date 2026-02-26
```

Common examples:

```bash
python ottawa_city_scraper/cli.py --start-date 2026-02-25 --end-date 2026-02-26
python ottawa_city_scraper/cli.py --start-date 2026-02-25 --end-date 2026-02-26 --meeting-name "City Council"
python ottawa_city_scraper/cli.py --start-date 2026-02-25 --end-date 2026-02-26 --output-root datasets
python ottawa_city_scraper/cli.py --start-date 2026-02-25 --end-date 2026-02-26 --verify-cert
```

Arguments:

- `--start-date`: required date range start in `YYYY-MM-DD` format. Defaults to today.
- `--end-date`: required date range end in `YYYY-MM-DD` format. Defaults to tomorrow.
- `--meeting-name`: optional exact meeting-name filter, matched case-insensitively.
- `--output-root`: optional base directory for generated run folders. Defaults to `datasets`.
- `--verify-cert`: optional flag to enforce TLS certificate verification.

What the CLI does:

1. Fetches the Ottawa eScribe calendar meetings for the requested date range.
2. Filters to English `PostMinutes` HTML documents.
3. Optionally narrows the meetings to a single meeting name such as `City Council`.
4. Scrapes and parses each matching meeting minutes page into a meeting-specific JSON file.

Output files:

- `calendar_meetings.json`: raw calendar-meetings API response.
- One parsed meeting-minutes JSON file per matching meeting, named like:

```text
2026-02-25_city_council_d81e8843-78b0-45b1-9ccd-fcc20e8b2526_postminutes.json
```

### 6) Run tests

```bash
pip install -r requirements.txt
pytest
```

### 7) Deactivate virtual environment

```bash
deactivate
```
