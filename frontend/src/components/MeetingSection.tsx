import { useState } from 'react';
import type { Meeting } from '../types';
import { formatStartTime, itemLabel } from '../utils/format';
import MotionCard from './MotionCard';
import styles from './MeetingSection.module.scss';

interface Props {
  meeting: Meeting;
  /** Element id for jump links; the heading gets `${id}-heading` */
  id: string;
  /** full_name → title ("Councillor", "Mayor") for the attendance list */
  councillorTitles: Map<string, string>;
}

/**
 * One meeting on the Motions by Date page: a heading on the page background,
 * attendance collapsed to a single line, then one card per agenda item.
 */
export default function MeetingSection({ meeting, id, councillorTitles }: Props) {
  const [showAttendance, setShowAttendance] = useState(false);
  const attendance = meeting.attendance ?? [];
  const present = attendance.filter((a) => a.status !== 'absent').length;
  const absent = attendance.length - present;
  const startTime = formatStartTime(meeting.start_time);
  const attendanceId = `${id}-attendance`;

  return (
    <section id={id} className={styles.meeting} aria-labelledby={`${id}-heading`}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          {startTime && <span className={styles.startTime}>{startTime}</span>}
          <h2 id={`${id}-heading`} className={styles.name} tabIndex={-1}>
            {meeting.meeting_name}
          </h2>
          <div className={styles.meta}>
            {[meeting.meeting_number ? `Meeting ${meeting.meeting_number}` : '', meeting.location]
              .filter(Boolean)
              .join(' · ')}
            {meeting.source_url && (
              <>
                {meeting.meeting_number || meeting.location ? ' · ' : ''}
                <a
                  href={meeting.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceLink}
                >
                  Minutes
                </a>
              </>
            )}
          </div>
        </div>

        {attendance.length > 0 && (
          <button
            type="button"
            className={styles.attendanceToggle}
            aria-expanded={showAttendance}
            aria-controls={attendanceId}
            onClick={() => setShowAttendance((s) => !s)}
          >
            <span className={styles.attendanceLabel}>Attendance</span>
            <span className={styles.attendanceCounts}>
              {present} present, {absent} absent
            </span>
            <svg
              className={`${styles.chevron} ${showAttendance ? styles.chevronOpen : ''}`}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {showAttendance && (
        <ul id={attendanceId} className={styles.attendees} aria-label="Attendance">
          {attendance.map((a) => (
            <li
              key={a.councillor_name}
              className={`${styles.attendee} ${a.status === 'absent' ? styles.absent : ''}`}
            >
              {councillorTitles.has(a.councillor_name)
                ? `${councillorTitles.get(a.councillor_name)} ${a.councillor_name}`
                : a.councillor_name}
              {a.status === 'absent' && <span className={styles.srOnly}> (absent)</span>}
            </li>
          ))}
        </ul>
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
  );
}
