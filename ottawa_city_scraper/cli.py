import requests
import json
import argparse
from datetime import date, datetime, timedelta
import logging
from pathlib import Path
from zoneinfo import ZoneInfo
import warnings
from urllib3.exceptions import InsecureRequestWarning

OTTAWA_ESCRIBE_MEETINGS_BASE_URL = "https://pub-ottawa.escribemeetings.com"

logging.basicConfig(
    level="INFO",
    format="%(message)s",
    datefmt="[%X]"
)
logger = logging.getLogger(__name__)

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape Ottawa City Council Meeting minutes and parse the voting"
    )
    parser.add_argument("--start-date", default=date.today().strftime("%Y-%m-%d"), help="Start date to scrape meetings from in format YYYY-mm-dd")
    parser.add_argument("--end-date", default=(date.today() + timedelta(days=1)).strftime("%Y-%m-%d"), help="End date to scrape meetings until in format YYYY-mm-dd")
    parser.add_argument("--output-root", default="datasets", help="Directory where each run folder will be created")
    parser.add_argument(
        "--verify-cert",
        action="store_true",
        help="Verify TLS certificates (default: disabled for self-signed certificates)",
    )
    return parser.parse_args(argv)


def build_run_dir_name(start_date: str, end_date: str, now: datetime | None = None) -> str:
    now = now or datetime.now()
    return f"{start_date}_to_{end_date}_{now:%Y%m%dT%H%M%S_%f}"


def create_run_directory(args: argparse.Namespace, now: datetime | None = None) -> Path:
    output_root = Path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / build_run_dir_name(args.start_date, args.end_date, now=now)
    run_dir.mkdir()
    return run_dir


def format_calendar_datetime(date_text: str) -> str:
    local = datetime.fromisoformat(date_text).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
        tzinfo=ZoneInfo("America/Toronto")
    )
    return local.isoformat()


def fetch_calendar_meetings(args: argparse.Namespace, run_dir: Path) -> Path:
    session = requests.Session()
    session.trust_env = False
    url = (
        f"{OTTAWA_ESCRIBE_MEETINGS_BASE_URL}"
        "/MeetingsCalendarView.aspx/GetCalendarMeetings"
    )
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/json",
    }
    payload = {
        "calendarStartDate": format_calendar_datetime(args.start_date),
        "calendarEndDate": format_calendar_datetime(args.end_date),
    }

    with warnings.catch_warnings():
        if not args.verify_cert:
            warnings.filterwarnings("ignore", category=InsecureRequestWarning)
        response = session.post(
            url,
            headers=headers,
            data=json.dumps(payload),
            timeout=(10, 60),
            verify=args.verify_cert,
        )
    response.raise_for_status()
    output_path = run_dir / "calendar_meetings.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(response.json(), f, indent=2)
    logger.info("Saved calendar meetings to %s", output_path)
    return output_path


def main(args: argparse.Namespace) -> int:
    run_dir = create_run_directory(args)
    logger.info(f"Working directory: {run_dir}")
    fetch_calendar_meetings(args, run_dir)
    logger.info(f"Start date: {args.start_date}")
    logger.info(f"End date: {args.end_date}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(parse_args()))
