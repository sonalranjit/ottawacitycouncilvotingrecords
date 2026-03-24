from pathlib import Path
import json
import sys
import unicodedata

import duckdb
import pandas as pd
import pytest


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_CSV_DIR = ROOT / "datasets" / "horizonottawa" / "votes_by_councillor" / "csv"
_COUNCILLORS_JSON = ROOT / "ottawa_city_scraper" / "reference_data" / "current_councillors.json"
_DB_PATH = ROOT / "ottawa_city_scraper.duckdb"


def normalize_meeting_url(url_series: "pd.Series") -> "pd.Series":
    """Truncate meeting URLs at 'lang=English', dropping any trailing params or fragments."""
    return url_series.str.replace(r"(lang=English).*", r"\1", regex=True)


def _to_slug(name: str) -> str:
    """Convert a full name to a CSV slug, stripping accents (e.g. 'Stéphanie Plante' → 'stephanie-plante')."""
    normalized = unicodedata.normalize("NFD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_name.lower().replace(" ", "-")


def _build_slug_to_initial() -> dict[str, str]:
    """Map CSV slugs (e.g. 'ariel-troster') to DB councillor names (e.g. 'A. Troster')."""
    councillors = json.loads(_COUNCILLORS_JSON.read_text(encoding="utf-8"))
    return {
        _to_slug(c["full_name"]): c["first_name_initial"]
        for c in councillors
    }


SLUG_TO_INITIAL = _build_slug_to_initial()


@pytest.fixture(scope="session")
def csv_votes() -> pd.DataFrame:
    frames = [pd.read_csv(f) for f in sorted(_CSV_DIR.glob("*.csv"))]
    df = pd.concat(frames, ignore_index=True)

    df["meeting_url"] = normalize_meeting_url(df["meeting_link"])
    df["for_count"] = df["vote_tally"].str.extract(r"(\d+) Yes").astype(int)
    df["against_count"] = df["vote_tally"].str.extract(r"(\d+) No").astype(int)
    df["vote_normalised"] = df["vote"].map({"Yes": "for", "No": "against"})
    df["councillor_name"] = df["councillor"].map(SLUG_TO_INITIAL)

    unmapped = df[df["councillor_name"].isna()]["councillor"].unique()
    assert len(unmapped) == 0, f"No councillor mapping for slugs: {list(unmapped)}"

    return df


@pytest.fixture(scope="session")
def db() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(_DB_PATH), read_only=True)
