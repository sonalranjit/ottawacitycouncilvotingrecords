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
}

export interface AgendaItem {
  item_id: string;
  agenda_item_number: string;
  title: string;
  motions: Motion[];
}

export interface Meeting {
  meeting_id: string;
  meeting_name: string;
  meeting_number: number;
  meeting_date: string;
  start_time: string;
  location: string;
  source_url: string;
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
}

export interface CouncillorData {
  councillor: CouncillorMeta;
  votes: CouncillorVoteRow[];
}
