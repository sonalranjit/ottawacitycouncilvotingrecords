import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchIndex, fetchCouncillorData, fetchAlignmentData } from '../api/data';
import type { IndexData, CouncillorData, AlignmentRow } from '../types';
import CouncillorSelector from '../components/CouncillorSelector';
import TagPill from '../components/TagPill';
import VoteTable from '../components/VoteTable';
import AlignmentTable from '../components/AlignmentTable';
import MotionsMovedTable from '../components/MotionsMovedTable';
import { toSlug } from '../utils/format';
import styles from './CouncillorHistory.module.scss';

export default function CouncillorHistory() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [councillorData, setCouncillorData] = useState<CouncillorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTagSlugs, setActiveTagSlugs] = useState<Set<string>>(new Set());
  const [alignmentData, setAlignmentData] = useState<AlignmentRow[]>([]);
  const [activeTab, setActiveTab] = useState<'history' | 'alignment' | 'moved'>('history');

  useEffect(() => {
    Promise.all([fetchIndex(), fetchAlignmentData()])
      .then(([indexData, alignment]) => {
        setIndex(indexData);
        setAlignmentData(alignment);
        if (!slug && indexData.councillors.length > 0) {
          navigate(`/ottawa/councillors/${indexData.councillors[0].slug}`, { replace: true });
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setCouncillorData(null);
    fetchCouncillorData(slug)
      .then((data) => {
        setCouncillorData(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [slug]);

  function handleCouncillorChange(newSlug: string) {
    setActiveTagSlugs(new Set());
    setActiveTab('history');
    navigate(`/ottawa/councillors/${newSlug}`);
  }

  function handleTagFilter(tagSlug: string) {
    setActiveTagSlugs((prev) => {
      const next = new Set(prev);
      next.has(tagSlug) ? next.delete(tagSlug) : next.add(tagSlug);
      return next;
    });
  }

  const availableTags = useMemo(() => {
    if (!councillorData) return [];
    const seen = new Map<string, string>(); // slug → tag label
    for (const vote of councillorData.votes) {
      for (const tag of (vote.tags ?? [])) {
        const s = toSlug(tag);
        if (!seen.has(s)) seen.set(s, tag);
      }
    }
    return [...seen.entries()].map(([s, tag]) => ({ slug: s, tag })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, [councillorData]);

  const filteredVotes = useMemo(() => {
    if (!councillorData) return [];
    if (activeTagSlugs.size === 0) return councillorData.votes;
    return councillorData.votes.filter((v) =>
      (v.tags ?? []).some((t) => activeTagSlugs.has(toSlug(t)))
    );
  }, [councillorData, activeTagSlugs]);

  if (error) {
    return <div className={styles.error}>Error: {error}</div>;
  }

  const councillor = councillorData?.councillor;

  return (
    <div className={styles.page}>
      {index && (
        <CouncillorSelector
          councillors={index.councillors}
          selectedSlug={slug ?? ''}
          onChange={handleCouncillorChange}
        />
      )}

      {loading && <div className={styles.loading}>Loading...</div>}

      {!loading && councillor && (
        <>
          <div className={styles.councillorCard}>
            <div className={styles.cardMain}>
              <h2 className={styles.name}>{councillor.full_name}</h2>
              <span className={styles.role}>
                {councillor.title}
                {councillor.ward_name ? ` — ${councillor.ward_name} Ward (Ward ${councillor.ward_number})` : ''}
              </span>
            </div>
            <div className={styles.cardMeta}>
              {councillor.email && (
                <a href={`mailto:${councillor.email}`} className={styles.metaLink}>
                  {councillor.email}
                </a>
              )}
              {councillor.telephone && (
                <a href={`tel:${councillor.telephone}`} className={styles.metaLink}>
                  {councillor.telephone}
                </a>
              )}
            </div>
          </div>

          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'history' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Vote History
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'alignment' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('alignment')}
            >
              Voting Alignment
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'moved' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('moved')}
            >
              Motions Moved
            </button>
          </div>

          {activeTab === 'history' && (
            <>
              {availableTags.length > 0 && (
                <div className={styles.tagFilter}>
                  <span className={styles.tagFilterLabel}>Filter by topic:</span>
                  <div className={styles.tagFilterPills}>
                    {availableTags.map(({ slug: tagSlug, tag }) => (
                      <TagPill
                        key={tagSlug}
                        tag={tag}
                        slug={tagSlug}
                        active={activeTagSlugs.has(tagSlug)}
                        onClick={handleTagFilter}
                      />
                    ))}
                  </div>
                  {activeTagSlugs.size > 0 && (
                    <button className={styles.clearFilter} onClick={() => setActiveTagSlugs(new Set())}>
                      Clear filter
                    </button>
                  )}
                </div>
              )}

              <div className={styles.tableHeader}>
                <span className={styles.voteCount}>
                  {filteredVotes.length === councillorData.votes.length
                    ? `${councillorData.votes.length} vote${councillorData.votes.length !== 1 ? 's' : ''} recorded`
                    : `${filteredVotes.length} of ${councillorData.votes.length} votes`}
                </span>
              </div>

              <VoteTable votes={filteredVotes} onTagFilter={handleTagFilter} />
            </>
          )}

          {activeTab === 'alignment' && (
            <AlignmentTable moverFullName={councillor.full_name} rows={alignmentData} />
          )}

          {activeTab === 'moved' && (
            <MotionsMovedTable moverFullName={councillor.full_name} motions={councillorData.motions_moved} />
          )}
        </>
      )}
    </div>
  );
}
