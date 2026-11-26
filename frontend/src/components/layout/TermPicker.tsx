import { useEffect, useId, useRef, useState } from 'react';
import type { Term } from '../../types';
import { shortTermLabel } from '../../utils/terms';
import styles from './TermPicker.module.scss';

interface Props {
  terms: Term[];
  selected: Term;
  currentSlug?: string;
  onSelect: (slug: string) => void;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The header's term chip. Opens a popover on desktop and a bottom sheet on
 * phones (the same markup, laid out by the stylesheet).
 */
export default function TermPicker({ terms, selected, currentSlug, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  function close() {
    setOpen(false);
    chipRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    selectedRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        chipRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function choose(slug: string) {
    if (slug !== selected.slug) onSelect(slug);
    close();
  }

  return (
    <div className={styles.picker}>
      <button
        ref={chipRef}
        type="button"
        className={styles.chip}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Council term ${selected.label}. Change term`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.chipLabel}>Term</span>
        <span className={styles.chipValueFull}>{selected.label}</span>
        <span className={styles.chipValueShort}>{shortTermLabel(selected.label)}</span>
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={close} aria-hidden="true" />
          <div className={styles.panel} role="dialog" aria-labelledby={headingId}>
            <div className={styles.handle} aria-hidden="true" />
            <h2 id={headingId} className={styles.heading}>Council term</h2>
            <p className={styles.hint}>Every page shows votes from the term you pick.</p>
            <ul className={styles.options}>
              {[...terms].reverse().map((t) => {
                const isSelected = t.slug === selected.slug;
                return (
                  <li key={t.slug}>
                    <button
                      ref={isSelected ? selectedRef : undefined}
                      type="button"
                      className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => choose(t.slug)}
                    >
                      <span className={styles.optionText}>
                        <span className={styles.optionLabel}>{t.label}</span>
                        <span className={styles.optionNote}>
                          {t.slug === currentSlug
                            ? 'Current term'
                            : `${formatDay(t.start)} – ${formatDay(t.end)}`}
                        </span>
                      </span>
                      {isSelected && (
                        <svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
