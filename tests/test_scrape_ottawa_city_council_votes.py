import ottawa_city_scraper.cli as scraper
from datetime import date
from datetime import datetime
import json

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
    assert run_dir.parent == tmp_path / "datasets" / "runs"
    assert run_dir.name == "2026-03-01_to_2026-03-10_20260301T123456_789000"


def test_parse_meetings_json_from_d_envelope(tmp_path):
    meetings_file = tmp_path / "calendar_meetings.json"
    raw_payload = {
        "d": [
            {
                "ID": "abc-123",
                "MeetingName": "Planning and Housing Committee",
                "StartDate": "2026/03/04 09:30:00",
                "EndDate": "2026/03/04 17:30:00",
                "Location": "Champlain Room",
                "MeetingType": "Planning and Housing Committee",
                "Url": "https://example.com/meeting/abc-123",
                "HasAgenda": True,
                "MeetingPassed": True,
                "MeetingDocumentLink": [
                    {"Title": "Agenda", "Type": "Agenda", "Format": "HTML", "Url": "Agenda.aspx"},
                    {"Title": "Minutes", "Type": "PostMinutes", "Format": "PDF", "Url": "Minutes.pdf"},
                ],
            }
        ]
    }
    meetings_file.write_text(json.dumps(raw_payload), encoding="utf-8")

    parsed = scraper.parse_meetings_json(meetings_file)

    assert len(parsed) == 1
    assert parsed[0]["id"] == "abc-123"
    assert parsed[0]["name"] == "Planning and Housing Committee"
    assert parsed[0]["documents"][0]["title"] == "Agenda"
