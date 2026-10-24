import type {
  Page,
  Payment,
  PaymentCreate,
  PaymentCycle,
  PaymentPlan,
  PayeeType,
  PlanInput,
} from '@kidzzy/shared';

/** The API's plan shapes (openapi.yaml: PaymentPlan, PlanInput, InstructorPlanCreate). */
export type { Page, Payment, PaymentCreate, PaymentCycle, PaymentPlan, PlanInput };

/** The status filters of the cycles list; "approaching" is one or two sessions before the end. */
export type CycleFilter = 'in_progress' | 'approaching' | 'due' | 'paid';

/**
 * What GET /payment-cycles is asked for here: one kind of payee, optionally one instructor (left
 * out for the caller's own cycles) and a status. Without pageSize, the largest page.
 */
export interface CycleListParams {
  payeeType: PayeeType;
  instructorId?: string;
  status?: CycleFilter;
  page?: number;
  pageSize?: number;
}

/**
 * What GET /payments is asked for here: the payment history, optionally of one instructor (left
 * out for the caller's own), between two academy-local dates, both included.
 */
export interface PaymentListParams {
  instructorId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Whose plan: a student or an instructor. Both have versioned plans with the same rules (BR-10),
 * and each its own screen to go back to.
 */
export interface Payee {
  type: PayeeType;
  id: string;
}

/** What a plan form sends: a student's plan, or an instructor's, which is per group. */
export interface PlanSaveInput extends PlanInput {
  /** Only an instructor's plan: the group it is for (an instructor is paid per group). */
  groupId?: string;
  /** Only the first plan of an instructor and group (BR-14); a student's is set at enrollment. */
  openingCount?: number;
}
