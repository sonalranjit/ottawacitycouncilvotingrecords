"""Unit tests for council terms: date → term resolution, membership windows, and per-term vote attribution."""

import json

import duckdb
import pytest

from ottawa_city_scraper import export_web_data
from ottawa_city_scraper.db.schema import create_tables
from ottawa_city_scraper.db.upsert import _insert_motion, seed_councillors
from ottawa_city_scraper.terms import (
    CouncillorResolver,
    current_term,
    latest_term_entry,
    load_councillors,
    load_terms,
    membership_windows,
    term_for_date,
)

TERMS = [
    {"slug": "2022-2026", "label": "2022–2026", "start": "2022-11-15", "end": "2026-11-14"},
    {"slug": "2026-2030", "label": "2026–2030", "start": "2026-11-15", "end": "2030-11-14"},
]


def _entry(term, ward="1", title="Councillor", start=None, end=None):
    return {"term": term, "title": title, "ward_number": ward, "ward_name": f"Ward {ward}", "start": start, "end": end}


def _person(full_name, initial, *entries):
    first, last = full_name.split(" ", 1)
    return {
        "full_name": full_name, "first_name": first, "last_name": last, "first_name_initial": initial,
        "email": "", "telephone": "", "fax": "", "municipality": "ottawa", "terms": list(entries),
    }


# Two different people who both appear as "J. Smith" in the minutes, in different terms
OLD_SMITH = _person("Jane Smith", "J. Smith", _entry("2022-2026", ward="3"))
NEW_SMITH = _person("John Smith", "J. Smith", _entry("2026-2030", ward="7"))
# Leaves mid-term
DEPARTED = _person("Pat Lee", "P. Lee", _entry("2022-2026", ward="5", end="2025-01-31"))
RETURNING = _person("Sam Roy", "S. Roy", _entry("2022-2026", ward="2"), _entry("2026-2030", ward="2", title="Deputy Mayor"))


def test_term_for_date_boundaries():
    assert term_for_date(TERMS, "2022-11-15") == "2022-2026"
    assert term_for_date(TERMS, "2026-11-14") == "2022-2026"
    assert term_for_date(TERMS, "2026-11-15") == "2026-2030"
    assert term_for_date(TERMS, "2022-11-14") is None


def test_current_term():
    assert current_term(TERMS, today="2026-11-01") == "2022-2026"
    assert current_term(TERMS, today="2026-12-01") == "2026-2030"
    # After the last term ends, the most recent one stays current
    assert current_term(TERMS, today="2031-01-01") == "2026-2030"
    assert current_term(TERMS, today="2000-01-01") == "2022-2026"


def test_membership_window_uses_entry_override():
    assert membership_windows(DEPARTED, TERMS) == [("2022-2026", "2022-11-15", "2025-01-31")]


def test_latest_term_entry():
    assert latest_term_entry(RETURNING, TERMS)["title"] == "Deputy Mayor"


def test_resolver_separates_same_initial_across_terms():
    resolver = CouncillorResolver([OLD_SMITH, NEW_SMITH], TERMS)
    assert resolver.resolve("J. Smith", "2024-05-01") == "Jane Smith"
    assert resolver.resolve("J. Smith", "2027-05-01") == "John Smith"
    assert resolver.resolve("John Smith", "2027-05-01") == "John Smith"
    assert resolver.resolve("John Smith", "2024-05-01") is None


def test_resolver_respects_mid_term_departure():
    resolver = CouncillorResolver([DEPARTED], TERMS)
    assert resolver.resolve("P. Lee", "2025-01-29") == "Pat Lee"
    assert resolver.resolve("P. Lee", "2025-03-01") is None


def test_resolve_mover_strips_prefixes():
    resolver = CouncillorResolver([RETURNING], TERMS)
    assert resolver.resolve_mover("Councillor S. Roy", "2027-01-01") == "Sam Roy"
    assert resolver.resolve_mover("Vice-Chair Sam Roy", "2023-01-01") == "Sam Roy"


def test_reference_data_is_consistent():
    terms = load_terms()
    slugs = {t["slug"] for t in terms}
    councillors = load_councillors()
    assert councillors, "councillors.json is empty"
    for c in councillors:
        assert c["terms"], f"{c['full_name']} has no terms"
        for e in c["terms"]:
            assert e["term"] in slugs, f"{c['full_name']} references unknown term {e['term']}"
    # Within a term, "F. Lastname" must identify one person (it is how votes are matched)
    for slug in slugs:
        initials = [c["first_name_initial"] for c in councillors if any(e["term"] == slug for e in c["terms"])]
        assert len(initials) == len(set(initials)), f"duplicate initials in {slug}"


def test_seed_councillors_populates_terms():
    con = duckdb.connect(":memory:")
    create_tables(con)
    seed_councillors(con)
    seed_councillors(con)  # idempotent
    assert con.execute("SELECT COUNT(*) FROM terms").fetchone()[0] == len(load_terms())
    expected = sum(len(c["terms"]) for c in load_councillors())
    assert con.execute("SELECT COUNT(*) FROM councillor_terms").fetchone()[0] == expected


@pytest.fixture
def two_term_db():
    """Meetings in both terms where "J. Smith" is a different person each time."""
    con = duckdb.connect(":memory:")
    create_tables(con)
    for meeting_id, date, voter in [("m-old", "2024-05-01", "J. Smith"), ("m-new", "2027-05-01", "J. Smith")]:
        con.execute(
            "INSERT INTO meetings (meeting_id, municipality, meeting_date, meeting_name, source_url) VALUES (?, 'ottawa', ?, 'City Council', '')",
            [meeting_id, date],
        )
        con.execute(
            "INSERT INTO agenda_items (item_id, meeting_id, agenda_item_number, title) VALUES (?, ?, '1', 'Item')",
            [f"i-{meeting_id}", meeting_id],
        )
        con.execute(
            """INSERT INTO motions (motion_id, item_id, meeting_id, motion_number, motion_moved_by, motion_text,
                                    motion_result, for_count, against_count, vote_kind)
               VALUES (?, ?, ?, '1', 'S. Roy', 'Text', 'Carried', 2, 0, 'recorded')""",
            [f"mo-{meeting_id}", f"i-{meeting_id}", meeting_id],
        )
        for name in (voter, "S. Roy"):
            con.execute("INSERT INTO votes (motion_id, councillor_name, vote) VALUES (?, ?, 'for')", [f"mo-{meeting_id}", name])
    yield con
    con.close()


def test_councillor_export_only_includes_votes_from_their_terms(two_term_db, tmp_path):
    councillors = [OLD_SMITH, NEW_SMITH, RETURNING]
    resolver = CouncillorResolver(councillors, TERMS)
    for c in councillors:
        export_web_data.export_councillor_file(two_term_db, c, tmp_path, TERMS, resolver)

    def load(slug):
        return json.loads((tmp_path / "councillors" / f"{slug}.json").read_text())

    jane, john, sam = load("jane-smith"), load("john-smith"), load("sam-roy")
    assert [(v["date"], v["term"]) for v in jane["votes"]] == [("2024-05-01", "2022-2026")]
    assert [(v["date"], v["term"]) for v in john["votes"]] == [("2027-05-01", "2026-2030")]
    # A returning councillor keeps one profile spanning both terms
    assert sorted(v["term"] for v in sam["votes"]) == ["2022-2026", "2026-2030"]
    assert sorted(m["term"] for m in sam["motions_moved"]) == ["2022-2026", "2026-2030"]
    assert [e["term"] for e in sam["councillor"]["terms"]] == ["2022-2026", "2026-2030"]


def test_alignment_is_computed_per_term(two_term_db, tmp_path):
    councillors = [OLD_SMITH, NEW_SMITH, RETURNING]
    export_web_data.export_alignment(two_term_db, tmp_path, "ottawa", TERMS, CouncillorResolver(councillors, TERMS))
    rows = json.loads((tmp_path / "alignment.json").read_text())
    assert {(r["term"], r["mover"], r["voter"]) for r in rows} == {
        ("2022-2026", "Sam Roy", "Jane Smith"),
        ("2026-2030", "Sam Roy", "John Smith"),
    }
    assert all(r["total_motions_moved"] == 1 and r["alignment_pct"] == 100.0 for r in rows)


def test_dissent_reconstruction_skips_councillors_outside_their_term():
    con = duckdb.connect(":memory:")
    create_tables(con)
    con.execute("INSERT INTO meetings (meeting_id, municipality, meeting_date) VALUES ('m', 'ottawa', '2027-05-01')")
    # Former and current councillors share a last name; only the current one sits in 2027
    for full_name, initial, term, start, end in [
        ("Jane Smith", "J. Smith", "2022-2026", "2022-11-15", "2026-11-14"),
        ("Kim Smith", "K. Smith", "2026-2030", "2026-11-15", "2030-11-14"),
        ("Sam Roy", "S. Roy", "2026-2030", "2026-11-15", "2030-11-14"),
    ]:
        first, last = full_name.split()
        con.execute(
            "INSERT INTO councillors (full_name, municipality, first_name, last_name, first_name_initial) VALUES (?, 'ottawa', ?, ?, ?)",
            [full_name, first, last, initial],
        )
        con.execute(
            "INSERT INTO councillor_terms (full_name, municipality, term_slug, start_date, end_date) VALUES (?, 'ottawa', ?, ?, ?)",
            [full_name, term, start, end],
        )
    for name in ("Kim Smith", "Sam Roy"):
        con.execute("INSERT INTO meeting_attendance VALUES ('m', ?, 'present')", [name])

    _insert_motion(con, "m", "item", {
        "motion_number": "1", "motion_text": "Text", "motion_result": "Carried",
        "motion_votes": {}, "dissent_voters": ["S. Roy"],
    })
    votes = dict(con.execute("SELECT councillor_name, vote FROM votes").fetchall())
    assert votes == {"K. Smith": "for", "S. Roy": "against"}
