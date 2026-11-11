// The period a report covers: academy-local dates (YYYY-MM-DD), both included. Plain calendar
// arithmetic on date strings: a date has no time zone, only "today" does (it comes from the
// academy's zone, see localToday in lib/format).

export interface Period {
  from: string;
  to: string;
}

/** The ready-made choices of the date filter; "custom" is the from/to inputs. */
export type PeriodPreset = 'today' | 'month' | 'lastMonth' | 'custom';

function parse(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first day of the month `date` is in. */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The last day of the month `date` is in. */
export function lastOfMonth(date: string): string {
  const day = parse(firstOfMonth(date));
  day.setUTCMonth(day.getUTCMonth() + 1, 0);
  return format(day);
}

/** The month before the one `date` is in, whole. */
function previousMonth(date: string): Period {
  const day = parse(firstOfMonth(date));
  day.setUTCMonth(day.getUTCMonth() - 1);
  const from = format(day);
  return { from, to: lastOfMonth(from) };
}

/** The period of a ready-made choice, as of `today`. */
export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, today: string): Period {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'lastMonth') return previousMonth(today);
  return { from: firstOfMonth(today), to: lastOfMonth(today) };
}

/**
 * The period the URL means, the way the API reads it: a missing end is the edge of the month the
 * other end (or today) is in, so no params at all is the current month.
 */
export function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  today: string,
): Period {
  return {
    from: from ?? firstOfMonth(to ?? today),
    to: to ?? lastOfMonth(from ?? today),
  };
}

/** Which ready-made choice a period is, or "custom". */
export function presetOf(period: Period, today: string): PeriodPreset {
  for (const preset of ['today', 'month', 'lastMonth'] as const) {
    const candidate = presetPeriod(preset, today);
    if (candidate.from === period.from && candidate.to === period.to) return preset;
  }
  return 'custom';
}

/** True when the period ends before it starts: the API would answer 400, so the screen says so. */
export function isBackwards(period: Period): boolean {
  return period.to < period.from;
}
