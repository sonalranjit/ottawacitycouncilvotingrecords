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
            to="/"
            end
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Motions by Date
          </NavLink>
          <NavLink
            to="/councillors"
            className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          >
            Councillors
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
