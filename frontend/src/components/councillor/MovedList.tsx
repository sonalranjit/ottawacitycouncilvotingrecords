import { useMemo, useState } from 'react';
import type { MovedMotion } from '../../types';
import { formatLongDate, isStubMotionText, movedOutcome, plainResult, type MovedOutcome } from '../../utils/format';
import FilterChips, { type ChipOption } from '../records/FilterChips';
import OutcomeBadge from '../records/OutcomeBadge';
import RecordCard from '../records/RecordCard';
import TallyBar from '../records/TallyBar';
import styles from './Tabs.module.scss';

const PAGE_SIZE = 20;

type Filter = 'all' | MovedOutcome;

interface Props {
  motions: MovedMotion[];
  termLabel?: string;
}

function Badge({ outcome, result }: { outcome: MovedOutcome; result: string }) {
  switch (outcome) {
    case 'passed':
      return <OutcomeBadge label="Passed" tone="good" icon="check" size="md" />;
    case 'lost':
      return <OutcomeBadge label="Lost" tone="bad" icon="cross" size="md" />;
    case 'tied':
      return <OutcomeBadge label="Tied" tone="info" size="md" />;
    case 'none':
      return <OutcomeBadge label="No result recorded" tone="neutral" icon="dash" size="md" />;
    default:
      return <OutcomeBadge label={plainResult(result)} tone="neutral" size="md" />;
  }
}

/** Motions the councillor moved in the term, filterable by how they ended. */
export default function MovedList({ motions, termLabel }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  const rows = useMemo(
    () =>
      [...motions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((m) => ({ motion: m, outcome: movedOutcome(m.motion_result) })),
    [motions],
  );

  if (motions.length === 0) {
    return <p className={styles.empty}>No motions moved{termLabel ? ` in the ${termLabel} term` : ''}.</p>;
  }

  const count = (o: MovedOutcome) => rows.filter((r) => r.outcome === o).length;
  const options: ChipOption<Filter>[] = [
    { value: 'all', label: 'All', count: rows.length },
    { value: 'passed', label: 'Passed', count: count('passed') },
    { value: 'lost', label: 'Lost', count: count('lost') },
    { value: 'tied', label: 'Tied', count: count('tied') },
    { value: 'other', label: 'Other result', count: count('other') },
    { value: 'none', label: 'No result', count: count('none') },
  ].filter((o) => o.value === 'all' || o.value === 'passed' || o.value === 'lost' || (o.count ?? 0) > 0) as ChipOption<Filter>[];

  const list = filter === 'all' ? rows : rows.filter((r) => r.outcome === filter);

  return (
    <div className={styles.panel}>
      <div className={styles.movedHeader}>
        <span className={styles.countLine}>
          {rows.length.toLocaleString('en-CA')} motions moved{termLabel ? ` in the ${termLabel} term` : ''} · newest first
        </span>
        <FilterChips<Filter>
          label="Filter by result"
          options={options}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setShown(PAGE_SIZE);
          }}
        />
      </div>

      <div className={styles.list}>
        {list.slice(0, shown).map(({ motion: m, outcome }) => {
          const summary = m.summary || (isStubMotionText(m.motion_text) ? undefined : m.motion_text);
          const hasTally = m.for_count + m.against_count > 0;
          return (
            <RecordCard
              key={m.motion_id}
              meta={[
                formatLongDate(m.date),
                m.meeting_name,
                m.agenda_item_number ? `Item ${m.agenda_item_number.replace(/\.$/, '')}` : '',
                m.motion_number ? `Motion ${m.motion_number}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              title={m.item_title || 'Untitled item'}
              titleTo={`/ottawa?date=${m.date}`}
              summary={summary}
              tags={m.tags}
              aside={
                <>
                  <Badge outcome={outcome} result={m.motion_result} />
                  {hasTally ? (
                    <TallyBar forCount={m.for_count} againstCount={m.against_count} />
                  ) : (
                    <span className={styles.result}>No recorded vote</span>
                  )}
                </>
              }
            />
          );
        })}
      </div>

      {list.length > shown && (
        <button type="button" className={styles.more} onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, list.length - shown)} more motions
        </button>
      )}
    </div>
  );
}
