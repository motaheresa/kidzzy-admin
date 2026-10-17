import {
  addDays,
  datesOnWeekday,
  laterDate,
  localDateOf,
  occurrenceInstant,
  planSessions,
  weekdayOf,
} from './occurrences';

const CAIRO = 'Africa/Cairo';
const slot = (id: string, weekday: number, startTime: string, durationMin = 60) => ({
  id,
  weekday,
  startTime,
  durationMin,
});

describe('weekdays and dates', () => {
  it('numbers weekdays from Sunday = 0', () => {
    expect(weekdayOf('2026-11-01')).toBe(0); // a Sunday
    expect(weekdayOf('2026-10-29')).toBe(4); // a Thursday
    expect(weekdayOf('2026-10-31')).toBe(6); // a Saturday
  });

  it('lists the dates on a weekday, both ends included', () => {
    expect(datesOnWeekday('2026-11-01', '2026-11-22', 0)).toEqual([
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
    ]);
    expect(datesOnWeekday('2026-11-02', '2026-11-07', 0)).toEqual([]);
  });

  it('adds days across month ends and picks the later date', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(laterDate('2026-10-01', '2026-11-01')).toBe('2026-11-01');
    expect(laterDate('2026-12-01', '2026-11-01')).toBe('2026-12-01');
  });

  it('gives the academy-local date of an instant, which can differ from the UTC date', () => {
    expect(localDateOf(new Date('2026-11-04T22:30:00Z'), CAIRO)).toBe('2026-11-05');
    expect(localDateOf(new Date('2026-07-04T21:30:00Z'), CAIRO)).toBe('2026-07-05');
  });
});

describe('the UTC instant of a local time in Cairo (daylight saving)', () => {
  // Egypt's DST ends at 24:00 on the last Thursday of October: Thursday 2026-10-29 is still
  // UTC+3, and from Friday 2026-10-30 Cairo is UTC+2.
  it('keeps a 17:00 slot at 17:00 local on both sides of the change', () => {
    expect(occurrenceInstant('2026-10-29', '17:00', CAIRO).toISOString()).toBe(
      '2026-10-29T14:00:00.000Z',
    ); // UTC+3
    expect(occurrenceInstant('2026-10-30', '17:00', CAIRO).toISOString()).toBe(
      '2026-10-30T15:00:00.000Z',
    ); // UTC+2
    expect(occurrenceInstant('2026-11-05', '17:00', CAIRO).toISOString()).toBe(
      '2026-11-05T15:00:00.000Z',
    );
  });

  it('is UTC+3 all summer and UTC+2 all winter', () => {
    expect(occurrenceInstant('2026-07-15', '16:00', CAIRO).toISOString()).toBe(
      '2026-07-15T13:00:00.000Z',
    );
    expect(occurrenceInstant('2027-01-15', '16:00', CAIRO).toISOString()).toBe(
      '2027-01-15T14:00:00.000Z',
    );
  });

  it('moves a time that does not exist forward by the skipped hour (clocks go forward)', () => {
    // Egypt starts DST on the last Friday of April: on 2027-04-30 the clock jumps 00:00 -> 01:00,
    // so 00:30 never happens; it becomes 01:30 local (UTC+3), which is 22:30Z the day before.
    expect(occurrenceInstant('2027-04-30', '00:30', CAIRO).toISOString()).toBe(
      '2027-04-29T22:30:00.000Z',
    );
  });

  it('takes the first of a time that happens twice (clocks go back)', () => {
    // 23:30 on Thursday 2026-10-29 happens twice: first at UTC+3 (20:30Z), then at UTC+2 (21:30Z).
    expect(occurrenceInstant('2026-10-29', '23:30', CAIRO).toISOString()).toBe(
      '2026-10-29T20:30:00.000Z',
    );
  });

  it('refuses an unknown time zone instead of guessing', () => {
    expect(() => occurrenceInstant('2026-11-01', '16:00', 'Mars/Base')).toThrow(/Invalid/);
  });
});

describe('planSessions', () => {
  it('plans each slot on its weekday, sorted by time, with the slot and its original day', () => {
    const planned = planSessions(
      [slot('sat', 6, '16:00'), slot('tue', 2, '16:00', 90)],
      { from: '2026-11-01', to: '2026-11-14' },
      CAIRO,
    );
    expect(planned.map((p) => `${p.slotId} ${p.occurrenceDate}`)).toEqual([
      'tue 2026-11-03',
      'sat 2026-11-07',
      'tue 2026-11-10',
      'sat 2026-11-14',
    ]);
    expect(planned[0]).toMatchObject({
      scheduledAt: new Date('2026-11-03T14:00:00.000Z'),
      durationMin: 90,
    });
  });

  it('shows the local time unchanged across the end of DST for Thursday and Friday slots', () => {
    const planned = planSessions(
      [slot('thu', 4, '17:00'), slot('fri', 5, '17:00')],
      { from: '2026-10-29', to: '2026-10-30' },
      CAIRO,
    );
    expect(planned.map((p) => p.scheduledAt.toISOString())).toEqual([
      '2026-10-29T14:00:00.000Z', // Thursday 17:00 at UTC+3
      '2026-10-30T15:00:00.000Z', // Friday 17:00 at UTC+2
    ]);
  });

  it('plans nothing for an empty range or no slots', () => {
    expect(
      planSessions([slot('a', 0, '16:00')], { from: '2026-11-02', to: '2026-11-07' }, CAIRO),
    ).toEqual([]);
    expect(planSessions([], { from: '2026-11-01', to: '2026-11-30' }, CAIRO)).toEqual([]);
  });
});
