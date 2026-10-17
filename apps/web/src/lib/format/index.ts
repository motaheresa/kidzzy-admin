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
