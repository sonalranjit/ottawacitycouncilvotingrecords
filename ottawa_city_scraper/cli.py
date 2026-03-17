import requests
import json
import argparse
from datetime import date, timedelta
import logging

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
    return parser.parse_args(argv)

def main(args: argparse.Namespace) -> int:
    logger.info(f"Start date: {args.start_date}")
    logger.info(f"End date: {args.end_date}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(parse_args()))
