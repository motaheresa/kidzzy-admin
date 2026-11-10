/**
 * Sessions still left in the cycle when an admin is reminded. The thresholds are the academy's
 * active payment rules (SCRUM-47); 0 means the cycle just became Due, is not a rule and is always
 * reminded.
 */
export type PaymentReminderSessionsLeft = number;

/** The active thresholds for each kind of cycle: students and instructors have their own rules. */
export interface PaymentReminderThresholds {
  student: readonly number[];
  instructor: readonly number[];
}

/** The permission whose active holders receive the summary. Instructors do not have it. */
export const PAYMENT_REMINDER_PERMISSION = 'payments.manage:any';
