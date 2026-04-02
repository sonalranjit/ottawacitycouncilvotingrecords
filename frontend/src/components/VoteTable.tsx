import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CouncillorVoteRow } from '../types';
import { formatDate, resultLabel, resultVariant, toSlug } from '../utils/format';
import TagPill from './TagPill';
import styles from './VoteTable.module.scss';

interface Props {
  votes: CouncillorVoteRow[];
  onTagFilter?: (slug: string) => void;
}

type SortDir = 'asc' | 'desc';

const TRUNCATE_AT = 120;

export default function VoteTable({ votes, onTagFilter }: Props) {
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
                {row.item_title && (
                  <Link to={`/ottawa?date=${row.date}`} className={styles.itemTitle}>
                    {row.item_title}
                  </Link>
                )}
                {row.summary ? (
                  <>
                    <div className={styles.summaryBlock}>
                      <span className={styles.summaryLabel}>Summary</span>
                      <span className={styles.summary}>{row.summary}</span>
                    </div>
                    {isLong && (
                      <button
                        className={styles.expandBtn}
                        onClick={() => toggleExpand(row.motion_id)}
                      >
                        {isExpanded ? 'Hide full text' : 'Show full text'}
                      </button>
                    )}
                    {isExpanded && (
                      <span className={styles.motionText}>{row.motion_text}</span>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
                )}
                {row.tags && row.tags.length > 0 && (
                  <div className={styles.tagRow}>
                    {row.tags.map((tag) => (
                      <TagPill
                        key={tag}
                        tag={tag}
                        slug={toSlug(tag)}
                        onClick={onTagFilter}
                      />
                    ))}
                  </div>
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
