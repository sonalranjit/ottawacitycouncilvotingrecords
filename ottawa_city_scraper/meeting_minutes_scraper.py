import requests
import json
import logging
from urllib.parse import urljoin
from pathlib import Path

from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fetch_html(url: str, verify_cert: bool = False) -> str:
    session = requests.Session()
    session.trust_env = False
    response = session.get(url, timeout=(10, 60), verify=verify_cert)
    response.raise_for_status()
    return response.text

def load_html_file(file_path: str | Path) -> str:
    return(Path(file_path).read_text(encoding="utf-8"))

def normalize_councillor_name(raw_name: str) -> str:
    name = raw_name.strip().rstrip(",")
    return name.removeprefix("Mayor ").removeprefix("and ").removeprefix("Councillor ")

def parse_header(agenda_header: BeautifulSoup) -> dict:
    agenda_header_details_table = agenda_header.find('div', class_='AgendaHeaderDetailsTable')
    meeting_number = agenda_header_details_table.find('div', class_='AgendaMeetingNumberText').get_text(strip=True)
    meeting_date = agenda_header_details_table.find('div', class_='AgendaMeetingTime').find('time')['datetime']
    meeting_start_time = agenda_header_details_table.find('span', class_='AgendaMeetingTimeStart').find('time')['datetime']
    meeting_location = agenda_header_details_table.find('div', class_='Location').get_text(strip=True)
    agenda_header_attendance_table = agenda_header.find('div', class_='AgendaHeaderAttendanceTable').find_all('div')
    present_attendees = []
    absent_attendees = []

    for attendance_div in agenda_header_attendance_table:
        attendance_label = attendance_div.find('div', class_='Label')
        if attendance_label is not None and attendance_label.get_text(strip=True) == "Present:":
            present_councillors = attendance_div.find_all('li')
            for councillor in present_councillors:
                logger.info("Present councillor: %s", normalize_councillor_name(councillor.get_text(strip=True, separator=" ")))
                present_attendees.append(normalize_councillor_name(councillor.get_text(strip=True, separator=" ")))
        elif attendance_label is not None and attendance_label.get_text(strip=True) == "Absent:":
            absent_councillors = attendance_div.find_all('li')
            for councillor in absent_councillors:
                logger.info("Absent councillor: %s", normalize_councillor_name(councillor.get_text(strip=True, separator=" ")))
                absent_attendees.append(normalize_councillor_name(councillor.get_text(strip=True, separator=" ")))
    return {
        "meeting_number": int(meeting_number),
        "meeting_date": meeting_date,
        "meeting_start_time": meeting_start_time,
        "meeting_location": meeting_location,
        "present_attendees": present_attendees,
        "absent_attendees": absent_attendees
    }

def parse_minutes_html(html: str, source: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    agenda_header = soup.find('header', class_='AgendaHeader')
    logger.info(agenda_header)
    parsed_header = parse_header(agenda_header)

    return {
        "source": source,
        "title": soup.title.get_text(strip=True) if soup.title else None,
        "meeting_number": parsed_header["meeting_number"],
        "meeting_date": parsed_header["meeting_date"],
        "meeting_start_time": parsed_header["meeting_start_time"],
        "meeting_location": parsed_header["meeting_location"],
        "present_attendees": parsed_header["present_attendees"],
        "absent_attendees": parsed_header["absent_attendees"],
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

def scrape_minutes_page(
        *,
        url: str | None = None,
        html_file: str | Path | None = None,
        verify_cert: bool = False,
    ) -> dict:
    if url is not None and html_file is not None:
        raise ValueError("Provide exactly one of 'url' or 'html_file'")
    
    if url is None and html_file is None:
        raise ValueError("Provide one of 'url' or 'html_file'")

    if html_file is not None:
        html = load_html_file(html_file)
        return parse_minutes_html(html, source=str(html_file))
    
    if url is None:
        raise ValueError("url is required when html_file is not provided")

    logger.info("Scraping minutes page: %s", url)
    html = fetch_html(url, verify_cert=verify_cert)
    parsed = parse_minutes_html(html, source=url)
    return normalize_minutes_data(parsed, source_url=url)