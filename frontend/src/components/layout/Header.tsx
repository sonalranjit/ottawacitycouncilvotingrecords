import { NavLink } from 'react-router-dom';
import { useTerm } from '../../hooks/useTerm';
import styles from './Header.module.scss';

export default function Header() {
  const { terms, term, setTerm, termQuery } = useTerm();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.brandTitle}>Ottawa City Council</span>
          <span className={styles.brandSub}>Voting Records</span>
        </div>
        <nav className={styles.nav}>
          <NavLink
            to={{ pathname: '/ottawa', search: termQuery }}
            end
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Motions by Date
          </NavLink>
          <NavLink
            to={{ pathname: '/ottawa/councillors', search: termQuery }}
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Councillors
          </NavLink>
          <NavLink
            to={{ pathname: '/ottawa/committees', search: termQuery }}
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Committees
          </NavLink>
          <NavLink
            to={{ pathname: '/ottawa/tags', search: termQuery }}
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Topics
          </NavLink>
          <NavLink
            to={{ pathname: '/ottawa/about', search: termQuery }}
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            About
          </NavLink>
          {terms.length > 1 && term && (
            <label className={styles.termPicker}>
              <span className={styles.termLabel}>Term</span>
              <select
                className={styles.termSelect}
                value={term.slug}
                onChange={(e) => setTerm(e.target.value)}
                aria-label="Council term"
              >
                {[...terms].reverse().map((t) => (
                  <option key={t.slug} value={t.slug}>{t.label}</option>
                ))}
              </select>
            </label>
          )}
          <a
            href="./data/ottawa/feed.xml"
            className={styles.rssLink}
            title="Subscribe via RSS"
            aria-label="RSS Feed"
          >
            <svg className={styles.rssIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <circle cx="3" cy="13" r="2" />
              <path d="M3 7a6 6 0 0 1 6 6" fill="none" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 2a11 11 0 0 1 11 11" fill="none" strokeWidth="2" strokeLinecap="round" />
            </svg>
            RSS
          </a>
        </nav>
      </div>
    </header>
  );
}
