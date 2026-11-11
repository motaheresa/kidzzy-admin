import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@kidzzy/shared';
import { DateTime } from 'luxon';
import { AppException } from '../../common/errors/app.exception';
import { addDays, occurrenceInstant } from '../sessions/occurrences';

/** The longest period a report covers, both ends included. */
export const MAX_PERIOD_DAYS = 366;

/**
 * The period of a report. from and to are academy-local dates, both included. start and end are
 * the instants around them: start is local midnight of `from`, end is local midnight of the day
 * after `to`, so end is excluded (a range is from inclusive, to exclusive, like everywhere else).
 * paid_on is a DATE column and is compared with from and to as plain dates, never as instants.
 */
export interface ResolvedPeriod {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

/**
 * Reads ?from&to. A missing end is the edge of the local month it belongs to: with neither given,
 * the current local month (today's date comes from the injectable Clock). A `to` before `from` is
 * 400 and a period longer than 366 days is 422 REPORT_PERIOD_TOO_LONG. The instants go through
 * occurrenceInstant, so a local midnight is right on the days Egypt changes its clock.
 */
export function resolvePeriod(
  query: { from?: string; to?: string },
  today: string,
  zone: string,
): ResolvedPeriod {
  const from = query.from ?? firstOfMonth(query.to ?? today);
  const to = query.to ?? lastOfMonth(query.from ?? today);

  if (to < from) {
    throw new AppException(
      ErrorCode.ValidationFailed,
      HttpStatus.BAD_REQUEST,
      'from must not be after to',
      [{ field: 'from', message: 'from must not be after to' }],
    );
  }
  const days = DateTime.fromISO(to, { zone: 'utc' }).diff(
    DateTime.fromISO(from, { zone: 'utc' }),
    'days',
  ).days;
  if (days + 1 > MAX_PERIOD_DAYS) {
    throw new AppException(
      ErrorCode.ReportPeriodTooLong,
      HttpStatus.UNPROCESSABLE_ENTITY,
      `A period is at most ${MAX_PERIOD_DAYS} days`,
      [{ field: 'to', message: `A period is at most ${MAX_PERIOD_DAYS} days` }],
    );
  }
  return {
    from,
    to,
    start: occurrenceInstant(from, '00:00', zone),
    end: occurrenceInstant(addDays(to, 1), '00:00', zone),
  };
}

function firstOfMonth(date: string): string {
  return DateTime.fromISO(date, { zone: 'utc' }).startOf('month').toISODate() ?? date;
}

function lastOfMonth(date: string): string {
  return DateTime.fromISO(date, { zone: 'utc' }).endOf('month').toISODate() ?? date;
}
