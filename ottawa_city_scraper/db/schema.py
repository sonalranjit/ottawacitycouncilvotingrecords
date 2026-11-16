import duckdb


def create_tables(con: duckdb.DuckDBPyConnection) -> None:
    """Create all tables if they don't already exist. Safe to call on every run."""

    con.execute("""
        CREATE TABLE IF NOT EXISTS councillors (
            full_name           VARCHAR,
            municipality        VARCHAR,
            first_name          VARCHAR,
            last_name           VARCHAR,
            first_name_initial  VARCHAR,
            title               VARCHAR,
            ward_number         VARCHAR,
            ward_name           VARCHAR,
            telephone           VARCHAR,
            fax                 VARCHAR,
            email               VARCHAR,
            active              BOOLEAN DEFAULT TRUE,
            PRIMARY KEY (full_name, municipality)
        )
    """)

    # Council terms; a meeting belongs to the term whose date range contains meeting_date
    con.execute("""
        CREATE TABLE IF NOT EXISTS terms (
            slug            VARCHAR,
            municipality    VARCHAR,
            label           VARCHAR,
            start_date      DATE,
            end_date        DATE,
            PRIMARY KEY (slug, municipality)
        )
    """)

    # One row per councillor per term served; start/end_date are the membership
    # window (the term's dates unless the councillor joined or left mid-term)
    con.execute("""
        CREATE TABLE IF NOT EXISTS councillor_terms (
            full_name       VARCHAR,
            municipality    VARCHAR,
            term_slug       VARCHAR,
            title           VARCHAR,
            ward_number     VARCHAR,
            ward_name       VARCHAR,
            start_date      DATE,
            end_date        DATE,
            PRIMARY KEY (full_name, municipality, term_slug)
        )
    """)

    con.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            meeting_id          VARCHAR PRIMARY KEY,
            municipality        VARCHAR,
            meeting_number      INTEGER,
            meeting_date        VARCHAR,
            meeting_start_time  VARCHAR,
            meeting_location    VARCHAR,
            meeting_name        VARCHAR,
            meeting_type        VARCHAR,
            source_url          VARCHAR,
            scraped_at          TIMESTAMP DEFAULT current_timestamp
        )
    """)

    # One row per councillor per meeting; status is 'present' or 'absent'
    con.execute("""
        CREATE TABLE IF NOT EXISTS meeting_attendance (
            meeting_id      VARCHAR,
            councillor_name VARCHAR,
            status          VARCHAR,
            PRIMARY KEY (meeting_id, councillor_name)
        )
    """)

    # Flattened agenda items; item_id is a deterministic hash of (meeting_id, number, title)
    con.execute("""
        CREATE TABLE IF NOT EXISTS agenda_items (
            item_id             VARCHAR PRIMARY KEY,
            meeting_id          VARCHAR,
            agenda_item_number  VARCHAR,
            title               VARCHAR,
            description         VARCHAR,
            minutes             VARCHAR
        )
    """)

    # One row per motion; motion_id is a deterministic hash of (item_id, motion_number, motion_text)
    # vote_kind: 'recorded' (roll-call vote), 'dissent' (votes reconstructed from
    # "Carried with dissent" prose), or 'none' (voice vote, no individual votes)
    con.execute("""
        CREATE TABLE IF NOT EXISTS motions (
            motion_id           VARCHAR PRIMARY KEY,
            item_id             VARCHAR,
            meeting_id          VARCHAR,
            motion_number       VARCHAR,
            motion_moved_by     VARCHAR,
            motion_seconded_by  VARCHAR,
            motion_text         VARCHAR,
            motion_result       VARCHAR,
            for_count           INTEGER,
            against_count       INTEGER,
            vote_kind           VARCHAR
        )
    """)

    # One row per councillor per motion; vote is 'for' or 'against'
    con.execute("""
        CREATE TABLE IF NOT EXISTS votes (
            motion_id       VARCHAR,
            councillor_name VARCHAR,
            vote            VARCHAR,
            PRIMARY KEY (motion_id, councillor_name)
        )
    """)

    # Attachments linked to agenda items
    con.execute("""
        CREATE TABLE IF NOT EXISTS agenda_item_attachments (
            item_id             VARCHAR,
            url                 VARCHAR,
            attachment_title    VARCHAR,
            PRIMARY KEY (item_id, url)
        )
    """)

    # AI-generated summaries and thematic tags for motions.
    # Kept separate from motions so re-scrapes (INSERT OR REPLACE INTO motions) don't wipe enrichment data.
    # motion_id is the same deterministic hash used in the motions table.
    con.execute("""
        CREATE TABLE IF NOT EXISTS motion_ai_enrichment (
            motion_id   VARCHAR PRIMARY KEY,
            summary     VARCHAR,
            tags        VARCHAR[],
            model       VARCHAR,
            enriched_at TIMESTAMP DEFAULT current_timestamp
        )
    """)

    # Per-meeting record of when the stored attachment links were last compared
    # with the live minutes page (see attachment_links.py). Kept separate from
    # meetings so INSERT OR REPLACE INTO meetings doesn't wipe it.
    # calendar_fingerprint is the hash of the meeting's calendar document links
    # as of the last successful verification; status is 'ok', 'repaired' or 'failed'.
    con.execute("""
        CREATE TABLE IF NOT EXISTS meeting_link_checks (
            meeting_id            VARCHAR PRIMARY KEY,
            calendar_fingerprint  VARCHAR,
            checked_at            TIMESTAMP,
            verified_at           TIMESTAMP,
            status                VARCHAR,
            detail                VARCHAR,
            consecutive_failures  INTEGER DEFAULT 0,
            last_repaired_at      TIMESTAMP,
            repair_count          INTEGER DEFAULT 0
        )
    """)

    migrate_schema(con)


def migrate_schema(con: duckdb.DuckDBPyConnection) -> None:
    """Bring pre-existing databases up to the current schema. Idempotent."""

    con.execute("ALTER TABLE motions ADD COLUMN IF NOT EXISTS vote_kind VARCHAR")
    # Motions with vote rows were recorded roll-call votes; the rest are voice
    # votes. Dissent-reconstructed motions also land on 'recorded' here — a
    # re-scrape (cli.py --rescrape) is required to reclassify them as 'dissent',
    # since the source prose is not retained in the database.
    con.execute("""
        UPDATE motions SET vote_kind = CASE
            WHEN EXISTS (SELECT 1 FROM votes v WHERE v.motion_id = motions.motion_id)
            THEN 'recorded' ELSE 'none' END
        WHERE vote_kind IS NULL
    """)
