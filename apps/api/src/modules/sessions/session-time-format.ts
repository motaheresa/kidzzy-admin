import { DateTime } from 'luxon';

/** Arabic weekday only. The clock is formatted separately so the digits stay Western. */
export function formatWeekday(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).setLocale('ar').toFormat('cccc');
}

/** 12-hour clock with ص/م and Western digits, for example "3:30 م". */
export function formatClock(instant: Date, zone: string): string {
  const local = DateTime.fromJSDate(instant, { zone });
  const hour12 = local.hour % 12 === 0 ? 12 : local.hour % 12;
  const minute = String(local.minute).padStart(2, '0');
  return `${hour12}:${minute} ${local.hour < 12 ? 'ص' : 'م'}`;
}

/** A number with its noun: the singular and the dual are words, 3 to 10 the plural, 11+ singular. */
function counted(amount: number, one: string, two: string, few: string, many: string): string {
  if (amount === 1) return one;
  if (amount === 2) return two;
  return `${amount} ${amount <= 10 ? few : many}`;
}

/**
 * A length of time in plain Arabic: 65 gives "ساعة و5 دقايق", 45 gives "45 دقيقة", 120 gives
 * "ساعتين". The same cases as `formatDuration` in the web app (lib/format); packages/shared holds
 * no runtime logic, so the two small functions are kept in step by their tests.
 */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(counted(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة'));
  if (rest > 0 || hours === 0) parts.push(counted(rest, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة'));
  return parts.join(' و');
}
