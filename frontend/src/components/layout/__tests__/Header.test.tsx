import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

function renderHeader(initialEntry = '/ottawa') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Header />
    </MemoryRouter>
  );
}

describe('Header', () => {
  it('renders the brand title and subtitle', () => {
    renderHeader();
    expect(screen.getByText('Ottawa City Council')).toBeInTheDocument();
    expect(screen.getByText('Voting Records')).toBeInTheDocument();
  });

  it('renders nav links pointing to the expected routes', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Motions by Date' })).toHaveAttribute('href', '/ottawa');
    expect(screen.getByRole('link', { name: 'Councillors' })).toHaveAttribute('href', '/ottawa/councillors');
    expect(screen.getByRole('link', { name: 'Committees' })).toHaveAttribute('href', '/ottawa/committees');
    expect(screen.getByRole('link', { name: 'Topics' })).toHaveAttribute('href', '/ottawa/tags');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/ottawa/about');
  });

  it('renders the RSS link', () => {
    renderHeader();
    const rss = screen.getByRole('link', { name: 'RSS Feed' });
    expect(rss).toHaveAttribute('href', './data/ottawa/feed.xml');
    expect(rss).toHaveAttribute('title', 'Subscribe via RSS');
  });

  it('marks "Motions by Date" active on the index route, and not other links', () => {
    renderHeader('/ottawa');
    expect(screen.getByRole('link', { name: 'Motions by Date' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Councillors' }).className).not.toMatch(/active/);
  });

  it('marks "Committees" active when on a committees route', () => {
    renderHeader('/ottawa/committees');
    expect(screen.getByRole('link', { name: 'Committees' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Motions by Date' }).className).not.toMatch(/active/);
  });

  it('marks "Councillors" active on a nested councillor route (non-end NavLink)', () => {
    renderHeader('/ottawa/councillors/ariel-troster');
    expect(screen.getByRole('link', { name: 'Councillors' }).className).toMatch(/active/);
  });

  it('marks "Topics" active when on a tags route', () => {
    renderHeader('/ottawa/tags');
    expect(screen.getByRole('link', { name: 'Topics' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'About' }).className).not.toMatch(/active/);
  });

  it('marks "About" active when on the about route', () => {
    renderHeader('/ottawa/about');
    expect(screen.getByRole('link', { name: 'About' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Topics' }).className).not.toMatch(/active/);
  });
});
