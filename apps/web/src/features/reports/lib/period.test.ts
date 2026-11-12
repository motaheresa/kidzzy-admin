import { describe, expect, it } from 'vitest';
import {
  firstOfMonth,
  isBackwards,
  lastOfMonth,
  presetOf,
  periodInstants,
  presetPeriod,
  resolvePeriod,
} from './period';

const TODAY = '2026-11-12';

describe('period', () => {
  it('finds the edges of a month, leap years and December included', () => {
    expect(firstOfMonth('2026-11-12')).toBe('2026-11-01');
    expect(lastOfMonth('2026-11-12')).toBe('2026-11-30');
    expect(lastOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(lastOfMonth('2026-12-31')).toBe('2026-12-31');
  });

  it('builds the ready-made periods as of today', () => {
    expect(presetPeriod('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetPeriod('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(presetPeriod('lastMonth', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('goes back across a year for the last month of January', () => {
    expect(presetPeriod('lastMonth', '2027-01-15')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('reads a missing end like the API: the current month, or the month of the other end', () => {
    expect(resolvePeriod(undefined, undefined, TODAY)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(resolvePeriod('2026-09-10', undefined, TODAY).to).toBe('2026-09-30');
    expect(resolvePeriod(undefined, '2026-09-10', TODAY).from).toBe('2026-09-01');
    expect(resolvePeriod('2026-09-10', '2026-09-12', TODAY)).toEqual({
      from: '2026-09-10',
      to: '2026-09-12',
    });
  });

  it('names a period after its ready-made choice, or custom', () => {
    expect(presetOf(presetPeriod('today', TODAY), TODAY)).toBe('today');
    expect(presetOf(presetPeriod('month', TODAY), TODAY)).toBe('month');
    expect(presetOf(presetPeriod('lastMonth', TODAY), TODAY)).toBe('lastMonth');
    expect(presetOf({ from: '2026-11-02', to: '2026-11-09' }, TODAY)).toBe('custom');
  });

  it('knows a backwards period', () => {
    expect(isBackwards({ from: '2026-11-10', to: '2026-11-09' })).toBe(true);
    expect(isBackwards({ from: '2026-11-10', to: '2026-11-10' })).toBe(false);
  });
});

describe('periodInstants', () => {
  it('is local midnight of the first day up to local midnight after the last, in winter time', () => {
    // Cairo is UTC+2 in November.
    expect(periodInstants({ from: '2026-11-01', to: '2026-11-30' }, 'Africa/Cairo')).toEqual({
      from: '2026-10-31T22:00:00.000Z',
      to: '2026-11-30T22:00:00.000Z',
    });
  });

  it('is 23 hours on the day Egypt springs forward and 25 on the day it falls back', () => {
    // 24 April 2026: midnight does not exist, the clock goes 00:00 -> 01:00 (UTC+2 -> UTC+3).
    expect(periodInstants({ from: '2026-04-24', to: '2026-04-24' }, 'Africa/Cairo')).toEqual({
      from: '2026-04-23T22:00:00.000Z',
      to: '2026-04-24T21:00:00.000Z',
    });
    // 29 October 2026: the day starts at UTC+3 (21:00Z the day before) and ends at UTC+2.
    expect(periodInstants({ from: '2026-10-29', to: '2026-10-29' }, 'Africa/Cairo')).toEqual({
      from: '2026-10-28T21:00:00.000Z',
      to: '2026-10-29T22:00:00.000Z',
    });
  });

  it('rolls the end over a month and a year', () => {
    const range = periodInstants({ from: '2026-12-31', to: '2026-12-31' }, 'Africa/Cairo');
    expect(range.to).toBe('2026-12-31T22:00:00.000Z');
  });
});
