import { describe, it, expect } from 'vitest';
import { councillorsInTerm, countInTerm, dateInTerm, filterByTerm, resolveTerm, shortTermLabel } from '../terms';
import type { CouncillorMeta, Term } from '../../types';

const oldTerm: Term = { slug: '2022-2026', label: '2022–2026', start: '2022-11-15', end: '2026-11-14' };
const newTerm: Term = { slug: '2026-2030', label: '2026–2030', start: '2026-11-15', end: '2030-11-14' };
const terms = [oldTerm, newTerm];

function councillor(slug: string, entries: CouncillorMeta['terms']): CouncillorMeta {
  return {
    slug,
    full_name: slug,
    first_name_initial: slug,
    title: 'Councillor',
    ward_number: '1',
    ward_name: 'Latest Ward',
    email: '',
    telephone: '',
    active: true,
    terms: entries,
  };
}

describe('dateInTerm', () => {
  it('includes both boundary dates', () => {
    expect(dateInTerm('2022-11-15', oldTerm)).toBe(true);
    expect(dateInTerm('2026-11-14', oldTerm)).toBe(true);
    expect(dateInTerm('2026-11-15', oldTerm)).toBe(false);
  });
});

describe('resolveTerm', () => {
  it('prefers an explicit term param', () => {
    expect(resolveTerm(terms, '2026-2030', '2022-2026', null)).toBe(oldTerm);
  });

  it('falls back to the term containing the date param', () => {
    expect(resolveTerm(terms, '2026-2030', null, '2024-03-06')).toBe(oldTerm);
  });

  it('falls back to the current term', () => {
    expect(resolveTerm(terms, '2026-2030', null, null)).toBe(newTerm);
  });

  it('ignores an unknown term param', () => {
    expect(resolveTerm(terms, '2022-2026', '1999-2003', null)).toBe(oldTerm);
  });

  it('returns null with no terms', () => {
    expect(resolveTerm([], '', null, null)).toBeNull();
  });
});

describe('councillorsInTerm', () => {
  const returning = councillor('returning', [
    { term: '2022-2026', title: 'Councillor', ward_number: '3', ward_name: 'Old Ward', start: null, end: null },
    { term: '2026-2030', title: 'Councillor and Deputy Mayor', ward_number: '4', ward_name: 'New Ward', start: null, end: null },
  ]);
  const departed = councillor('departed', [
    { term: '2022-2026', title: 'Councillor', ward_number: '5', ward_name: 'Five', start: null, end: '2025-01-31' },
  ]);

  it('keeps only councillors who served in the term', () => {
    expect(councillorsInTerm([returning, departed], '2026-2030').map((c) => c.slug)).toEqual(['returning']);
  });

  it("uses the councillor's role in that term", () => {
    const [c] = councillorsInTerm([returning], '2022-2026');
    expect(c.ward_number).toBe('3');
    expect(c.ward_name).toBe('Old Ward');
    expect(c.title).toBe('Councillor');
  });
});

describe('filterByTerm', () => {
  const rows = [{ term: '2022-2026' }, { term: '2026-2030' }, { term: null }];

  it('keeps rows from the term plus unlabelled rows', () => {
    expect(filterByTerm(rows, '2026-2030')).toEqual([{ term: '2026-2030' }, { term: null }]);
  });

  it('keeps everything when no term is selected', () => {
    expect(filterByTerm(rows, undefined)).toHaveLength(3);
  });
});

describe('countInTerm', () => {
  it('reads the per-term count', () => {
    expect(countInTerm({ motion_count: 10, counts_by_term: { '2022-2026': 7 } }, '2022-2026')).toBe(7);
    expect(countInTerm({ motion_count: 10, counts_by_term: { '2022-2026': 7 } }, '2026-2030')).toBe(0);
  });

  it('falls back to the total when per-term counts are missing', () => {
    expect(countInTerm({ motion_count: 10 }, '2026-2030')).toBe(10);
  });
});

describe('shortTermLabel', () => {
  it('shortens the end year', () => {
    expect(shortTermLabel('2022–2026')).toBe('2022–26');
  });

  it('leaves other labels alone', () => {
    expect(shortTermLabel('Interim')).toBe('Interim');
  });
});
