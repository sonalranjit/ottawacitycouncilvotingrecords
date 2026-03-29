import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteTable from '../VoteTable';
import type { CouncillorVoteRow } from '../../types';

const makeRow = (overrides: Partial<CouncillorVoteRow> = {}): CouncillorVoteRow => ({
  date: '2025-06-15',
  meeting_name: 'City Council',
  meeting_id: 'mtg1',
  source_url: 'https://example.com/meeting/1',
  agenda_item_number: '3.1',
  item_title: 'Capital Budget',
  motion_id: 'mot1',
  motion_number: '1',
  motion_text: 'That the report be received.',
  motion_result: 'Carried',
  for_count: 18,
  against_count: 5,
  vote: 'for',
  ...overrides,
});

const longMotionText = 'B'.repeat(121);

describe('VoteTable', () => {
  it('shows the empty message when no votes are provided', () => {
    render(<VoteTable votes={[]} />);
    expect(screen.getByText('No votes recorded.')).toBeInTheDocument();
  });

  it('renders a row for each vote', () => {
    const votes = [
      makeRow({ motion_id: 'a', date: '2025-06-15' }),
      makeRow({ motion_id: 'b', date: '2025-06-16' }),
    ];
    render(<VoteTable votes={votes} />);
    // Two date cells means two rows
    const rows = screen.getAllByRole('link');
    expect(rows).toHaveLength(2);
  });

  it('formats dates as M/D/YYYY without leading zeros', () => {
    render(<VoteTable votes={[makeRow({ date: '2025-01-05' })]} />);
    expect(screen.getByText('1/5/2025')).toBeInTheDocument();
  });

  it('shows "Yes" for a "for" vote', () => {
    render(<VoteTable votes={[makeRow({ vote: 'for' })]} />);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shows "No" for an "against" vote', () => {
    render(<VoteTable votes={[makeRow({ vote: 'against' })]} />);
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('displays the result label', () => {
    render(<VoteTable votes={[makeRow({ motion_result: 'Carried Unanimously' })]} />);
    expect(screen.getByText('Carried')).toBeInTheDocument();
  });

  it('displays for/against tally', () => {
    render(<VoteTable votes={[makeRow({ for_count: 20, against_count: 3 })]} />);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows short motion text in full without expand button', () => {
    render(<VoteTable votes={[makeRow()]} />);
    expect(screen.getByText('That the report be received.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('truncates motion text longer than 120 characters', () => {
    render(<VoteTable votes={[makeRow({ motion_text: longMotionText })]} />);
    expect(screen.queryByText(longMotionText)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('expands truncated motion text on "Show more" click', async () => {
    render(<VoteTable votes={[makeRow({ motion_text: longMotionText })]} />);
    await userEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText(longMotionText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });

  it('expanding one row does not expand others', async () => {
    const votes = [
      makeRow({ motion_id: 'a', motion_text: longMotionText }),
      makeRow({ motion_id: 'b', motion_text: longMotionText }),
    ];
    render(<VoteTable votes={votes} />);
    const [firstBtn] = screen.getAllByRole('button', { name: /show more/i });
    await userEvent.click(firstBtn!);
    // First is now "Show less", second still "Show more"
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('sorts by date descending by default (most recent first)', () => {
    const votes = [
      makeRow({ motion_id: 'old', date: '2024-01-01' }),
      makeRow({ motion_id: 'new', date: '2025-06-15' }),
    ];
    render(<VoteTable votes={votes} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is thead; rows[1] should be the most recent date
    expect(within(rows[1]!).getByText('6/15/2025')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('1/1/2024')).toBeInTheDocument();
  });

  it('toggles to ascending sort when the Date header is clicked', async () => {
    const votes = [
      makeRow({ motion_id: 'old', date: '2024-01-01' }),
      makeRow({ motion_id: 'new', date: '2025-06-15' }),
    ];
    render(<VoteTable votes={votes} />);
    await userEvent.click(screen.getByRole('columnheader', { name: /date/i }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('1/1/2024')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('6/15/2025')).toBeInTheDocument();
  });
});
