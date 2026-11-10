/** How many due sessions one academy reminds in a single run. The soonest go first. */
export const REMINDERS_PER_RUN = 50;

const MINUTE_MS = 60_000;

/** A lead of this many minutes or more names the weekday in the reminder text. */
export const DAY_MINUTES = 1440;

/** The tick runs every 15 minutes (ADR-0016), so a window shorter than that could be missed. */
const MIN_GRACE_MINUTES = 15;
const MAX_GRACE_MINUTES = 180;

/**
 * How long after the reminder moment a lead is still worth sending: half the lead, at least one
 * tick and at most 3 hours. 60 gives 30 minutes and 1440 gives 180, as before the leads became
 * rules (SCRUM-47). A 15-minute tick always lands inside the window; a session created after the
 * window has passed does not get that lead.
 */
export function graceMinutes(lead: number): number {
  return Math.min(MAX_GRACE_MINUTES, Math.max(MIN_GRACE_MINUTES, Math.round(lead / 2)));
}

/** scheduled_at is inside (now + lead - grace, now + lead]. */
export function leadWindow(now: Date, lead: number): { after: Date; until: Date } {
  return {
    after: new Date(now.getTime() + (lead - graceMinutes(lead)) * MINUTE_MS),
    until: new Date(now.getTime() + lead * MINUTE_MS),
  };
}

/**
 * Every active lead whose window contains this start, if the session is still ahead. Each lead is
 * checked on its own, so two leads with overlapping windows both match.
 */
export function matchingLeads(scheduledAt: Date, now: Date, leads: readonly number[]): number[] {
  if (scheduledAt <= now) return [];
  return leads.filter((lead) => {
    const window = leadWindow(now, lead);
    return scheduledAt > window.after && scheduledAt <= window.until;
  });
}
