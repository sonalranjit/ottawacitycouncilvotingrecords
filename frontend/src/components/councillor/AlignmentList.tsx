import type { AlignmentRow } from '../../types';
import styles from './Tabs.module.scss';

interface Props {
  moverFullName: string;
  /** Alignment rows for the term; filtered to this councillor here */
  rows: AlignmentRow[];
}

// A percentage from this few votes says little; its bar is drawn lighter
const FEW_VOTES = 3;

/** How often each colleague voted for the motions this councillor moved. */
export default function AlignmentList({ moverFullName, rows }: Props) {
  const mine = rows
    .filter((r) => r.mover === moverFullName && r.total_votes > 0)
    .sort((a, b) => b.alignment_pct - a.alignment_pct || b.total_votes - a.total_votes || a.voter.localeCompare(b.voter));

  if (mine.length === 0) {
    return (
      <p className={styles.empty}>
        None of the motions {moverFullName} moved had a recorded vote, so there’s nothing to compare.
      </p>
    );
  }

  const votedFor = mine.reduce((s, r) => s + r.voted_for, 0);
  const total = mine.reduce((s, r) => s + r.total_votes, 0);
  const average = Math.round((votedFor / total) * 100);
  const backedAll = mine.filter((r) => r.voted_for === r.total_votes).length;
  const maxVotes = Math.max(...mine.map((r) => r.total_votes));
  const hasFew = mine.some((r) => r.total_votes <= FEW_VOTES);

  return (
    <div className={styles.panel}>
      <div className={styles.alignmentIntro}>
        <div className={styles.alignmentText}>
          <h2 className={styles.panelHeading}>Who backs {moverFullName}’s motions</h2>
          <p className={styles.explain}>
            How often each colleague voted for a motion {moverFullName} moved. Only motions with a recorded vote
            count, so each colleague voted on up to {maxVotes} of them.
          </p>
        </div>
        <dl className={styles.miniStats}>
          <div className={styles.miniStat}>
            <dt>average support</dt>
            <dd>{average}%</dd>
          </div>
          <div className={styles.miniStat}>
            <dt>backed every one</dt>
            <dd>{backedAll}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.legend}>
        <span>Most to least support · {mine.length} colleagues</span>
        {hasFew && (
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} aria-hidden="true" />
            Lighter bar: {FEW_VOTES} votes or fewer, read with care
          </span>
        )}
      </div>

      <ol className={styles.ranking}>
        {mine.map((r, i) => {
          const pct = Math.round(r.alignment_pct);
          return (
            <li key={r.voter} className={styles.rankRow}>
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.voter}>{r.voter}</span>
              <span className={styles.pct}>{pct}%</span>
              <span className={styles.rankBar} aria-hidden="true">
                <span
                  className={r.total_votes <= FEW_VOTES ? styles.rankFillFew : styles.rankFill}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className={styles.ofTotal}>
                {r.voted_for} of {r.total_votes}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
