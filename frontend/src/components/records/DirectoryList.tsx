import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './DirectoryList.module.scss';

export interface DirectoryItem {
  name: string;
  slug: string;
  count: number;
}

interface Props {
  /** Most motions first */
  items: DirectoryItem[];
  linkTo: (slug: string) => string;
  /** "committee" or "topic", for the search label and counts line */
  noun: string;
  nounPlural: string;
  placeholder: string;
}

/** Searchable list of committees or topics, each with its motion count and a bar comparing it to the largest. */
export default function DirectoryList({ items, linkTo, noun, nounPlural, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const max = Math.max(1, ...items.map((i) => i.count));
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;

  return (
    <div className={styles.directory}>
      <div className={styles.searchField}>
        <label htmlFor={searchId} className={styles.searchLabel}>Find a {noun}</label>
        <input
          id={searchId}
          type="search"
          className={styles.search}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <span className={styles.countLine} aria-live="polite">
        {q ? `${shown.length} of ${items.length} ${nounPlural}` : `${items.length} ${nounPlural} · most motions first`}
      </span>
      <ul className={styles.list}>
        {shown.map((item) => (
          <li key={item.slug}>
            <Link to={linkTo(item.slug)} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.rowTop}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.count}>
                    {item.count.toLocaleString('en-CA')} motion{item.count === 1 ? '' : 's'}
                  </span>
                </span>
                <span className={styles.bar} aria-hidden="true">
                  <span style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} />
                </span>
              </span>
              <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className={styles.empty}>No {nounPlural} match “{query}”.</p>}
    </div>
  );
}
