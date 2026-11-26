import styles from './FilterChips.module.scss';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** A single-choice row of pill buttons, each with an optional count. */
export default function FilterChips<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.chip} ${o.value === value ? styles.on : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className={styles.count}>{o.count.toLocaleString('en-CA')}</span>}
        </button>
      ))}
    </div>
  );
}
