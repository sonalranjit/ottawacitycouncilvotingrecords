import { useState } from 'react';
import type { CouncillorVoteRow } from '../types';
import { formatDate, resultLabel, resultVariant } from '../utils/format';
import styles from './VoteTable.module.scss';

interface Props {
  votes: CouncillorVoteRow[];
}

type SortDir = 'asc' | 'desc';

const TRUNCATE_AT = 120;

export default function VoteTable({ votes }: Props) {
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const sorted = [...votes].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  return (
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
            <th className={styles.hideMobile}>Item</th>
            <th>Motion</th>
            <th>Vote</th>
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
              <td className={styles.hideMobile}>{row.agenda_item_number}</td>
              <td>
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
                {row.item_title && (
                  <span className={styles.itemTitle}>{row.item_title}</span>
                )}
              </td>
              <td>
                <span className={`${styles.voteBadge} ${row.vote === 'for' ? styles.voteFor : styles.voteAgainst}`}>
                  {row.vote === 'for' ? 'Yes' : 'No'}
                </span>
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
      {votes.length === 0 && (
        <p className={styles.empty}>No votes recorded.</p>
      )}
    </div>
  );
}
