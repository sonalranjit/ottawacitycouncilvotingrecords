import { Link } from 'react-router';
import styles from './TagPill.module.scss';

interface Props {
  tag: string;
  slug: string;
  /** Render as a nav link to /ottawa/tags/{slug} */
  asLink?: boolean;
  /** Called with the tag slug when clicked (for filter mode) */
  onClick?: (slug: string) => void;
  active?: boolean;
}

export default function TagPill({ tag, slug, asLink, onClick, active }: Props) {
  if (asLink) {
    return (
      <Link to={`/ottawa/tags/${slug}`} className={styles.pill}>
        {tag}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.pill} ${active ? styles.active : ''}`}
      onClick={() => onClick?.(slug)}
    >
      {tag}
    </button>
  );
}
