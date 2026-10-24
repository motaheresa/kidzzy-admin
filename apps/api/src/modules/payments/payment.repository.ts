import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PaymentMethod } from '@kidzzy/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import { stringToDate } from '../sessions/dates';

const PAYMENT_SELECT = {
  id: true,
  cycleId: true,
  amount: true,
  paidOn: true,
  method: true,
  note: true,
  createdAt: true,
  recordedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.PaymentSelect;

export type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

/**
 * Reads and writes payments (US-23). One payment settles one cycle: the database refuses a
 * second for the same cycle (UNIQUE cycle_id). Queries go through `txHost.tx`, limited to the
 * academy in TenantContext.
 */
@Injectable()
export class PaymentRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /** Inserts the payment of a cycle. The caller has locked the cycle and checked it is Due. */
  create(input: {
    cycleId: string;
    amount: Prisma.Decimal;
    /** Academy-local date, YYYY-MM-DD. */
    paidOn: string;
    method: PaymentMethod;
    note: string | null;
    recordedById: string;
  }): Promise<PaymentRow> {
    return this.txHost.tx.payment.create({
      data: {
        academyId: this.tenant.requireAcademyId(),
        cycleId: input.cycleId,
        amount: input.amount,
        paidOn: stringToDate(input.paidOn),
        method: input.method,
        note: input.note,
        recordedById: input.recordedById,
      },
      select: PAYMENT_SELECT,
    });
  }
}
