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
}

export interface IndexData {
  dates: string[];
  councillors: CouncillorMeta[];
}

export interface VoteRecord {
  councillor_name: string;
  vote: 'for' | 'against';
}

export interface Motion {
  motion_id: string;
  motion_number: string;
  motion_text: string;
  motion_moved_by: string;
  motion_seconded_by: string;
  motion_result: string;
  for_count: number;
  against_count: number;
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
  meetings: Meeting[];
}

export interface CouncillorVoteRow {
  date: string;
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

export interface CouncillorData {
  councillor: CouncillorMeta;
  votes: CouncillorVoteRow[];
}

export interface TagMeta {
  tag: string;
  slug: string;
  motion_count: number;
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
  item_title: string;
  agenda_item_number: string;
  date: string;
  meeting_name: string;
  source_url: string;
  tags: string[];
}

export interface TagData {
  tag: string;
  slug: string;
  motions: TagMotion[];
}
