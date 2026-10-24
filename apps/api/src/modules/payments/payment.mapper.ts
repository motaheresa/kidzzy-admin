import type { Payment } from '@kidzzy/shared';
import { toMoney } from '../prisma/money';
import { dateToString } from '../sessions/dates';
import type { PaymentRow } from './payment.repository';

/**
 * openapi.yaml: Payment. Built field by field; the amount is a decimal string. It names whose
 * cycle it settled and, for an instructor, the group.
 */
export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    cycleId: row.cycleId,
    payeeType: row.cycle.payeeType,
    payeeId:
      (row.cycle.payeeType === 'student' ? row.cycle.studentId : row.cycle.instructorId) ?? '',
    payeeName:
      (row.cycle.payeeType === 'student' ? row.cycle.student?.name : row.cycle.instructor?.name) ??
      '',
    groupId: row.cycle.groupId,
    groupName: row.cycle.group?.name ?? null,
    cycleNumber: row.cycle.cycleNumber,
    amount: toMoney(row.amount),
    paidOn: dateToString(row.paidOn),
    method: row.method,
    note: row.note,
    recordedBy: { id: row.recordedBy.id, name: row.recordedBy.name },
    createdAt: row.createdAt.toISOString(),
  };
}
