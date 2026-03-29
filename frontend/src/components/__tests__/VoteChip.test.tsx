import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VoteChip from '../VoteChip';

describe('VoteChip', () => {
  it('renders the councillor name', () => {
    render(<VoteChip councillor_name="A. Troster" vote="for" />);
    expect(screen.getByText('A. Troster')).toBeInTheDocument();
  });

  it('shows "Yes" in the title for a "for" vote', () => {
    render(<VoteChip councillor_name="A. Troster" vote="for" />);
    expect(screen.getByTitle('A. Troster: Yes')).toBeInTheDocument();
  });

  it('shows "No" in the title for an "against" vote', () => {
    render(<VoteChip councillor_name="G. Gower" vote="against" />);
    expect(screen.getByTitle('G. Gower: No')).toBeInTheDocument();
  });
});
