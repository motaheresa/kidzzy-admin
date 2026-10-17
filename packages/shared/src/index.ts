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
  CurrentPasswordIncorrect: 'CURRENT_PASSWORD_INCORRECT',
  PasswordUnchanged: 'PASSWORD_UNCHANGED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  ScheduleOverlap: 'SCHEDULE_OVERLAP',
  InstructorNotAssignable: 'INSTRUCTOR_NOT_ASSIGNABLE',
  EmailTaken: 'EMAIL_TAKEN',
  PhoneTaken: 'PHONE_TAKEN',
  SessionNotScheduled: 'SESSION_NOT_SCHEDULED',
  SessionNotHeld: 'SESSION_NOT_HELD',
  StudentAlreadyEnrolled: 'STUDENT_ALREADY_ENROLLED',
  StudentCodeTaken: 'STUDENT_CODE_TAKEN',
  StudentAbsent: 'STUDENT_ABSENT',
  StudentNotEnrollable: 'STUDENT_NOT_ENROLLABLE',
  GroupInactive: 'GROUP_INACTIVE',
  NoActiveEnrollment: 'NO_ACTIVE_ENROLLMENT',
  SameGroup: 'SAME_GROUP',
  EnrollmentDateInvalid: 'ENROLLMENT_DATE_INVALID',
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

/** POST /auth/change-password body (openapi.yaml: ChangePasswordRequest). */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** POST /instructors/{id}/reset-password body (openapi.yaml: ResetPasswordRequest). */
export interface ResetPasswordRequest {
  temporaryPassword: string;
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

/** One weekly meeting of a group (openapi.yaml: ScheduleSlot). */
export interface ScheduleSlot {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** Academy-local "HH:MM" */
  startTime: string;
  durationMin: number;
}

/** A group with its weekly schedule (openapi.yaml: Group). */
export interface Group {
  id: string;
  name: string;
  level: string;
  instructor: GroupRef;
  /** Academy-local date, YYYY-MM-DD */
  startDate: string;
  isActive: boolean;
  schedule: ScheduleSlot[];
  studentCount: number;
  heldCount: number;
  /** ISO 8601, UTC */
  nextSessionAt: string | null;
}

/** POST /groups body (openapi.yaml: GroupCreate). */
export interface GroupCreate {
  name: string;
  level: string;
  instructorId: string;
  startDate: string;
  schedule: ScheduleSlot[];
}

/** PATCH /groups/{id} body (openapi.yaml: GroupUpdate). */
export interface GroupUpdate {
  name?: string;
  level?: string;
  instructorId?: string;
  isActive?: boolean;
}

/** PUT /groups/{id}/schedule body (openapi.yaml: ScheduleReplace). */
export interface ScheduleReplace {
  schedule: ScheduleSlot[];
}

/** A payment cycle (openapi.yaml: PaymentCycle). Money is a decimal string in EGP. */
export interface PaymentCycle {
  id: string;
  payeeType: PayeeType;
  payeeId: string;
  payeeName: string;
  cycleNumber: number;
  sessionsPerCycle: number;
  amount: string;
  openingCount: number;
  sessionsCounted: number;
  status: CycleStatus;
  /** ISO 8601, UTC */
  dueAt: string | null;
  /** ISO 8601, UTC */
  paidAt: string | null;
}

/** N sessions per cycle for an amount (openapi.yaml: PlanInput). amount: "1500.00". */
export interface PlanInput {
  sessionsPerCycle: number;
  amount: string;
}

/** POST /students/{id}/transfer body (openapi.yaml: TransferRequest). */
export interface TransferRequest {
  toGroupId: string;
  /** Academy-local date, YYYY-MM-DD: the first day in the new group. */
  effectiveDate: string;
}

/** POST /groups/{id}/enrollments body (openapi.yaml: EnrollRequest). */
export interface EnrollRequest {
  studentId: string;
  /** Academy-local date, YYYY-MM-DD */
  startDate: string;
  plan: PlanInput;
  /** Starting point (BR-14): 0 to N-1, only for a first cycle. */
  openingCount?: number;
}

/** A student enrollment (openapi.yaml: Enrollment). */
export interface Enrollment {
  id: string;
  studentId: string;
  studentName: string;
  group: GroupRef;
  /** Academy-local date, YYYY-MM-DD */
  startDate: string;
  /** Academy-local date, YYYY-MM-DD */
  endDate: string | null;
}

/** A student record (openapi.yaml: Student). */
export interface Student {
  id: string;
  /** Stored trimmed and uppercase, unique per academy. */
  code: string;
  name: string;
  age: number | null;
  parentName: string;
  parentPhone: string;
  notes: string | null;
  isActive: boolean;
  currentGroup: GroupRef | null;
  currentCycle: PaymentCycle | null;
}

/** POST /students body (openapi.yaml: StudentCreate). */
export interface StudentCreate {
  code: string;
  name: string;
  age?: number;
  parentName: string;
  parentPhone: string;
  notes?: string;
}

/** PATCH /students/{id} body (openapi.yaml: StudentUpdate); null clears age or notes. */
export interface StudentUpdate {
  code?: string;
  name?: string;
  age?: number | null;
  parentName?: string;
  parentPhone?: string;
  notes?: string | null;
}

/** PATCH /instructors/{id} body (openapi.yaml: InstructorUpdate); null removes email or phone. */
export interface InstructorUpdate {
  name?: string;
  email?: string | null;
  phone?: string | null;
}
