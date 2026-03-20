import requests
import json
import logging
from urllib.parse import urljoin
from pathlib import Path
from typing import Any
import re

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
    present_attendees = []
    absent_attendees = []
    attendance_table = agenda_header.find('div', class_='AgendaHeaderAttendanceTable')
    attendance_divs = [] if attendance_table is None else attendance_table.find_all('div')

    for attendance_div in attendance_divs:
        attendance_label = attendance_div.find('div', class_='Label')
        if attendance_label is not None and attendance_label.get_text(strip=True) == "Present:":
            present_councillors = attendance_div.find_all('li')
            for councillor in present_councillors:
                present_attendees.append(normalize_councillor_name(councillor.get_text(strip=True, separator=" ")))
        elif attendance_label is not None and attendance_label.get_text(strip=True) == "Absent:":
            absent_councillors = attendance_div.find_all('li')
            for councillor in absent_councillors:
                absent_attendees.append(normalize_councillor_name(councillor.get_text(strip=True, separator=" ")))
    return {
        "meeting_number": int(meeting_number) if meeting_number is not None and meeting_number != "" else 0,
        "meeting_date": meeting_date,
        "meeting_start_time": meeting_start_time,
        "meeting_location": meeting_location,
        "present_attendees": present_attendees,
        "absent_attendees": absent_attendees
    }

def parse_motion_voters(motion_voters: BeautifulSoup) -> dict:
    parsed_votes = {} 
    vote_rows = motion_voters.find_all('tr')
    for vote_row in vote_rows:
        voter_vote = vote_row.find('td', class_='VoterVote', recursive=False)
        votes_users = vote_row.find('td', class_='VotesUsers', recursive=False)
        voter_vote_text = "" if voter_vote is None else voter_vote.get_text(strip=True)
        votes_users = "" if votes_users is None else votes_users.get_text(strip=True).split(',')
        votes_users_sanitized = []
        for votes_user in  votes_users:
            sanitized_user_text = votes_user.removeprefix(" ").removeprefix(" and ")
            votes_users_sanitized.append(sanitized_user_text)
        if voter_vote_text.startswith("For"):
            for_votes_match = re.search(r"\((\d+)\)", voter_vote_text)
            parsed_votes["for"] = {
                "councillors": votes_users_sanitized,
                "count": int(for_votes_match.group(1))
            } 
        elif voter_vote_text.startswith("Against"):
            against_votes_match = re.search(r"\((\d+)\)", voter_vote_text)
            parsed_votes["against"] = {
                "councillors": votes_users_sanitized,
                "count": int(against_votes_match.group(1))
            }
    return parsed_votes

def parse_agenda_item_motions(agenda_item_motions: BeautifulSoup) -> list[dict]:
    parsed_agenda_item_motions = []
    for agenda_item_motion in agenda_item_motions.find_all('li', class_='AgendaItemMotion', recursive=False):
        parsed_agenda_item_motion: dict[str, str] = {}
        pre_motion_text = agenda_item_motion.find('div', class_='PremotionText', recursive=False)
        motion_number = agenda_item_motion.find('div', class_='Number', recursive=False)
        motion_number_text = "" if motion_number is None else motion_number.get_text(strip=True)
        motion_moved_by = agenda_item_motion.find('div', class_='MovedBy', recursive=False)
        motion_moved_by_text = "" if motion_moved_by is None else motion_moved_by.get_text(strip=True)
        motion_seconded_by = agenda_item_motion.find('div', class_='SecondedBy', recursive=False)
        motion_seconded_by_text = "" if motion_seconded_by is None else motion_seconded_by.get_text(strip=True)
        motion_text = agenda_item_motion.find('div', class_='MotionText', recursive=False)
        motion_voters = agenda_item_motion.find('table', class_='MotionVoters', recursive=False)
        parsed_motion_voters = {}
        if motion_voters is not None:
            parsed_motion_voters = parse_motion_voters(motion_voters)
        motion_result = agenda_item_motion.find('div', class_='MotionResult', recursive=False)
        motion_result_text = "" if motion_result is None else motion_result.get_text(strip=True)
        post_motion_text = agenda_item_motion.find('div', class_='PostMotionText', recursive=False)
        parsed_agenda_item_motion["premotion_text"] = "" if pre_motion_text is None else pre_motion_text.get_text(strip=True)
        parsed_agenda_item_motion["motion_number"] = motion_number_text
        parsed_agenda_item_motion["motion_moved_by"] = motion_moved_by_text
        parsed_agenda_item_motion["motion_seconded_by"] = motion_seconded_by_text
        parsed_agenda_item_motion["motion_text"] = "" if motion_text is None else motion_text.get_text(strip=True)
        parsed_agenda_item_motion["motion_votes"] = parsed_motion_voters
        parsed_agenda_item_motion["motion_result"] = motion_result_text
        parsed_agenda_item_motion["post_motion_text"] = "" if post_motion_text is None else post_motion_text.get_text(strip=True)
        if not any(parsed_agenda_item_motion.values()):
            continue
        parsed_agenda_item_motions.append(parsed_agenda_item_motion)
    return parsed_agenda_item_motions

def parse_agenda_item_container(agenda_item_container: BeautifulSoup) -> dict:
    parsed_agenda_item_container = {}
    agenda_items = agenda_item_container.find_all('div', class_='AgendaItem', recursive=False)
    for agenda_item in agenda_items:
        agenda_item_counter = agenda_item.find('div', class_='AgendaItemCounter')
        agenda_item_title = agenda_item.find('div', class_='AgendaItemTitle')
        parsed_agenda_item_container["agenda_item_number"] = "" if agenda_item_counter is None else agenda_item_counter.get_text(strip=True)
        parsed_agenda_item_container["title"] = "" if agenda_item_title is None else agenda_item_title.get_text(strip=True)
        description_parts = []
        minutes_parts = []
        motions = []
        agenda_item_content_rows = agenda_item.find_all('div', class_='AgendaItemContentRow', recursive=False)
        for agenda_item_content_row in agenda_item_content_rows:
            agenda_item_description = agenda_item_content_row.find('div', class_='AgendaItemDescription', recursive=False)
            agenda_item_minutes = agenda_item_content_row.find('div', class_='AgendaItemMinutes', recursive=False)
            agenda_item_motions = agenda_item_content_row.find('ul', class_='AgendaItemMotions', recursive=False)
            agenda_item_description_text = "" if agenda_item_description is None else "\n".join([p.get_text() for p in agenda_item_description.find_all('p')])
            agenda_item_minutes_text = "" if agenda_item_minutes is None else "\n".join([p.get_text() for p in agenda_item_minutes.find_all('p')])
            if agenda_item_description_text:
                description_parts.append(agenda_item_description_text)
            if agenda_item_minutes_text:
                minutes_parts.append(agenda_item_minutes_text)
            if agenda_item_motions is not None:
                motions.extend(parse_agenda_item_motions(agenda_item_motions))
        parsed_agenda_item_container["description"] = "\n".join(description_parts)
        parsed_agenda_item_container["minutes"] = "\n".join(minutes_parts)
        parsed_agenda_item_container["motions"] = motions
    sub_agenda_item_containers = []
    for child_div in agenda_item_container.find_all('div', recursive=False):
        child_classes = child_div.get("class", [])
        if "AgendaItem" in child_classes:
            continue
        if "AgendaItemContainer" in child_classes:
            sub_agenda_item_containers.append(child_div)
            continue
        sub_agenda_item_containers.extend(
            child_div.find_all('div', class_='AgendaItemContainer', recursive=False)
        )

    if len(sub_agenda_item_containers) > 0:
        sub_agenda_items = []
        for sub_agenda_item_container in sub_agenda_item_containers:
            parsed_sub_agenda_item_container = parse_agenda_item_container(sub_agenda_item_container)
            sub_agenda_items.append(parsed_sub_agenda_item_container)
        parsed_agenda_item_container["sub_agendas_items"] = sub_agenda_items
    return parsed_agenda_item_container

def parse_agenda_items(agenda_items: BeautifulSoup) -> dict:
    parsed_agenda_items = []
    agenda_item_containers = agenda_items.find_all('div', class_='AgendaItemContainer', recursive=False)
    for agenda_item_container in agenda_item_containers:
        parsed_agenda_item_container = parse_agenda_item_container(agenda_item_container)
        parsed_agenda_items.append(parsed_agenda_item_container)

    return {
        "total_agenda_items": len(agenda_item_containers),
        "agenda_items": parsed_agenda_items
    }


def parse_minutes_html(html: str, source: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    agenda_header = soup.find('header', class_='AgendaHeader')
    agenda_items = soup.find('div', class_='AgendaItems')
    parsed_header = parse_header(agenda_header)
    parsed_agenda_items = parse_agenda_items(agenda_items)

    return {
        "source": source,
        "title": soup.title.get_text(strip=True) if soup.title else None,
        "meeting_number": parsed_header["meeting_number"],
        "meeting_date": parsed_header["meeting_date"],
        "meeting_start_time": parsed_header["meeting_start_time"],
        "meeting_location": parsed_header["meeting_location"],
        "present_attendees": parsed_header["present_attendees"],
        "absent_attendees": parsed_header["absent_attendees"],
        "agenda_items": parsed_agenda_items,
    }

def normalize_minutes_data(parsed: dict, source_url: str) -> dict:
    return {
        "source_url": source_url,
        "source": parsed.get("source"),
        "title": parsed.get("title"),
        "meeting_number": parsed.get("meeting_number"),
        "meeting_date": parsed.get("meeting_date"),
        "meeting_start_time": parsed.get("meeting_start_time"),
        "meeting_location": parsed.get("meeting_location"),
        "present_attendees": parsed.get("present_attendees", []),
        "absent_attendees": parsed.get("absent_attendees", []),
        "agenda_items": parsed.get("agenda_items", {}),
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

    html = fetch_html(url, verify_cert=verify_cert)
    parsed = parse_minutes_html(html, source=url)
    return normalize_minutes_data(parsed, source_url=url)
