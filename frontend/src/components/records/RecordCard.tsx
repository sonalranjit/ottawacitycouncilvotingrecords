import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import TagPill from '../TagPill';
import { toSlug } from '../../utils/format';
import styles from './RecordCard.module.scss';

interface Props {
  /** Small line above the title: date, meeting, item number */
  meta: ReactNode;
  title: string;
  /** Where the title links to (the Motions by Date page for that day) */
  titleTo?: string;
  summary?: string;
  tags?: string[];
  /** The outcome column: result, tally, the councillor's vote */
  aside: ReactNode;
}

/**
 * One motion in a list (a committee, a topic, a councillor's record). Wide
 * screens: description left, outcome in a tinted side column. Phones: one
 * column with the outcome straight after the title.
 */
export default function RecordCard({ meta, title, titleTo, summary, tags, aside }: Props) {
  return (
    <article className={styles.card}>
      <div className={styles.main}>
        <div className={styles.head}>
          <span className={styles.meta}>{meta}</span>
          <h3 className={styles.title}>
            {titleTo ? <Link to={titleTo}>{title}</Link> : title}
          </h3>
        </div>
        {(summary || (tags && tags.length > 0)) && (
          <div className={styles.body}>
            {summary && <p className={styles.summary}>{summary}</p>}
            {tags && tags.length > 0 && (
              <div className={styles.tags}>
                {tags.map((tag) => (
                  <TagPill key={tag} tag={tag} slug={toSlug(tag)} asLink />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className={styles.aside}>{aside}</div>
    </article>
  );
}
