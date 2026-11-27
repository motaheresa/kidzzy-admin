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
  EvaluationRequest: 'evaluation_request',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** One in-app notification (openapi.yaml: Notification). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** ISO 8601, UTC. Null while unread. */
  readAt: string | null;
  /** ISO 8601, UTC */
  createdAt: string;
}

/** GET /notifications/unread-count (openapi.yaml: UnreadCount). */
export interface UnreadCount {
  count: number;
}

/** GET /push/public-key (openapi.yaml: PublicKey). */
export interface PushPublicKey {
  publicKey: string;
}

/** POST /push-subscriptions body (openapi.yaml: PushSubscriptionCreate). */
export interface PushSubscriptionCreate {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/** A registered device (openapi.yaml: PushSubscription). */
export interface PushSubscription {
  id: string;
  userAgent: string | null;
  /** ISO 8601, UTC */
  createdAt: string;
}

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
  SessionNotStarted: 'SESSION_NOT_STARTED',
  SessionOutOfOrder: 'SESSION_OUT_OF_ORDER',
  SessionNotHeld: 'SESSION_NOT_HELD',
  SessionNotCancelled: 'SESSION_NOT_CANCELLED',
  SessionAlreadyCompensated: 'SESSION_ALREADY_COMPENSATED',
  CompensatesSessionInvalid: 'COMPENSATES_SESSION_INVALID',
  SessionInLaterCycle: 'SESSION_IN_LATER_CYCLE',
  StudentAlreadyEnrolled: 'STUDENT_ALREADY_ENROLLED',
  StudentCodeTaken: 'STUDENT_CODE_TAKEN',
  StudentAbsent: 'STUDENT_ABSENT',
  AttendanceIncomplete: 'ATTENDANCE_INCOMPLETE',
  StudentNotInSession: 'STUDENT_NOT_IN_SESSION',
  InstructorNotInGroup: 'INSTRUCTOR_NOT_IN_GROUP',
  StudentNotEnrollable: 'STUDENT_NOT_ENROLLABLE',
  GroupInactive: 'GROUP_INACTIVE',
  StudentHasNoPlan: 'STUDENT_HAS_NO_PLAN',
  PlanUnchanged: 'PLAN_UNCHANGED',
  NoActiveEnrollment: 'NO_ACTIVE_ENROLLMENT',
  SameGroup: 'SAME_GROUP',
  EnrollmentDateInvalid: 'ENROLLMENT_DATE_INVALID',
  CycleNotDue: 'CYCLE_NOT_DUE',
  CycleAlreadyPaid: 'CYCLE_ALREADY_PAID',
  StartingPointLocked: 'STARTING_POINT_LOCKED',
  StartingPointOutOfRange: 'STARTING_POINT_OUT_OF_RANGE',
  AmountMismatch: 'AMOUNT_MISMATCH',
  PaidOnInFuture: 'PAID_ON_IN_FUTURE',
  ReminderRuleExists: 'REMINDER_RULE_EXISTS',
  ReminderRulesLimit: 'REMINDER_RULES_LIMIT',
  ActualTimeInvalid: 'ACTUAL_TIME_INVALID',
  ReportPeriodTooLong: 'REPORT_PERIOD_TOO_LONG',
  /** The user has a pending evaluation to write first (US-42): only the evaluation routes work. */
  EvaluationRequired: 'EVALUATION_REQUIRED',
  /** The student already has a pending evaluation request. */
  EvaluationPending: 'EVALUATION_PENDING',
  /** The request is no longer pending (submitted or cancelled), so it cannot be submitted or cancelled. */
  EvaluationNotPending: 'EVALUATION_NOT_PENDING',
  /** The audience of an announcement resolves to nobody (US-31), so there is nobody to send it to. */
  AnnouncementNoRecipients: 'ANNOUNCEMENT_NO_RECIPIENTS',
  /** The academy already has MATERIAL_LINKS_MAX material links (US-32). */
  MaterialLinksLimit: 'MATERIAL_LINKS_LIMIT',
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
  /**
   * How many evaluations the user must write before using the app (US-42), read from the
   * database on every /auth/me, so the web opens the evaluation screen without waiting for the
   * access token to be refreshed. The token's pendingEvaluation claim is this count > 0.
   */
  pendingEvaluations: number;
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

/** One session of a group (openapi.yaml: Session). */
export interface Session {
  id: string;
  group: GroupRef;
  /**
   * The instructor on the session: who taught it, or who will teach it.
   * Can differ from the group's current instructor after that instructor changes.
   */
  instructorId: string;
  /** The name of the instructor on the session, so a list can say who without another request. */
  instructorName: string;
  /** ISO 8601, UTC */
  scheduledAt: string;
  durationMin: number;
  status: SessionStatus;
  sessionNumber: number | null;
  isMakeup: boolean;
  compensatesSessionId: string | null;
  cancelReason: string | null;
  /**
   * What the instructor taught. Null until the session is Held, and for sessions held before the
   * topic existed (SCRUM-79).
   */
  topic: string | null;
  /**
   * When the session really started and ended (ISO 8601, UTC), entered when it was marked Held
   * (SCRUM-80). Null until then and for sessions held before they existed.
   */
  actualStartedAt: string | null;
  actualEndedAt: string | null;
  /** The minutes between the two, computed on read. Null when the times are. */
  actualDurationMin: number | null;
}

/**
 * What marking a session Held returns (openapi.yaml: HeldResult).
 * cyclesUpdated stays empty until cycles are counted (SCRUM-38).
 */
export interface HeldResult extends Session {
  cyclesUpdated: CycleChange[];
}

/** One cycle a Held session moved (openapi.yaml: CycleChange). Unused until SCRUM-38. */
export interface CycleChange {
  cycleId: string;
  payeeType: PayeeType;
  studentId: string | null;
  instructorId: string | null;
  /** The group of an instructor's cycle (an instructor is paid per group); null for a student. */
  groupId: string | null;
  sessionsCounted: number;
  sessionsPerCycle: number;
  status: CycleStatus;
}

/**
 * One student's line on a session's attendance (openapi.yaml: AttendanceRecord).
 * homeworkRating null means there was no homework.
 */
export interface AttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  performanceRating: number | null;
  homeworkRating: number | null;
  /** About the student in this session. Absent students can have one too. */
  note?: string | null;
}

/** The body of POST /sessions/{id}/held (openapi.yaml: HeldRequest): the topic and every student. */
export interface HeldRequest {
  topic: string;
  /** Local wall-clock "HH:mm" in the academy's zone, on the session's date. */
  startedAt: string;
  /** Same; on the next date when it is earlier than startedAt. Not after now. */
  endedAt: string;
  attendance: AttendanceRecord[];
}

/**
 * A student of the session with what was recorded for them (openapi.yaml: SessionAttendance).
 * status is null while nothing is recorded for that student yet.
 */
export interface SessionAttendanceRecord {
  studentId: string;
  studentName: string;
  status: AttendanceStatus | null;
  performanceRating: number | null;
  homeworkRating: number | null;
  /** Null when there is no note, or nothing is recorded yet. */
  note: string | null;
}

/** Every student of a session, recorded or not (openapi.yaml: SessionAttendance). */
export interface SessionAttendance {
  sessionId: string;
  records: SessionAttendanceRecord[];
}

/** A student as a row or a column of another record (openapi.yaml: StudentRef). */
export interface StudentRef {
  id: string;
  code: string;
  name: string;
}

/** What was recorded for one student in one session of the group grid. */
export interface GroupAttendanceCell {
  sessionId: string;
  status: AttendanceStatus;
  performanceRating: number | null;
  homeworkRating: number | null;
}

/**
 * Students by Held sessions (openapi.yaml: GroupAttendance). A student's records hold only the
 * sessions where something was recorded for them; a missing cell means not recorded.
 */
export interface GroupAttendance {
  sessions: Session[];
  students: { student: StudentRef; records: GroupAttendanceCell[] }[];
}

/** One line of a student's attendance history (openapi.yaml: StudentAttendanceItem). */
export interface StudentAttendanceItem {
  sessionId: string;
  scheduledAt: string;
  sessionNumber: number | null;
  group: GroupRef;
  /** What the instructor taught in that session; null for a session held before the topic existed. */
  topic: string | null;
  status: AttendanceStatus;
  performanceRating: number | null;
  homeworkRating: number | null;
  /** This student's note for that session. */
  note: string | null;
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
  /** For an instructor's cycle, the group it counts (per group, ADR-0015); null for a student. */
  groupId: string | null;
  groupName: string | null;
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

/**
 * One entry of the audit log (openapi.yaml: AuditLog): who changed what and when, with the values
 * before and after. before and after are objects of the fields that matter, or null.
 */
export interface AuditLog {
  id: string;
  actor: GroupRef;
  /** For example session.cancelled or payment.recorded. */
  action: string;
  /** The kind of record: sessions, students, payment_cycles, payment_plans. */
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** ISO 8601, UTC */
  createdAt: string;
}

/** The payment that settled a cycle (openapi.yaml: Payment). amount: "1500.00". */
export interface Payment {
  id: string;
  cycleId: string;
  /** Whose cycle it settled. An instructor is paid per group (ADR-0015). */
  payeeType: PayeeType;
  payeeId: string;
  payeeName: string;
  /** The group of an instructor's cycle; null for a student's. */
  groupId: string | null;
  groupName: string | null;
  cycleNumber: number;
  amount: string;
  /** Academy-local date, YYYY-MM-DD. */
  paidOn: string;
  method: PaymentMethod;
  note: string | null;
  /** Who recorded it. */
  recordedBy: GroupRef;
  /** ISO 8601, UTC */
  createdAt: string;
}

/** What recording a payment sends (openapi.yaml: PaymentCreate). */
export interface PaymentCreate {
  amount: string;
  paidOn: string;
  method: PaymentMethod;
  note?: string;
}

/** A plan version of a student or instructor (openapi.yaml: PaymentPlan). amount: "1500.00". */
export interface PaymentPlan {
  id: string;
  payeeType: PayeeType;
  payeeId: string;
  /** For an instructor's plan, the group it is for (per group, ADR-0015); null for a student. */
  groupId: string | null;
  groupName: string | null;
  sessionsPerCycle: number;
  amount: string;
  /** The first cycle number this version applies to. */
  effectiveFromCycle: number;
  /** ISO 8601, UTC */
  createdAt: string;
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

/** What a reminder rule is for (openapi.yaml: ReminderRule.type). */
export const ReminderRuleType = {
  SessionReminder: 'session_reminder',
  StudentPayment: 'student_payment',
  InstructorPayment: 'instructor_payment',
} as const;
export type ReminderRuleType = (typeof ReminderRuleType)[keyof typeof ReminderRuleType];

/** Limits of a reminder rule (US-30). The tick runs every 15 minutes (ADR-0016), so a lead under 30 is pointless. */
export const REMINDER_LEAD_MINUTES_MIN = 30;
export const REMINDER_LEAD_MINUTES_MAX = 10080;
export const REMINDER_SESSIONS_BEFORE_END_MIN = 1;
export const REMINDER_SESSIONS_BEFORE_END_MAX = 20;
export const REMINDER_RULES_PER_TYPE = 10;

/** The rules every academy starts with: what was hardcoded before SCRUM-47. */
export const DEFAULT_REMINDER_RULES: ReadonlyArray<{
  type: ReminderRuleType;
  leadMinutes?: number;
  sessionsBeforeEnd?: number;
}> = [
  { type: ReminderRuleType.SessionReminder, leadMinutes: 1440 },
  { type: ReminderRuleType.SessionReminder, leadMinutes: 60 },
  { type: ReminderRuleType.StudentPayment, sessionsBeforeEnd: 2 },
  { type: ReminderRuleType.StudentPayment, sessionsBeforeEnd: 1 },
  { type: ReminderRuleType.InstructorPayment, sessionsBeforeEnd: 2 },
  { type: ReminderRuleType.InstructorPayment, sessionsBeforeEnd: 1 },
];

/** A reminder rule (openapi.yaml: ReminderRule). */
export interface ReminderRule {
  id: string;
  type: ReminderRuleType;
  leadMinutes: number | null;
  sessionsBeforeEnd: number | null;
  isActive: boolean;
}

/** POST /reminder-rules body: leadMinutes for a session rule, sessionsBeforeEnd for a payment rule. */
export interface ReminderRuleCreate {
  type: ReminderRuleType;
  leadMinutes?: number;
  sessionsBeforeEnd?: number;
}

/** PATCH /reminder-rules/{id} body; the type cannot change. */
export interface ReminderRuleUpdate {
  leadMinutes?: number;
  sessionsBeforeEnd?: number;
  isActive?: boolean;
}

/** PATCH /sessions/{id} body (openapi.yaml: SessionUpdate): the topic, or both times, or all. */
export interface SessionUpdate {
  topic?: string;
  startedAt?: string;
  endedAt?: string;
}

/** The four numbers at the top of the admin dashboard (openapi.yaml: Dashboard). */
export interface DashboardCounts {
  /** Today's sessions that are not cancelled. */
  sessionsToday: number;
  /** Due cycles of students and instructors, not capped. */
  dueCycles: number;
  /** Cancelled sessions dated in the last 7 academy-local days, today included. */
  cancelledThisWeek: number;
  /** Past sessions still Scheduled (nobody marked them). */
  unmarked: number;
}

/** One of the last Held sessions (openapi.yaml: DashboardHeldSession). */
export interface DashboardHeldSession {
  sessionId: string;
  /** ISO 8601, UTC */
  scheduledAt: string;
  group: GroupRef;
  /** The instructor on the session. */
  instructor: GroupRef;
  topic: string | null;
  attendance: { present: number; enrolled: number };
  /** Minutes between the actual start and end; null when they were not recorded. */
  actualDurationMin: number | null;
}

/** A due cycle on the dashboard (openapi.yaml: DashboardDueCycle). */
export interface DashboardDueCycle {
  id: string;
  payeeId: string;
  payeeName: string;
  cycleNumber: number;
  /** Decimal string in EGP, e.g. "1500.00" */
  amount: string;
  /** ISO 8601, UTC */
  dueAt: string | null;
  /** The group of an instructor's cycle (an instructor is paid per group); null for a student. */
  group: GroupRef | null;
}

/** GET /dashboard (openapi.yaml: Dashboard). Admin only. */
export interface Dashboard {
  counts: DashboardCounts;
  todaySessions: Session[];
  recentHeld: DashboardHeldSession[];
  dueCycles: { students: DashboardDueCycle[]; instructors: DashboardDueCycle[] };
}

/** The period a finance report covers: academy-local dates, both included (openapi.yaml: FinanceReport). */
export interface ReportPeriod {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
}

/** Money in, money out and the difference, as decimal strings in EGP. */
export interface MoneyFlow {
  in: string;
  out: string;
  net: string;
}

/** Due and unpaid cycles of one kind of payee: how many and what they add up to. */
export interface OutstandingTotal {
  count: number;
  /** Decimal string in EGP */
  total: string;
}

/** GET /reports/finance (openapi.yaml: FinanceReport). Admin only. */
export interface FinanceReport {
  period: ReportPeriod;
  /** Payments with paid_on in the period: students pay in, instructors are paid out. */
  actual: MoneyFlow;
  /** What the period should bring: cycles due in its passed part plus a projection of its future part. */
  expected: MoneyFlow & {
    /** Students left out of the projection (no open enrollment or no plan). */
    skippedStudents: number;
    /** (Instructor, group) pairs left out of the projection (no plan). */
    skippedInstructorPairs: number;
  };
  /** Cycles that are Due and unpaid, not filtered by the period. */
  outstanding: { students: OutstandingTotal; instructors: OutstandingTotal };
}

/** GET /reports/overview (openapi.yaml: OverviewReport). Admin only, not filtered by a period. */
export interface OverviewReport {
  /** One cycle of every student with an open enrollment and a plan, decimal string in EGP. */
  roundIncome: string;
  /** One cycle of every (instructor, group) pair of an active group, decimal string in EGP. */
  roundOutflow: string;
  roundNet: string;
  /** Average weeks one cycle lasts (one decimal); null when there is no student to average. */
  averageRoundWeeks: number | null;
}

/** How a sessions report groups its buckets: one per academy-local day, or one per local month. */
export type ReportGranularity = 'day' | 'month';

/** The sessions of one local day or month, by state (openapi.yaml: SessionsBucket). */
export interface SessionsBucket {
  /** YYYY-MM-DD for a day, YYYY-MM for a month */
  key: string;
  held: number;
  cancelled: number;
  /** Scheduled and already past: nobody marked it held or cancelled. */
  unmarked: number;
  /** Scheduled and not started yet. */
  upcoming: number;
}

/** The numbers of a sessions report (openapi.yaml: SessionsReportKpis). */
export interface SessionsReportKpis {
  held: number;
  cancelled: number;
  unmarked: number;
  upcoming: number;
  /** Present over all attendance rows of the held sessions, in percent with one decimal; null when there is none. */
  attendanceRate: number | null;
  /** Mean real length of the held sessions that have actual times, in whole minutes; null when none. */
  averageActualDurationMin: number | null;
}

/** GET /reports/sessions (openapi.yaml: SessionsReport). Admin only. */
export interface SessionsReport {
  period: ReportPeriod;
  /** day when the period is 62 days or less, month when it is longer. */
  granularity: ReportGranularity;
  kpis: SessionsReportKpis;
  buckets: SessionsBucket[];
}

/** One instructor of an instructors report (openapi.yaml: InstructorsReportRow). */
export interface InstructorsReportRow {
  instructorId: string;
  name: string;
  isActive: boolean;
  /** Active groups whose current instructor they are. */
  activeGroups: number;
  /** Sessions in the period held by them (the instructor on the session, not the group's current one). */
  held: number;
  cancelled: number;
  /** Real minutes of their held sessions that have actual times. */
  actualMinutes: number;
  /** Held sessions with no actual times: left out of actualMinutes, never replaced by the planned length. */
  heldWithoutActualTimes: number;
  /** Present over all attendance rows of their held sessions, percent with one decimal; null when none. */
  attendanceRate: number | null;
  /** Payments on their cycles with paid_on in the period, decimal string in EGP. */
  paid: string;
  /** Their cycles Due now, not filtered by the period. */
  due: OutstandingTotal;
  /** What the period should bring them: the finance projection for their (instructor, group) pairs. */
  expected: string;
}

/** The totals of an instructors report (openapi.yaml: InstructorsReportKpis). */
export interface InstructorsReportKpis {
  /** Active instructors among the rows. */
  activeInstructors: number;
  held: number;
  /** Total real minutes; the screen shows hours. */
  actualMinutes: number;
  paid: string;
  due: OutstandingTotal;
  expectedOutflow: string;
}

/** GET /reports/instructors (openapi.yaml: InstructorsReport). Admin only, every row, not paginated. */
export interface InstructorsReport {
  period: ReportPeriod;
  kpis: InstructorsReportKpis;
  rows: InstructorsReportRow[];
}

/** A student with this many absences in a row, counted back from their latest session, is a repeated absence. */
export const REPEATED_ABSENCE_THRESHOLD = 3;

/** The present and absent attendance rows of one local day or month (openapi.yaml: StudentsBucket). */
export interface StudentsBucket {
  /** YYYY-MM-DD for a day, YYYY-MM for a month */
  key: string;
  present: number;
  absent: number;
}

/** The numbers of a students report (openapi.yaml: StudentsReportKpis). */
export interface StudentsReportKpis {
  /** Students with an open enrollment now. */
  activeStudents: number;
  /** Students whose first enrollment started in the period. */
  joined: number;
  /** Students whose latest enrollment ended in the period and who have no open enrollment. */
  left: number;
  /** Attendance rows of the held sessions scheduled in the period. */
  present: number;
  absent: number;
  /** Present over present plus absent, percent with one decimal; null when there is none. */
  attendanceRate: number | null;
  /** Mean of the non-null performance ratings of those rows, one decimal; null when none. */
  averagePerformance: number | null;
  /** Mean of the non-null homework ratings of those rows (null means no homework), one decimal; null when none. */
  averageHomework: number | null;
  /** Listed students whose current absence streak is REPEATED_ABSENCE_THRESHOLD or more. */
  repeatedAbsence: number;
}

/** One student of a students report (openapi.yaml: StudentsReportRow). Never carries an attendance note. */
export interface StudentsReportRow {
  studentId: string;
  name: string;
  isActive: boolean;
  /** The group of their open enrollment; null when they have none. */
  currentGroup: GroupRef | null;
  present: number;
  absent: number;
  attendanceRate: number | null;
  /** Consecutive absences counted back from the latest attendance row, over all time (not the period). */
  absenceStreak: number;
  /** ISO 8601, UTC: the latest session they attended, any time; null if never. */
  lastPresentAt: string | null;
  averagePerformance: number | null;
  averageHomework: number | null;
  /** The cycle in progress, else the latest Due one; null when they have neither. */
  cycle: {
    sessionsCounted: number;
    sessionsPerCycle: number;
    status: Extract<CycleStatus, 'in_progress' | 'due'>;
  } | null;
}

/** GET /reports/students (openapi.yaml: StudentsReport). Admin only, every row, not paginated. */
export interface StudentsReport {
  period: ReportPeriod;
  granularity: ReportGranularity;
  kpis: StudentsReportKpis;
  buckets: StudentsBucket[];
  rows: StudentsReportRow[];
}

/** Why an evaluation was asked for (US-42). */
export const EvaluationSource = { CycleDue: 'cycle_due', Admin: 'admin' } as const;
export type EvaluationSource = (typeof EvaluationSource)[keyof typeof EvaluationSource];

export const EvaluationStatus = {
  Pending: 'pending',
  Submitted: 'submitted',
  Cancelled: 'cancelled',
} as const;
export type EvaluationStatus = (typeof EvaluationStatus)[keyof typeof EvaluationStatus];

/**
 * A pending evaluation request (openapi.yaml: EvaluationRequest): who it is about, the group,
 * and the cycle that became Due (null for a request by the admin). It never carries any text.
 */
export interface EvaluationRequest {
  id: string;
  source: EvaluationSource;
  status: EvaluationStatus;
  student: { id: string; name: string };
  group: GroupRef;
  instructor: { id: string; name: string };
  /** The number of the cycle that became Due; null for a request by the admin. */
  cycleNumber: number | null;
  /** ISO 8601, UTC */
  requestedAt: string;
}

/** A written evaluation of a student (openapi.yaml: StudentEvaluation). */
export interface StudentEvaluation {
  id: string;
  source: EvaluationSource;
  student: { id: string; name: string };
  group: GroupRef;
  instructor: { id: string; name: string };
  cycleNumber: number | null;
  /** 1 to 5 */
  overallRating: number;
  summary: string;
  strengths: string | null;
  toImprove: string | null;
  /** ISO 8601, UTC */
  submittedAt: string;
}

/** POST /evaluation-requests/{id}/submit (openapi.yaml: SubmitEvaluationRequest). */
export interface SubmitEvaluationInput {
  /** 1 to 5 */
  overallRating: number;
  /** 20 to 2000 characters */
  summary: string;
  strengths?: string | null;
  toImprove?: string | null;
}

/** GET and PATCH /academy/settings (openapi.yaml: AcademySettings). */
export interface AcademySettings {
  /** A student cycle becoming Due asks the instructor on the session for a blocking evaluation. */
  evaluationsRequired: boolean;
}

/** Limits of an announcement (US-31); the API validates them and the web counters show them. */
export const ANNOUNCEMENT_TITLE_MAX = 100;
export const ANNOUNCEMENT_BODY_MAX = 1000;
export const ANNOUNCEMENT_MAX_USERS = 200;

export const AnnouncementAudience = { All: 'all', Role: 'role', Users: 'users' } as const;
export type AnnouncementAudience = (typeof AnnouncementAudience)[keyof typeof AnnouncementAudience];

/** A sent announcement (openapi.yaml: Announcement). It is never edited or deleted. */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  roleId: string | null;
  /** The role's name when audience is role. */
  roleName: string | null;
  recipientCount: number;
  sender: { id: string; name: string };
  /** ISO 8601, UTC */
  createdAt: string;
}

/** POST /announcements (openapi.yaml: AnnouncementCreate). */
export interface AnnouncementCreate {
  /** 1 to 100 characters after trimming */
  title: string;
  /** 1 to 1000 characters after trimming */
  body: string;
  audience: AnnouncementAudience;
  /** Required when audience is role. */
  roleId?: string;
  /** Required when audience is users: 1 to 200 ids. */
  userIds?: string[];
}

/** GET /announcements/recipients-count (openapi.yaml: RecipientsCount). */
export interface RecipientsCount {
  count: number;
}

/** A role the audience picker offers (GET /announcements/audience/roles). */
export interface AudienceRole {
  id: string;
  name: string;
}

/** A person the audience picker offers (GET /announcements/audience/users). */
export interface AudienceUser {
  id: string;
  name: string;
  roles: string[];
}

/** Limits of the material links (US-32); the API validates them and the web inputs follow them. */
export const MATERIAL_LINK_TITLE_MAX = 100;
export const MATERIAL_LINK_URL_MAX = 2048;
export const MATERIAL_LINKS_MAX = 100;

/** A course material link (openapi.yaml: MaterialLink). */
export interface MaterialLink {
  id: string;
  title: string;
  /** An absolute http or https address, as the admin typed it. */
  url: string;
  /** The place in the list, from 1 with no gaps. */
  sortOrder: number;
}

/** POST /material-links (openapi.yaml: MaterialLinkCreate). A new link goes to the end. */
export interface MaterialLinkCreate {
  /** 1 to 100 characters after trimming */
  title: string;
  /** http or https, at most 2048 characters */
  url: string;
}

/** PATCH /material-links/{id} (openapi.yaml: MaterialLinkUpdate). */
export type MaterialLinkUpdate = Partial<MaterialLinkCreate>;

/** PUT /material-links/order (openapi.yaml: MaterialOrder): every id of the academy exactly once. */
export interface MaterialOrder {
  ids: string[];
}
