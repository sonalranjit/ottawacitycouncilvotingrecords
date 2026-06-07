import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MotionsMovedTable from '../MotionsMovedTable';
import type { MovedMotion } from '../../types';

const makeMotion = (overrides: Partial<MovedMotion> = {}): MovedMotion => ({
  date: '2025-06-15',
  meeting_name: 'City Council',
  source_url: 'https://example.com/meeting/1',
  agenda_item_number: '3.1',
  item_title: 'Capital Budget',
  motion_id: 'mot1',
  motion_number: '1',
  motion_text: 'That the report be received.',
  motion_result: 'Carried',
  for_count: 18,
  against_count: 5,
  ...overrides,
});

const longMotionText = 'B'.repeat(121);

function renderTable(motions: MovedMotion[], moverFullName = 'Jane Smith') {
  return render(
    <MemoryRouter>
      <MotionsMovedTable moverFullName={moverFullName} motions={motions} />
    </MemoryRouter>
  );
}

describe('MotionsMovedTable', () => {
  it('shows the empty message when no motions are provided', () => {
    renderTable([]);
    expect(screen.getByText('No motions moved by this councillor.')).toBeInTheDocument();
  });

  it('renders a row for each motion', () => {
    const motions = [
      makeMotion({ motion_id: 'a', date: '2025-06-15' }),
      makeMotion({ motion_id: 'b', date: '2025-06-16' }),
    ];
    renderTable(motions);
    expect(screen.getAllByRole('link', { name: /\d{1,2}\/\d{1,2}\/2025/ })).toHaveLength(2);
  });

  it('summarizes total moved and the carried/lost/tied breakdown', () => {
    const motions = [
      makeMotion({ motion_id: 'a', motion_result: 'Carried' }),
      makeMotion({ motion_id: 'b', motion_result: 'Lost' }),
      makeMotion({ motion_id: 'c', motion_result: 'Lost on a tie (6 to 6)' }),
    ];
    renderTable(motions, 'Ariel Troster');
    const summary = screen.getByText(/Ariel Troster moved/);
    expect(summary).toHaveTextContent('Ariel Troster moved 3 motions: 1 carried, 1 lost, 1 tied.');
  });

  it('formats dates as M/D/YYYY without leading zeros', () => {
    renderTable([makeMotion({ date: '2025-01-05' })]);
    expect(screen.getByText('1/5/2025')).toBeInTheDocument();
  });

  it('displays the result label, classifying ties separately from losses', () => {
    renderTable([makeMotion({ motion_result: 'Lost on a tie (6 to 6)' })]);
    expect(screen.getByText('Tied')).toBeInTheDocument();
  });

  it('displays for/against tally', () => {
    renderTable([makeMotion({ for_count: 20, against_count: 3 })]);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('truncates motion text longer than 120 characters and expands on click', async () => {
    renderTable([makeMotion({ motion_text: longMotionText })]);
    expect(screen.queryByText(longMotionText)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText(longMotionText)).toBeInTheDocument();
  });

  it('sorts by date descending by default (most recent first)', () => {
    const motions = [
      makeMotion({ motion_id: 'old', date: '2024-01-01' }),
      makeMotion({ motion_id: 'new', date: '2025-06-15' }),
    ];
    renderTable(motions);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('6/15/2025')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('1/1/2024')).toBeInTheDocument();
  });

  it('toggles to ascending sort when the Date header is clicked', async () => {
    const motions = [
      makeMotion({ motion_id: 'old', date: '2024-01-01' }),
      makeMotion({ motion_id: 'new', date: '2025-06-15' }),
    ];
    renderTable(motions);
    await userEvent.click(screen.getByRole('columnheader', { name: /date/i }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('1/1/2024')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('6/15/2025')).toBeInTheDocument();
  });
});
