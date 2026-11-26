import { fetchTagData, fetchTagIndex } from '../api/data';
import MotionGroup, { type MotionGroupConfig } from './MotionGroup';

// Defined once at module level so the page's data effects don't refire on every render
const CONFIG: MotionGroupConfig = {
  title: 'Topics',
  intro: 'Motions grouped by subject, so you can see everything council decided on housing, transit, budgets and more.',
  noun: 'topic',
  nounPlural: 'topics',
  searchPlaceholder: 'e.g. Parks',
  basePath: '/ottawa/tags',
  showMeeting: true,
  fetchIndex: () => fetchTagIndex().then((d) => d.tags.map((t) => ({ ...t, name: t.tag }))),
  fetchGroup: (slug) => fetchTagData(slug).then((d) => ({ name: d.tag, motions: d.motions })),
};

export default function Tags() {
  return <MotionGroup config={CONFIG} />;
}
