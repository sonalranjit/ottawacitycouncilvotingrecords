import styles from './OutcomeBadge.module.scss';

export type BadgeTone = 'good' | 'bad' | 'neutral' | 'info';

const ICONS: Record<string, string> = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6 6l12 12 M18 6L6 18',
  dash: 'M6 12h12',
};

interface Props {
  label: string;
  tone: BadgeTone;
  icon?: keyof typeof ICONS;
  size?: 'sm' | 'md';
}

/** A rounded result label, e.g. "Carried", "Voted against", "Passed". */
export default function OutcomeBadge({ label, tone, icon, size = 'sm' }: Props) {
  return (
    <span className={`${styles.badge} ${styles[tone]} ${size === 'md' ? styles.md : ''}`}>
      {icon && (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d={ICONS[icon]} />
        </svg>
      )}
      {label}
    </span>
  );
}
