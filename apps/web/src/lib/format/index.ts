// Number and date formatting for the Arabic UI with Western digits (0-9), as the academy uses.
// "ar-EG" alone would print Arabic-Indic digits (١٢٣); the -u-nu-latn extension keeps 0-9.
export const LOCALE = 'ar-EG-u-nu-latn';

const numberFormat = new Intl.NumberFormat(LOCALE);

/** 1234.5 -> "1,234.5". Put class="numeric" on the element for aligned columns. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/**
 * Money in EGP from the API's decimal string: "1500.00" -> "1,500.00 ج.م.". Intl.NumberFormat
 * formats a numeric string as an exact decimal (ES2023), so money never becomes a JS number; the
 * TypeScript lib in use only declares number, hence the cast.
 */
export function formatMoney(amount: string): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EGP' }).format(
    amount as unknown as number,
  );
}

/** A date in the academy's timezone, e.g. "16 أكتوبر 2026". */
export function formatDate(value: Date | string, timeZone = 'Africa/Cairo'): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeZone }).format(new Date(value));
}

/** A date and time in the academy's timezone, e.g. "16 أكتوبر 2026، 4:00 م". */
export function formatDateTime(value: Date | string, timeZone = 'Africa/Cairo'): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

/** Today's date in the academy's timezone, YYYY-MM-DD (the API's date form). */
export function localToday(timeZone = 'Africa/Cairo', now = new Date()): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** A time in the academy's timezone, e.g. "5:00 م". */
export function formatTime(value: Date | string, timeZone = 'Africa/Cairo'): string {
  return new Intl.DateTimeFormat(LOCALE, { timeStyle: 'short', timeZone }).format(new Date(value));
}

/**
 * The academy-local calendar day that contains `now`, as a UTC range for GET /sessions:
 * `from` is local midnight inclusive, `to` is the next local midnight exclusive.
 * The two midnights can be 23 or 25 hours apart when the zone changes offset (Egypt's DST).
 */
export function zonedDayRange(timeZone: string, now = new Date()): { from: string; to: string } {
  const day = localToday(timeZone, now);
  return {
    from: zonedMidnightUtc(day, timeZone).toISOString(),
    to: zonedMidnightUtc(nextCalendarDay(day), timeZone).toISOString(),
  };
}

function nextCalendarDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + 1)).toISOString().slice(0, 10);
}

/**
 * UTC instant of local midnight on `day` (YYYY-MM-DD). A UTC guess is compared with the
 * wall clock that zone gives it, then shifted; a second pass settles a DST boundary.
 */
function zonedMidnightUtc(day: string, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const midnight = Date.UTC(year!, month! - 1, date!, 0, 0, 0);
  let utc = midnight;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = wallClock(new Date(utc), timeZone);
    const labeled = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    utc -= labeled - midnight;
  }
  return new Date(utc);
}

function wallClock(instant: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => Number(formatted.find((item) => item.type === type)?.value);
  const hour = part('hour') === 24 ? 0 : part('hour');
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour,
    minute: part('minute'),
    second: part('second'),
  };
}
