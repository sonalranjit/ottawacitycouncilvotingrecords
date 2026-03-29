import { describe, it, expect } from 'vitest';
import { formatDate, resultLabel, resultVariant } from '../format';

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

  it('maps "Received" to "Carried"', () => {
    expect(resultLabel('Received')).toBe('Carried');
  });

  it('maps "Lost" to "Lost"', () => {
    expect(resultLabel('Lost')).toBe('Lost');
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

describe('resultVariant', () => {
  it('returns "carried" for Carried results', () => {
    expect(resultVariant('Carried')).toBe('carried');
    expect(resultVariant('Carried Unanimously')).toBe('carried');
    expect(resultVariant('Received')).toBe('carried');
  });

  it('returns "lost" for Lost results', () => {
    expect(resultVariant('Lost')).toBe('lost');
  });

  it('returns "neutral" for anything else', () => {
    expect(resultVariant('Withdrawn')).toBe('neutral');
    expect(resultVariant('')).toBe('neutral');
  });
});
