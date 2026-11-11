import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatNumber,
  localToday,
  withBa,
  zonedDateAndTime,
  zonedDayRange,
  zonedInstantUtc,
} from '.';

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;

describe('format', () => {
  it('prints Western digits in the Arabic locale', () => {
    for (const text of [
      formatNumber(1234567.5),
      formatMoney('1500.00'),
      formatDate('2026-10-16T12:00:00Z'),
    ]) {
      expect(text).toMatch(/[0-9]/);
      expect(text).not.toMatch(ARABIC_INDIC_DIGITS);
    }
  });

  it('keeps the amount of a money string', () => {
    expect(formatMoney('1500.00')).toMatch(/1,500\.00/);
  });

  it('keeps every digit of a large amount (no JS number on the way)', () => {
    expect(formatMoney('99999999.99')).toMatch(/99,999,999\.99/);
  });

  it("gives today's date in the academy's timezone", () => {
    // 23:30 UTC on Oct 16 is already Oct 17 in Cairo (UTC+3 until the end of October).
    expect(localToday('Africa/Cairo', new Date('2026-10-16T23:30:00Z'))).toBe('2026-10-17');
  });

  it('bounds a Cairo day by local midnight, including the 25-hour day when DST ends', () => {
    // Thursday 2026-10-29 is still UTC+3. Friday 2026-10-30 is UTC+2: DST ends at midnight.
    expect(zonedDayRange('Africa/Cairo', new Date('2026-10-22T10:00:00.000Z'))).toEqual({
      from: '2026-10-21T21:00:00.000Z',
      to: '2026-10-22T21:00:00.000Z',
    });
    expect(zonedDayRange('Africa/Cairo', new Date('2026-10-29T12:00:00.000Z'))).toEqual({
      from: '2026-10-28T21:00:00.000Z',
      to: '2026-10-29T22:00:00.000Z',
    });
    expect(zonedDayRange('Africa/Cairo', new Date('2026-10-30T12:00:00.000Z'))).toEqual({
      from: '2026-10-29T22:00:00.000Z',
      to: '2026-10-30T22:00:00.000Z',
    });
  });

  it('bounds the 23-hour day when DST starts in Cairo', () => {
    // Friday 2027-04-30: local midnight jumps to 01:00, so the day is 23 hours (UTC+2 then UTC+3).
    expect(zonedDayRange('Africa/Cairo', new Date('2027-04-29T12:00:00.000Z'))).toEqual({
      from: '2027-04-28T22:00:00.000Z',
      to: '2027-04-29T22:00:00.000Z',
    });
    expect(zonedDayRange('Africa/Cairo', new Date('2027-04-30T12:00:00.000Z'))).toEqual({
      from: '2027-04-29T22:00:00.000Z',
      to: '2027-04-30T21:00:00.000Z',
    });
  });

  it('turns an academy-local date and time into the UTC instant, across the DST change', () => {
    // Egypt leaves DST at the turn of 2026-10-29 to 10-30: UTC+3 before it, UTC+2 after.
    expect(zonedInstantUtc('2026-10-29', '17:00', 'Africa/Cairo').toISOString()).toBe(
      '2026-10-29T14:00:00.000Z',
    );
    expect(zonedInstantUtc('2026-10-30', '17:00', 'Africa/Cairo').toISOString()).toBe(
      '2026-10-30T15:00:00.000Z',
    );
    expect(zonedInstantUtc('2026-10-30', '00:30', 'Africa/Cairo').toISOString()).toBe(
      '2026-10-29T22:30:00.000Z',
    );
    // The same wall clock in another zone is another instant: the browser's zone never counts.
    expect(zonedInstantUtc('2026-10-30', '17:00', 'UTC').toISOString()).toBe(
      '2026-10-30T17:00:00.000Z',
    );
  });

  it('gives the academy-local date and time of an instant, the inverse of the above', () => {
    expect(zonedDateAndTime('2026-10-29T14:00:00.000Z', 'Africa/Cairo')).toEqual({
      date: '2026-10-29',
      time: '17:00',
    });
    expect(zonedDateAndTime('2026-10-30T15:00:00.000Z', 'Africa/Cairo')).toEqual({
      date: '2026-10-30',
      time: '17:00',
    });
    expect(zonedDateAndTime('2026-10-29T22:30:00.000Z', 'Africa/Cairo')).toEqual({
      date: '2026-10-30',
      time: '00:30',
    });
  });
});

// The same cases as formatDuration in the API (sessions/session-time-format.spec.ts).
describe('formatDuration', () => {
  it.each([
    [1, 'دقيقة'],
    [2, 'دقيقتين'],
    [5, '5 دقايق'],
    [10, '10 دقايق'],
    [11, '11 دقيقة'],
    [45, '45 دقيقة'],
    [60, 'ساعة'],
    [65, 'ساعة و5 دقايق'],
    [90, 'ساعة و30 دقيقة'],
    [120, 'ساعتين'],
    [122, 'ساعتين ودقيقتين'],
    [181, '3 ساعات ودقيقة'],
    [660, '11 ساعة'],
  ])('%i minutes is "%s"', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });

  it('uses Western digits', () => {
    expect(formatDuration(125)).not.toMatch(ARABIC_INDIC_DIGITS);
  });
});

describe('withBa', () => {
  it('writes "بـ" before a number and "ب" before a word', () => {
    expect(withBa('5 دقايق')).toBe('بـ5 دقايق');
    expect(withBa('ساعة')).toBe('بساعة');
    expect(withBa('ساعة و5 دقايق')).toBe('بساعة و5 دقايق');
    expect(withBa('دقيقتين')).toBe('بدقيقتين');
  });
});
