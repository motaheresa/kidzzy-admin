import type { PaymentCycle } from '@kidzzy/shared';
import { toMoney } from '../prisma/money';
import type { PaymentCycleRow } from './payment-cycle.repository';

/**
 * openapi.yaml: PaymentCycle. Built field by field, so a new column never leaks into the API.
 * The amount is the plan version's, as a decimal string.
 */
export function toPaymentCycle(row: PaymentCycleRow): PaymentCycle {
  return {
    id: row.id,
    payeeType: row.payeeType,
    payeeId: (row.payeeType === 'student' ? row.studentId : row.instructorId) ?? '',
    payeeName: (row.payeeType === 'student' ? row.student?.name : row.instructor?.name) ?? '',
    groupId: row.groupId,
    groupName: row.group?.name ?? null,
    cycleNumber: row.cycleNumber,
    sessionsPerCycle: row.sessionsPerCycle,
    amount: toMoney(row.plan.amount),
    openingCount: row.openingCount,
    sessionsCounted: row.sessionsCounted,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}
