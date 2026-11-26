import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeetingSection from '../MeetingSection';
import type { Meeting } from '../../types';

const meeting: Meeting = {
  meeting_id: 'm1',
  meeting_name: 'Ottawa Police Service Board',
  meeting_number: 118,
  meeting_date: '2025-06-23',
  start_time: '16:00',
  location: 'Electronic Participation',
  source_url: 'https://example.test/minutes',
  attendance: [
    { councillor_name: 'Cathy Curry', status: 'present' },
    { councillor_name: 'Marty Carr', status: 'absent' },
  ],
  agenda_items: [
    {
      item_id: 'i1',
      agenda_item_number: '1.',
      title: 'Appointment of Special Constables',
      attachments: [],
      motions: [
        {
          motion_id: 'mo1',
          motion_number: '',
          motion_text: 'That the Board approve the appointments.',
          motion_moved_by: '',
          motion_seconded_by: '',
          motion_result: 'Carried',
          for_count: 0,
          against_count: 0,
          vote_kind: 'none',
          votes: [],
        },
      ],
    },
  ],
};

function renderSection() {
  render(
    <MeetingSection
      meeting={meeting}
      id="meeting-m1"
      councillorTitles={new Map([['Cathy Curry', 'Councillor']])}
    />,
  );
}

describe('MeetingSection', () => {
  it('shows the start time, name, number and location', () => {
    renderSection();
    expect(screen.getByText('4:00 pm')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Ottawa Police Service Board' })).toBeInTheDocument();
    expect(screen.getByText(/Meeting 118 · Electronic Participation/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Minutes' })).toHaveAttribute('href', 'https://example.test/minutes');
  });

  it('collapses attendance to counts until opened', async () => {
    renderSection();
    const toggle = screen.getByRole('button', { name: /Attendance/ });
    expect(toggle).toHaveTextContent('1 present, 1 absent');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Councillor Cathy Curry')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Councillor Cathy Curry')).toBeInTheDocument();
    expect(screen.getByText('(absent)', { exact: false })).toBeInTheDocument();
  });

  it('renders each agenda item as a card with its heading', () => {
    renderSection();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Appointment of Special Constables' })).toBeInTheDocument();
  });
});
