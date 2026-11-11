import { DateTime } from 'luxon';
import { localDateOf, occurrenceInstant } from './occurrences';

/** "HH:mm", 24-hour, as a time input gives it. */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Which request field a refused actual time belongs to. */
export class ActualTimeError extends Error {
  constructor(
    readonly field: 'startedAt' | 'endedAt',
    message: string,
  ) {
    super(message);
  }
}

/**
 * The instants of the start and the end an instructor typed as local clock times (SCRUM-80).
 *
 * The start is on the session's academy-local date, the date of `scheduledAt` in the academy zone.
 * The end is on the same date, or on the next one when its clock time is earlier than the start's:
 * a session that crosses midnight. Both go through `occurrenceInstant` (Luxon with the academy's
 * IANA zone), never a fixed offset, because Egypt's offset changes with daylight saving time.
 *
 * Refused (ActualTimeError on `endedAt`): an end that is not after the start (the same clock time
 * is not read as a 24-hour session), and an end after `now`, so the times are entered after the
 * session ended. There is no minimum or maximum duration and no rule on lateness.
 */
export function actualInstants(input: {
  scheduledAt: Date;
  startedAt: string;
  endedAt: string;
  zone: string;
  now: Date;
}): { startedAt: Date; endedAt: Date } {
  const date = localDateOf(input.scheduledAt, input.zone);
  const startedAt = occurrenceInstant(date, input.startedAt, input.zone);
  const sameDay = occurrenceInstant(date, input.endedAt, input.zone);
  const endedAt =
    input.endedAt < input.startedAt
      ? occurrenceInstant(nextDate(date), input.endedAt, input.zone)
      : sameDay;
  if (endedAt <= startedAt) {
    throw new ActualTimeError('endedAt', 'The end must be after the start');
  }
  if (endedAt > input.now) {
    throw new ActualTimeError('endedAt', 'The end cannot be in the future');
  }
  return { startedAt, endedAt };
}

function nextDate(date: string): string {
  const next = DateTime.fromISO(date, { zone: 'utc' }).plus({ days: 1 }).toISODate();
  if (!next) throw new Error(`Not a date: ${date}`);
  return next;
}
