"""
Export all recorded votes for a councillor from the persistent DuckDB to CSV,
in the same format as the horizonottawa manually curated CSVs.

Usage:
    python -m ottawa_city_scraper.export_councillor_votes "Ariel Troster"
    python -m ottawa_city_scraper.export_councillor_votes ariel-troster
    python -m ottawa_city_scraper.export_councillor_votes "A. Troster"
    python -m ottawa_city_scraper.export_councillor_votes "Ariel Troster" --output ariel-troster.csv
    python -m ottawa_city_scraper.export_councillor_votes "Ariel Troster" --term 2022-2026
    python -m ottawa_city_scraper.export_councillor_votes --list
"""
import argparse
import csv
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import duckdb

from .terms import CouncillorResolver, load_councillors, load_terms, term_for_date

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "ottawa_city_scraper.duckdb"

CSV_COLUMNS = [
    "councillor",
    "airtable_row_index",
    "airtable_row_key",
    "date",
    "vote",
    "motion",
    "ward",
    "meeting_link",
    "result",
    "vote_tally",
]


def _to_slug(name: str) -> str:
    n = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode("ascii")
    return n.lower().replace(" ", "-")


def resolve_councillor(query: str, councillors: list[dict]) -> dict:
    """
    Accept full name, slug (ariel-troster), or first_name_initial (A. Troster).
    Returns the matching councillor dict, or raises SystemExit.
    """
    q = query.strip()
    for c in councillors:
        if (
            c["full_name"].lower() == q.lower()
            or _to_slug(c["full_name"]) == _to_slug(q)
            or c["first_name_initial"].lower() == q.lower()
        ):
            return c
    candidates = [c["full_name"] for c in councillors]
    sys.exit(
        f"Councillor {q!r} not found.\nKnown councillors:\n"
        + "\n".join(f"  {n}" for n in sorted(candidates))
    )


def _format_date(iso_date: str) -> str:
    """Convert YYYY-MM-DD to M/D/YYYY (no leading zeros), matching the CSV format."""
    d = datetime.strptime(iso_date, "%Y-%m-%d")
    return f"{d.month}/{d.day}/{d.year}"


def _format_result(motion_result: str) -> str:
    """Map the scraped motion_result text to Passed / Failed."""
    r = motion_result.lower()
    if r.startswith("carried") or r.startswith("received"):
        return "Passed"
    if r.startswith("lost"):
        return "Failed"
    if r.startswith("withdrawn"):
        return "Withdrawn"
    return motion_result  # preserve as-is when unrecognised


def _ward_display(term_entry: dict) -> str:
    if term_entry.get("ward_name"):
        return f"{term_entry['ward_name']} Ward"
    # Mayor or any role without a ward — use title
    return term_entry.get("title", "")


def export_votes(
    councillor: dict,
    con: duckdb.DuckDBPyConnection,
    terms: list[dict],
    resolver: CouncillorResolver,
    term: str | None = None,
) -> list[dict]:
    """Return the councillor's votes, optionally limited to one term.

    Votes are matched by "F. Lastname" and kept only for meetings inside the
    councillor's term memberships; the ward column reflects the term of each vote.
    """
    initial = councillor["first_name_initial"]
    slug = _to_slug(councillor["full_name"])
    ward_by_term = {e["term"]: _ward_display(e) for e in councillor.get("terms", [])}

    rows = con.execute(
        """
        SELECT
            mt.meeting_date,
            mt.source_url,
            m.motion_number,
            m.motion_text,
            m.motion_result,
            m.for_count,
            m.against_count,
            v.vote
        FROM votes v
        JOIN motions  m  ON v.motion_id  = m.motion_id
        JOIN meetings mt ON m.meeting_id = mt.meeting_id
        WHERE v.councillor_name = ?
        ORDER BY mt.meeting_date DESC, m.motion_number
        """,
        [initial],
    ).fetchall()

    records = []
    for meeting_date, source_url, motion_number, motion_text, motion_result, for_count, against_count, vote in rows:
        iso_date = str(meeting_date)[:10]
        if resolver.resolve(initial, iso_date) != councillor["full_name"]:
            continue
        vote_term = term_for_date(terms, iso_date)
        if term and vote_term != term:
            continue
        records.append({
            "councillor": slug,
            "airtable_row_index": len(records) + 1,
            "airtable_row_key": "",
            "date": _format_date(meeting_date),
            "vote": "Yes" if vote == "for" else "No",
            "motion": motion_text.strip(),
            "ward": ward_by_term.get(vote_term, ""),
            "meeting_link": source_url,
            "result": _format_result(motion_result),
            "vote_tally": f"{for_count} Yes / {against_count} No",
        })
    return records


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export a councillor's recorded votes from DuckDB as CSV."
    )
    parser.add_argument(
        "councillor",
        nargs="?",
        help="Full name, slug (ariel-troster), or initial format (A. Troster)",
    )
    parser.add_argument(
        "--output", "-o",
        help="Output CSV file path (default: stdout)",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="List all available councillors and exit",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Export votes for all councillors; writes one CSV per councillor into --output-dir",
    )
    parser.add_argument(
        "--output-dir", "-d", default=".",
        help="Directory for --all output files (default: current directory)",
    )
    parser.add_argument(
        "--term",
        help="Only export votes from this council term, e.g. 2022-2026 (default: all terms)",
    )
    parser.add_argument(
        "--db", default=str(DB_PATH),
        help=f"Path to DuckDB file (default: {DB_PATH})",
    )
    args = parser.parse_args()

    councillors = load_councillors()
    terms = load_terms()
    resolver = CouncillorResolver(councillors, terms)
    term_slugs = [t["slug"] for t in terms]
    if args.term and args.term not in term_slugs:
        parser.error(f"unknown term {args.term!r}; known terms: {', '.join(term_slugs)}")

    if args.list:
        for c in sorted(councillors, key=lambda x: x["last_name"]):
            served = ", ".join(e["term"] for e in c.get("terms", []))
            print(f"{c['full_name']:25}  {_to_slug(c['full_name']):25}  {served}")
        return

    con = duckdb.connect(args.db, read_only=True)

    if args.all:
        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for councillor in sorted(councillors, key=lambda x: x["last_name"]):
            records = export_votes(councillor, con, terms, resolver, args.term)
            slug = _to_slug(councillor["full_name"])
            if not records:
                print(f"  skipped {councillor['full_name']} — no recorded votes", file=sys.stderr)
                continue
            out_path = out_dir / f"{slug}.csv"
            with open(out_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
                writer.writeheader()
                writer.writerows(records)
            print(f"  {slug}.csv  ({len(records)} votes)", file=sys.stderr)
        return

    if not args.councillor:
        parser.error("councillor argument is required (or use --all / --list)")

    councillor = resolve_councillor(args.councillor, councillors)
    records = export_votes(councillor, con, terms, resolver, args.term)

    if not records:
        print(
            f"No recorded votes found for {councillor['full_name']} "
            f"({councillor['first_name_initial']}) in the database.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.output:
        out = open(args.output, "w", newline="", encoding="utf-8")
    else:
        out = sys.stdout

    writer = csv.DictWriter(out, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    writer.writerows(records)

    if args.output:
        out.close()
        print(f"Wrote {len(records)} votes to {args.output}", file=sys.stderr)
    else:
        print(f"\n({len(records)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
