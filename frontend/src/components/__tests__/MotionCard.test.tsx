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
    render(<MotionCard motion={baseMotion} />);
    expect(screen.getByText('Carried')).toBeInTheDocument();
  });

  it('renders moved-by and seconded-by', () => {
    render(<MotionCard motion={baseMotion} />);
    expect(screen.getByText('Moved: G. Gower')).toBeInTheDocument();
    expect(screen.getByText('Seconded: A. Troster')).toBeInTheDocument();
  });

  it('renders the for/against tally', () => {
    render(<MotionCard motion={baseMotion} />);
    expect(screen.getByText('18 For')).toBeInTheDocument();
    expect(screen.getByText('5 Against')).toBeInTheDocument();
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
});
