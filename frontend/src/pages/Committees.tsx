import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchCommitteeIndex, fetchCommitteeData } from '../api/data';
import type { CommitteeIndexData, CommitteeData } from '../types';
import { resultVariant, formatDate } from '../utils/format';
import VoteChip from '../components/VoteChip';
import styles from './Committees.module.scss';

export default function Committees() {
  const { slug } = useParams<{ slug?: string }>();
  const [committeeIndex, setCommitteeIndex] = useState<CommitteeIndexData | null>(null);
  const [committeeData, setCommitteeData] = useState<CommitteeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      setLoading(true);
      setCommitteeData(null);
      fetchCommitteeData(slug)
        .then((data) => {
          setCommitteeData(data);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    } else {
      setLoading(true);
      fetchCommitteeIndex()
        .then((data) => {
          setCommitteeIndex(data);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    }
  }, [slug]);

  if (error) {
    return <div className={styles.error}>Error: {error}</div>;
  }

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  // Committee browse index
  if (!slug && committeeIndex) {
    return (
      <div className={styles.page}>
        <h2 className={styles.heading}>Committees</h2>
        <p className={styles.intro}>
          Browse motions by the council body that considered them — committees, boards, commissions, and City Council.
        </p>
        <div className={styles.committeeGrid}>
          {committeeIndex.committees.map((c) => (
            <Link key={c.slug} to={`/ottawa/committees/${c.slug}`} className={styles.committeeCard}>
              <span className={styles.committeeName}>{c.committee}</span>
              <span className={styles.committeeCount}>{c.motion_count} motion{c.motion_count !== 1 ? 's' : ''}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Per-committee motions list
  if (committeeData) {
    return (
      <div className={styles.page}>
        <nav className={styles.breadcrumb}>
          <Link to="/ottawa/committees" className={styles.breadcrumbLink}>Committees</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>{committeeData.committee}</span>
        </nav>
        <h2 className={styles.heading}>{committeeData.committee}</h2>
        <p className={styles.intro}>
          {committeeData.motions.length} motion{committeeData.motions.length !== 1 ? 's' : ''} voted on
        </p>
        <div className={styles.motionList}>
          {committeeData.motions.map((m) => (
            <div key={m.motion_id} className={styles.motionCard}>
              <div className={styles.motionMeta}>
                <a href={m.source_url} target="_blank" rel="noopener noreferrer" className={styles.motionDate}>
                  {formatDate(m.date)}
                </a>
                <span className={styles.motionMeeting}>{m.meeting_name}</span>
                {m.item_title && (
                  <Link to={`/ottawa?date=${m.date}`} className={styles.motionItem}>
                    {m.item_title}
                  </Link>
                )}
              </div>
              {m.summary && (
                <div className={styles.motionSummaryBlock}>
                  <span className={styles.motionSummaryLabel}>Summary</span>
                  <p className={styles.motionSummary}>{m.summary}</p>
                </div>
              )}
              <div className={styles.motionFooter}>
                <span className={`${styles.result} ${styles[resultVariant(m.motion_result)] ?? ''}`}>
                  {m.motion_result || 'Unknown'}
                </span>
                <span className={styles.tally}>
                  <span className={styles.forCount}>{m.for_count} For</span>
                  {' / '}
                  <span className={styles.againstCount}>{m.against_count} Against</span>
                </span>
              </div>
              {m.votes && m.votes.length > 0 && (
                <div className={styles.voteGroups}>
                  {m.votes.filter((v) => v.vote === 'for').length > 0 && (
                    <div className={styles.voteGroup}>
                      <span className={styles.voteGroupLabel}>For</span>
                      <div className={styles.chips}>
                        {m.votes.filter((v) => v.vote === 'for').map((v) => (
                          <VoteChip key={v.councillor_name} councillor_name={v.councillor_name} vote={v.vote} />
                        ))}
                      </div>
                    </div>
                  )}
                  {m.votes.filter((v) => v.vote === 'against').length > 0 && (
                    <div className={styles.voteGroup}>
                      <span className={styles.voteGroupLabel}>Against</span>
                      <div className={styles.chips}>
                        {m.votes.filter((v) => v.vote === 'against').map((v) => (
                          <VoteChip key={v.councillor_name} councillor_name={v.councillor_name} vote={v.vote} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
