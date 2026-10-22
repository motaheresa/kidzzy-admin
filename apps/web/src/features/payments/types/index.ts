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

/** What a plan form sends: a student's plan, or an instructor's, which may carry a starting point. */
export interface PlanSaveInput extends PlanInput {
  /** Only an instructor's first plan (BR-14); a student's starting point is set at enrollment. */
  openingCount?: number;
}
