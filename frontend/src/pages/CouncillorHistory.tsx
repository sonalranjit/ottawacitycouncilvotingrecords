import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCouncillorData, fetchAlignmentData } from '../api/data';
import type { CouncillorData, AlignmentRow } from '../types';
import { useTerm } from '../hooks/useTerm';
import CouncillorSelector from '../components/CouncillorSelector';
import ProfileCard from '../components/councillor/ProfileCard';
import VoteHistory from '../components/councillor/VoteHistory';
import AlignmentList from '../components/councillor/AlignmentList';
import MovedList from '../components/councillor/MovedList';
import tabStyles from '../components/councillor/Tabs.module.scss';
import { passRate } from '../utils/format';
import { councillorsInTerm, filterByTerm } from '../utils/terms';
import styles from './CouncillorHistory.module.scss';

type Tab = 'votes' | 'alignment' | 'moved';

const TABS: { id: Tab; label: string }[] = [
  { id: 'votes', label: 'Votes' },
  { id: 'alignment', label: 'Alignment' },
  { id: 'moved', label: 'Motions moved' },
];

export default function CouncillorHistory() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { index, error: indexError, terms, term, setTerm, termQuery } = useTerm();
  const [councillorData, setCouncillorData] = useState<CouncillorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alignmentData, setAlignmentData] = useState<AlignmentRow[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('votes');

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
    setActiveTab('votes');
    navigate({ pathname: `/ottawa/councillors/${newSlug}`, search: termQuery });
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
  const moved = useMemo(() => passRate(termMovedMotions.map((m) => m.motion_result)), [termMovedMotions]);

  if (error || indexError) {
    return <div className={styles.error}>Error: {error ?? indexError}</div>;
  }

  const councillor = councillorData?.councillor;
  // The councillor's role in the selected term; undefined when they didn't serve in it
  const termEntry = councillor && term ? councillor.terms.find((e) => e.term === term.slug) : undefined;
  const servedTerms = councillor ? terms.filter((t) => councillor.terms.some((e) => e.term === t.slug)) : [];
  // Remount the tab panels per councillor and term so filters and paging start fresh
  const panelKey = `${slug}-${term?.slug ?? ''}`;

  return (
    <div className={styles.page}>
      {index && (
        <div className={styles.pickerRow}>
          <CouncillorSelector
            councillors={termCouncillors}
            selectedSlug={slug ?? ''}
            onChange={handleCouncillorChange}
          />
        </div>
      )}

      {loading && <div className={styles.loading}>Loading…</div>}

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
          <ProfileCard
            councillor={councillor}
            termEntry={termEntry}
            servedTerms={servedTerms}
            votes={termVotes.length}
            moved={termMovedMotions.length}
            passed={moved.passed}
            decided={moved.decided}
          />

          <div role="tablist" aria-label="Councillor record" className={tabStyles.tablist}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-controls={`panel-${t.id}`}
                aria-selected={activeTab === t.id}
                className={`${tabStyles.tab} ${activeTab === t.id ? tabStyles.tabOn : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
            {activeTab === 'votes' && <VoteHistory key={panelKey} votes={termVotes} termLabel={term?.label} />}
            {activeTab === 'alignment' && (
              <AlignmentList moverFullName={councillor.full_name} rows={termAlignment} />
            )}
            {activeTab === 'moved' && <MovedList key={panelKey} motions={termMovedMotions} termLabel={term?.label} />}
          </div>
        </>
      )}
    </div>
  );
}
