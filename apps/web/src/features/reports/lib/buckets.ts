import { LOCALE } from '@/lib/format';
import type { ReportGranularity, SessionsBucket } from '../types';

// Labels of the sessions chart. A bucket key is a plain calendar value (a local day or month), not
// an instant, so it is read in UTC and never shifted by the browser's zone.

const monthName = new Intl.DateTimeFormat(LOCALE, { month: 'long', timeZone: 'UTC' });
const monthAndYear = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const fullDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'full', timeZone: 'UTC' });

/** The label under a bar: the day number for a day, the month name for a month. */
export function bucketLabel(key: string, granularity: ReportGranularity): string {
  return granularity === 'day'
    ? String(Number(key.slice(8, 10)))
    : monthName.format(new Date(`${key}-01T00:00:00.000Z`));
}

/** The title of a bar's tooltip: the full date of a day, the month and year of a month. */
export function bucketTitle(key: string, granularity: ReportGranularity): string {
  return granularity === 'day'
    ? fullDate.format(new Date(`${key}T00:00:00.000Z`))
    : monthAndYear.format(new Date(`${key}-01T00:00:00.000Z`));
}

/** True when the report has at least one session to draw. */
export function hasSessions(buckets: readonly SessionsBucket[]): boolean {
  return buckets.some((b) => b.held + b.cancelled + b.unmarked + b.upcoming > 0);
}
