import type { PaymentPlan } from '@kidzzy/shared';
import { toMoney } from '../prisma/money';
import type { PlanRow } from './payment-plan.repository';

/** openapi.yaml: PaymentPlan. Built field by field; the amount is a decimal string. */
export function toPaymentPlan(row: PlanRow): PaymentPlan {
  return {
    id: row.id,
    payeeType: row.payeeType,
    payeeId: (row.payeeType === 'student' ? row.studentId : row.instructorId) ?? '',
    groupId: row.groupId,
    groupName: row.group?.name ?? null,
    sessionsPerCycle: row.sessionsPerCycle,
    amount: toMoney(row.amount),
    effectiveFromCycle: row.effectiveFromCycle,
    createdAt: row.createdAt.toISOString(),
  };
}
