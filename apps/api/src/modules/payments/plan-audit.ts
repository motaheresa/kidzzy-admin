import { toMoney } from '../prisma/money';
import type { PlanRow } from './payment-plan.repository';

/**
 * What the audit log keeps of a plan version (payment_plan.set and payment_plan.changed): ids,
 * the version, N, the amount as a decimal string and the cycle it applies from. openingCount is
 * only there on the first plan of a payee (BR-14). Names and notes never go in.
 */
export function planAudit(plan: PlanRow, openingCount?: number): Record<string, string | number> {
  return {
    payeeType: plan.payeeType,
    ...(plan.studentId ? { studentId: plan.studentId } : {}),
    ...(plan.instructorId ? { instructorId: plan.instructorId } : {}),
    ...(plan.groupId ? { groupId: plan.groupId } : {}),
    version: plan.version,
    sessionsPerCycle: plan.sessionsPerCycle,
    amount: toMoney(plan.amount),
    effectiveFromCycle: plan.effectiveFromCycle,
    ...(openingCount !== undefined ? { openingCount } : {}),
  };
}
