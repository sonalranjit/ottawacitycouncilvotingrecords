/** A council term, e.g. 2022–2026. Dates are inclusive YYYY-MM-DD. */
export interface Term {
  slug: string;
  label: string;
  start: string;
  end: string;
}

/** A councillor's role in one term; start/end are set only for mid-term joins or departures. */
export interface CouncillorTermEntry {
  term: string;
  title: string;
  ward_number: string;
  ward_name: string;
  start: string | null;
  end: string | null;
}

/**
 * Top-level title/ward are from the latest term served; `active` means the
 * councillor sits in the current term.
 */
export interface CouncillorMeta {
  slug: string;
  full_name: string;
  first_name_initial: string;
  title: string;
  ward_number: string;
  ward_name: string;
  email: string;
  telephone: string;
  active: boolean;
  terms: CouncillorTermEntry[];
}

export interface IndexData {
  dates: string[];
  terms: Term[];
  current_term: string;
  councillors: CouncillorMeta[];
}

export interface VoteRecord {
  councillor_name: string;
  vote: 'for' | 'against';
}

/**
 * How a motion was decided: 'recorded' (roll-call vote), 'dissent' (votes
 * reconstructed from "Carried with dissent" prose in the minutes), or 'none'
 * (voice vote with no individual votes). Optional for older exported JSON.
 */
export type VoteKind = 'recorded' | 'dissent' | 'none';

export interface Motion {
  motion_id: string;
  motion_number: string;
  motion_text: string;
  motion_moved_by: string;
  motion_seconded_by: string;
  motion_result: string;
  for_count: number;
  against_count: number;
  vote_kind?: VoteKind;
  votes: VoteRecord[];
  summary?: string;
  tags?: string[];
}

export interface Attachment {
  url: string;
  title: string;
}

export interface AgendaItem {
  item_id: string;
  agenda_item_number: string;
  title: string;
  motions: Motion[];
  attachments: Attachment[];
}

export interface AttendanceRecord {
  councillor_name: string;
  status: 'present' | 'absent';
}

export interface Meeting {
  meeting_id: string;
  meeting_name: string;
  meeting_number: number;
  meeting_date: string;
  start_time: string;
  location: string;
  source_url: string;
  attendance: AttendanceRecord[];
  agenda_items: AgendaItem[];
}

export interface DateData {
  date: string;
  term?: string | null;
  meetings: Meeting[];
}

export interface CouncillorVoteRow {
  date: string;
  term?: string | null;
  meeting_name: string;
  meeting_id: string;
  source_url: string;
  agenda_item_number: string;
  item_title: string;
  motion_id: string;
  motion_number: string;
  motion_text: string;
  motion_result: string;
  for_count: number;
  against_count: number;
  vote: 'for' | 'against';
  summary?: string;
  tags?: string[];
}

export interface MovedMotion {
  date: string;
  term?: string | null;
  meeting_name: string;
  source_url: string;
  agenda_item_number: string;
  item_title: string;
  motion_id: string;
  motion_number: string;
  motion_text: string;
  motion_result: string;
  for_count: number;
  against_count: number;
  vote_kind?: VoteKind;
  summary?: string;
  tags?: string[];
}

export interface CouncillorData {
  councillor: CouncillorMeta;
  votes: CouncillorVoteRow[];
  motions_moved: MovedMotion[];
}

export interface TagMeta {
  tag: string;
  slug: string;
  motion_count: number;
  counts_by_term?: Record<string, number>;
}

export interface TagIndexData {
  tags: TagMeta[];
}

export interface TagMotion {
  motion_id: string;
  summary: string;
  motion_text: string;
  motion_result: string;
  for_count: number;
  against_count: number;
  vote_kind?: VoteKind;
  item_title: string;
  agenda_item_number: string;
  date: string;
  term?: string | null;
  meeting_name: string;
  source_url: string;
  tags: string[];
  votes: VoteRecord[];
}

export interface TagData {
  tag: string;
  slug: string;
  motions: TagMotion[];
}

export interface CommitteeMeta {
  committee: string;
  slug: string;
  motion_count: number;
  counts_by_term?: Record<string, number>;
}

export interface CommitteeIndexData {
  committees: CommitteeMeta[];
}

export interface CommitteeData {
  committee: string;
  slug: string;
  motions: TagMotion[];
}

export interface AlignmentRow {
  term?: string;
  mover: string;
  voter: string;
  total_motions_moved: number;
  voted_for: number;
  total_votes: number;
  alignment_pct: number;
}
