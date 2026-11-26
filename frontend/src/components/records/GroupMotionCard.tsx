import { useState } from 'react';
import type { TagMotion } from '../../types';
import { formatLongDate, motionOutcome, plainResult } from '../../utils/format';
import VoteChip from '../VoteChip';
import OutcomeBadge, { type BadgeTone } from './OutcomeBadge';
import RecordCard from './RecordCard';
import TallyBar from './TallyBar';
import styles from './GroupMotionCard.module.scss';

const TONE: Record<string, BadgeTone> = { carried: 'good', lost: 'bad', tied: 'info', neutral: 'neutral' };

interface Props {
  motion: TagMotion;
  /** Committee pages leave the meeting out, since every motion shares it */
  showMeeting: boolean;
}

/** A motion on a committee or topic page. */
export default function GroupMotionCard({ motion: m, showMeeting }: Props) {
  const [showVotes, setShowVotes] = useState(false);
  const votes = m.votes ?? [];
  const outcome = motionOutcome(m.motion_result, m.vote_kind, votes.length);
  const forVotes = votes.filter((v) => v.vote === 'for');
  const againstVotes = votes.filter((v) => v.vote === 'against');

  const meta = [formatLongDate(m.date), showMeeting ? m.meeting_name : '', m.agenda_item_number ? `Item ${m.agenda_item_number.replace(/\.$/, '')}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <RecordCard
      meta={meta}
      title={m.item_title || 'Untitled item'}
      titleTo={`/ottawa?date=${m.date}`}
      summary={m.summary}
      tags={m.tags}
      aside={
        <>
          <OutcomeBadge label={outcome.showTally ? plainResult(outcome.label) : outcome.label} tone={TONE[outcome.variant] ?? 'neutral'} size="md" />
          {outcome.showTally ? (
            <TallyBar forCount={m.for_count} againstCount={m.against_count} />
          ) : (
            <span className={styles.noVote}>No recorded vote</span>
          )}
          {outcome.note && <span className={styles.note}>{outcome.note}</span>}
          {againstVotes.length > 0 && !showVotes && (
            <span className={styles.against}>
              Against: {againstVotes.map((v) => v.councillor_name).join(', ')}
            </span>
          )}
          {votes.length > 0 && (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={showVotes}
              onClick={() => setShowVotes((s) => !s)}
            >
              {showVotes ? 'Hide votes' : `Show votes (${votes.length})`}
            </button>
          )}
          {showVotes && (
            <div className={styles.votes}>
              {([['For', forVotes], ['Against', againstVotes]] as const).map(([label, list]) =>
                list.length > 0 ? (
                  <div key={label} className={styles.voteGroup}>
                    <span className={styles.voteLabel}>{label}</span>
                    <div className={styles.chips}>
                      {list.map((v) => (
                        <VoteChip key={v.councillor_name} councillor_name={v.councillor_name} vote={v.vote} />
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </>
      }
    />
  );
}
