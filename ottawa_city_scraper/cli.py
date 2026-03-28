import random
import time
import requests
import json
import argparse
import re
from fnmatch import fnmatch
from datetime import date, datetime, timedelta
import logging
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import Any
import warnings
from requests.adapters import HTTPAdapter
from urllib3.exceptions import InsecureRequestWarning
from urllib3.util.retry import Retry
from meeting_minutes_scraper import scrape_minutes_page
from db.connection import get_connection
from db.schema import create_tables
from db import upsert

OTTAWA_ESCRIBE_MEETINGS_BASE_URL = "https://pub-ottawa.escribemeetings.com"


def _build_session() -> requests.Session:
    session = requests.Session()
    session.trust_env = False
    retry = Retry(
        total=5,
        backoff_factor=2,  # waits 2, 4, 8, 16, 32 seconds between retries
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

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
        "--meeting-name",
        required=True,
        nargs="+",
        metavar="NAME",
        help="One or more meeting name patterns to scrape (required). Supports wildcards (* and ?). e.g. 'City Council' '*Committee*'",
    )
    parser.add_argument(
        "--verify-cert",
        action="store_true",
        help="Verify TLS certificates (default: disabled for self-signed certificates)",
    )
    parser.add_argument(
        "--db-path",
        default="ottawa_council.duckdb",
        help="Path to the persistent DuckDB file (default: ottawa_council.duckdb)",
    )
    parser.add_argument(
        "--min-delay", type=float, default=1.0,
        help="Minimum seconds to wait between meeting scrapes (default: 1.0)",
    )
    parser.add_argument(
        "--max-delay", type=float, default=3.0,
        help="Maximum seconds to wait between meeting scrapes (default: 3.0)",
    )
    return parser.parse_args(argv)


def build_run_dir_name(start_date: str, end_date: str, now: datetime | None = None) -> str:
    now = now or datetime.now()
    return f"{start_date}_to_{end_date}_{now:%Y%m%dT%H%M%S_%f}"


def create_run_directory(args: argparse.Namespace, now: datetime | None = None) -> Path:
    output_root = Path(args.output_root)
    output_root = output_root / "runs"
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / build_run_dir_name(args.start_date, args.end_date, now=now)
    run_dir.mkdir()
    return run_dir


def write_json_to_run_dir(
    run_dir: Path,
    filename: str,
    payload: Any,
    *,
    log_label: str | None = None,
) -> Path:
    output_path = run_dir / filename
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    logger.info("Saved %s to %s", log_label or filename, output_path)
    return output_path


def build_meeting_minutes_filename(meeting: dict[str, Any]) -> str:
    meeting_name = meeting.get("name") or "meeting"
    start_date = meeting.get("start_date") or ""
    meeting_id = meeting.get("id") or "unknown-id"

    start_dt = datetime.strptime(start_date, "%Y/%m/%d %H:%M:%S")
    slug = re.sub(r"[^a-z0-9]+", "_", meeting_name.lower()).strip("_")
    return f"{start_dt:%Y-%m-%d}_{slug}_{meeting_id}_postminutes.json"


def format_calendar_datetime(date_text: str) -> str:
    local = datetime.fromisoformat(date_text).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
        tzinfo=ZoneInfo("America/Toronto")
    )
    return local.isoformat()


def parse_meetings_json(file_path: str | Path) -> list[dict[str, Any]]:
    """Parse a calendar-meetings response payload into a list of dicts."""
    payload = json.loads(Path(file_path).read_text(encoding="utf-8"))
    meetings = payload

    if isinstance(payload, dict):
        if "d" in payload and isinstance(payload["d"], list):
            meetings = payload["d"]
        elif "meetings" in payload and isinstance(payload["meetings"], list):
            meetings = payload["meetings"]
        elif any(key in payload for key in ("ID", "MeetingName", "StartDate")):
            meetings = [payload]

    if not isinstance(meetings, list):
        raise ValueError("Unexpected meetings JSON format; expected a list or an object with a list field.")

    parsed: list[dict[str, Any]] = []
    for meeting in meetings:
        if not isinstance(meeting, dict):
            continue

        parsed.append({
            "id": meeting.get("ID") or meeting.get("id"),
            "name": meeting.get("MeetingName") or meeting.get("name"),
            "start_date": meeting.get("StartDate") or meeting.get("start_date"),
            "end_date": meeting.get("EndDate") or meeting.get("end_date"),
            "formatted_start": meeting.get("FormattedStart"),
            "location": meeting.get("Location"),
            "meeting_type": meeting.get("MeetingType"),
            "url": meeting.get("Url"),
            "agenda_url": meeting.get("AgendaUrl"),
            "has_agenda": bool(meeting.get("HasAgenda", False)),
            "is_passed": bool(meeting.get("MeetingPassed", False)),
            "documents": [
                {
                    "title": doc.get("Title"),
                    "type": doc.get("Type"),
                    "format": doc.get("Format"),
                    "url": doc.get("Url"),
                    "language_id": doc.get("LanguageId"),
                    "language_code": doc.get("LanguageCode"),
                }
                for doc in (meeting.get("MeetingDocumentLink") or [])
                if isinstance(doc, dict)
            ],
        })

    return parsed


def is_english_document(document: dict[str, Any]) -> bool:
    language_id = document.get("language_id")
    if isinstance(language_id, str) and language_id.isdigit():
        language_id = int(language_id)
    language_code = (document.get("language_code") or "").lower()
    return language_id == 9 or language_code == "lang='en'" or language_code.startswith("lang='en'")


def filter_postminutes_html_english_documents(
    meetings: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    for meeting in meetings:
        documents = [
            doc
            for doc in (meeting.get("documents") or [])
            if doc.get("type") == "PostMinutes"
            and doc.get("format") == "HTML"
            and is_english_document(doc)
        ]
        if not documents:
            continue
        filtered.append({**meeting, "documents": documents})

    return filtered


def filter_meetings_by_name(
    meetings: list[dict[str, Any]],
    meeting_names: list[str],
) -> list[dict[str, Any]]:
    patterns = [name.strip().lower() for name in meeting_names]
    return [
        meeting
        for meeting in meetings
        if any(fnmatch((meeting.get("name") or "").strip().lower(), p) for p in patterns)
    ]


def print_meeting_documents(meetings: list[dict[str, Any]]) -> None:
    for meeting in meetings:
        meeting_name = meeting.get("name") or "Unknown meeting"
        formatted_start = meeting.get("formatted_start")
        if formatted_start:
            print(f"Meeting: {meeting_name} ({formatted_start})")
        else:
            print(f"Meeting: {meeting_name}")

        documents = meeting.get("documents") or []
        if not documents:
            print("  No documents")
            continue

        for document in documents:
            title = document.get("title") or "Untitled"
            doc_type = document.get("type") or "Unknown type"
            fmt = document.get("format") or "Unknown format"
            url = document.get("url") or "No URL"
            print(f"  - {doc_type}: {title} [{fmt}] -> {url}")

        print()


def fetch_calendar_meetings(args: argparse.Namespace, run_dir: Path, session: requests.Session) -> Path:
    url = (
        f"{OTTAWA_ESCRIBE_MEETINGS_BASE_URL}"
        "/MeetingsCalendarView.aspx/GetCalendarMeetings"
    )
    headers = {
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
    return write_json_to_run_dir(
        run_dir,
        "calendar_meetings.json",
        response.json(),
        log_label="calendar meetings",
    )



def main(args: argparse.Namespace) -> int:
    con = get_connection(args.db_path)
    create_tables(con)
    upsert.seed_councillors(con)
    logger.info("Database ready: %s", args.db_path)

    session = _build_session()
    run_dir = create_run_directory(args)
    meetings_path = fetch_calendar_meetings(args, run_dir, session=session)
    meetings = parse_meetings_json(meetings_path)
    if args.meeting_name:
        meetings = filter_meetings_by_name(meetings, args.meeting_name)
    postminutes_html_english = filter_postminutes_html_english_documents(meetings)
    postminutes_html_english_count = sum(len(m.get("documents", [])) for m in postminutes_html_english)
    print_meeting_documents(postminutes_html_english)
    logger.info(f"PostMinutes HTML documents (English): {len(postminutes_html_english)}")
    logger.info(f"PostMinutes HTML documents (English, total files): {postminutes_html_english_count}")
    logger.info(f"Working directory: {run_dir}")
    logger.info(f"Parsed meetings: {len(meetings)}")
    logger.info(f"Start date: {args.start_date}")
    logger.info(f"End date: {args.end_date}")
    for meeting in postminutes_html_english:
        output_filename = build_meeting_minutes_filename(meeting)
        for document in meeting.get("documents", []):
            meeting_minutes_to_scrape = f"{OTTAWA_ESCRIBE_MEETINGS_BASE_URL}/{document['url']}"
            logger.info("Scraping: %s", meeting_minutes_to_scrape)
            scraped = scrape_minutes_page(
                url=meeting_minutes_to_scrape,
                verify_cert=args.verify_cert,
                base_url=OTTAWA_ESCRIBE_MEETINGS_BASE_URL,
                session=session,
            )
            write_json_to_run_dir(
                run_dir,
                output_filename,
                scraped,
                log_label="scraped meeting minutes",
            )
            upsert.insert_meeting(con, meeting["id"], meeting, scraped)
            delay = random.uniform(args.min_delay, args.max_delay)
            if delay > 0:
                logger.info("Waiting %.1fs before next request...", delay)
                time.sleep(delay)

    con.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main(parse_args()))
