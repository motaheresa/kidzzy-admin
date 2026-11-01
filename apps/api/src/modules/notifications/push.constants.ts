/** The only reminder-job kind in this story: deliver one notification by web push. */
export const NOTIFICATION_PUSH = 'notification.push';

/** After this many failed sends the tick leaves the job unsent and stops retrying it. */
export const MAX_PUSH_ATTEMPTS = 5;

/**
 * Minutes a failed job waits before its next try, indexed by attempts already made minus one: a
 * push-service outage of a few minutes does not use up every attempt, and a failing job leaves
 * the head of the queue. The last attempt (MAX_PUSH_ATTEMPTS) has no wait after it.
 */
export const PUSH_RETRY_DELAY_MINUTES = [1, 5, 15, 60];

/** How many due jobs one academy sends in a single tick. The rest wait for the next minute. */
export const JOBS_PER_TICK = 50;

/** A slow push service must not hold the job's row lock longer than this. */
export const PUSH_TIMEOUT_MS = 10_000;
