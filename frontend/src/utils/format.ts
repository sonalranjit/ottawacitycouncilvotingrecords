import type { VoteKind } from '../types';

/** Convert a tag name to a URL-safe slug (matches Python export logic). */
export function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/** Convert ISO date string YYYY-MM-DD to M/D/YYYY with no leading zeros. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${parseInt(month)}/${parseInt(day)}/${year}`;
}

/** Map a raw motion_result string to a display label. */
export function resultLabel(result: string): string {
  const r = result.toLowerCase();
  if (r.includes('tie')) return 'Tied';
  if (r.startsWith('received')) return 'Received';
  if (r.startsWith('carried')) return 'Carried';
  if (r.startsWith('lost')) return 'Lost';
  return result;
}

/** Return a CSS class key based on motion result: 'carried' | 'lost' | 'tied' | 'neutral'. */
export function resultVariant(result: string): 'carried' | 'lost' | 'tied' | 'neutral' {
  const r = result.toLowerCase();
  if (r.includes('tie')) return 'tied';
  if (r.startsWith('carried') || r.startsWith('received')) return 'carried';
  if (r.startsWith('lost')) return 'lost';
  return 'neutral';
}

export interface MotionOutcome {
  label: string;
  variant: 'carried' | 'lost' | 'tied' | 'neutral';
  /** false when there was no recorded vote, so a 0/0 tally would mislead */
  showTally: boolean;
  note?: string;
}

/** Results like "Carried (4 to 0)" embed their own tally and must keep their raw label. */
const EMBEDDED_TALLY_RE = /\(\d+\s+to\s+\d+\)/;

const DISSENT_NOTE =
  'Votes reconstructed from dissent noted in the minutes; no roll call was taken.';

/**
 * Derive the display outcome for a motion, distinguishing voice votes
 * ("Carried Unanimously"), dissent-only notation ("Carried with Dissent"),
 * and recorded roll-call votes. voteCount is the fallback signal for JSON
 * exported before vote_kind existed.
 */
export function motionOutcome(result: string, voteKind?: VoteKind, voteCount = 0): MotionOutcome {
  const kind: VoteKind = voteKind ?? (voteCount > 0 ? 'recorded' : 'none');
  const r = result.trim();
  const lower = r.toLowerCase();

  if (!r) return { label: 'No result recorded', variant: 'neutral', showTally: false };
  if (lower.includes('tie')) return { label: r, variant: 'tied', showTally: true };
  if (lower.startsWith('received')) {
    return { label: r, variant: 'carried', showTally: kind !== 'none' };
  }
  if (lower.startsWith('carried')) {
    if (kind === 'dissent') {
      return { label: 'Carried with Dissent', variant: 'carried', showTally: true, note: DISSENT_NOTE };
    }
    if (kind === 'none' && !EMBEDDED_TALLY_RE.test(r)) {
      return { label: `${r} Unanimously`, variant: 'carried', showTally: false };
    }
    return { label: r, variant: 'carried', showTally: true };
  }
  if (lower.startsWith('lost')) {
    return { label: r, variant: 'lost', showTally: kind !== 'none' };
  }
  return { label: r, variant: 'neutral', showTally: kind !== 'none' };
}
