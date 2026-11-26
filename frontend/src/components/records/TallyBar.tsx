import styles from './TallyBar.module.scss';

interface Props {
  forCount: number;
  againstCount: number;
}

/** For/Against counts over a thin bar showing the split. */
export default function TallyBar({ forCount, againstCount }: Props) {
  const total = forCount + againstCount;
  const forPct = total > 0 ? (forCount / total) * 100 : 0;
  return (
    <div className={styles.tally}>
      <div className={styles.counts}>
        <span className={styles.for}>{forCount} For</span>
        <span className={styles.against}>{againstCount} Against</span>
      </div>
      {total > 0 && (
        <div className={styles.bar} aria-hidden="true">
          <span className={styles.barFor} style={{ width: `${forPct}%` }} />
          <span className={styles.barAgainst} style={{ width: `${100 - forPct}%` }} />
        </div>
      )}
    </div>
  );
}
