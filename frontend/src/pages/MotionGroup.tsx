import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { TagMotion } from '../types';
import { useTerm } from '../hooks/useTerm';
import { countInTerm, filterByTerm } from '../utils/terms';
import DirectoryList from '../components/records/DirectoryList';
import FilterChips from '../components/records/FilterChips';
import GroupMotionCard from '../components/records/GroupMotionCard';
import styles from './MotionGroup.module.scss';

const PAGE_SIZE = 20;

interface GroupMeta {
  name: string;
  slug: string;
  motion_count: number;
  counts_by_term?: Record<string, number>;
}

export interface MotionGroupConfig {
  title: string;
  intro: string;
  noun: string;
  nounPlural: string;
  searchPlaceholder: string;
  basePath: string;
  /** Show the meeting on each card; a committee's motions all share one */
  showMeeting: boolean;
  fetchIndex: () => Promise<GroupMeta[]>;
  fetchGroup: (slug: string) => Promise<{ name: string; motions: TagMotion[] }>;
}

/**
 * The Committees and Topics sections: a searchable list of groups, and a
 * page per group listing its motions in the term.
 */
export default function MotionGroup({ config }: { config: MotionGroupConfig }) {
  const { slug } = useParams<{ slug?: string }>();
  return slug ? <GroupDetail key={slug} slug={slug} config={config} /> : <GroupIndex config={config} />;
}

function GroupIndex({ config }: { config: MotionGroupConfig }) {
  const { term, termQuery } = useTerm();
  const [groups, setGroups] = useState<GroupMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    config.fetchIndex().then(setGroups).catch((e: Error) => setError(e.message));
  }, [config]);

  const items = useMemo(
    () =>
      (groups ?? [])
        .map((g) => ({ name: g.name, slug: g.slug, count: countInTerm(g, term?.slug) }))
        .filter((g) => g.count > 0)
        .sort((a, b) => b.count - a.count),
    [groups, term],
  );

  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!groups) return <div className={styles.loading}>Loading…</div>;

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h1 className={styles.heading}>{config.title}</h1>
        <p className={styles.lead}>{config.intro}</p>
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>
          No {config.nounPlural} have motions yet{term ? ` in the ${term.label} term` : ''}.
        </p>
      ) : (
        <DirectoryList
          items={items}
          linkTo={(s) => `${config.basePath}/${s}${termQuery}`}
          noun={config.noun}
          nounPlural={config.nounPlural}
          placeholder={config.searchPlaceholder}
        />
      )}
    </div>
  );
}

type VoteFilter = 'all' | 'recorded';

function GroupDetail({ slug, config }: { slug: string; config: MotionGroupConfig }) {
  const { term, termQuery } = useTerm();
  const [group, setGroup] = useState<{ name: string; motions: TagMotion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VoteFilter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    config.fetchGroup(slug).then(setGroup).catch((e: Error) => setError(e.message));
  }, [slug, config]);

  const termMotions = useMemo(
    () => (group ? [...filterByTerm(group.motions, term?.slug)].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [group, term],
  );
  const recorded = useMemo(() => termMotions.filter((m) => (m.votes ?? []).length > 0), [termMotions]);
  const list = filter === 'recorded' ? recorded : termMotions;

  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!group) return <div className={styles.loading}>Loading…</div>;

  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link to={`${config.basePath}${termQuery}`} className={styles.back}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          All {config.nounPlural}
        </Link>
      </nav>
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <h1 className={styles.heading}>{group.name}</h1>
          <span className={styles.subhead}>
            {termMotions.length.toLocaleString('en-CA')} motion{termMotions.length === 1 ? '' : 's'}
            {term ? ` in the ${term.label} term` : ''} · newest first
          </span>
        </div>
        {termMotions.length > 0 && (
          <FilterChips<VoteFilter>
            label="Show"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setShown(PAGE_SIZE);
            }}
            options={[
              { value: 'all', label: 'All', count: termMotions.length },
              { value: 'recorded', label: 'Recorded votes', count: recorded.length },
            ]}
          />
        )}
      </div>

      {list.length === 0 ? (
        <p className={styles.empty}>
          {filter === 'recorded' ? 'None of these motions had a recorded vote.' : `No motions${term ? ` in the ${term.label} term` : ''}.`}
        </p>
      ) : (
        <div className={styles.list}>
          {list.slice(0, shown).map((m) => (
            <GroupMotionCard key={m.motion_id} motion={m} showMeeting={config.showMeeting} />
          ))}
        </div>
      )}

      {list.length > shown && (
        <button type="button" className={styles.more} onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, list.length - shown)} more motions
        </button>
      )}
    </div>
  );
}
