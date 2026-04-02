"""
Enrich motions with AI-generated plain-English summaries and thematic tags.

This module serves two purposes:
  1. Standalone script — bulk-enrich the existing historical DB (one-time run).
  2. Callable function — used by cli.py via --enrich to tag newly scraped motions.

Reads only from existing scraped tables (motions, agenda_items).
Writes only to motion_ai_enrichment. Never modifies scraped data.

Usage:
    # Bulk-enrich all untagged motions
    python -m ottawa_city_scraper.tag_motions

    # Preview what would be sent (no API calls)
    python -m ottawa_city_scraper.tag_motions --dry-run

    # Custom DB path or batch size
    python -m ottawa_city_scraper.tag_motions --db datasets/ottawa_city_scraper.duckdb --batch-size 10

    # Re-process all motions (even already enriched ones)
    python -m ottawa_city_scraper.tag_motions --re-enrich
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "datasets" / "ottawa_city_scraper.duckdb"
DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_BATCH_SIZE = 20

ALLOWED_TAGS = [
    "Budget & Finance",
    "Housing & Zoning",
    "Transit & Transportation",
    "Roads & Infrastructure",
    "Parks & Recreation",
    "Environment & Sustainability",
    "Public Safety",
    "Social Services",
    "Governance & Procedure",
    "Economic Development",
    "Land Use & Planning",
    "Arts Culture & Events",
    "Community & Neighbourhood",
    "Property & Procurement",
    "Licensing & Permits",
    "Indigenous Relations",
    "Personnel & Appointments",
]

SYSTEM_PROMPT = """\
You are helping everyday Ottawa residents understand what their city council is voting on. \
Most readers have no background in politics, law, or bureaucracy.

For each motion in the input array, produce a summary and tags. Rules:
- summary: 1-2 plain sentences explaining what council is actually deciding and why it matters \
to residents. Write as if explaining to a neighbour who has never attended a council meeting. \
Avoid jargon like "moved", "whereas", "resolved", "bylaw", "delegated authority" — use plain \
everyday words instead. Do not start with "This motion" or "Council". Be concrete: name the \
street, neighbourhood, dollar amount, or service affected if present.
  BAD: "Approves the delegated authority report for Q1 in accordance with Bylaw 2002-189."
  GOOD: "Lets staff approve small construction and permit requests without needing a full \
council vote, as they do each quarter."
- tags: 1-3 tags chosen strictly from the allowed list.\
"""

# Tool definition enforces JSON schema on the response — no post-parsing validation needed.
ENRICHMENT_TOOL = {
    "name": "record_motion_enrichments",
    "description": "Record the enriched summary and tags for each motion.",
    "input_schema": {
        "type": "object",
        "required": ["enrichments"],
        "properties": {
            "enrichments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["motion_id", "summary", "tags"],
                    "additionalProperties": False,
                    "properties": {
                        "motion_id": {"type": "string"},
                        "summary": {"type": "string"},
                        "tags": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 3,
                            "items": {
                                "type": "string",
                                "enum": ALLOWED_TAGS,
                            },
                        },
                    },
                },
            }
        },
    },
}


def _fetch_untagged_motions(
    con: duckdb.DuckDBPyConnection, re_enrich: bool
) -> list[dict[str, str]]:
    """Return motions that have not yet been enriched (or all if re_enrich=True)."""
    where = (
        ""
        if re_enrich
        else "WHERE e.motion_id IS NULL AND m.motion_text IS NOT NULL AND trim(m.motion_text) != ''"
    )
    if re_enrich:
        where = "WHERE m.motion_text IS NOT NULL AND trim(m.motion_text) != ''"

    rows = con.execute(
        f"""
        SELECT
            m.motion_id,
            ai.title          AS item_title,
            ai.description    AS item_description,
            m.motion_text
        FROM motions m
        JOIN agenda_items ai ON m.item_id = ai.item_id
        LEFT JOIN motion_ai_enrichment e ON m.motion_id = e.motion_id
        {where}
        ORDER BY m.motion_id
        """
    ).fetchall()

    return [
        {
            "motion_id": row[0],
            "item_title": row[1] or "",
            "item_description": row[2] or "",
            "motion_text": row[3] or "",
        }
        for row in rows
    ]


def _build_user_payload(batch: list[dict[str, str]]) -> str:
    """Truncate fields and serialise a batch to JSON for the user message."""
    payload = [
        {
            "motion_id": row["motion_id"],
            "agenda_item_title": row["item_title"][:300],
            "agenda_item_description": row["item_description"][:500],
            "motion_text": row["motion_text"][:1000],
        }
        for row in batch
    ]
    return json.dumps(payload, ensure_ascii=False)


def _call_claude(
    client: Any, batch: list[dict[str, str]], model: str
) -> list[dict[str, Any]]:
    """Call Claude with tool-use to get structured enrichments for a batch."""
    import anthropic

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        tools=[ENRICHMENT_TOOL],
        tool_choice={"type": "tool", "name": "record_motion_enrichments"},
        messages=[{"role": "user", "content": _build_user_payload(batch)}],
    )

    # The tool_choice forces the model to call our tool; result is in content[0].input
    tool_block = next(
        (b for b in response.content if b.type == "tool_use"), None
    )
    if tool_block is None:
        raise ValueError("Claude did not return a tool_use block")

    enrichments: list[dict[str, Any]] = tool_block.input.get("enrichments", [])

    # Verify each returned motion_id was in the batch (defence against hallucination)
    batch_ids = {row["motion_id"] for row in batch}
    valid = [e for e in enrichments if e["motion_id"] in batch_ids]
    if len(valid) != len(enrichments):
        print(
            f"  Warning: {len(enrichments) - len(valid)} enrichment(s) had unknown motion_ids and were discarded.",
            file=sys.stderr,
        )
    return valid


def _upsert_enrichments(
    con: duckdb.DuckDBPyConnection,
    enrichments: list[dict[str, Any]],
    model: str,
) -> None:
    for e in enrichments:
        con.execute(
            """
            INSERT OR REPLACE INTO motion_ai_enrichment (motion_id, summary, tags, model)
            VALUES (?, ?, ?, ?)
            """,
            [e["motion_id"], e["summary"], e["tags"], model],
        )


def enrich_motions(
    con: duckdb.DuckDBPyConnection,
    api_key: str,
    model: str = DEFAULT_MODEL,
    batch_size: int = DEFAULT_BATCH_SIZE,
    re_enrich: bool = False,
    dry_run: bool = False,
) -> int:
    """
    Enrich untagged motions with AI-generated summaries and tags.

    Returns the number of motions successfully enriched.
    Can be called from cli.py as well as run standalone.
    """
    import anthropic

    con.execute("""
        CREATE TABLE IF NOT EXISTS motion_ai_enrichment (
            motion_id   VARCHAR PRIMARY KEY,
            summary     VARCHAR,
            tags        VARCHAR[],
            model       VARCHAR,
            enriched_at TIMESTAMP DEFAULT current_timestamp
        )
    """)

    motions = _fetch_untagged_motions(con, re_enrich)
    if not motions:
        print("No untagged motions found — nothing to do.")
        return 0

    print(f"Found {len(motions)} motion(s) to enrich.")

    if dry_run:
        print("Dry run — showing first batch payload only, no API calls made.")
        first_batch = motions[:batch_size]
        print(_build_user_payload(first_batch))
        return 0

    client = anthropic.Anthropic(api_key=api_key)
    total_enriched = 0
    chunks = [motions[i : i + batch_size] for i in range(0, len(motions), batch_size)]

    for i, batch in enumerate(chunks, 1):
        print(f"  Batch {i}/{len(chunks)} ({len(batch)} motions)...", end=" ", flush=True)
        try:
            results = _call_claude(client, batch, model)
            _upsert_enrichments(con, results, model)
            total_enriched += len(results)
            print(f"done ({len(results)} enriched).")
        except Exception as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
        # Brief pause to avoid hitting rate limits
        if i < len(chunks):
            time.sleep(0.5)

    print(f"Enriched {total_enriched}/{len(motions)} motions.")
    return total_enriched


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich motions with AI-generated summaries and tags."
    )
    parser.add_argument("--db", type=Path, default=DB_PATH, help="Path to DuckDB database")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Motions per API call (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Anthropic API key (default: ANTHROPIC_API_KEY env var)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print first batch payload without making API calls",
    )
    parser.add_argument(
        "--re-enrich",
        action="store_true",
        help="Re-process all motions, even those already enriched",
    )
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        print(
            "Error: ANTHROPIC_API_KEY environment variable not set. "
            "Use --api-key or set the env var.",
            file=sys.stderr,
        )
        sys.exit(1)

    con = duckdb.connect(str(args.db))
    try:
        enrich_motions(
            con=con,
            api_key=api_key or "",
            model=args.model,
            batch_size=args.batch_size,
            re_enrich=args.re_enrich,
            dry_run=args.dry_run,
        )
    finally:
        con.close()


if __name__ == "__main__":
    main()
