import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MotionsByDate from '../MotionsByDate';
import type { DateData, IndexData, Meeting } from '../../types';

const index: IndexData = {
  dates: ['2025-06-23', '2025-06-24'],
  current_term: '2022-2026',
  councillors: [],
  terms: [{ slug: '2022-2026', label: '2022–2026', start: '2022-11-15', end: '2026-11-14' }],
};

function meeting(id: string, name: string, start: string, motions: number): Meeting {
  return {
    meeting_id: id,
    meeting_name: name,
    meeting_number: 1,
    meeting_date: '2025-06-23',
    start_time: start,
    location: '',
    source_url: '',
    attendance: [],
    agenda_items: [
      {
        item_id: `${id}-item`,
        agenda_item_number: '1',
        title: `${name} item`,
        attachments: [],
        motions: Array.from({ length: motions }, (_, i) => ({
          motion_id: `${id}-${i}`,
          motion_number: '',
          motion_text: 'That the report be received.',
          motion_moved_by: '',
          motion_seconded_by: '',
          motion_result: 'Carried',
          for_count: 0,
          against_count: 0,
          vote_kind: 'none' as const,
          votes: [],
        })),
      },
    ],
  };
}

const dates: Record<string, DateData> = {
  // Listed out of order on purpose: the page sorts by start time
  '2025-06-23': {
    date: '2025-06-23',
    meetings: [
      meeting('b', 'Ottawa Police Service Board', '16:00', 2),
      meeting('a', 'Emergency Preparedness and Protective Services Committee', '09:30', 1),
    ],
  },
  '2025-06-24': { date: '2025-06-24', meetings: [meeting('c', 'City Council', '10:00', 3)] },
};

vi.mock('../../api/data', () => ({
  fetchIndex: () => Promise.resolve(index),
  fetchDateData: (date: string) => Promise.resolve(dates[date]),
}));

function renderPage(date: string) {
  render(
    <MemoryRouter initialEntries={[`/ottawa?date=${date}`]}>
      <MotionsByDate />
    </MemoryRouter>,
  );
}

describe('MotionsByDate with several meetings', () => {
  it('lists the meetings in start-time order with jump buttons', async () => {
    renderPage('2025-06-23');
    const nav = await screen.findByRole('navigation', { name: '2 meetings on this date · 3 motions' });
    const jumps = nav.querySelectorAll('button');
    expect([...jumps].map((b) => b.textContent)).toEqual([
      '9:30 am1 motionEmergency Preparedness and Protective Services Committee',
      '4:00 pm2 motionsOttawa Police Service Board',
    ]);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      '2 meetings on this date · 3 motions',
      'Emergency Preparedness and Protective Services Committee',
      'Ottawa Police Service Board',
    ]);
  });

  it('moves focus to the chosen meeting', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderPage('2025-06-23');
    await userEvent.click(await screen.findByRole('button', { name: /4:00 pm/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Ottawa Police Service Board' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the meetings list' }));
    expect(screen.getByRole('heading', { name: /2 meetings on this date/ })).toHaveFocus();
  });

  it('shows no meeting list for a single meeting', async () => {
    renderPage('2025-06-24');
    expect(await screen.findByRole('heading', { level: 2, name: 'City Council' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to the meetings list' })).not.toBeInTheDocument();
  });
});
