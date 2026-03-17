import ottawa_city_scraper.cli as scraper
from datetime import date

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
