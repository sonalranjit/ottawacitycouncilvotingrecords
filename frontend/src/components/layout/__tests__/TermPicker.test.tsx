import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TermPicker from '../TermPicker';
import type { Term } from '../../../types';

const terms: Term[] = [
  { slug: '2022-2026', label: '2022–2026', start: '2022-11-15', end: '2026-11-14' },
  { slug: '2026-2030', label: '2026–2030', start: '2026-11-15', end: '2030-11-14' },
];

function renderPicker(selected = terms[1], onSelect = vi.fn()) {
  render(<TermPicker terms={terms} selected={selected} currentSlug="2026-2030" onSelect={onSelect} />);
  return onSelect;
}

describe('TermPicker', () => {
  it('shows the selected term on a closed chip', () => {
    renderPicker();
    const chip = screen.getByRole('button', { name: 'Council term 2026–2030. Change term' });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('2026–30')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a dialog listing terms newest first, marking the current one', async () => {
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: /change term/i }));
    expect(screen.getByRole('dialog', { name: 'Council term' })).toBeInTheDocument();
    const options = screen.getAllByRole('button', { pressed: undefined }).filter((b) =>
      b.hasAttribute('aria-pressed'),
    );
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('2026–2030Current term'),
      expect.stringContaining('2022–2026'),
    ]);
    expect(options[0]).toHaveAttribute('aria-pressed', 'true');
    expect(options[0]).toHaveFocus();
  });

  it('selects another term and closes', async () => {
    const onSelect = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: /change term/i }));
    await userEvent.click(screen.getByRole('button', { name: /^2022–2026/ }));
    expect(onSelect).toHaveBeenCalledWith('2022-2026');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not reselect the term already chosen', async () => {
    const onSelect = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: /change term/i }));
    await userEvent.click(screen.getByRole('button', { name: /^2026–2030/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the chip', async () => {
    renderPicker();
    const chip = screen.getByRole('button', { name: /change term/i });
    await userEvent.click(chip);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });
});
