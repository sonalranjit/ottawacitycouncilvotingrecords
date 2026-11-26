import type { CouncillorMeta, CouncillorTermEntry, Term } from '../../types';
import { initials } from '../../utils/format';
import styles from './ProfileCard.module.scss';

interface Props {
  councillor: CouncillorMeta;
  termEntry: CouncillorTermEntry;
  servedTerms: Term[];
  votes: number;
  moved: number;
  /** Pass rate of the motions they moved that have a recorded result */
  passed: number;
  decided: number;
}

export default function ProfileCard({ councillor, termEntry, servedTerms, votes, moved, passed, decided }: Props) {
  const role = [
    termEntry.title,
    termEntry.ward_name ? `${termEntry.ward_name} Ward (Ward ${termEntry.ward_number})` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const passPct = decided > 0 ? Math.round((passed / decided) * 100) : null;
  const undecided = moved - decided;

  return (
    <section className={styles.card} aria-labelledby="councillor-name">
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">{initials(councillor.full_name)}</span>
        <div className={styles.nameBlock}>
          <h1 id="councillor-name" className={styles.name}>{councillor.full_name}</h1>
          <span className={styles.role}>{role}</span>
          {servedTerms.length > 1 && (
            <span className={styles.terms}>Terms: {servedTerms.map((t) => t.label).join(', ')}</span>
          )}
        </div>
      </div>

      {(councillor.email || councillor.telephone) && (
        <div className={styles.contact}>
          {councillor.email && (
            <a href={`mailto:${councillor.email}`} className={styles.contactLink}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16v12H4z M4 7l8 6 8-6" /></svg>
              <span className={styles.contactLong}>{councillor.email}</span>
              <span className={styles.contactShort}>Email</span>
            </a>
          )}
          {councillor.telephone && (
            <a href={`tel:${councillor.telephone}`} className={styles.contactLink}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>
              <span className={styles.contactLong}>{councillor.telephone}</span>
              <span className={styles.contactShort}>Call</span>
            </a>
          )}
        </div>
      )}

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>votes recorded</dt>
          <dd>{votes.toLocaleString('en-CA')}</dd>
        </div>
        <div className={styles.stat}>
          <dt>of their motions passed{passPct !== null && undecided > 0 ? '*' : ''}</dt>
          <dd>{passPct === null ? '—' : `${passPct}%`}</dd>
        </div>
        <div className={styles.stat}>
          <dt>motions moved</dt>
          <dd>{moved.toLocaleString('en-CA')}</dd>
        </div>
      </dl>
      {passPct !== null && undecided > 0 && (
        <p className={styles.footnote}>
          * Counts only motions with a recorded result: {passed} of {decided} passed. The other {undecided} motion
          {undecided === 1 ? '' : 's'} moved {undecided === 1 ? 'has' : 'have'} no result in the minutes.
        </p>
      )}
    </section>
  );
}
