from meeting_minutes_scraper import scrape_minutes_page
from cli import write_json_to_run_dir, create_run_directory, build_run_dir_name
import logging
import argparse
from datetime import date, datetime, timedelta

logging.basicConfig(
    level="INFO",
    format="%(message)s",
    datefmt="[%X]"
)

logger = logging.getLogger(__name__)

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Testing the beautifulsoup scraper"
    )
    parser.add_argument("--start-date", default=date.today().strftime("%Y-%m-%d"), help="Start date to scrape meetings from in format YYYY-mm-dd")
    parser.add_argument("--end-date", default=(date.today() + timedelta(days=1)).strftime("%Y-%m-%d"), help="End date to scrape meetings until in format YYYY-mm-dd")
    parser.add_argument("--output-root", default="datasets", help="Directory where each run folder will be created")
    return parser.parse_args(argv)

def main(args: argparse.Namespace) -> int:
    run_dir = create_run_directory(args)
    write_json_to_run_dir(
        run_dir,
        "scraped-meeting-minutes.json",
        scrape_minutes_page(html_file="datasets/website-capture/city-council-2025-02-25.html"),
        log_label="Scraped meeting minutes",
    )

    return 0

if __name__ == "__main__":
    raise SystemExit(main(parse_args()))
