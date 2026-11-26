import { useState } from 'react';
import type { Motion, Attachment } from '../types';
import { describeAttachment, isStubMotionText, itemLabel, motionOutcome, toSlug } from '../utils/format';
import VoteChip from './VoteChip';
import TagPill from './TagPill';
import styles from './MotionCard.module.scss';

interface Props {
  motion: Motion;
  attachments?: Attachment[];
  highlightCouncillor?: string;
  /** The agenda item this motion belongs to, shown as the card's heading */
  item?: { number: string; title: string };
}

/**
 * One motion, laid out as a row of an agenda item's card (the caller draws
 * the card's border). On wide screens the description sits on the left and
 * the outcome and documents in a side column; on phones it is one column:
 * item heading, outcome, description, documents.
 */
export default function MotionCard({ motion, attachments, highlightCouncillor, item }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showVotes, setShowVotes] = useState(false);

  const forVotes = motion.votes.filter((v) => v.vote === 'for');
  const againstVotes = motion.votes.filter((v) => v.vote === 'against');
  const hasVotes = motion.votes.length > 0;
  const outcome = motionOutcome(motion.motion_result, motion.vote_kind, motion.votes.length);
  const totalVotes = motion.for_count + motion.against_count;
  const forShare = totalVotes > 0 ? (motion.for_count / totalVotes) * 100 : 0;
  const showMotionText = !isStubMotionText(motion.motion_text);

  return (
    <article className={styles.card}>
      <div className={styles.outcome}>
        <span className={`${styles.result} ${styles[outcome.variant] ?? ''}`}>
          {outcome.label}
        </span>

        {outcome.showTally ? (
          <div className={styles.tally}>
            <div className={styles.tallyCounts}>
              <span className={styles.forCount}>{motion.for_count} For</span>
              <span className={styles.againstCount}>{motion.against_count} Against</span>
            </div>
            {totalVotes > 0 && (
              <div className={styles.tallyBar} aria-hidden="true">
                <span className={styles.tallyFor} style={{ width: `${forShare}%` }} />
                <span className={styles.tallyAgainst} style={{ width: `${100 - forShare}%` }} />
              </div>
            )}
          </div>
        ) : (
          <div className={styles.noVote}>No recorded vote</div>
        )}

        {outcome.note && <div className={styles.voteNote}>{outcome.note}</div>}

        {hasVotes && (
          <button
            type="button"
            className={styles.toggleVotes}
            aria-expanded={showVotes}
            onClick={() => setShowVotes(!showVotes)}
          >
            {showVotes ? 'Hide votes' : `Show votes (${motion.votes.length})`}
          </button>
        )}

        {showVotes && hasVotes && (
          <div className={styles.votes}>
            {forVotes.length > 0 && (
              <div className={styles.voteGroup}>
                <span className={styles.sectionLabel}>For</span>
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
                <span className={styles.sectionLabel}>Against</span>
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

      <div className={styles.content}>
        {item && (
          <div className={styles.heading}>
            {itemLabel(item.number) && <span className={styles.itemNumber}>{itemLabel(item.number)}</span>}
            <h3 className={styles.itemTitle}>{item.title}</h3>
          </div>
        )}

        {(motion.motion_number || motion.motion_moved_by || motion.motion_seconded_by) && (
          <div className={styles.meta}>
            {motion.motion_number && (
              <span className={styles.motionNum}>Motion {motion.motion_number}</span>
            )}
            {motion.motion_moved_by && <span>Moved: {motion.motion_moved_by}</span>}
            {motion.motion_seconded_by && <span>Seconded: {motion.motion_seconded_by}</span>}
          </div>
        )}

        {motion.summary && (
          <div className={styles.summary}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionLabel}>In plain language</span>
              <span className={styles.aiTag}>AI summary</span>
            </div>
            <p className={styles.summaryText}>{motion.summary}</p>
          </div>
        )}

        {showMotionText && (
          <div className={`${styles.motionBlock} ${motion.summary ? styles.divided : ''}`}>
            {motion.summary && <span className={styles.sectionLabel}>Motion text</span>}
            <div className={`${styles.motionText} ${expanded ? styles.expanded : ''}`}>
              {motion.motion_text || <em>No motion text recorded.</em>}
            </div>
            {motion.motion_text.length > 200 && (
              <button
                type="button"
                className={styles.toggleText}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {motion.tags && motion.tags.length > 0 && (
          <div className={styles.tags}>
            {motion.tags.map((tag) => (
              <TagPill key={tag} tag={tag} slug={toSlug(tag)} asLink />
            ))}
          </div>
        )}
      </div>

      {attachments && attachments.length > 0 && (
        <div className={styles.documents}>
          <span className={styles.sectionLabel}>Documents</span>
          <ul className={styles.documentList}>
            {attachments.map((a) => {
              const doc = describeAttachment(a.title);
              return (
                <li key={a.url}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.document}
                    title={a.title}
                  >
                    <svg className={styles.fileIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5" />
                    </svg>
                    <span className={styles.documentText}>
                      <span className={styles.documentLabel}>{doc.label}</span>
                      {(doc.detail || doc.fileType) && (
                        <span className={styles.documentDetail}>
                          {[doc.detail, doc.fileType].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}
