import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CouncillorSelector from '../CouncillorSelector';
import type { CouncillorMeta } from '../../types';

const mayor: CouncillorMeta = {
  slug: 'mark-sutcliffe',
  full_name: 'Mark Sutcliffe',
  first_name_initial: 'M. Sutcliffe',
  title: 'Mayor',
  ward_number: '',
  ward_name: '',
  email: 'mayor@ottawa.ca',
  telephone: '613-580-2400',
  active: true,
};

const councillors: CouncillorMeta[] = [
  mayor,
  {
    slug: 'ariel-troster',
    full_name: 'Ariel Troster',
    first_name_initial: 'A. Troster',
    title: 'Councillor',
    ward_number: '14',
    ward_name: 'Somerset',
    email: 'ariel.troster@ottawa.ca',
    telephone: '613-580-2484',
    active: true,
  },
  {
    slug: 'glen-gower',
    full_name: 'Glen Gower',
    first_name_initial: 'G. Gower',
    title: 'Councillor',
    ward_number: '6',
    ward_name: 'Stittsville',
    email: 'glen.gower@ottawa.ca',
    telephone: '613-580-2476',
    active: true,
  },
];

describe('CouncillorSelector', () => {
  it('renders an option for every councillor', () => {
    render(
      <CouncillorSelector
        councillors={councillors}
        selectedSlug="ariel-troster"
        onChange={() => {}}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    // One option per councillor
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('puts the Mayor (no ward_number) first', () => {
    render(
      <CouncillorSelector
        councillors={councillors}
        selectedSlug="ariel-troster"
        onChange={() => {}}
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveValue('mark-sutcliffe');
  });

  it('orders ward councillors by ward number ascending', () => {
    render(
      <CouncillorSelector
        councillors={councillors}
        selectedSlug="ariel-troster"
        onChange={() => {}}
      />,
    );
    const options = screen.getAllByRole('option');
    // Ward 6 (Glen Gower) should come before Ward 14 (Ariel Troster)
    expect(options[1]).toHaveValue('glen-gower');
    expect(options[2]).toHaveValue('ariel-troster');
  });

  it('reflects the selectedSlug as the current value', () => {
    render(
      <CouncillorSelector
        councillors={councillors}
        selectedSlug="glen-gower"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('glen-gower');
  });

  it('calls onChange with the new slug when the selection changes', async () => {
    const onChange = vi.fn();
    render(
      <CouncillorSelector
        councillors={councillors}
        selectedSlug="mark-sutcliffe"
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ariel-troster');
    expect(onChange).toHaveBeenCalledWith('ariel-troster');
  });
});
