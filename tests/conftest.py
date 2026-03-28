from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Only validate votes from the last 6 months to keep tests focused on current data.
CUTOFF_DATE = pd.Timestamp("2025-12-27")

HTML_DIR = Path(__file__).resolve().parent / "html"


def normalize_meeting_url(url_series: "pd.Series") -> "pd.Series":
    """Truncate meeting URLs at 'lang=English', dropping any trailing params or fragments."""
    return url_series.str.replace(r"(lang=English).*", r"\1", regex=True)


def pytest_sessionfinish(session, exitstatus):
    """Generate the horizonottawa comparison HTML report after every test run."""
    from generate_horizonottawa_comparison_report import _load, collect, render

    HORIZON_DIR = ROOT / "datasets" / "horizonottawa" / "votes_by_councillor" / "csv"
    EXPORT_DIR = ROOT / "datasets" / "exported-votes"

    try:
        horizon = _load(HORIZON_DIR, normalize=True)
        exported = _load(EXPORT_DIR, normalize=True)
        data = collect(horizon, exported)
        html = render(data)
    except Exception as exc:
        print(f"\nWarning: could not generate HTML report: {exc}")
        return

    HTML_DIR.mkdir(exist_ok=True)
    out = HTML_DIR / "horizonottawa_comparison_report.html"
    out.write_text(html, encoding="utf-8")
    print(f"\nHTML report written to {out.relative_to(ROOT)}")
