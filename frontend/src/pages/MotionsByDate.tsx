import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchDateData } from '../api/data';
import type { DateData } from '../types';
import MotionCard from '../components/MotionCard';
import { useTerm } from '../hooks/useTerm';
import { councillorsInTerm, dateInTerm } from '../utils/terms';
import { itemLabel } from '../utils/format';
import styles from './MotionsByDate.module.scss';

export default function MotionsByDate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { index, error: indexError, term } = useTerm();
  const [dateData, setDateData] = useState<DateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only dates in the selected term are offered
  const termDates = useMemo(
    () => (index && term ? index.dates.filter((d) => dateInTerm(d, term)) : []),
    [index, term],
  );

  // Derive selected date: from URL param, or default to the term's most recent
  const selectedDate = searchParams.get('date') ?? (termDates[0] ?? '');

  // Load date data whenever selectedDate changes
  useEffect(() => {
    if (!selectedDate) {
      setDateData(null);
      setLoading(false);
      return;
    }
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
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', date);
      return next;
    }, { replace: true });
  }

  if (error || indexError) {
    return <div className={styles.error}>Error: {error ?? indexError}</div>;
  }

  const councillorTitles = new Map(
    index && term ? councillorsInTerm(index.councillors, term.slug).map((c) => [c.full_name, c.title]) : []
  );

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
            disabled={!index || termDates.length === 0}
          >
            {termDates.map((d) => (
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

      {!loading && index && term && termDates.length === 0 && (
        <p className={styles.empty}>No meetings have been recorded yet for the {term.label} term.</p>
      )}

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

          {meeting.attendance && meeting.attendance.length > 0 && (
            <div className={styles.attendance}>
              <span className={styles.attendanceLabel}>Attendance</span>
              <div className={styles.attendees}>
                {meeting.attendance.map((a) => (
                  <span
                    key={a.councillor_name}
                    className={`${styles.attendee} ${a.status === 'absent' ? styles.absent : ''}`}
                  >
                    {councillorTitles.has(a.councillor_name)
                      ? `${councillorTitles.get(a.councillor_name)} ${a.councillor_name}`
                      : a.councillor_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {meeting.agenda_items.map((item) => (
            // One card per agenda item. The item heading sits inside its first
            // motion; further motions follow as rows of the same card.
            <div key={item.item_id} className={styles.itemCard}>
              {item.motions.length === 0 ? (
                <h3 className={styles.itemTitle}>
                  <span className={styles.itemNumber}>{itemLabel(item.agenda_item_number)}</span>
                  {item.title}
                </h3>
              ) : (
                item.motions.map((motion, i) => (
                  <MotionCard
                    key={motion.motion_id}
                    motion={motion}
                    attachments={i === 0 ? item.attachments : undefined}
                    item={i === 0 ? { number: item.agenda_item_number, title: item.title } : undefined}
                  />
                ))
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
