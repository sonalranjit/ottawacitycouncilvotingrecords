import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';
import type { IndexData } from '../../../types';

const index: IndexData = {
  dates: ['2026-10-08', '2026-11-18'],
  current_term: '2026-2030',
  councillors: [],
  terms: [
    { slug: '2022-2026', label: '2022–2026', start: '2022-11-15', end: '2026-11-14' },
    { slug: '2026-2030', label: '2026–2030', start: '2026-11-15', end: '2030-11-14' },
  ],
};

vi.mock('../../../api/data', () => ({
  fetchIndex: () => Promise.resolve(index),
}));

function renderHeader(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Header />
    </MemoryRouter>,
  );
}

describe('Header term selection', () => {
  it('shows the term chip and no notice for the current term', async () => {
    renderHeader('/ottawa');
    expect(
      await screen.findByRole('button', { name: 'Council term 2026–2030. Change term' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Showing the/)).not.toBeInTheDocument();
  });

  it('flags a past term and offers a way back to the current one', async () => {
    renderHeader('/ottawa?term=2022-2026');
    expect(await screen.findByText('Showing the 2022–2026 term')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to current term' }));
    expect(screen.queryByText(/Showing the/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Council term 2026–2030/ })).toBeInTheDocument();
  });

  it('carries the chosen term on section links', async () => {
    renderHeader('/ottawa?term=2022-2026');
    await screen.findByText('Showing the 2022–2026 term');
    expect(screen.getByRole('link', { name: 'Councillors' })).toHaveAttribute(
      'href',
      '/ottawa/councillors?term=2022-2026',
    );
  });
});
