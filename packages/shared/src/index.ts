// Values shared by the API and the web app. They mirror the database enums (ERD) and the API spec.

export const SessionStatus = {
  Scheduled: 'scheduled',
  Held: 'held',
  Cancelled: 'cancelled',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const AttendanceStatus = {
  Present: 'present',
  Absent: 'absent',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const PayeeType = {
  Student: 'student',
  Instructor: 'instructor',
} as const;
export type PayeeType = (typeof PayeeType)[keyof typeof PayeeType];

export const CycleStatus = {
  InProgress: 'in_progress',
  Due: 'due',
  Paid: 'paid',
} as const;
export type CycleStatus = (typeof CycleStatus)[keyof typeof CycleStatus];

export const PaymentMethod = {
  Cash: 'cash',
  Transfer: 'transfer',
  Wallet: 'wallet',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const NotificationType = {
  SessionReminder: 'session_reminder',
  StudentPayment: 'student_payment',
  InstructorPayment: 'instructor_payment',
  PaymentRecorded: 'payment_recorded',
  SessionReport: 'session_report',
  Announcement: 'announcement',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Stable error codes returned in Problem Details responses (API Design V1, Errors). */
export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthenticated: 'UNAUTHENTICATED',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  PasswordChangeRequired: 'PASSWORD_CHANGE_REQUIRED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  SessionNotScheduled: 'SESSION_NOT_SCHEDULED',
  SessionNotHeld: 'SESSION_NOT_HELD',
  StudentAlreadyEnrolled: 'STUDENT_ALREADY_ENROLLED',
  StudentCodeTaken: 'STUDENT_CODE_TAKEN',
  StudentAbsent: 'STUDENT_ABSENT',
  CycleNotDue: 'CYCLE_NOT_DUE',
  CycleAlreadyPaid: 'CYCLE_ALREADY_PAID',
  StartingPointLocked: 'STARTING_POINT_LOCKED',
  StartingPointOutOfRange: 'STARTING_POINT_OUT_OF_RANGE',
  AmountMismatch: 'AMOUNT_MISMATCH',
  RateLimited: 'RATE_LIMITED',
  InternalError: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Problem Details body (RFC 9457) with the stable code. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance?: string;
  errors?: { field: string; message: string }[];
}

/** Paginated list response. */
export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export const API_PREFIX = 'api/v1';
