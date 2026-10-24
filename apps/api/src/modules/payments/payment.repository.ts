import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PageWindow } from '../../common/pagination/page';
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
  cycle: {
    select: {
      cycleNumber: true,
      payeeType: true,
      studentId: true,
      instructorId: true,
      groupId: true,
      student: { select: { name: true } },
      instructor: { select: { name: true } },
      group: { select: { name: true } },
    },
  },
} as const satisfies Prisma.PaymentSelect;

export type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

/** What GET /payments can filter by. The filters are combined with AND. */
export interface PaymentListFilter {
  payeeType?: 'student' | 'instructor';
  studentId?: string;
  instructorId?: string;
  /** Academy-local dates, YYYY-MM-DD, both included. */
  from?: string;
  to?: string;
}

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

  /**
   * One page of payments, newest first (the day they were paid, then when they were recorded).
   * paid_on is already an academy-local date, so from and to compare as plain dates.
   */
  async list(
    filter: PaymentListFilter,
    window: PageWindow,
  ): Promise<{ rows: PaymentRow[]; total: number }> {
    const cycle: Prisma.PaymentCycleWhereInput = {
      ...(filter.payeeType ? { payeeType: filter.payeeType } : {}),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
      ...(filter.instructorId ? { instructorId: filter.instructorId } : {}),
    };
    const where: Prisma.PaymentWhereInput = {
      ...(Object.keys(cycle).length > 0 ? { cycle } : {}),
      ...(filter.from || filter.to
        ? {
            paidOn: {
              ...(filter.from ? { gte: stringToDate(filter.from) } : {}),
              ...(filter.to ? { lte: stringToDate(filter.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.txHost.tx.payment.findMany({
        where,
        select: PAYMENT_SELECT,
        orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.txHost.tx.payment.count({ where }),
    ]);
    return { rows, total };
  }

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
