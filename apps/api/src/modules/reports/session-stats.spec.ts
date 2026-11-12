import type { SessionStatus } from '@kidzzy/shared';
import { buildSessionStats, type StatSession } from './session-stats';

const ZONE = 'Africa/Cairo';
// 10:00 in Cairo on Thursday 2026-11-12 (UTC+2).
const NOW = new Date('2026-11-12T08:00:00.000Z');

function session(
  scheduledAt: string,
  status: SessionStatus = 'held',
  actual?: [string, string],
): StatSession {
  return {
    status,
    scheduledAt: new Date(scheduledAt),
    actualStartedAt: actual ? new Date(actual[0]) : null,
    actualEndedAt: actual ? new Date(actual[1]) : null,
  };
}

function stats(
  sessions: StatSession[],
  period: { from: string; to: string },
  attendance = { present: 0, total: 0 },
  now = NOW,
) {
  return buildSessionStats({ sessions, attendance, period, now, zone: ZONE });
}

const keysWithSessions = (result: ReturnType<typeof stats>) =>
  result.buckets
    .filter((b) => b.held + b.cancelled + b.unmarked + b.upcoming > 0)
    .map((b) => b.key);

describe('buildSessionStats', () => {
  describe('the local day of a session', () => {
    it('puts 23:30 Cairo on its own day, although its UTC date is the same, and 00:30 on the next', () => {
      const result = stats(
        [session('2026-11-03T21:30:00.000Z'), session('2026-11-03T22:30:00.000Z')],
        { from: '2026-11-01', to: '2026-11-30' },
      );
      // 21:30Z = 23:30 on the 3rd; 22:30Z = 00:30 on the 4th.
      expect(result.buckets.find((b) => b.key === '2026-11-03')?.held).toBe(1);
      expect(result.buckets.find((b) => b.key === '2026-11-04')?.held).toBe(1);
    });

    it('keeps the local day on the day Egypt springs forward (midnight is skipped)', () => {
      // 2026-04-24 00:00 does not exist: at 22:00Z on the 23rd the clock jumps to 01:00.
      const result = stats(
        [session('2026-04-23T21:30:00.000Z'), session('2026-04-23T22:30:00.000Z')],
        { from: '2026-04-20', to: '2026-04-27' },
        undefined,
        new Date('2026-05-01T00:00:00.000Z'),
      );
      expect(result.buckets.find((b) => b.key === '2026-04-23')?.held).toBe(1); // 23:30
      expect(result.buckets.find((b) => b.key === '2026-04-24')?.held).toBe(1); // 01:30
    });

    it('keeps both 23:30s on the day Egypt falls back (the day has 25 hours)', () => {
      // 2026-10-29: 23:30 happens twice, at 20:30Z (summer time) and 21:30Z (winter time).
      const result = stats(
        [
          session('2026-10-29T20:30:00.000Z'),
          session('2026-10-29T21:30:00.000Z'),
          session('2026-10-29T22:30:00.000Z'),
        ],
        { from: '2026-10-25', to: '2026-11-02' },
        undefined,
        new Date('2026-12-01T00:00:00.000Z'),
      );
      expect(result.buckets.find((b) => b.key === '2026-10-29')?.held).toBe(2);
      expect(result.buckets.find((b) => b.key === '2026-10-30')?.held).toBe(1); // 00:30
    });
  });

  describe('the state of a session', () => {
    it('counts held and cancelled, and splits Scheduled into unmarked (past) and upcoming', () => {
      const result = stats(
        [
          session('2026-11-10T15:00:00.000Z', 'held'),
          session('2026-11-10T16:00:00.000Z', 'cancelled'),
          session('2026-11-11T15:00:00.000Z', 'scheduled'), // past: nobody marked it
          session('2026-11-13T15:00:00.000Z', 'scheduled'), // ahead
        ],
        { from: '2026-11-01', to: '2026-11-30' },
      );
      expect(result.kpis).toMatchObject({ held: 1, cancelled: 1, unmarked: 1, upcoming: 1 });
    });

    it('is unmarked before now and upcoming at exactly now', () => {
      const result = stats(
        [
          session('2026-11-12T07:59:59.999Z', 'scheduled'),
          session('2026-11-12T08:00:00.000Z', 'scheduled'),
        ],
        { from: '2026-11-12', to: '2026-11-12' },
      );
      expect(result.kpis).toMatchObject({ unmarked: 1, upcoming: 1 });
    });
  });

  describe('buckets and granularity', () => {
    it('is one bucket per day, empty days included, for two months', () => {
      const result = stats([], { from: '2026-10-01', to: '2026-11-30' });
      // 2026-10-01 to 2026-11-30 is 31 + 30 = 61 days.
      expect(result.granularity).toBe('day');
      expect(result.buckets).toHaveLength(61);
      expect(result.buckets[0]).toEqual({
        key: '2026-10-01',
        held: 0,
        cancelled: 0,
        unmarked: 0,
        upcoming: 0,
      });
    });

    it('stays daily at exactly 62 days and switches to months at 63', () => {
      const sixtyTwo = stats([], { from: '2026-10-01', to: '2026-12-01' });
      expect(sixtyTwo.granularity).toBe('day');
      expect(sixtyTwo.buckets).toHaveLength(62);

      const sixtyThree = stats([], { from: '2026-10-01', to: '2026-12-02' });
      expect(sixtyThree.granularity).toBe('month');
      expect(sixtyThree.buckets.map((b) => b.key)).toEqual(['2026-10', '2026-11', '2026-12']);
    });

    it('is one bucket per local month with partial first and last months, empty months included', () => {
      const result = stats(
        [
          session('2026-01-20T10:00:00.000Z'),
          session('2026-04-02T10:00:00.000Z'),
          session('2026-04-03T10:00:00.000Z'),
        ],
        { from: '2026-01-15', to: '2026-04-10' },
        undefined,
        new Date('2026-06-01T00:00:00.000Z'),
      );
      expect(result.granularity).toBe('month');
      expect(result.buckets.map((b) => [b.key, b.held])).toEqual([
        ['2026-01', 1],
        ['2026-02', 0],
        ['2026-03', 0],
        ['2026-04', 2],
      ]);
    });

    it('rolls a month across the year end', () => {
      const result = stats([], { from: '2026-11-01', to: '2027-02-28' });
      expect(result.buckets.map((b) => b.key)).toEqual([
        '2026-11',
        '2026-12',
        '2027-01',
        '2027-02',
      ]);
    });

    it('buckets a month by the local month, not the UTC one', () => {
      // 22:30Z on 31 Oct is 00:30 on 1 Nov in Cairo (UTC+2 after the clocks went back).
      const result = stats([session('2026-10-31T22:30:00.000Z')], {
        from: '2026-10-01',
        to: '2026-12-31',
      });
      expect(keysWithSessions(result)).toEqual(['2026-11']);
    });

    it('is a single bucket for a one-day period', () => {
      const result = stats([session('2026-11-12T10:00:00.000Z')], {
        from: '2026-11-12',
        to: '2026-11-12',
      });
      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0]?.held).toBe(1);
    });

    it('ignores a session outside the period instead of crashing', () => {
      const result = stats([session('2026-12-20T10:00:00.000Z')], {
        from: '2026-11-01',
        to: '2026-11-30',
      });
      expect(result.kpis.held).toBe(0);
    });
  });

  describe('the KPIs', () => {
    it('has null rate and null average when there is nothing', () => {
      const result = stats([], { from: '2026-11-01', to: '2026-11-30' });
      expect(result.kpis).toEqual({
        held: 0,
        cancelled: 0,
        unmarked: 0,
        upcoming: 0,
        attendanceRate: null,
        averageActualDurationMin: null,
      });
    });

    it('is present over all attendance rows with one decimal', () => {
      const period = { from: '2026-11-01', to: '2026-11-30' };
      expect(stats([], period, { present: 2, total: 3 }).kpis.attendanceRate).toBe(66.7);
      expect(stats([], period, { present: 9, total: 10 }).kpis.attendanceRate).toBe(90);
      expect(stats([], period, { present: 0, total: 4 }).kpis.attendanceRate).toBe(0);
      expect(stats([], period, { present: 4, total: 4 }).kpis.attendanceRate).toBe(100);
    });

    it('averages the real duration of the held sessions that have actual times, in whole minutes', () => {
      const result = stats(
        [
          session('2026-11-10T10:00:00.000Z', 'held', [
            '2026-11-10T10:00:00.000Z',
            '2026-11-10T11:00:00.000Z',
          ]), // 60
          session('2026-11-11T10:00:00.000Z', 'held', [
            '2026-11-11T10:00:00.000Z',
            '2026-11-11T10:45:00.000Z',
          ]), // 45
          session('2026-11-11T12:00:00.000Z', 'held'), // no actual times: left out
          session('2026-11-11T14:00:00.000Z', 'cancelled'),
        ],
        { from: '2026-11-01', to: '2026-11-30' },
      );
      expect(result.kpis.averageActualDurationMin).toBe(53); // 52.5 rounds up
    });

    it('has a null average when no held session has actual times', () => {
      const result = stats([session('2026-11-10T10:00:00.000Z', 'held')], {
        from: '2026-11-01',
        to: '2026-11-30',
      });
      expect(result.kpis.averageActualDurationMin).toBeNull();
    });
  });
});
