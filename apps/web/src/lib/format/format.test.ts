import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatNumber, localToday, zonedDayRange } from '.';

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
});
