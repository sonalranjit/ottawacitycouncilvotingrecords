import { fetchCommitteeData, fetchCommitteeIndex } from '../api/data';
import MotionGroup, { type MotionGroupConfig } from './MotionGroup';

// Defined once at module level so the page's data effects don't refire on every render
const CONFIG: MotionGroupConfig = {
  title: 'Committees',
  intro: 'Motions grouped by the body that voted on them: City Council, its committees, boards and commissions.',
  noun: 'committee',
  nounPlural: 'committees',
  searchPlaceholder: 'e.g. Transit',
  basePath: '/ottawa/committees',
  showMeeting: false,
  fetchIndex: () =>
    fetchCommitteeIndex().then((d) => d.committees.map((c) => ({ ...c, name: c.committee }))),
  fetchGroup: (slug) => fetchCommitteeData(slug).then((d) => ({ name: d.committee, motions: d.motions })),
};

export default function Committees() {
  return <MotionGroup config={CONFIG} />;
}
