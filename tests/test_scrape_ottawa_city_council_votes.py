import ottawa_city_scraper.cli as scraper
from datetime import date
from datetime import datetime

def test_parse_args_defaults(monkeypatch):
    class FrozenDate:
        @staticmethod
        def today():
            return date(2026, 3, 1)

    monkeypatch.setattr(scraper, "date", FrozenDate)
    args = scraper.parse_args([])
    assert args.start_date == "2026-03-01"
    assert args.end_date == "2026-03-02"


def test_parse_args_custom_dates():
    args = scraper.parse_args(["--start-date", "2026-03-01", "--end-date", "2026-03-10"])
    assert args.start_date == "2026-03-01"
    assert args.end_date == "2026-03-10"


def test_create_run_directory(tmp_path):
    args = scraper.parse_args(
        [
            "--start-date", "2026-03-01",
            "--end-date", "2026-03-10",
            "--output-root", str(tmp_path / "datasets"),
        ]
    )
    now = datetime(2026, 3, 1, 12, 34, 56, 789000)
    run_dir = scraper.create_run_directory(args, now=now)
    assert run_dir.exists()
    assert run_dir.is_dir()
    assert run_dir.parent == tmp_path / "datasets"
    assert run_dir.name == "2026-03-01_to_2026-03-10_20260301T123456_789000"
