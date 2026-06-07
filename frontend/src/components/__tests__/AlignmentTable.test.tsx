import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AlignmentTable from '../AlignmentTable';
import type { AlignmentRow } from '../../types';

const makeRow = (overrides: Partial<AlignmentRow> = {}): AlignmentRow => ({
  mover: 'Ariel Troster',
  voter: 'Allan Hubley',
  total_motions_moved: 42,
  voted_for: 30,
  total_votes: 40,
  alignment_pct: 75,
  ...overrides,
});

describe('AlignmentTable', () => {
  it('shows the empty message when no rows match the mover', () => {
    render(<AlignmentTable moverFullName="Ariel Troster" rows={[]} />);
    expect(screen.getByText('No alignment data available for this councillor.')).toBeInTheDocument();
  });

  it('shows the empty message when rows exist but none match the mover', () => {
    render(
      <AlignmentTable
        moverFullName="Ariel Troster"
        rows={[makeRow({ mover: 'Allan Hubley' })]}
      />
    );
    expect(screen.getByText('No alignment data available for this councillor.')).toBeInTheDocument();
  });

  it('filters rows to only those for the given mover', () => {
    const rows = [
      makeRow({ mover: 'Ariel Troster', voter: 'Allan Hubley' }),
      makeRow({ mover: 'Allan Hubley', voter: 'Ariel Troster' }),
    ];
    render(<AlignmentTable moverFullName="Ariel Troster" rows={rows} />);
    expect(screen.getByText('Allan Hubley')).toBeInTheDocument();
    expect(screen.queryByText('Ariel Troster')).not.toBeInTheDocument();
  });

  it('shows the singular "motion" when total_motions_moved is 1', () => {
    render(
      <AlignmentTable
        moverFullName="Ariel Troster"
        rows={[makeRow({ total_motions_moved: 1 })]}
      />
    );
    const summary = screen.getByText(/Ariel Troster moved/);
    expect(summary).toHaveTextContent('Ariel Troster moved 1 motion in total.');
  });

  it('shows the plural "motions" when total_motions_moved is not 1', () => {
    render(
      <AlignmentTable
        moverFullName="Ariel Troster"
        rows={[makeRow({ total_motions_moved: 42 })]}
      />
    );
    const summary = screen.getByText(/Ariel Troster moved/);
    expect(summary).toHaveTextContent('Ariel Troster moved 42 motions in total.');
  });

  it('renders voted-for and total-vote counts for each voter', () => {
    render(
      <AlignmentTable
        moverFullName="Ariel Troster"
        rows={[makeRow({ voted_for: 30, total_votes: 40 })]}
      />
    );
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('rounds the alignment percentage', () => {
    render(
      <AlignmentTable
        moverFullName="Ariel Troster"
        rows={[makeRow({ alignment_pct: 74.6 })]}
      />
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows an em dash when total_votes is zero', () => {
    render(
      <AlignmentTable
        moverFullName="Ariel Troster"
        rows={[makeRow({ total_votes: 0, voted_for: 0, alignment_pct: 0 })]}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
