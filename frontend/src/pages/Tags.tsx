import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchTagIndex, fetchTagData } from '../api/data';
import type { TagIndexData, TagData } from '../types';
import { resultVariant, formatDate } from '../utils/format';
import VoteChip from '../components/VoteChip';
import styles from './Tags.module.scss';

export default function Tags() {
  const { slug } = useParams<{ slug?: string }>();
  const [tagIndex, setTagIndex] = useState<TagIndexData | null>(null);
  const [tagData, setTagData] = useState<TagData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      setLoading(true);
      setTagData(null);
      fetchTagData(slug)
        .then((data) => {
          setTagData(data);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    } else {
      setLoading(true);
      fetchTagIndex()
        .then((data) => {
          setTagIndex(data);
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

  // Tag browse index
  if (!slug && tagIndex) {
    return (
      <div className={styles.page}>
        <h2 className={styles.heading}>Topics</h2>
        <p className={styles.intro}>
          Browse motions by topic to see what Ottawa City Council has voted on across different areas.
        </p>
        <div className={styles.tagGrid}>
          {tagIndex.tags.map((t) => (
            <Link key={t.slug} to={`/ottawa/tags/${t.slug}`} className={styles.tagCard}>
              <span className={styles.tagName}>{t.tag}</span>
              <span className={styles.tagCount}>{t.motion_count} motion{t.motion_count !== 1 ? 's' : ''}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Per-tag motions list
  if (tagData) {
    return (
      <div className={styles.page}>
        <nav className={styles.breadcrumb}>
          <Link to="/ottawa/tags" className={styles.breadcrumbLink}>Topics</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>{tagData.tag}</span>
        </nav>
        <h2 className={styles.heading}>{tagData.tag}</h2>
        <p className={styles.intro}>
          {tagData.motions.length} motion{tagData.motions.length !== 1 ? 's' : ''} voted on
        </p>
        <div className={styles.motionList}>
          {tagData.motions.map((m) => (
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
