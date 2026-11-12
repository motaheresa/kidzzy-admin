import { describe, expect, it } from 'vitest';
import { bucketLabel, bucketTitle, hasSessions } from './buckets';

describe('bucketLabel', () => {
  it('is the day number of a day, without a leading zero', () => {
    expect(bucketLabel('2026-11-03', 'day')).toBe('3');
    expect(bucketLabel('2026-11-30', 'day')).toBe('30');
  });

  it('is the month name of a month, whatever the browser zone', () => {
    expect(bucketLabel('2026-10', 'month')).toBe('أكتوبر');
    expect(bucketLabel('2027-01', 'month')).toBe('يناير');
  });
});

describe('bucketTitle', () => {
  it('is the full date of a day, on the same day in every zone', () => {
    const title = bucketTitle('2026-11-03', 'day');
    expect(title).toContain('3');
    expect(title).toContain('نوفمبر');
    expect(title).toContain('2026');
  });

  it('is the month and year of a month', () => {
    const title = bucketTitle('2026-10', 'month');
    expect(title).toContain('أكتوبر');
    expect(title).toContain('2026');
  });
});

describe('hasSessions', () => {
  it('is false for no buckets or only empty ones, true when one has a session', () => {
    expect(hasSessions([])).toBe(false);
    expect(
      hasSessions([{ key: '2026-11-01', held: 0, cancelled: 0, unmarked: 0, upcoming: 0 }]),
    ).toBe(false);
    expect(
      hasSessions([
        { key: '2026-11-01', held: 0, cancelled: 0, unmarked: 0, upcoming: 0 },
        { key: '2026-11-02', held: 0, cancelled: 0, unmarked: 1, upcoming: 0 },
      ]),
    ).toBe(true);
  });
});
