import type { CouncillorMeta, Term } from '../types';

/** True when an ISO YYYY-MM-DD date falls inside the term (inclusive). */
export function dateInTerm(date: string, term: Term): boolean {
  return term.start <= date && date <= term.end;
}

/**
 * Pick the term to show: an explicit ?term= slug, else the term containing a
 * ?date= link (so old-term date links still land in the right term), else the
 * current term.
 */
export function resolveTerm(
  terms: Term[],
  currentTerm: string,
  termParam: string | null,
  dateParam: string | null,
): Term | null {
  return (
    terms.find((t) => t.slug === termParam) ??
    (dateParam ? terms.find((t) => dateInTerm(dateParam, t)) : undefined) ??
    terms.find((t) => t.slug === currentTerm) ??
    terms[terms.length - 1] ??
    null
  );
}

/**
 * Councillors who served in the given term, with title/ward replaced by their
 * role in that term.
 */
export function councillorsInTerm(councillors: CouncillorMeta[], termSlug: string): CouncillorMeta[] {
  return councillors.flatMap((c) => {
    const entry = c.terms.find((e) => e.term === termSlug);
    if (!entry) return [];
    return [{ ...c, title: entry.title, ward_number: entry.ward_number, ward_name: entry.ward_name }];
  });
}

/** Keep rows labelled with the given term. Rows with no term label (older exports) are kept. */
export function filterByTerm<T extends { term?: string | null }>(rows: T[], termSlug: string | undefined): T[] {
  if (!termSlug) return rows;
  return rows.filter((r) => r.term == null || r.term === termSlug);
}

/** Motion count for a tag or committee in the given term, falling back to the all-time count. */
export function countInTerm(
  item: { motion_count: number; counts_by_term?: Record<string, number> },
  termSlug: string | undefined,
): number {
  if (!termSlug || !item.counts_by_term) return item.motion_count;
  return item.counts_by_term[termSlug] ?? 0;
}

/** "2022–2026" → "2022–26", for the narrow term chip on phones. */
export function shortTermLabel(label: string): string {
  return label.replace(/^(\d{4})–\d\d(\d\d)$/, '$1–$2');
}
