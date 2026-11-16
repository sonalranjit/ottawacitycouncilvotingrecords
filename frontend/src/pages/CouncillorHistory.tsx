import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCouncillorData, fetchAlignmentData } from '../api/data';
import type { CouncillorData, AlignmentRow } from '../types';
import { useTerm } from '../hooks/useTerm';
import CouncillorSelector from '../components/CouncillorSelector';
import TagPill from '../components/TagPill';
import VoteTable from '../components/VoteTable';
import AlignmentTable from '../components/AlignmentTable';
import MotionsMovedTable from '../components/MotionsMovedTable';
import { toSlug } from '../utils/format';
import { councillorsInTerm, filterByTerm } from '../utils/terms';
import styles from './CouncillorHistory.module.scss';

export default function CouncillorHistory() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { index, error: indexError, terms, term, setTerm, termQuery } = useTerm();
  const [councillorData, setCouncillorData] = useState<CouncillorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTagSlugs, setActiveTagSlugs] = useState<Set<string>>(new Set());
  const [alignmentData, setAlignmentData] = useState<AlignmentRow[]>([]);
  const [activeTab, setActiveTab] = useState<'history' | 'alignment' | 'moved'>('history');

  const termCouncillors = useMemo(
    () => (index && term ? councillorsInTerm(index.councillors, term.slug) : []),
    [index, term],
  );

  useEffect(() => {
    fetchAlignmentData()
      .then(setAlignmentData)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!slug && termCouncillors.length > 0) {
      navigate({ pathname: `/ottawa/councillors/${termCouncillors[0].slug}`, search: termQuery }, { replace: true });
    }
  }, [slug, termCouncillors]);

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
    navigate({ pathname: `/ottawa/councillors/${newSlug}`, search: termQuery });
  }

  function handleTagFilter(tagSlug: string) {
    setActiveTagSlugs((prev) => {
      const next = new Set(prev);
      next.has(tagSlug) ? next.delete(tagSlug) : next.add(tagSlug);
      return next;
    });
  }

  const termVotes = useMemo(
    () => (councillorData ? filterByTerm(councillorData.votes, term?.slug) : []),
    [councillorData, term],
  );
  const termMovedMotions = useMemo(
    () => (councillorData ? filterByTerm(councillorData.motions_moved, term?.slug) : []),
    [councillorData, term],
  );
  const termAlignment = useMemo(() => filterByTerm(alignmentData, term?.slug), [alignmentData, term]);

  const availableTags = useMemo(() => {
    const seen = new Map<string, string>(); // slug → tag label
    for (const vote of termVotes) {
      for (const tag of (vote.tags ?? [])) {
        const s = toSlug(tag);
        if (!seen.has(s)) seen.set(s, tag);
      }
    }
    return [...seen.entries()].map(([s, tag]) => ({ slug: s, tag })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, [termVotes]);

  const filteredVotes = useMemo(() => {
    if (activeTagSlugs.size === 0) return termVotes;
    return termVotes.filter((v) =>
      (v.tags ?? []).some((t) => activeTagSlugs.has(toSlug(t)))
    );
  }, [termVotes, activeTagSlugs]);

  if (error || indexError) {
    return <div className={styles.error}>Error: {error ?? indexError}</div>;
  }

  const councillor = councillorData?.councillor;
  // The councillor's role in the selected term; undefined when they didn't serve in it
  const termEntry = councillor && term ? councillor.terms.find((e) => e.term === term.slug) : undefined;
  const servedTerms = councillor ? terms.filter((t) => councillor.terms.some((e) => e.term === t.slug)) : [];

  return (
    <div className={styles.page}>
      {index && (
        <CouncillorSelector
          councillors={termCouncillors}
          selectedSlug={slug ?? ''}
          onChange={handleCouncillorChange}
        />
      )}

      {loading && <div className={styles.loading}>Loading...</div>}

      {!loading && councillor && !termEntry && term && (
        <div className={styles.notInTerm}>
          <p>
            {councillor.full_name} did not serve on council in the {term.label} term.
          </p>
          {servedTerms.length > 0 && (
            <p>
              See their record for:{' '}
              {servedTerms.map((t, i) => (
                <span key={t.slug}>
                  {i > 0 && ', '}
                  <button className={styles.termLink} onClick={() => setTerm(t.slug)}>
                    {t.label}
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {!loading && councillor && termEntry && (
        <>
          <div className={styles.councillorCard}>
            <div className={styles.cardMain}>
              <h2 className={styles.name}>{councillor.full_name}</h2>
              <span className={styles.role}>
                {termEntry.title}
                {termEntry.ward_name ? ` — ${termEntry.ward_name} Ward (Ward ${termEntry.ward_number})` : ''}
              </span>
              {servedTerms.length > 1 && (
                <span className={styles.termsServed}>
                  Terms served: {servedTerms.map((t) => t.label).join(', ')}
                </span>
              )}
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
                  {filteredVotes.length === termVotes.length
                    ? `${termVotes.length} vote${termVotes.length !== 1 ? 's' : ''} recorded in the ${term?.label ?? ''} term`
                    : `${filteredVotes.length} of ${termVotes.length} votes`}
                </span>
              </div>

              <VoteTable votes={filteredVotes} onTagFilter={handleTagFilter} />
            </>
          )}

          {activeTab === 'alignment' && (
            <AlignmentTable moverFullName={councillor.full_name} rows={termAlignment} />
          )}

          {activeTab === 'moved' && (
            <MotionsMovedTable moverFullName={councillor.full_name} motions={termMovedMotions} />
          )}
        </>
      )}
    </div>
  );
}
