/**
 * Minutes before the session. Each lead is sent only inside its grace window, until SCRUM-47
 * moves these to reminder rules:
 * 1440 stays valid for 3 hours after its moment, 60 for 30 minutes.
 * A 15-minute tick always lands inside both windows. A session created 20 minutes before it
 * starts is outside both, and a 2-hour gap still covers the day lead but misses the hour lead.
 */
export const SESSION_REMINDER_LEADS = [1440, 60] as const;

export type SessionReminderLead = (typeof SESSION_REMINDER_LEADS)[number];

/** How long after the reminder moment that lead is still worth sending. */
export const SESSION_REMINDER_GRACE_MINUTES: Record<SessionReminderLead, number> = {
  1440: 180,
  60: 30,
};

/** How many due sessions one academy reminds in a single run. The soonest go first. */
export const REMINDERS_PER_RUN = 50;

const MINUTE_MS = 60_000;

/** scheduled_at is inside (now + lead - grace, now + lead]. */
export function leadWindow(now: Date, lead: SessionReminderLead): { after: Date; until: Date } {
  const grace = SESSION_REMINDER_GRACE_MINUTES[lead];
  return {
    after: new Date(now.getTime() + (lead - grace) * MINUTE_MS),
    until: new Date(now.getTime() + lead * MINUTE_MS),
  };
}

/** The lead whose window contains this start, if the session is still ahead. */
export function matchingLead(scheduledAt: Date, now: Date): SessionReminderLead | undefined {
  if (scheduledAt <= now) return undefined;
  for (const lead of SESSION_REMINDER_LEADS) {
    const window = leadWindow(now, lead);
    if (scheduledAt > window.after && scheduledAt <= window.until) return lead;
  }
  return undefined;
}
