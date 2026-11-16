"""
Council terms and per-term councillor membership.

Reference data lives in reference_data/terms.json (term date ranges) and
reference_data/councillors.json (one record per person, with a `terms` array
giving their title/ward in each term they served). A councillor's membership
window defaults to the term's start/end; an entry's own `start`/`end` override
it for mid-term changes such as resignations and by-elections.

Votes in the database only carry the "F. Lastname" string from the minutes, so
resolving a vote to a person always goes through the meeting date: the same
initial can belong to different people in different terms.
"""

import json
import re
from datetime import date
from pathlib import Path

REFERENCE_DIR = Path(__file__).parent / "reference_data"
TERMS_JSON = REFERENCE_DIR / "terms.json"
COUNCILLORS_JSON = REFERENCE_DIR / "councillors.json"

# Prefixes the minutes put in front of a mover's name
_MOVER_PREFIX = re.compile(r"^(member|councillor|vice-chair|chair)\s+", re.IGNORECASE)


def load_terms(municipality: str = "ottawa") -> list[dict]:
    """Return terms for a municipality, sorted oldest first."""
    terms = json.loads(TERMS_JSON.read_text(encoding="utf-8"))
    terms = [t for t in terms if t.get("municipality", "ottawa") == municipality]
    return sorted(terms, key=lambda t: t["start"])


def load_councillors(municipality: str = "ottawa") -> list[dict]:
    councillors = json.loads(COUNCILLORS_JSON.read_text(encoding="utf-8"))
    return [c for c in councillors if c.get("municipality", "ottawa") == municipality]


def term_for_date(terms: list[dict], iso_date: str) -> str | None:
    """Return the slug of the term containing iso_date (YYYY-MM-DD), or None."""
    for t in terms:
        if t["start"] <= iso_date <= t["end"]:
            return t["slug"]
    return None


def current_term(terms: list[dict], today: str | None = None) -> str:
    """The term containing today, else the most recent term that has started, else the first."""
    today = today or date.today().isoformat()
    slug = term_for_date(terms, today)
    if slug:
        return slug
    started = [t for t in terms if t["start"] <= today]
    return (started[-1] if started else terms[0])["slug"]


def membership_windows(councillor: dict, terms: list[dict]) -> list[tuple[str, str, str]]:
    """Return [(term_slug, start, end)] for each term the councillor served."""
    by_slug = {t["slug"]: t for t in terms}
    windows = []
    for entry in councillor.get("terms", []):
        term = by_slug.get(entry["term"])
        if term is None:
            continue
        windows.append((term["slug"], entry.get("start") or term["start"], entry.get("end") or term["end"]))
    return windows


def latest_term_entry(councillor: dict, terms: list[dict]) -> dict:
    """The councillor's entry for the most recent term they served (title/ward to show by default)."""
    order = {t["slug"]: i for i, t in enumerate(terms)}
    entries = sorted(councillor.get("terms", []), key=lambda e: order.get(e["term"], -1))
    return entries[-1] if entries else {"term": "", "title": "", "ward_number": "", "ward_name": ""}


def strip_mover_prefix(name: str) -> str:
    return _MOVER_PREFIX.sub("", (name or "").strip()).strip()


class CouncillorResolver:
    """Maps a name as written in the minutes plus a meeting date to a councillor's full_name."""

    def __init__(self, councillors: list[dict], terms: list[dict]):
        self.terms = terms
        # name variant -> [(full_name, start, end)]
        self._index: dict[str, list[tuple[str, str, str]]] = {}
        for c in councillors:
            for _, start, end in membership_windows(c, terms):
                for key in (c["first_name_initial"], c["full_name"]):
                    self._index.setdefault(key, []).append((c["full_name"], start, end))

    def resolve(self, name: str, iso_date: str) -> str | None:
        for full_name, start, end in self._index.get((name or "").strip(), []):
            if start <= iso_date <= end:
                return full_name
        return None

    def resolve_mover(self, moved_by: str, iso_date: str) -> str | None:
        return self.resolve(strip_mover_prefix(moved_by), iso_date)
