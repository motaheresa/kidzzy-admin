import { describe, expect, it } from 'vitest';
import { actualClockTimes, compareToPlan, plannedTimes, previewMinutes } from './actual-times';

const ZONE = 'Africa/Cairo';
// 17:00 in Cairo in winter (UTC+2), planned for 60 minutes.
const planned = { scheduledAt: '2026-11-10T15:00:00.000Z', durationMin: 60 };

describe('plannedTimes', () => {
  it('is the planned start and end in the academy zone', () => {
    expect(plannedTimes(planned, ZONE)).toEqual({ startedAt: '17:00', endedAt: '18:00' });
  });

  it('follows the zone in summer (UTC+3) and across midnight', () => {
    expect(
      plannedTimes({ scheduledAt: '2026-07-10T14:00:00.000Z', durationMin: 90 }, ZONE),
    ).toEqual({ startedAt: '17:00', endedAt: '18:30' });
    expect(
      plannedTimes({ scheduledAt: '2026-11-10T21:30:00.000Z', durationMin: 90 }, ZONE),
    ).toEqual({ startedAt: '23:30', endedAt: '01:00' });
  });
});

describe('actualClockTimes', () => {
  it('shows the stored instants as clock times, or null', () => {
    expect(
      actualClockTimes(
        { actualStartedAt: '2026-11-10T15:05:00.000Z', actualEndedAt: '2026-11-10T16:10:00.000Z' },
        ZONE,
      ),
    ).toEqual({ startedAt: '17:05', endedAt: '18:10' });
    expect(actualClockTimes({ actualStartedAt: null, actualEndedAt: null }, ZONE)).toBeNull();
  });
});

describe('previewMinutes', () => {
  it('is the length between the two times', () => {
    expect(previewMinutes(planned.scheduledAt, '17:05', '18:10', ZONE)).toBe(65);
  });

  it('reads an end before the start as the next day, so a mistake shows as a long duration', () => {
    expect(previewMinutes(planned.scheduledAt, '17:00', '06:00', ZONE)).toBe(13 * 60);
    expect(previewMinutes('2026-11-10T21:30:00.000Z', '23:30', '00:40', ZONE)).toBe(70);
  });

  it('follows the clock change of 2026-10-29/30', () => {
    // 22:30 on the 29th is UTC+3 and 00:30 on the 30th is UTC+2: three real hours. (Inside the
    // repeated hour 23:00 to 24:00 the preview may read the other copy of the hour than the
    // server does; the server's answer is the one stored.)
    expect(previewMinutes('2026-10-29T19:30:00.000Z', '22:30', '00:30', ZONE)).toBe(180);
  });

  it('is null while a time is missing or malformed, and for equal times', () => {
    expect(previewMinutes(planned.scheduledAt, '', '18:00', ZONE)).toBeNull();
    expect(previewMinutes(planned.scheduledAt, '17:00', '', ZONE)).toBeNull();
    expect(previewMinutes(planned.scheduledAt, '17:00', '17:00', ZONE)).toBeNull();
    expect(previewMinutes(planned.scheduledAt, '7:00', '18:00', ZONE)).toBeNull();
  });
});

describe('compareToPlan', () => {
  const held = (startedAt: string, durationMin: number) => ({
    ...planned,
    actualStartedAt: startedAt,
    actualDurationMin: durationMin,
  });

  it('says nothing when it ran as planned, or within 4 minutes', () => {
    expect(compareToPlan(held('2026-11-10T15:00:00.000Z', 60))).toEqual([]);
    expect(compareToPlan(held('2026-11-10T15:04:00.000Z', 64))).toEqual([]);
    expect(compareToPlan(held('2026-11-10T14:56:00.000Z', 56))).toEqual([]);
  });

  it('says it started late or early from 5 minutes, and longer or shorter from 5 minutes', () => {
    expect(compareToPlan(held('2026-11-10T15:05:00.000Z', 60))).toEqual(['بدأت متأخر 5 دقايق']);
    expect(compareToPlan(held('2026-11-10T14:55:00.000Z', 60))).toEqual(['بدأت بدري 5 دقايق']);
    expect(compareToPlan(held('2026-11-10T15:00:00.000Z', 65))).toEqual([
      'اطول من المخطط بـ5 دقايق',
    ]);
    expect(compareToPlan(held('2026-11-10T15:00:00.000Z', 55))).toEqual([
      'اقصر من المخطط بـ5 دقايق',
    ]);
  });

  it('can say both, and writes a long difference as hours', () => {
    expect(compareToPlan(held('2026-11-10T15:10:00.000Z', 125))).toEqual([
      'بدأت متأخر 10 دقايق',
      'اطول من المخطط بساعة و5 دقايق',
    ]);
  });

  it('is empty for a session without actual times', () => {
    expect(compareToPlan({ ...planned, actualStartedAt: null, actualDurationMin: null })).toEqual(
      [],
    );
  });
});
