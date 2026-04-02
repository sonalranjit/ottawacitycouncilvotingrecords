import { NavLink } from 'react-router-dom';
import styles from './Header.module.scss';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.brandTitle}>Ottawa City Council</span>
          <span className={styles.brandSub}>Voting Records</span>
        </div>
        <nav className={styles.nav}>
          <NavLink
            to="/ottawa"
            end
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Motions by Date
          </NavLink>
          <NavLink
            to="/ottawa/councillors"
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Councillors
          </NavLink>
          <NavLink
            to="/ottawa/tags"
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Topics
          </NavLink>
          <NavLink
            to="/ottawa/about"
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            About
          </NavLink>
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
