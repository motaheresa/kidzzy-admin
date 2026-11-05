/**
 * Sessions still left in the cycle when an admin is reminded, until SCRUM-47 moves these to
 * reminder rules. 0 is stored for a cycle that just became Due and is not in this list.
 */
export const PAYMENT_REMINDER_SESSIONS_LEFT = [2, 1] as const;

export type PaymentReminderSessionsLeft = (typeof PAYMENT_REMINDER_SESSIONS_LEFT)[number] | 0;

/** The permission whose active holders receive the summary. Instructors do not have it. */
export const PAYMENT_REMINDER_PERMISSION = 'payments.manage:any';
