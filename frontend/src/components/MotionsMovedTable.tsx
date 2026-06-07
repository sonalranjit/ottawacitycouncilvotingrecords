import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MovedMotion } from '../types';
import { formatDate, resultLabel, resultVariant } from '../utils/format';
import styles from './MotionsMovedTable.module.scss';

interface Props {
  moverFullName: string;
  motions: MovedMotion[];
}

type SortDir = 'asc' | 'desc';

const TRUNCATE_AT = 120;

export default function MotionsMovedTable({ moverFullName, motions }: Props) {
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (motions.length === 0) {
    return <p className={styles.empty}>No motions moved by this councillor.</p>;
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const carried = motions.filter((m) => resultVariant(m.motion_result) === 'carried').length;
  const lost = motions.filter((m) => resultVariant(m.motion_result) === 'lost').length;
  const tied = motions.filter((m) => resultVariant(m.motion_result) === 'tied').length;

  const sorted = [...motions].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  return (
    <div>
      <p className={styles.summary}>
        {moverFullName} moved <strong>{motions.length}</strong> motion{motions.length !== 1 ? 's' : ''}:{' '}
        <strong>{carried}</strong> carried, <strong>{lost}</strong> lost, <strong>{tied}</strong> tied.
      </p>
      <div className={styles.wrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th
                className={styles.sortable}
                onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
              >
                Date {sortDir === 'desc' ? '▼' : '▲'}
              </th>
              <th className={styles.hideMobile}>Meeting</th>
              <th>Motion</th>
              <th>Result</th>
              <th className={styles.hideMobile}>Tally</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isLong = row.motion_text.length > TRUNCATE_AT;
              const isExpanded = expanded.has(row.motion_id);
              return (
                <tr key={row.motion_id}>
                  <td className={styles.dateCell}>
                    <a href={row.source_url} target="_blank" rel="noopener noreferrer">
                      {formatDate(row.date)}
                    </a>
                  </td>
                  <td className={styles.hideMobile}>{row.meeting_name}</td>
                  <td>
                    {row.item_title && (
                      <Link to={`/ottawa?date=${row.date}`} className={styles.itemTitle}>
                        {row.item_title}
                      </Link>
                    )}
                    <span className={styles.motionText}>
                      {isLong && !isExpanded
                        ? row.motion_text.slice(0, TRUNCATE_AT) + '…'
                        : row.motion_text}
                    </span>
                    {isLong && (
                      <button
                        className={styles.expandBtn}
                        onClick={() => toggleExpand(row.motion_id)}
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.resultBadge} ${styles[resultVariant(row.motion_result)] ?? ''}`}>
                      {resultLabel(row.motion_result)}
                    </span>
                  </td>
                  <td className={styles.hideMobile}>
                    <span className={styles.tally}>
                      <span className={styles.forCount}>{row.for_count}</span>
                      {' / '}
                      <span className={styles.againstCount}>{row.against_count}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
