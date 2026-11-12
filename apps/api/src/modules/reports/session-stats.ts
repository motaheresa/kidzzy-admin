import type {
  ReportGranularity,
  SessionsBucket,
  SessionsReportKpis,
  SessionStatus,
} from '@kidzzy/shared';
import { DateTime } from 'luxon';
import { addDays, localDateOf } from '../sessions/occurrences';

/** A period of this many days or fewer is drawn one bucket per day; a longer one, one per month. */
export const MAX_DAILY_BUCKET_DAYS = 62;

/** What the statistics need from a session: nothing more is loaded. */
export interface StatSession {
  status: SessionStatus;
  scheduledAt: Date;
  actualStartedAt: Date | null;
  actualEndedAt: Date | null;
}

export interface SessionStatsInput {
  sessions: readonly StatSession[];
  /** Attendance rows of the period's held sessions: how many, and how many were present. */
  attendance: { present: number; total: number };
  /** Academy-local dates, both included. */
  period: { from: string; to: string };
  now: Date;
  zone: string;
}

export interface SessionStats {
  granularity: ReportGranularity;
  kpis: SessionsReportKpis;
  buckets: SessionsBucket[];
}

/**
 * The statistics of a sessions report, as a pure function: the repository loads the rows, this
 * decides. `now` and the zone are inputs, so there is no clock, no database and no time zone
 * surprise inside.
 *
 * A session belongs to the academy-local date of its scheduled_at (never a UTC slice), so a 23:30
 * session in Cairo lands on its own day even though its UTC date can differ. Its state: held or
 * cancelled as stored; Scheduled and before `now` is unmarked (nobody recorded it); Scheduled at
 * or after `now` is upcoming. Every day (or month) of the period has a bucket, empty ones too.
 */
export function buildSessionStats(input: SessionStatsInput): SessionStats {
  const { period, zone, now } = input;
  const granularity = granularityOf(period);
  const buckets = emptyBuckets(period, granularity);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  const durations: number[] = [];
  for (const session of input.sessions) {
    const day = localDateOf(session.scheduledAt, zone);
    const bucket = byKey.get(granularity === 'day' ? day : day.slice(0, 7));
    if (!bucket) continue; // outside the period: the repository already clips, this is a guard
    if (session.status === 'held') {
      bucket.held += 1;
      if (session.actualStartedAt && session.actualEndedAt) {
        durations.push(session.actualEndedAt.getTime() - session.actualStartedAt.getTime());
      }
    } else if (session.status === 'cancelled') {
      bucket.cancelled += 1;
    } else if (session.scheduledAt.getTime() < now.getTime()) {
      bucket.unmarked += 1;
    } else {
      bucket.upcoming += 1;
    }
  }

  return {
    granularity,
    kpis: {
      held: sum(buckets, 'held'),
      cancelled: sum(buckets, 'cancelled'),
      unmarked: sum(buckets, 'unmarked'),
      upcoming: sum(buckets, 'upcoming'),
      attendanceRate: percentage(input.attendance.present, input.attendance.total),
      averageActualDurationMin: averageMinutes(durations),
    },
    buckets,
  };
}

export function granularityOf(period: { from: string; to: string }): ReportGranularity {
  const days = DateTime.fromISO(period.to, { zone: 'utc' }).diff(
    DateTime.fromISO(period.from, { zone: 'utc' }),
    'days',
  ).days;
  return days + 1 <= MAX_DAILY_BUCKET_DAYS ? 'day' : 'month';
}

function emptyBuckets(
  period: { from: string; to: string },
  granularity: ReportGranularity,
): SessionsBucket[] {
  const keys: string[] = [];
  if (granularity === 'day') {
    for (let day = period.from; day <= period.to; day = addDays(day, 1)) keys.push(day);
  } else {
    const last = period.to.slice(0, 7);
    for (
      let month = period.from.slice(0, 7);
      month <= last;
      month = DateTime.fromISO(`${month}-01`, { zone: 'utc' })
        .plus({ months: 1 })
        .toFormat('yyyy-MM')
    ) {
      keys.push(month);
    }
  }
  return keys.map((key) => ({ key, held: 0, cancelled: 0, unmarked: 0, upcoming: 0 }));
}

function sum(buckets: readonly SessionsBucket[], field: keyof Omit<SessionsBucket, 'key'>): number {
  return buckets.reduce((total, bucket) => total + bucket[field], 0);
}

/** Percent with one decimal, in integer math; null when there is nothing to divide. */
function percentage(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part * 1000) / whole) / 10;
}

/** Mean of the lengths (milliseconds) in whole minutes; null when there is none. */
function averageMinutes(milliseconds: readonly number[]): number | null {
  if (milliseconds.length === 0) return null;
  const total = milliseconds.reduce((a, b) => a + b, 0);
  return Math.round(total / milliseconds.length / 60_000);
}
