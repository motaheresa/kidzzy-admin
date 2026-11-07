/** Who gets the reports: every active user whose role holds this key. Instructors do not. */
export const SESSION_REPORT_PERMISSION = 'sessions.read:any';

/** A Scheduled session is reported as not marked this long after it ended. */
export const UNMARKED_AFTER_END_MINUTES = 120;

/** A session that ended longer ago than this is never reported, so a deploy does not flood the admins. */
export const UNMARKED_MAX_AGE_MINUTES = 24 * 60;

/** The longest a session can last (CreateSessionDto), so the query can bound scheduled_at and use the index. */
export const MAX_SESSION_MINUTES = 240;

/** How many unmarked sessions one academy reports in a single run, the oldest first. */
export const UNMARKED_REPORTS_PER_RUN = 50;

export const TOPIC_CUT = 60;
export const REASON_CUT = 80;
export const ABSENT_NAMES_CAP = 3;
