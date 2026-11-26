import { useEffect, useId, useRef, useState } from 'react';
import { TAB_BAR_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import styles from './TopicFilter.module.scss';

export interface TopicOption {
  slug: string;
  tag: string;
  count: number;
}

interface Props {
  /** Most-used first */
  topics: TopicOption[];
  selected: Set<string>;
  onToggle: (slug: string) => void;
  onClear: () => void;
}

const CHIPS_SHOWN = 8;

/**
 * Topic filter for a councillor's votes. Wide screens get a row of chips
 * (the less-used topics folded behind "+N more"); phones get one button that
 * opens a searchable sheet, since a long chip row is awkward to scroll.
 */
export default function TopicFilter(props: Props) {
  const isPhone = useMediaQuery(TAB_BAR_QUERY);
  return isPhone ? <TopicSheet {...props} /> : <TopicChips {...props} />;
}

function TopicChips({ topics, selected, onToggle, onClear }: Props) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll
    ? topics
    : topics.filter((t, i) => i < CHIPS_SHOWN || selected.has(t.slug));
  const hidden = topics.length - shown.length;

  return (
    <div className={styles.chipRow} role="group" aria-label="Filter by topic">
      <span className={styles.chipLabel}>Topic</span>
      {shown.map((t) => (
        <button
          key={t.slug}
          type="button"
          className={`${styles.chip} ${selected.has(t.slug) ? styles.chipOn : ''}`}
          aria-pressed={selected.has(t.slug)}
          onClick={() => onToggle(t.slug)}
        >
          {t.tag} <span className={styles.chipCount}>{t.count}</span>
        </button>
      ))}
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          +{hidden} more
        </button>
      )}
      {showAll && topics.length > CHIPS_SHOWN && (
        <button type="button" className={styles.more} onClick={() => setShowAll(false)}>
          Show fewer
        </button>
      )}
      {selected.size > 0 && (
        <button type="button" className={styles.clear} onClick={onClear}>
          Clear filter
        </button>
      )}
    </div>
  );
}

function TopicSheet({ topics, selected, onToggle, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const searchId = useId();

  function close() {
    setOpen(false);
    setQuery('');
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const chosen = topics.filter((t) => selected.has(t.slug));
  const summary =
    chosen.length === 0 ? 'All topics' : chosen.length === 1 ? chosen[0].tag : `${chosen.length} topics`;
  const q = query.trim().toLowerCase();
  const matches = q ? topics.filter((t) => t.tag.toLowerCase().includes(q)) : topics;

  return (
    <div className={styles.sheetFilter}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg className={styles.triggerIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 6h16 M7 12h10 M10 18h4" />
        </svg>
        <span className={styles.triggerText}>
          <span className={styles.triggerLabel}>Topic:</span> <strong>{summary}</strong>
        </span>
        <svg className={styles.triggerChevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {selected.size > 0 && (
        <button type="button" className={styles.clear} onClick={onClear}>
          Clear filter
        </button>
      )}

      {open && (
        <>
          <div className={styles.backdrop} onClick={close} aria-hidden="true" />
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={headingId}>
            <div className={styles.handle} aria-hidden="true" />
            <div className={styles.sheetHeader}>
              <h2 id={headingId} className={styles.sheetTitle}>Filter by topic</h2>
              <span className={styles.sheetCount}>{topics.length} topics</span>
            </div>
            <label htmlFor={searchId} className={styles.srOnly}>Search topics</label>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className={styles.search}
              placeholder="Search topics"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className={styles.options}>
              {matches.map((t) => (
                <li key={t.slug}>
                  <label className={styles.option}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selected.has(t.slug)}
                      onChange={() => onToggle(t.slug)}
                    />
                    <span className={styles.optionLabel}>{t.tag}</span>
                    <span className={styles.optionCount}>{t.count}</span>
                  </label>
                </li>
              ))}
              {matches.length === 0 && <li className={styles.noMatch}>No topics match “{query}”.</li>}
            </ul>
            <button type="button" className={styles.done} onClick={close}>
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
