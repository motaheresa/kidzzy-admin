import { zonedInstantUtc } from '@/lib/format';

/** The day after YYYY-MM-DD. */
function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + 1)).toISOString().slice(0, 10);
}

/**
 * Two academy-local days (both included) as the UTC instants the API takes: `from` is the start of
 * the first day, `to` is the start of the day after the last one (the API's `to` is exclusive).
 * The academy's timezone decides, not the browser's, and Egypt's DST is handled by the helper.
 */
export function dayRangeToInstants(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): { from?: string; to?: string } {
  return {
    ...(from ? { from: zonedInstantUtc(from, '00:00', timeZone).toISOString() } : {}),
    ...(to ? { to: zonedInstantUtc(nextDay(to), '00:00', timeZone).toISOString() } : {}),
  };
}
