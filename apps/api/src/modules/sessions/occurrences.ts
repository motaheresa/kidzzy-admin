import { DateTime } from 'luxon';

// Pure rules for the sessions a weekly slot produces (US-11): no database, no framework.
//
// Time zones: Egypt observes daylight saving time (UTC+2 in winter, UTC+3 in summer). A slot's
// start time is a LOCAL wall-clock time in the academy's IANA zone, so each occurrence's UTC
// instant is computed from its local date and time, never with a fixed offset: a 17:00 slot is
// 17:00 in Cairo before and after the clocks change, and its UTC instant moves by an hour.
//
// Luxon, not the Temporal polyfill: it is stable and small, and it takes the zone rules from the
// runtime's ICU data, so Node's tzdata decides. For a local time that does not exist (the hour
// skipped when the clocks go forward) it moves forward by the gap; for one that happens twice (the
// hour repeated when they go back) it takes the first, daylight-saving, one. tests: occurrences.spec.

/** A slot, as generation needs it. weekday: 0 = Sunday … 6 = Saturday. */
export interface SlotRule {
  id: string;
  weekday: number;
  /** Academy-local "HH:MM" */
  startTime: string;
  durationMin: number;
}

/** A session to create. occurrenceDate is the slot's original academy-local day. */
export interface PlannedSession {
  slotId: string;
  occurrenceDate: string;
  scheduledAt: Date;
  durationMin: number;
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD date (a calendar date has no zone). */
export function weekdayOf(date: string): number {
  return DateTime.fromISO(date, { zone: 'utc' }).weekday % 7; // Luxon: Monday 1 … Sunday 7
}

/** The academy-local calendar date (YYYY-MM-DD) of an instant. */
export function localDateOf(instant: Date, zone: string): string {
  return toDateTime(instant, zone).toISODate() ?? '';
}

function toDateTime(instant: Date, zone: string): DateTime {
  const value = DateTime.fromJSDate(instant, { zone });
  if (!value.isValid) throw new Error(`Invalid time zone: ${zone}`);
  return value;
}

/** The UTC instant of a local date and time in an IANA zone. */
export function occurrenceInstant(date: string, time: string, zone: string): Date {
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!value.isValid) throw new Error(`Invalid local time ${date} ${time} in ${zone}`);
  return value.toUTC().toJSDate();
}

/** Every date from `from` to `to` (inclusive, YYYY-MM-DD) that falls on `weekday`. */
export function datesOnWeekday(from: string, to: string, weekday: number): string[] {
  const dates: string[] = [];
  let day = DateTime.fromISO(from, { zone: 'utc' });
  const last = DateTime.fromISO(to, { zone: 'utc' });
  while (day <= last) {
    if (day.weekday % 7 === weekday) dates.push(day.toISODate() ?? '');
    day = day.plus({ days: 1 });
  }
  return dates;
}

/** The later of two YYYY-MM-DD dates. */
export function laterDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** `date` plus `days`, as YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate() ?? '';
}

/**
 * The sessions a group's slots produce from `from` to `to` (academy-local dates, inclusive),
 * sorted by time. The caller passes from = max(today, start date).
 */
export function planSessions(
  slots: readonly SlotRule[],
  range: { from: string; to: string },
  zone: string,
): PlannedSession[] {
  return slots
    .flatMap((slot) =>
      datesOnWeekday(range.from, range.to, slot.weekday).map((occurrenceDate) => ({
        slotId: slot.id,
        occurrenceDate,
        scheduledAt: occurrenceInstant(occurrenceDate, slot.startTime, zone),
        durationMin: slot.durationMin,
      })),
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
