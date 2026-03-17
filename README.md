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
- `--verify-cert`: enforce TLS certificate verification (default currently disables cert validation for self-signed endpoints)

Run outputs are written under:

```
<output-root>/runs/<start>_to_<end>_<timestamp>/
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
