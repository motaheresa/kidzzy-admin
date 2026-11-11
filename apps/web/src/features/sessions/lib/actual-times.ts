import type { Session } from '@kidzzy/shared';
import { formatDuration, withBa, zonedDateAndTime, zonedInstantUtc } from '@/lib/format';

/** How many minutes of difference from the plan are worth a line in the details. */
export const PLAN_DIFFERENCE_MINUTES = 5;

const MINUTE_MS = 60_000;

/**
 * The planned start and end of a session as "HH:mm" in the academy's zone: what the Held dialog
 * is prefilled with, since most sessions run as planned.
 */
export function plannedTimes(
  session: Pick<Session, 'scheduledAt' | 'durationMin'>,
  timeZone: string,
): { startedAt: string; endedAt: string } {
  const start = new Date(session.scheduledAt);
  const end = new Date(start.getTime() + session.durationMin * MINUTE_MS);
  return {
    startedAt: zonedDateAndTime(start, timeZone).time,
    endedAt: zonedDateAndTime(end, timeZone).time,
  };
}

/** The actual start and end of a Held session as "HH:mm" in the academy's zone, or null. */
export function actualClockTimes(
  session: Pick<Session, 'actualStartedAt' | 'actualEndedAt'>,
  timeZone: string,
): { startedAt: string; endedAt: string } | null {
  if (!session.actualStartedAt || !session.actualEndedAt) return null;
  return {
    startedAt: zonedDateAndTime(session.actualStartedAt, timeZone).time,
    endedAt: zonedDateAndTime(session.actualEndedAt, timeZone).time,
  };
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The minutes between two typed clock times, the way the server reads them: both on the session's
 * academy-local date, the end on the next date when it is earlier than the start. Null while a
 * time is missing or is not "HH:mm", and for equal times (the API refuses those). So an end that
 * was typed before the start shows a long duration, and the mistake is visible before saving.
 */
export function previewMinutes(
  scheduledAt: string,
  startedAt: string,
  endedAt: string,
  timeZone: string,
): number | null {
  if (!CLOCK.test(startedAt) || !CLOCK.test(endedAt) || startedAt === endedAt) return null;
  const day = zonedDateAndTime(scheduledAt, timeZone).date;
  const start = zonedInstantUtc(day, startedAt, timeZone);
  const end = zonedInstantUtc(endedAt < startedAt ? nextDay(day) : day, endedAt, timeZone);
  const minutes = Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
  return minutes > 0 ? minutes : null;
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + 1)).toISOString().slice(0, 10);
}

/**
 * How the real session differed from the plan, one short line each, only for a difference of
 * 5 minutes or more: when it started and how long it ran. Empty when it ran as planned or the
 * session has no actual times.
 */
export function compareToPlan(
  session: Pick<Session, 'scheduledAt' | 'durationMin' | 'actualStartedAt' | 'actualDurationMin'>,
): string[] {
  if (!session.actualStartedAt || session.actualDurationMin === null) return [];
  const lines: string[] = [];
  const startDiff = Math.round(
    (new Date(session.actualStartedAt).getTime() - new Date(session.scheduledAt).getTime()) /
      MINUTE_MS,
  );
  if (Math.abs(startDiff) >= PLAN_DIFFERENCE_MINUTES) {
    lines.push(
      `${startDiff > 0 ? 'بدأت متأخر' : 'بدأت بدري'} ${formatDuration(Math.abs(startDiff))}`,
    );
  }
  const lengthDiff = session.actualDurationMin - session.durationMin;
  if (Math.abs(lengthDiff) >= PLAN_DIFFERENCE_MINUTES) {
    lines.push(
      `${lengthDiff > 0 ? 'اطول' : 'اقصر'} من المخطط ${withBa(formatDuration(Math.abs(lengthDiff)))}`,
    );
  }
  return lines;
}
