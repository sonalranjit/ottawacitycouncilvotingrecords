import requests
import json
import logging
from urllib.parse import urljoin

from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fetch_html(url: str, verify_cert: bool = False) -> str:
    session = requests.Session()
    session.trust_env = False
    response = session.get(url, timeout=(10, 60), verify=verify_cert)
    response.raise_for_status()
    return response.text

def parse_minutes_html(html: str, source_url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    return {
        "source_url": source_url,
        "title": soup.title.get_text(strip=True) if soup.title else None,
        "motions": [],
        "votes": [],
    }

def normalize_minutes_data(parsed: dict, source_url: str) -> dict:
    return {
        "source_url": source_url,
        "title": parsed.get("title"),
        "motions": parsed.get("motions", []),
        "votes": parsed.get("votes", []),
    }

def scrape_minutes_page(url: str, verify_cert: bool = False) -> dict:
    logger.info("Scraping minutes page: %s", url)
    html = fetch_html(url, verify_cert=verify_cert)
    parsed = parse_minutes_html(html, source_url=url)
    return normalize_minutes_data(parsed, source_url=url)