import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MotionCard from '../MotionCard';
import type { Motion } from '../../types';

const baseMotion: Motion = {
  motion_id: 'abc123',
  motion_number: '1',
  motion_text: 'That the report be received.',
  motion_moved_by: 'G. Gower',
  motion_seconded_by: 'A. Troster',
  motion_result: 'Carried',
  for_count: 18,
  against_count: 5,
  votes: [],
};

const longText = 'A'.repeat(201);

describe('MotionCard', () => {
  it('renders the motion number', () => {
    render(<MotionCard motion={baseMotion} />);
    expect(screen.getByText('Motion 1')).toBeInTheDocument();
  });

  it('renders the motion result', () => {
    render(<MotionCard motion={{ ...baseMotion, vote_kind: 'recorded' }} />);
    expect(screen.getByText('Carried')).toBeInTheDocument();
  });

  it('renders moved-by and seconded-by', () => {
    render(<MotionCard motion={baseMotion} />);
    expect(screen.getByText('Moved: G. Gower')).toBeInTheDocument();
    expect(screen.getByText('Seconded: A. Troster')).toBeInTheDocument();
  });

  it('renders the for/against tally for recorded votes', () => {
    render(<MotionCard motion={{ ...baseMotion, vote_kind: 'recorded' }} />);
    expect(screen.getByText('18 For')).toBeInTheDocument();
    expect(screen.getByText('5 Against')).toBeInTheDocument();
  });

  it('labels a carried voice vote as Carried Unanimously without a tally', () => {
    render(
      <MotionCard
        motion={{ ...baseMotion, vote_kind: 'none', for_count: 0, against_count: 0 }}
      />
    );
    expect(screen.getByText('Carried Unanimously')).toBeInTheDocument();
    expect(screen.getByText('No recorded vote')).toBeInTheDocument();
    expect(screen.queryByText('0 For')).not.toBeInTheDocument();
  });

  it('labels an empty result as No result recorded', () => {
    render(<MotionCard motion={{ ...baseMotion, motion_result: '', vote_kind: 'none' }} />);
    expect(screen.getByText('No result recorded')).toBeInTheDocument();
  });

  it('labels dissent-reconstructed motions as Carried with Dissent with a note', () => {
    render(
      <MotionCard
        motion={{
          ...baseMotion,
          vote_kind: 'dissent',
          for_count: 22,
          against_count: 1,
          votes: [
            { councillor_name: 'A. Troster', vote: 'for' },
            { councillor_name: 'G. Gower', vote: 'against' },
          ],
        }}
      />
    );
    expect(screen.getByText('Carried with Dissent')).toBeInTheDocument();
    expect(screen.getByText(/reconstructed from dissent/i)).toBeInTheDocument();
    expect(screen.getByText('22 For')).toBeInTheDocument();
  });

  it('shows placeholder when motion_text is empty', () => {
    render(<MotionCard motion={{ ...baseMotion, motion_text: '' }} />);
    expect(screen.getByText('No motion text recorded.')).toBeInTheDocument();
  });

  it('does not show "Show more" for short motion text', () => {
    render(<MotionCard motion={baseMotion} />);
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('shows "Show more" button for motion text longer than 200 characters', () => {
    render(<MotionCard motion={{ ...baseMotion, motion_text: longText }} />);
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('toggles to "Show less" after expanding long motion text', async () => {
    render(<MotionCard motion={{ ...baseMotion, motion_text: longText }} />);
    await userEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });

  it('does not show "Show votes" button when votes array is empty', () => {
    render(<MotionCard motion={baseMotion} />);
    expect(screen.queryByRole('button', { name: /show votes/i })).not.toBeInTheDocument();
  });

  it('shows "Show votes (N)" button when votes exist', () => {
    const motionWithVotes: Motion = {
      ...baseMotion,
      votes: [
        { councillor_name: 'A. Troster', vote: 'for' },
        { councillor_name: 'G. Gower', vote: 'against' },
      ],
    };
    render(<MotionCard motion={motionWithVotes} />);
    expect(screen.getByRole('button', { name: 'Show votes (2)' })).toBeInTheDocument();
  });

  it('renders vote chips after expanding votes', async () => {
    const motionWithVotes: Motion = {
      ...baseMotion,
      votes: [
        { councillor_name: 'A. Troster', vote: 'for' },
        { councillor_name: 'G. Gower', vote: 'against' },
      ],
    };
    render(<MotionCard motion={motionWithVotes} />);
    await userEvent.click(screen.getByRole('button', { name: /show votes/i }));
    expect(screen.getByText('A. Troster')).toBeInTheDocument();
    expect(screen.getByText('G. Gower')).toBeInTheDocument();
  });

  it('toggles to "Hide votes" after expanding', async () => {
    const motionWithVotes: Motion = {
      ...baseMotion,
      votes: [{ councillor_name: 'A. Troster', vote: 'for' }],
    };
    render(<MotionCard motion={motionWithVotes} />);
    await userEvent.click(screen.getByRole('button', { name: /show votes/i }));
    expect(screen.getByRole('button', { name: /hide votes/i })).toBeInTheDocument();
  });

  it('hides motion text that is only a lead-in', () => {
    render(<MotionCard motion={{ ...baseMotion, motion_text: 'Committee Recommendation(s)\nThat Council:' }} />);
    expect(screen.queryByText(/That Council:/)).not.toBeInTheDocument();
    expect(screen.queryByText('No motion text recorded.')).not.toBeInTheDocument();
  });

  it('labels the summary as an AI plain-language summary', () => {
    render(<MotionCard motion={{ ...baseMotion, summary: 'Approves a zoning change.' }} />);
    expect(screen.getByText('In plain language')).toBeInTheDocument();
    expect(screen.getByText('AI summary')).toBeInTheDocument();
    expect(screen.getByText('Approves a zoning change.')).toBeInTheDocument();
  });

  it('lists documents with short labels and keeps the full name as a tooltip', () => {
    const title = 'Report - ACS2026-PDB-PSX-0001 - ZBLA - 342 Roosevelt Avenue.pdf';
    render(
      <MotionCard
        motion={baseMotion}
        attachments={[{ url: 'https://example.test/doc?id=1', title }]}
      />
    );
    const link = screen.getByRole('link', { name: /Staff report/ });
    expect(link).toHaveAttribute('href', 'https://example.test/doc?id=1');
    expect(link).toHaveAttribute('title', title);
    expect(link).toHaveTextContent('ACS2026-PDB-PSX-0001 – ZBLA – 342 Roosevelt Avenue · PDF');
  });

  it('omits the motion label when the motion has no number', () => {
    render(<MotionCard motion={{ ...baseMotion, motion_number: '' }} />);
    expect(screen.queryByText(/^Motion/)).not.toBeInTheDocument();
  });

  it('shows the agenda item as the card heading when given', () => {
    render(<MotionCard motion={baseMotion} item={{ number: '11.2', title: 'Zoning By-law Amendment' }} />);
    expect(screen.getByText('Item 11.2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Zoning By-law Amendment' })).toBeInTheDocument();
  });

  it('scrolls a long document list and says how many there are', () => {
    const attachments = Array.from({ length: 8 }, (_, i) => ({
      url: `https://example.test/doc?id=${i}`,
      title: `Document ${i + 1} - Appendix.pdf`,
    }));
    render(<MotionCard motion={baseMotion} attachments={attachments} />);
    const list = screen.getByRole('list', { name: 'Documents, 8 files' });
    expect(list.className).toMatch(/scrollable/);
    expect(list).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('Scroll for all 8 documents')).toBeInTheDocument();
  });

  it('leaves a short document list as it is', () => {
    const attachments = [{ url: 'https://example.test/a', title: 'Report - Item.pdf' }];
    render(<MotionCard motion={baseMotion} attachments={attachments} />);
    expect(screen.getByRole('list').className).not.toMatch(/scrollable/);
    expect(screen.queryByText(/Scroll for all/)).not.toBeInTheDocument();
  });
});
