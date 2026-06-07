import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import TagPill from '../TagPill';

function renderPill(props: Parameters<typeof TagPill>[0]) {
  return render(
    <MemoryRouter>
      <TagPill {...props} />
    </MemoryRouter>
  );
}

describe('TagPill', () => {
  it('renders a link to the tag page when asLink is true', () => {
    renderPill({ tag: 'Housing', slug: 'housing', asLink: true });
    const link = screen.getByRole('link', { name: 'Housing' });
    expect(link).toHaveAttribute('href', '/ottawa/tags/housing');
  });

  it('renders a button when asLink is not set', () => {
    renderPill({ tag: 'Housing', slug: 'housing' });
    expect(screen.getByRole('button', { name: 'Housing' })).toBeInTheDocument();
  });

  it('calls onClick with the slug when the button is clicked', async () => {
    const onClick = vi.fn();
    renderPill({ tag: 'Housing', slug: 'housing', onClick });
    await userEvent.click(screen.getByRole('button', { name: 'Housing' }));
    expect(onClick).toHaveBeenCalledWith('housing');
  });

  it('applies the active class when active is true', () => {
    renderPill({ tag: 'Housing', slug: 'housing', active: true });
    expect(screen.getByRole('button', { name: 'Housing' }).className).toMatch(/active/);
  });

  it('does not apply the active class when active is false', () => {
    renderPill({ tag: 'Housing', slug: 'housing', active: false });
    expect(screen.getByRole('button', { name: 'Housing' }).className).not.toMatch(/active/);
  });
});
