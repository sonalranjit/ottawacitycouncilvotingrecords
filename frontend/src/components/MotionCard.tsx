import { useState } from 'react';
import type { Motion, Attachment } from '../types';
import { resultVariant, toSlug } from '../utils/format';
import VoteChip from './VoteChip';
import TagPill from './TagPill';
import styles from './MotionCard.module.scss';

interface Props {
  motion: Motion;
  attachments?: Attachment[];
  highlightCouncillor?: string;
}

export default function MotionCard({ motion, attachments, highlightCouncillor }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showVotes, setShowVotes] = useState(false);

  const forVotes = motion.votes.filter((v) => v.vote === 'for');
  const againstVotes = motion.votes.filter((v) => v.vote === 'against');
  const hasVotes = motion.votes.length > 0;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.motionNum}>Motion {motion.motion_number}</span>
        <span className={`${styles.result} ${styles[resultVariant(motion.motion_result)] ?? ''}`}>
          {motion.motion_result || 'Unknown'}
        </span>
      </div>

      {(motion.motion_moved_by || motion.motion_seconded_by) && (
        <div className={styles.movers}>
          {motion.motion_moved_by && <span>Moved: {motion.motion_moved_by}</span>}
          {motion.motion_seconded_by && <span>Seconded: {motion.motion_seconded_by}</span>}
        </div>
      )}

      {motion.summary && (
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>Summary</span>
          <p className={styles.summaryText}>{motion.summary}</p>
        </div>
      )}

      <div className={`${styles.motionText} ${expanded ? styles.expanded : ''}`}>
        {motion.motion_text || <em>No motion text recorded.</em>}
      </div>

      {motion.motion_text.length > 200 && (
        <button className={styles.toggleText} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {motion.tags && motion.tags.length > 0 && (
        <div className={styles.tags}>
          {motion.tags.map((tag) => (
            <TagPill key={tag} tag={tag} slug={toSlug(tag)} asLink />
          ))}
        </div>
      )}

      {attachments && attachments.length > 0 && (
        <div className={styles.attachments}>
          <span className={styles.attachmentsLabel}>Documents</span>
          <ul className={styles.attachmentList}>
            {attachments.map((a) => (
              <li key={a.url}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.attachment}
                >
                  {a.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.tally}>
        <span className={styles.forCount}>{motion.for_count} For</span>
        <span className={styles.tallyDivider}>/</span>
        <span className={styles.againstCount}>{motion.against_count} Against</span>
      </div>

      {hasVotes && (
        <button className={styles.toggleVotes} onClick={() => setShowVotes(!showVotes)}>
          {showVotes ? 'Hide votes' : `Show votes (${motion.votes.length})`}
        </button>
      )}

      {showVotes && hasVotes && (
        <div className={styles.votes}>
          {forVotes.length > 0 && (
            <div className={styles.voteGroup}>
              <span className={styles.voteGroupLabel}>For</span>
              <div className={styles.chips}>
                {forVotes.map((v) => (
                  <VoteChip
                    key={v.councillor_name}
                    councillor_name={v.councillor_name}
                    vote={v.vote}
                    highlight={v.councillor_name === highlightCouncillor}
                  />
                ))}
              </div>
            </div>
          )}
          {againstVotes.length > 0 && (
            <div className={styles.voteGroup}>
              <span className={styles.voteGroupLabel}>Against</span>
              <div className={styles.chips}>
                {againstVotes.map((v) => (
                  <VoteChip
                    key={v.councillor_name}
                    councillor_name={v.councillor_name}
                    vote={v.vote}
                    highlight={v.councillor_name === highlightCouncillor}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
