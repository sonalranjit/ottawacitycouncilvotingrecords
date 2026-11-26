import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchDateData } from '../api/data';
import type { DateData, Meeting } from '../types';
import MeetingSection from '../components/MeetingSection';
import { useTerm } from '../hooks/useTerm';
import { councillorsInTerm, dateInTerm } from '../utils/terms';
import { formatStartTime } from '../utils/format';
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

  const motionCount = (m: Meeting) => m.agenda_items.reduce((s, i) => s + i.motions.length, 0);
  const totalMotions = dateData?.meetings.reduce((sum, m) => sum + motionCount(m), 0) ?? 0;
  // Earliest first; meetings without a start time keep their place at the end
  const meetings = [...(dateData?.meetings ?? [])].sort((a, b) =>
    (a.start_time || '99').localeCompare(b.start_time || '99'),
  );
  const meetingAnchor = (m: Meeting) => `meeting-${m.meeting_id}`;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function jumpTo(id: string) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    // Move focus with the view so keyboard and screen reader users land there too
    const target = document.getElementById(`${id}-heading`) ?? document.getElementById(id);
    target?.focus({ preventScroll: true });
  }

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
        {dateData && dateData.meetings.length <= 1 && (
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

      {!loading && meetings.length > 1 && (
        <nav id="meetings-on-date" className={styles.meetingsNav} aria-labelledby="meetings-on-date-heading">
          <h2 id="meetings-on-date-heading" className={styles.meetingsNavLabel} tabIndex={-1}>
            {meetings.length} meetings on this date · {plural(totalMotions, 'motion')}
          </h2>
          <ul className={styles.meetingsNavList}>
            {meetings.map((m) => (
              <li key={m.meeting_id}>
                <button type="button" className={styles.meetingJump} onClick={() => jumpTo(meetingAnchor(m))}>
                  <span className={styles.jumpTop}>
                    <span className={styles.jumpTime}>{formatStartTime(m.start_time)}</span>
                    <span className={styles.jumpCount}>{plural(motionCount(m), 'motion')}</span>
                  </span>
                  <span className={styles.jumpName}>{m.meeting_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {!loading && meetings.map((meeting) => (
        <MeetingSection
          key={meeting.meeting_id}
          id={meetingAnchor(meeting)}
          meeting={meeting}
          councillorTitles={councillorTitles}
        />
      ))}

      {!loading && meetings.length > 1 && (
        <button
          type="button"
          className={styles.backToList}
          onClick={() => jumpTo('meetings-on-date')}
        >
          Back to the meetings list
        </button>
      )}
    </div>
  );
}
