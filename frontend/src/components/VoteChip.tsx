import styles from './VoteChip.module.scss';

interface Props {
  councillor_name: string;
  vote: 'for' | 'against';
  highlight?: boolean;
}

export default function VoteChip({ councillor_name, vote, highlight }: Props) {
  return (
    <span
      className={`${styles.chip} ${vote === 'for' ? styles.for : styles.against} ${highlight ? styles.highlight : ''}`}
      title={`${councillor_name}: ${vote === 'for' ? 'Yes' : 'No'}`}
    >
      {councillor_name}
    </span>
  );
}
