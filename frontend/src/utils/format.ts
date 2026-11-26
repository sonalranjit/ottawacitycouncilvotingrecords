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

export interface AttachmentLabel {
  /** Short name to show, e.g. "Staff report", or the file's own name */
  label: string;
  /** What the document is about, when the label was shortened */
  detail: string;
  /** File extension in capitals, e.g. "PDF"; empty when the title has none */
  fileType: string;
}

/**
 * Friendlier labels for eScribe attachment titles, which usually read
 * "Report - ACS2026-… - ZBLA - 342 Roosevelt Avenue.pdf". The common
 * "Report", "Coverpage" and "Document N" prefixes become the label with the
 * rest as detail; anything else keeps its own name (minus the extension).
 */
export function describeAttachment(title: string): AttachmentLabel {
  const ext = title.match(/^(.*)\.([a-z0-9]{2,4})$/i);
  const base = (ext ? ext[1] : title).trim();
  const fileType = ext ? ext[2].toUpperCase() : '';
  // Parts are joined by " - " or " – ", and some eScribe titles use a double space instead
  const [first, ...rest] = base.split(/\s+[-–]\s+|\s{2,}/);
  const prefix = first.replace(/^\((.*)\)$/, '$1').trim();
  const detail = rest.join(' – ');
  if (detail) {
    if (/^cover(\s?page)?$/i.test(prefix)) return { label: 'Cover page', detail, fileType };
    if (/^report$/i.test(prefix)) return { label: 'Staff report', detail, fileType };
    if (/^document \d+[a-z]?$/i.test(prefix)) return { label: prefix, detail, fileType };
  }
  return { label: base, detail: '', fileType };
}

const MOTION_HEADING_RE = /^((committee|report) recommendations?(\(s\))?)?[\s,]*(as amended)?[\s,:]*$/i;

/**
 * True when the minutes kept only a heading or a lead-in such as
 * "Committee Recommendation(s)\nThat Council:" and lost the actual
 * recommendation, so there is nothing worth showing.
 */
export function isStubMotionText(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !MOTION_HEADING_RE.test(l));
  if (lines.length === 0) return text.trim() !== '';
  const rest = lines.join(' ');
  return /^that\b[^.]{0,60}:$/i.test(rest);
}

/** "11.2" → "Item 11.2"; a trailing dot ("14.") is dropped. */
export function itemLabel(agendaItemNumber: string): string {
  const n = agendaItemNumber.trim().replace(/\.$/, '');
  return n ? `Item ${n}` : '';
}

/** "13:00" → "1:00 pm", "09:30" → "9:30 am"; anything else comes back empty. */
export function formatStartTime(time: string | null | undefined): string {
  const m = (time ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const hours = Number(m[1]);
  if (hours > 23) return '';
  const suffix = hours < 12 ? 'am' : 'pm';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${m[2]} ${suffix}`;
}
