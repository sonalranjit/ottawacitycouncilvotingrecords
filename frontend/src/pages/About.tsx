import styles from './About.module.scss';

export default function About() {
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.heading}>About This Site</h1>
        <p>
          This site tracks how Ottawa City Council members vote at council meetings.
          Data is scraped from the{' '}
          <a href="https://pub-ottawa.escribemeetings.com/" target="_blank" rel="noopener noreferrer">
            Ottawa eScribe system
          </a>
          , which publishes official meeting minutes for City Council and committee meetings.
          <br></br>
          Technically this scraper can be scrape any municipality using the eScribe Meetings system.
          As a first proof of concept, the scraper runs for Ottawa.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>How the Data is Scraped</h2>
        <p>
          A Python scraper fetches all the meetings in a given date range. Then for each meeting,
          parses the HTML documents with BeautifulSoup, and stores the results in a DuckDB database.
          The scraper runs daily as a github action and is idempotent — re-running it never duplicates data.
        </p>
        <p>
          For each meeting, the scraper extracts:
        </p>
        <ul className={styles.list}>
          <li>Attendance (present / absent councillors)</li>
          <li>Agenda items and their titles</li>
          <li>Motions under each agenda item</li>
          <li>Individual councillor votes (for / against / absent) on each motion</li>
        </ul>
        <p>
          Councillor names are normalized at scrape time to handle inconsistencies
          in the source HTML. All data is exported as static JSON files at build time.
        </p>
        <p>
          Motions are also enriched with plain-English summaries and thematic tags using Claude AI.
          These summaries are written for everyday residents with no background in politics or law —
          concrete, jargon-free, and focused on what the vote actually means. Tags group motions
          by topic (e.g. Budget &amp; Finance, Housing &amp; Zoning) and power the{' '}
          <a href="/ottawa/tags">Topics</a> page.
        </p>
        <p>
          The source code for the scraper is available on{' '}
          <a href="https://github.com/sranjit/ottawacitycouncilvotingrecords" target="_blank" rel="noopener noreferrer">
          GitHub.
          </a>
          <br></br>
          If there are any inconsistencies with the scraped data or any feedback please create an issue 
          on the github repository.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>Using the Data as an API</h2>
        <p>
          All data is published as static JSON files and can be accessed directly via URL.
          There is no authentication required.
        </p>

        <div className={styles.endpoint}>
          <h3 className={styles.endpointTitle}>Index</h3>
          <code className={styles.url}>/data/ottawa/index.json</code>
          <p className={styles.endpointDesc}>
            Returns a list of all available meeting dates and a directory of councillors
            (name, ward, slug).
          </p>
        </div>

        <div className={styles.endpoint}>
          <h3 className={styles.endpointTitle}>Motions by Date</h3>
          <code className={styles.url}>/data/ottawa/dates/YYYY-MM-DD.json</code>
          <p className={styles.endpointDesc}>
            Returns all meetings, agenda items, and motions (including full vote tallies
            and individual councillor votes) for a given date.
          </p>
          <p className={styles.endpointExample}>
            Example: <code>/data/ottawa/dates/2026-02-26.json</code>
          </p>
        </div>

        <div className={styles.endpoint}>
          <h3 className={styles.endpointTitle}>Councillor Vote History</h3>
          <code className={styles.url}>/data/ottawa/councillors/[slug].json</code>
          <p className={styles.endpointDesc}>
            Returns the full vote history for a single councillor, including every motion
            they voted on and the outcome of each vote.
          </p>
          <p className={styles.endpointExample}>
            Example: <code>/data/ottawa/councillors/ariel-troster.json</code>
          </p>
        </div>

        <div className={styles.endpoint}>
          <h3 className={styles.endpointTitle}>Topic Tag Index</h3>
          <code className={styles.url}>/data/ottawa/tags/index.json</code>
          <p className={styles.endpointDesc}>
            Returns all topic tags with their URL-safe slug and motion count, sorted by
            number of motions descending.
          </p>
        </div>

        <div className={styles.endpoint}>
          <h3 className={styles.endpointTitle}>Motions by Tag</h3>
          <code className={styles.url}>/data/ottawa/tags/[slug].json</code>
          <p className={styles.endpointDesc}>
            Returns all motions tagged with a given topic, including their AI-generated
            summary, vote tallies, and meeting metadata. Tag slugs are lowercased, with
            spaces replaced by hyphens and <code>&amp;</code> replaced by <code>and</code>.
          </p>
          <p className={styles.endpointExample}>
            Example: <code>/data/ottawa/tags/budget-and-finance.json</code>
          </p>
        </div>
      </section>
    </div>
  );
}
