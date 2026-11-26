import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProfileCard from '../ProfileCard';
import AlignmentList from '../AlignmentList';
import MovedList from '../MovedList';
import VoteHistory from '../VoteHistory';
import type { AlignmentRow, CouncillorMeta, CouncillorVoteRow, MovedMotion } from '../../../types';

const councillor: CouncillorMeta = {
  slug: 'ariel-troster',
  full_name: 'Ariel Troster',
  first_name_initial: 'A. Troster',
  title: 'Councillor',
  ward_number: '14',
  ward_name: 'Somerset',
  email: 'ariel.troster@ottawa.ca',
  telephone: '613-580-2484',
  active: true,
  terms: [
    { term: '2022-2026', title: 'Councillor', ward_number: '14', ward_name: 'Somerset', start: null, end: null },
    { term: '2026-2030', title: 'Councillor', ward_number: '14', ward_name: 'Somerset', start: null, end: null },
  ],
};

describe('ProfileCard', () => {
  it('shows the role, contact links and the three numbers with a footnote', () => {
    render(
      <ProfileCard
        councillor={councillor}
        termEntry={councillor.terms[0]}
        servedTerms={[
          { slug: '2022-2026', label: '2022–2026', start: '2022-11-15', end: '2026-11-14' },
          { slug: '2026-2030', label: '2026–2030', start: '2026-11-15', end: '2030-11-14' },
        ]}
        votes={279}
        moved={117}
        passed={99}
        decided={100}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Ariel Troster' })).toBeInTheDocument();
    expect(screen.getByText('Councillor · Somerset Ward (Ward 14)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ariel.troster@ottawa.ca/ })).toHaveAttribute('href', 'mailto:ariel.troster@ottawa.ca');
    expect(screen.getByText('99%')).toBeInTheDocument();
    expect(screen.getByText(/99 of 100 passed. The other 17 motions moved have no result/)).toBeInTheDocument();
  });
});

describe('AlignmentList', () => {
  const rows: AlignmentRow[] = [
    { mover: 'Ariel Troster', voter: 'Laine Johnson', total_motions_moved: 117, voted_for: 6, total_votes: 6, alignment_pct: 100 },
    { mover: 'Ariel Troster', voter: 'David Brown', total_motions_moved: 117, voted_for: 1, total_votes: 5, alignment_pct: 20 },
    { mover: 'Ariel Troster', voter: 'George Darouze', total_motions_moved: 117, voted_for: 0, total_votes: 1, alignment_pct: 0 },
    { mover: 'Someone Else', voter: 'Laine Johnson', total_motions_moved: 3, voted_for: 1, total_votes: 1, alignment_pct: 100 },
  ];

  it('ranks this councillor’s colleagues and summarises support', () => {
    render(<AlignmentList moverFullName="Ariel Troster" rows={rows} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['1Laine Johnson100%6 of 6', '2David Brown20%1 of 5', '3George Darouze0%0 of 1']);
    // (6 + 1 + 0) of (6 + 5 + 1) = 58%
    expect(screen.getByText('58%')).toBeInTheDocument();
    expect(screen.getByText(/3 votes or fewer/)).toBeInTheDocument();
  });

  it('explains when there is nothing to compare', () => {
    render(<AlignmentList moverFullName="Nobody" rows={rows} />);
    expect(screen.getByText(/had a recorded vote/)).toBeInTheDocument();
  });
});

function moved(id: string, result: string, date: string, forCount = 0, againstCount = 0): MovedMotion {
  return {
    date,
    meeting_name: 'City Council',
    source_url: '',
    agenda_item_number: '1',
    item_title: `Item ${id}`,
    motion_id: id,
    motion_number: '',
    motion_text: '',
    motion_result: result,
    for_count: forCount,
    against_count: againstCount,
  };
}

describe('MovedList', () => {
  const motions = [
    moved('a', 'Carried', '2026-10-08'),
    moved('b', 'Lost (11 to 14)', '2025-11-07', 11, 14),
    moved('c', '', '2026-09-23'),
  ];

  it('labels outcomes and filters by them', async () => {
    render(
      <MemoryRouter>
        <MovedList motions={motions} termLabel="2022–2026" />
      </MemoryRouter>,
    );
    // Once as a filter chip, once as the card's badge
    expect(screen.getAllByText('Passed')).toHaveLength(2);
    expect(screen.getByText('No result recorded')).toBeInTheDocument();
    expect(screen.getByText('11 For')).toBeInTheDocument();
    // Newest first
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Item a', 'Item c', 'Item b']);
    await userEvent.click(screen.getByRole('button', { name: /Lost/ }));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Item b']);
  });
});

describe('VoteHistory', () => {
  function vote(id: string, v: 'for' | 'against', tags: string[]): CouncillorVoteRow {
    return {
      date: `2026-10-0${id}`,
      meeting_name: 'City Council',
      meeting_id: 'm',
      source_url: '',
      agenda_item_number: id,
      item_title: `Vote ${id}`,
      motion_id: id,
      motion_number: '',
      motion_text: 'That Council approve the plan.',
      motion_result: 'Carried (8 to 2)',
      for_count: 8,
      against_count: 2,
      vote: v,
      tags,
    };
  }

  it('shows how they voted and filters by topic', async () => {
    render(
      <MemoryRouter>
        <VoteHistory
          votes={[vote('1', 'for', ['Housing & Zoning']), vote('2', 'against', ['Budget & Finance'])]}
          termLabel="2022–2026"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Voted for')).toBeInTheDocument();
    expect(screen.getByText('Voted against')).toBeInTheDocument();
    expect(screen.getAllByText('Carried')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /Budget & Finance 1/ }));
    expect(screen.getByText('1 of 2 votes · newest first')).toBeInTheDocument();
    expect(screen.queryByText('Vote 1')).not.toBeInTheDocument();
  });
});
