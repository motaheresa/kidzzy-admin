import type { Payment } from '@kidzzy/shared';
import { toMoney } from '../prisma/money';
import { dateToString } from '../sessions/dates';
import type { PaymentRow } from './payment.repository';

/** openapi.yaml: Payment. Built field by field; the amount is a decimal string. */
export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    cycleId: row.cycleId,
    amount: toMoney(row.amount),
    paidOn: dateToString(row.paidOn),
    method: row.method,
    note: row.note,
    recordedBy: { id: row.recordedBy.id, name: row.recordedBy.name },
    createdAt: row.createdAt.toISOString(),
  };
}
