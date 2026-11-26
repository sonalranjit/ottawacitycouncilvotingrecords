import { NavLink } from 'react-router-dom';
import { useTerm } from '../../hooks/useTerm';
import { TAB_BAR_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import TermPicker from './TermPicker';
import styles from './Header.module.scss';

// One stroke icon per section, drawn on a 24×24 grid. Shown only in the mobile tab bar.
const NAV_ITEMS = [
  {
    to: '/ottawa',
    label: 'Motions',
    end: true,
    icon: 'M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M3 10.5h18 M8 3v5 M16 3v5',
  },
  {
    to: '/ottawa/councillors',
    label: 'Councillors',
    icon: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.8a3.2 3.2 0 0 1 0 6.2 M18 14.5a5.5 5.5 0 0 1 3.5 5.5',
  },
  {
    to: '/ottawa/committees',
    label: 'Committees',
    icon: 'M3 9.5L12 4l9 5.5 M5 10.5v7.5 M9.7 10.5v7.5 M14.3 10.5v7.5 M19 10.5v7.5 M3 20.5h18',
  },
  {
    to: '/ottawa/tags',
    label: 'Topics',
    icon: 'M3 3h8l10 10-8 8L3 11z M7.5 7.5h.01',
  },
  {
    to: '/ottawa/about',
    label: 'About',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 7.5h.01',
  },
];

const RSS_HREF = './data/ottawa/feed.xml';

function RssIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 19h.01 M5 12a7 7 0 0 1 7 7 M5 5a14 14 0 0 1 14 14" />
    </svg>
  );
}

export default function Header() {
  const { index, terms, term, setTerm, termQuery } = useTerm();
  const currentTerm = index ? terms.find((t) => t.slug === index.current_term) : undefined;
  const viewingPastTerm = !!term && !!currentTerm && term.slug !== currentTerm.slug;
  // On phones the links are a fixed tab bar. It is rendered outside the sticky
  // header: iOS Safari lets a fixed element inside a sticky one scroll away.
  const isTabBar = useMediaQuery(TAB_BAR_QUERY);

  const sectionNav = (
    <nav className={styles.nav} aria-label="Sections">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={{ pathname: item.to, search: termQuery }}
          end={item.end}
          className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
        >
          <span className={styles.iconPill} aria-hidden="true">
            <svg
              className={styles.navIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
            >
              <path d={item.icon} />
            </svg>
          </span>
          <span className={styles.linkLabel}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <>
      <header className={styles.header}>
        <div className={styles.bar}>
          <div className={styles.inner}>
            <div className={styles.brand}>
              <span className={styles.brandTitle}>Ottawa City Council</span>
              <span className={styles.brandSub}>Voting Records</span>
            </div>

            {!isTabBar && sectionNav}

            <div className={styles.actions}>
              {terms.length > 1 && term && (
                <TermPicker
                  terms={terms}
                  selected={term}
                  currentSlug={index?.current_term}
                  onSelect={setTerm}
                />
              )}
              <a
                href={RSS_HREF}
                className={styles.rssLink}
                title="Subscribe via RSS"
                aria-label="Subscribe via RSS"
              >
                <RssIcon className={styles.rssIcon} />
              </a>
            </div>
          </div>
        </div>

        {viewingPastTerm && term && currentTerm && (
          <div className={styles.pastTerm} role="status">
            <div className={styles.pastTermInner}>
              <span>Showing the {term.label} term</span>
              <button
                type="button"
                className={styles.pastTermButton}
                onClick={() => setTerm(currentTerm.slug)}
              >
                Go to current term
              </button>
            </div>
          </div>
        )}
      </header>
      {isTabBar && sectionNav}
    </>
  );
}
