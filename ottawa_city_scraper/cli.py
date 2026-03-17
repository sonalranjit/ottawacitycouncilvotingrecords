import requests
import json
import argparse
from datetime import date, datetime, timedelta
import logging
from pathlib import Path

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


def main(args: argparse.Namespace) -> int:
    run_dir = create_run_directory(args)
    logger.info(f"Working directory: {run_dir}")
    logger.info(f"Start date: {args.start_date}")
    logger.info(f"End date: {args.end_date}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(parse_args()))
