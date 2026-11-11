import { ActualTimeError, CLOCK_TIME_PATTERN, actualInstants } from './actual-times';

const ZONE = 'Africa/Cairo';
const FAR = new Date('2030-01-01T00:00:00.000Z');

function run(scheduledAt: string, startedAt: string, endedAt: string, now = FAR) {
  const result = actualInstants({
    scheduledAt: new Date(scheduledAt),
    startedAt,
    endedAt,
    zone: ZONE,
    now,
  });
  return { startedAt: result.startedAt.toISOString(), endedAt: result.endedAt.toISOString() };
}

describe('actualInstants', () => {
  it('turns two clock times on the session date into instants (winter, UTC+2)', () => {
    // 2026-11-10 15:00Z is 17:00 in Cairo.
    expect(run('2026-11-10T15:00:00Z', '17:05', '18:10')).toEqual({
      startedAt: '2026-11-10T15:05:00.000Z',
      endedAt: '2026-11-10T16:10:00.000Z',
    });
  });

  it('uses UTC+3 in summer', () => {
    expect(run('2026-07-10T14:00:00Z', '17:00', '18:00')).toEqual({
      startedAt: '2026-07-10T14:00:00.000Z',
      endedAt: '2026-07-10T15:00:00.000Z',
    });
  });

  it('puts an end earlier than the start on the next date (a session across midnight)', () => {
    // 21:30Z is 23:30 in Cairo (winter); it ends at 00:40 the next day, 22:40Z.
    expect(run('2026-11-10T21:30:00Z', '23:30', '00:40')).toEqual({
      startedAt: '2026-11-10T21:30:00.000Z',
      endedAt: '2026-11-10T22:40:00.000Z',
    });
  });

  it('follows the clock change on the day Egypt goes back (2026-10-29 to 30)', () => {
    // Clocks go back at 24:00 on Thursday 2026-10-29: the evening of the 29th is still UTC+3.
    expect(run('2026-10-29T20:00:00Z', '23:30', '00:30')).toEqual({
      startedAt: '2026-10-29T20:30:00.000Z',
      // 00:30 on the 30th is UTC+2 after the change, so 22:30Z is not +1h of the start: it is +2h.
      endedAt: '2026-10-29T22:30:00.000Z',
    });
    // The day after the change is UTC+2.
    expect(run('2026-10-30T15:00:00Z', '17:00', '18:00')).toEqual({
      startedAt: '2026-10-30T15:00:00.000Z',
      endedAt: '2026-10-30T16:00:00.000Z',
    });
  });

  it('refuses an end equal to the start', () => {
    expect(() => run('2026-11-10T15:00:00Z', '17:00', '17:00')).toThrow(ActualTimeError);
  });

  it('refuses an end after now, with the field', () => {
    const now = new Date('2026-11-10T16:00:00Z');
    try {
      run('2026-11-10T15:00:00Z', '17:00', '18:10', now);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ActualTimeError);
      expect((error as ActualTimeError).field).toBe('endedAt');
    }
    expect(() =>
      run('2026-11-10T15:00:00Z', '17:00', '18:00', new Date('2026-11-10T16:00:00Z')),
    ).not.toThrow();
  });

  it('has no minimum, maximum or lateness rule', () => {
    expect(() => run('2026-11-10T15:00:00Z', '17:00', '17:01')).not.toThrow();
    expect(() => run('2026-11-10T15:00:00Z', '06:00', '16:00')).not.toThrow(); // 10 hours
    expect(() => run('2026-11-10T15:00:00Z', '16:30', '17:30')).not.toThrow(); // before the plan
  });
});

describe('CLOCK_TIME_PATTERN', () => {
  it.each(['00:00', '09:05', '17:05', '23:59'])('accepts %s', (value) => {
    expect(CLOCK_TIME_PATTERN.test(value)).toBe(true);
  });
  it.each(['24:00', '7:05', '17:5', '17:60', '1705', '17:05:00', ' 17:05', ''])(
    'refuses "%s"',
    (value) => {
      expect(CLOCK_TIME_PATTERN.test(value)).toBe(false);
    },
  );
});
