import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DirectoryList from '../DirectoryList';
import FilterChips from '../FilterChips';
import TallyBar from '../TallyBar';
import TopicFilter from '../TopicFilter';
import GroupMotionCard from '../GroupMotionCard';
import type { TagMotion } from '../../../types';

describe('TallyBar', () => {
  it('shows both counts', () => {
    render(<TallyBar forCount={23} againstCount={2} />);
    expect(screen.getByText('23 For')).toBeInTheDocument();
    expect(screen.getByText('2 Against')).toBeInTheDocument();
  });
});

describe('FilterChips', () => {
  it('marks the chosen option and reports changes', async () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        label="Show"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'All', count: 655 },
          { value: 'recorded', label: 'Recorded votes', count: 29 },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Recorded votes/ }));
    expect(onChange).toHaveBeenCalledWith('recorded');
  });
});

describe('DirectoryList', () => {
  const items = [
    { name: 'City Council', slug: 'city-council', count: 3485 },
    { name: 'Transit Commission', slug: 'transit-commission', count: 120 },
  ];

  function renderList() {
    render(
      <MemoryRouter>
        <DirectoryList
          items={items}
          linkTo={(s) => `/ottawa/committees/${s}`}
          noun="committee"
          nounPlural="committees"
          placeholder="e.g. Transit"
        />
      </MemoryRouter>,
    );
  }

  it('links each entry with its motion count', () => {
    renderList();
    expect(screen.getByRole('link', { name: /City Council\s*3,485 motions/ })).toHaveAttribute(
      'href',
      '/ottawa/committees/city-council',
    );
    expect(screen.getByText('2 committees · most motions first')).toBeInTheDocument();
  });

  it('narrows the list as you type', async () => {
    renderList();
    await userEvent.type(screen.getByLabelText('Find a committee'), 'tran');
    expect(screen.queryByRole('link', { name: /City Council/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Transit Commission/ })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 committees')).toBeInTheDocument();
  });
});

describe('TopicFilter', () => {
  const topics = Array.from({ length: 10 }, (_, i) => ({ slug: `t${i}`, tag: `Topic ${i}`, count: 20 - i }));

  afterEach(() => vi.unstubAllGlobals());

  it('shows chips on wide screens with the rest behind "+N more"', async () => {
    const onToggle = vi.fn();
    render(<TopicFilter topics={topics} selected={new Set()} onToggle={onToggle} onClear={() => {}} />);
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(8);
    await userEvent.click(screen.getByRole('button', { name: '+2 more' }));
    expect(screen.getByRole('button', { name: /Topic 9/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Topic 9/ }));
    expect(onToggle).toHaveBeenCalledWith('t9');
  });

  it('uses a searchable sheet on phones', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onToggle = vi.fn();
    render(<TopicFilter topics={topics} selected={new Set(['t1'])} onToggle={onToggle} onClear={() => {}} />);
    const trigger = screen.getByRole('button', { name: /Topic: Topic 1/ });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Filter by topic' });
    await userEvent.type(within(dialog).getByLabelText('Search topics'), 'topic 4');
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Topic 4/ }));
    expect(onToggle).toHaveBeenCalledWith('t4');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('GroupMotionCard', () => {
  const motion: TagMotion = {
    motion_id: 'm1',
    summary: 'Council wants to engage the federal government about the Eastern Bridge Project.',
    motion_text: 'That Council engage the federal government.',
    motion_result: 'Carried (23 to 2)',
    for_count: 23,
    against_count: 2,
    vote_kind: 'recorded',
    item_title: 'Eastern Bridge Project',
    agenda_item_number: '19.1',
    date: '2026-09-09',
    meeting_name: 'City Council',
    source_url: '',
    tags: ['Transit & Transportation'],
    votes: [
      { councillor_name: 'A. Troster', vote: 'for' },
      { councillor_name: 'G. Gower', vote: 'against' },
    ],
  };

  it('shows the outcome, tally and who voted against', async () => {
    render(
      <MemoryRouter>
        <GroupMotionCard motion={motion} showMeeting />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sep 9, 2026 · City Council · Item 19.1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Eastern Bridge Project' })).toHaveAttribute('href', '/ottawa?date=2026-09-09');
    expect(screen.getByText('23 For')).toBeInTheDocument();
    expect(screen.getByText('Against: G. Gower')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show votes (2)' }));
    expect(screen.getByText('A. Troster')).toBeInTheDocument();
  });

  it('leaves the meeting out on committee pages', () => {
    render(
      <MemoryRouter>
        <GroupMotionCard motion={motion} showMeeting={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sep 9, 2026 · Item 19.1')).toBeInTheDocument();
  });
});
