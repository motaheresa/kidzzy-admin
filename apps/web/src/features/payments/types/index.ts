import type { PaymentPlan, PayeeType, PlanInput } from '@kidzzy/shared';

/** The API's plan shapes (openapi.yaml: PaymentPlan, PlanInput, InstructorPlanCreate). */
export type { PaymentPlan, PlanInput };

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
