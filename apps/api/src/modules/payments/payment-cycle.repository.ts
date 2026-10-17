import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import type { PlanRow } from './payment-plan.repository';

/** What a cycle row holds for the API (openapi.yaml: PaymentCycle). */
export const CYCLE_SELECT = {
  id: true,
  payeeType: true,
  studentId: true,
  instructorId: true,
  cycleNumber: true,
  sessionsPerCycle: true,
  openingCount: true,
  sessionsCounted: true,
  status: true,
  dueAt: true,
  paidAt: true,
  student: { select: { name: true } },
  instructor: { select: { name: true } },
  plan: { select: { amount: true } },
} as const satisfies Prisma.PaymentCycleSelect;

export type PaymentCycleRow = Prisma.PaymentCycleGetPayload<{ select: typeof CYCLE_SELECT }>;

/**
 * Reads and writes payment cycles (FR-15, FR-16). A cycle belongs to its payee, never to a group,
 * so enrollments and transfers do not touch it (BR-11). Counting held sessions is US-22.
 * Queries go through `txHost.tx`, limited to the academy in TenantContext.
 */
@Injectable()
export class PaymentCycleRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /** The student's cycle in progress (at most one, by a partial unique index), or null. */
  findOpenForStudent(studentId: string): Promise<PaymentCycleRow | null> {
    return this.txHost.tx.paymentCycle.findFirst({
      where: { studentId, status: 'in_progress' },
      select: CYCLE_SELECT,
    });
  }

  /** True when the student has any cycle, whatever its status. */
  async studentHasCycles(studentId: string): Promise<boolean> {
    return (await this.txHost.tx.paymentCycle.count({ where: { studentId } })) > 0;
  }

  /**
   * The student's first cycle under plan version 1: cycle 1, counting from the starting point
   * (BR-14). The caller checks 0 <= openingCount < N; a check constraint holds it too.
   */
  async createFirstForStudent(
    studentId: string,
    plan: PlanRow,
    openingCount: number,
  ): Promise<PaymentCycleRow> {
    const academyId = this.tenant.requireAcademyId();
    return this.txHost.tx.paymentCycle.create({
      data: {
        academyId,
        payeeType: 'student',
        studentId,
        studentAcademyId: academyId,
        planId: plan.id,
        sessionsPerCycle: plan.sessionsPerCycle,
        cycleNumber: 1,
        openingCount,
        sessionsCounted: openingCount,
      },
      select: CYCLE_SELECT,
    });
  }
}
