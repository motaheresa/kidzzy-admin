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
