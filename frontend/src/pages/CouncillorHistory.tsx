import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchIndex, fetchCouncillorData } from '../api/data';
import type { IndexData, CouncillorData } from '../types';
import CouncillorSelector from '../components/CouncillorSelector';
import TagPill from '../components/TagPill';
import VoteTable from '../components/VoteTable';
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

  useEffect(() => {
    fetchIndex()
      .then((data) => {
        setIndex(data);
        // If no slug in URL, redirect to first councillor
        if (!slug && data.councillors.length > 0) {
          navigate(`/ottawa/councillors/${data.councillors[0].slug}`, { replace: true });
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
    </div>
  );
}
