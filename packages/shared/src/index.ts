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
  EmailTaken: 'EMAIL_TAKEN',
  PhoneTaken: 'PHONE_TAKEN',
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

export * from './permissions';

/** The signed-in user (openapi.yaml: Me), returned by POST /auth/login and GET /auth/me. */
export interface Me {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
  academy: { id: string; name: string; timezone: string };
}

/** Id and display name of a related record (openapi.yaml: GroupRef). */
export interface GroupRef {
  id: string;
  name: string;
}

/** An instructor account (openapi.yaml: Instructor). */
export interface Instructor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  /** ISO 8601, UTC */
  createdAt: string;
}

/** An instructor with the groups they teach (openapi.yaml: InstructorDetail). */
export interface InstructorDetail extends Instructor {
  groups: GroupRef[];
}

/** POST /instructors body (openapi.yaml: InstructorCreate). At least one of email or phone. */
export interface InstructorCreate {
  name: string;
  email?: string;
  phone?: string;
  temporaryPassword: string;
}

/** PATCH /instructors/{id} body (openapi.yaml: InstructorUpdate); null removes email or phone. */
export interface InstructorUpdate {
  name?: string;
  email?: string | null;
  phone?: string | null;
}
