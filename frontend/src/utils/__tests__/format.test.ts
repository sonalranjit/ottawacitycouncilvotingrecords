import { describe, it, expect } from 'vitest';
import {
  describeAttachment,
  formatDate,
  formatStartTime,
  isStubMotionText,
  itemLabel,
  motionOutcome,
  resultLabel,
  resultVariant,
} from '../format';

describe('formatDate', () => {
  it('converts YYYY-MM-DD to M/D/YYYY', () => {
    expect(formatDate('2025-04-16')).toBe('4/16/2025');
  });

  it('strips leading zeros from month and day', () => {
    expect(formatDate('2025-01-05')).toBe('1/5/2025');
  });

  it('handles end-of-year dates', () => {
    expect(formatDate('2025-12-31')).toBe('12/31/2025');
  });
});

describe('resultLabel', () => {
  it('maps "Carried" to "Carried"', () => {
    expect(resultLabel('Carried')).toBe('Carried');
  });

  it('maps "Carried Unanimously" to "Carried"', () => {
    expect(resultLabel('Carried Unanimously')).toBe('Carried');
  });

  it('maps "Received" to "Received"', () => {
    expect(resultLabel('Received')).toBe('Received');
  });

  it('maps "Lost" to "Lost"', () => {
    expect(resultLabel('Lost')).toBe('Lost');
  });

  it('maps "Lost on a tie (6 to 6)" to "Tied"', () => {
    expect(resultLabel('Lost on a tie (6 to 6)')).toBe('Tied');
  });

  it('is case-insensitive', () => {
    expect(resultLabel('carried')).toBe('Carried');
    expect(resultLabel('LOST')).toBe('Lost');
  });

  it('passes through unrecognised values unchanged', () => {
    expect(resultLabel('Withdrawn')).toBe('Withdrawn');
    expect(resultLabel('')).toBe('');
  });
});

describe('motionOutcome', () => {
  it('labels an empty result as "No result recorded" with no tally', () => {
    expect(motionOutcome('', 'none')).toEqual({
      label: 'No result recorded',
      variant: 'neutral',
      showTally: false,
    });
  });

  it('labels a carried voice vote as unanimous with no tally', () => {
    expect(motionOutcome('Carried', 'none')).toEqual({
      label: 'Carried Unanimously',
      variant: 'carried',
      showTally: false,
    });
  });

  it('appends Unanimously to compound carried results', () => {
    expect(motionOutcome('Carried as amended', 'none').label).toBe(
      'Carried as amended Unanimously'
    );
  });

  it('labels dissent-reconstructed motions as Carried with Dissent, keeping the tally', () => {
    const outcome = motionOutcome('Carried', 'dissent', 23);
    expect(outcome.label).toBe('Carried with Dissent');
    expect(outcome.variant).toBe('carried');
    expect(outcome.showTally).toBe(true);
    expect(outcome.note).toMatch(/dissent/i);
  });

  it('keeps Received as Received and hides the 0/0 tally', () => {
    expect(motionOutcome('Received', 'none')).toEqual({
      label: 'Received',
      variant: 'carried',
      showTally: false,
    });
  });

  it('keeps Lost as Lost, hiding the tally when no vote was recorded', () => {
    expect(motionOutcome('Lost', 'none')).toEqual({
      label: 'Lost',
      variant: 'lost',
      showTally: false,
    });
  });

  it('does not relabel results that embed their own tally', () => {
    expect(motionOutcome('Carried (4 to 0)', 'none').label).toBe('Carried (4 to 0)');
  });

  it('keeps recorded votes as-is with the tally shown', () => {
    expect(motionOutcome('Carried (20 to 5)', 'recorded', 25)).toEqual({
      label: 'Carried (20 to 5)',
      variant: 'carried',
      showTally: true,
    });
  });

  it('shows tied results with their tally', () => {
    expect(motionOutcome('Lost on a tie (6 to 6)', 'recorded', 12).variant).toBe('tied');
  });

  it('falls back to the vote count when vote_kind is missing (older JSON)', () => {
    expect(motionOutcome('Carried', undefined, 0).label).toBe('Carried Unanimously');
    expect(motionOutcome('Carried', undefined, 12).label).toBe('Carried');
  });

  it('hides the tally on unrecognised no-vote results', () => {
    expect(motionOutcome('Withdrawn', 'none')).toEqual({
      label: 'Withdrawn',
      variant: 'neutral',
      showTally: false,
    });
  });
});

describe('resultVariant', () => {
  it('returns "carried" for Carried results', () => {
    expect(resultVariant('Carried')).toBe('carried');
    expect(resultVariant('Carried Unanimously')).toBe('carried');
    expect(resultVariant('Received')).toBe('carried');
  });

  it('returns "lost" for Lost results', () => {
    expect(resultVariant('Lost')).toBe('lost');
  });

  it('returns "tied" for tied results', () => {
    expect(resultVariant('Lost on a tie (6 to 6)')).toBe('tied');
  });

  it('returns "neutral" for anything else', () => {
    expect(resultVariant('Withdrawn')).toBe('neutral');
    expect(resultVariant('')).toBe('neutral');
  });
});

describe('describeAttachment', () => {
  it('renames the usual report and cover page prefixes', () => {
    expect(describeAttachment('Report - ACS2026-PDB-PSX-0001 - ZBLA - 342 Roosevelt Avenue.pdf')).toEqual({
      label: 'Staff report',
      detail: 'ACS2026-PDB-PSX-0001 – ZBLA – 342 Roosevelt Avenue',
      fileType: 'PDF',
    });
    expect(describeAttachment('Coverpage - Zoning By-law Amendment – 2095 Dilworth Road.pdf').label).toBe('Cover page');
    expect(describeAttachment('(Cover) - Item 4.1.pdf').label).toBe('Cover page');
  });

  it('splits numbered documents into number and subject', () => {
    expect(describeAttachment('Document 1 - Location Map.pdf')).toEqual({
      label: 'Document 1',
      detail: 'Location Map',
      fileType: 'PDF',
    });
    expect(describeAttachment('Document 10  Update on the City of Ottawa')).toEqual({
      label: 'Document 10',
      detail: 'Update on the City of Ottawa',
      fileType: '',
    });
  });

  it('keeps other titles as they are, minus the extension', () => {
    expect(describeAttachment('4.1 - Delegation list.pdf')).toEqual({
      label: '4.1 - Delegation list',
      detail: '',
      fileType: 'PDF',
    });
    expect(describeAttachment('Report')).toEqual({ label: 'Report', detail: '', fileType: '' });
  });
});

describe('isStubMotionText', () => {
  it('flags text that is only a heading or a lead-in', () => {
    expect(isStubMotionText('Committee Recommendation(s)\nThat Council:')).toBe(true);
    expect(isStubMotionText('That Council:')).toBe(true);
    expect(isStubMotionText('Report Recommendation(s)')).toBe(true);
    expect(isStubMotionText('Committee recommendations, as amended\nThat Council approve:')).toBe(true);
  });

  it('keeps real motion text, and empty text for the placeholder', () => {
    expect(isStubMotionText('Committee Recommendation(s)\nThat Council approve the zoning amendment.')).toBe(false);
    expect(isStubMotionText('That the report be received.')).toBe(false);
    expect(isStubMotionText('')).toBe(false);
  });
});

describe('itemLabel', () => {
  it('prefixes the agenda number and drops a trailing dot', () => {
    expect(itemLabel('11.2')).toBe('Item 11.2');
    expect(itemLabel('14.')).toBe('Item 14');
    expect(itemLabel('')).toBe('');
  });
});

describe('formatStartTime', () => {
  it('converts 24-hour times to am/pm', () => {
    expect(formatStartTime('09:30')).toBe('9:30 am');
    expect(formatStartTime('13:00')).toBe('1:00 pm');
    expect(formatStartTime('12:00')).toBe('12:00 pm');
    expect(formatStartTime('00:15')).toBe('12:15 am');
  });

  it('returns nothing for missing or odd values', () => {
    expect(formatStartTime('')).toBe('');
    expect(formatStartTime(null)).toBe('');
    expect(formatStartTime('noon')).toBe('');
  });
});
