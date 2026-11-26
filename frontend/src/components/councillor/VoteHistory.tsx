import { useMemo, useState } from 'react';
import type { CouncillorVoteRow } from '../../types';
import { formatLongDate, isStubMotionText, plainResult, toSlug } from '../../utils/format';
import OutcomeBadge from '../records/OutcomeBadge';
import RecordCard from '../records/RecordCard';
import TallyBar from '../records/TallyBar';
import TopicFilter, { type TopicOption } from '../records/TopicFilter';
import styles from './Tabs.module.scss';

const PAGE_SIZE = 20;

interface Props {
  votes: CouncillorVoteRow[];
  termLabel?: string;
}

/** A councillor's votes in the term, newest first, filterable by topic. */
export default function VoteHistory({ votes, termLabel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE_SIZE);

  const sorted = useMemo(() => [...votes].sort((a, b) => b.date.localeCompare(a.date)), [votes]);

  const topics = useMemo<TopicOption[]>(() => {
    const counts = new Map<string, TopicOption>();
    for (const v of votes) {
      for (const tag of v.tags ?? []) {
        const slug = toSlug(tag);
        const t = counts.get(slug) ?? { slug, tag, count: 0 };
        t.count += 1;
        counts.set(slug, t);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [votes]);

  const filtered = useMemo(
    () =>
      selected.size === 0
        ? sorted
        : sorted.filter((v) => (v.tags ?? []).some((t) => selected.has(toSlug(t)))),
    [sorted, selected],
  );

  function toggle(slug: string) {
    setShown(PAGE_SIZE);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  if (votes.length === 0) {
    return <p className={styles.empty}>No votes recorded{termLabel ? ` in the ${termLabel} term` : ''}.</p>;
  }

  return (
    <div className={styles.panel}>
      {topics.length > 0 && (
        <TopicFilter
          topics={topics}
          selected={selected}
          onToggle={toggle}
          onClear={() => {
            setSelected(new Set());
            setShown(PAGE_SIZE);
          }}
        />
      )}
      <span className={styles.countLine} aria-live="polite">
        {selected.size === 0
          ? `${votes.length.toLocaleString('en-CA')} votes${termLabel ? ` in the ${termLabel} term` : ''} · newest first`
          : `${filtered.length.toLocaleString('en-CA')} of ${votes.length.toLocaleString('en-CA')} votes · newest first`}
      </span>

      <div className={styles.list}>
        {filtered.slice(0, shown).map((v) => {
          const summary = v.summary || (isStubMotionText(v.motion_text) ? undefined : v.motion_text);
          const hasTally = v.for_count + v.against_count > 0;
          return (
            <RecordCard
              key={v.motion_id}
              meta={[formatLongDate(v.date), v.meeting_name, v.agenda_item_number ? `Item ${v.agenda_item_number.replace(/\.$/, '')}` : '']
                .filter(Boolean)
                .join(' · ')}
              title={v.item_title || 'Untitled item'}
              titleTo={`/ottawa?date=${v.date}`}
              summary={summary}
              tags={v.tags}
              aside={
                <>
                  {v.vote === 'for' ? (
                    <OutcomeBadge label="Voted for" tone="good" icon="check" size="md" />
                  ) : (
                    <OutcomeBadge label="Voted against" tone="bad" icon="cross" size="md" />
                  )}
                  <span className={styles.result}>{plainResult(v.motion_result) || 'No result recorded'}</span>
                  {hasTally && <TallyBar forCount={v.for_count} againstCount={v.against_count} />}
                </>
              }
            />
          );
        })}
      </div>

      {filtered.length > shown && (
        <button type="button" className={styles.more} onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, filtered.length - shown)} more votes
        </button>
      )}
    </div>
  );
}
