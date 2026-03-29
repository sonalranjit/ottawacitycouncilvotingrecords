import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchIndex, fetchCouncillorData } from '../api/data';
import type { IndexData, CouncillorData } from '../types';
import CouncillorSelector from '../components/CouncillorSelector';
import VoteTable from '../components/VoteTable';
import styles from './CouncillorHistory.module.scss';

export default function CouncillorHistory() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [councillorData, setCouncillorData] = useState<CouncillorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    navigate(`/ottawa/councillors/${newSlug}`);
  }

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

          <div className={styles.tableHeader}>
            <span className={styles.voteCount}>
              {councillorData.votes.length} vote{councillorData.votes.length !== 1 ? 's' : ''} recorded
            </span>
          </div>

          <VoteTable votes={councillorData.votes} />
        </>
      )}
    </div>
  );
}
