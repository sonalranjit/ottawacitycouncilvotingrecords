import type { CouncillorMeta } from '../types';
import styles from './CouncillorSelector.module.scss';

interface Props {
  councillors: CouncillorMeta[];
  selectedSlug: string;
  onChange: (slug: string) => void;
}

export default function CouncillorSelector({ councillors, selectedSlug, onChange }: Props) {
  // Mayor first (no ward_number), then by ward number
  const mayor = councillors.filter((c) => !c.ward_number);
  const byWard = councillors
    .filter((c) => !!c.ward_number)
    .sort((a, b) => parseInt(a.ward_number) - parseInt(b.ward_number));

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="councillor-select">
        Select Councillor
      </label>
      <select
        id="councillor-select"
        className={styles.select}
        value={selectedSlug}
        onChange={(e) => onChange(e.target.value)}
      >
        {mayor.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.full_name} ({c.title})
          </option>
        ))}
        {byWard.map((c) => (
          <option key={c.slug} value={c.slug}>
            Ward {c.ward_number} — {c.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}
