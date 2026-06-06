import type { AlignmentRow } from '../types';
import styles from './AlignmentTable.module.scss';

interface Props {
  moverFullName: string;
  rows: AlignmentRow[];
}

export default function AlignmentTable({ moverFullName, rows }: Props) {
  const filtered = rows.filter((r) => r.mover === moverFullName);

  if (filtered.length === 0) {
    return <p className={styles.empty}>No alignment data available for this councillor.</p>;
  }

  const totalMotionsMoved = filtered[0].total_motions_moved;

  return (
    <div>
      <p className={styles.summary}>
        {moverFullName} moved <strong>{totalMotionsMoved}</strong> motion{totalMotionsMoved !== 1 ? 's' : ''} in total.
      </p>
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Councillor</th>
            <th className={styles.numCol}>Votes For</th>
            <th className={styles.numCol}>Total Votes</th>
            <th className={styles.numCol}>Support %</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.voter}>
              <td>{row.voter}</td>
              <td className={styles.numCol}>{row.voted_for}</td>
              <td className={styles.numCol}>{row.total_votes}</td>
              <td className={styles.numCol}>
                {row.total_votes === 0 ? '—' : `${Math.round(row.alignment_pct)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
