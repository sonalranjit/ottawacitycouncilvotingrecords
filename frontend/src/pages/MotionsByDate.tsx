import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchIndex, fetchDateData } from '../api/data';
import type { IndexData, DateData } from '../types';
import MotionCard from '../components/MotionCard';
import styles from './MotionsByDate.module.scss';

export default function MotionsByDate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [dateData, setDateData] = useState<DateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, load the index
  useEffect(() => {
    fetchIndex()
      .then(setIndex)
      .catch((e: Error) => setError(e.message));
  }, []);

  // Derive selected date: from URL param, or default to most recent
  const selectedDate = searchParams.get('date') ?? (index?.dates[0] ?? '');

  // Load date data whenever selectedDate changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    setDateData(null);
    fetchDateData(selectedDate)
      .then((data) => {
        setDateData(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [selectedDate]);

  function handleDateChange(date: string) {
    setSearchParams({ date }, { replace: true });
  }

  if (error) {
    return <div className={styles.error}>Error: {error}</div>;
  }

  const totalMotions = dateData?.meetings.reduce(
    (sum, m) => sum + m.agenda_items.reduce((s, i) => s + i.motions.length, 0),
    0,
  ) ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <div className={styles.datePickerGroup}>
          <label className={styles.label} htmlFor="date-select">
            Date
          </label>
          <select
            id="date-select"
            className={styles.dateSelect}
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            disabled={!index}
          >
            {index?.dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        {dateData && (
          <span className={styles.summary}>
            {dateData.meetings.length} meeting{dateData.meetings.length !== 1 ? 's' : ''},{' '}
            {totalMotions} motion{totalMotions !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && <div className={styles.loading}>Loading...</div>}

      {!loading && dateData && dateData.meetings.length === 0 && (
        <p className={styles.empty}>No motions recorded for this date.</p>
      )}

      {!loading && dateData?.meetings.map((meeting) => (
        <section key={meeting.meeting_id} className={styles.meeting}>
          <div className={styles.meetingHeader}>
            <h2 className={styles.meetingName}>{meeting.meeting_name}</h2>
            <div className={styles.meetingMeta}>
              {meeting.meeting_number ? `#${meeting.meeting_number}` : ''}
              {meeting.location ? ` · ${meeting.location}` : ''}
              {meeting.source_url && (
                <a
                  href={meeting.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceLink}
                >
                  Minutes
                </a>
              )}
            </div>
          </div>

          {meeting.agenda_items.map((item) => (
            <div key={item.item_id} className={styles.agendaItem}>
              <h3 className={styles.itemTitle}>
                <span className={styles.itemNumber}>{item.agenda_item_number}</span>
                {item.title}
              </h3>
              <div className={styles.motions}>
                {item.motions.map((motion) => (
                  <MotionCard key={motion.motion_id} motion={motion} attachments={item.attachments} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
