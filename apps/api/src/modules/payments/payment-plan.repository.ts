import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

const PLAN_SELECT = {
  id: true,
  payeeType: true,
  studentId: true,
  instructorId: true,
  version: true,
  sessionsPerCycle: true,
  amount: true,
  effectiveFromCycle: true,
  createdAt: true,
} as const satisfies Prisma.PaymentPlanSelect;

/** A plan version, as the services and the mapper need it. */
export type PlanRow = Prisma.PaymentPlanGetPayload<{ select: typeof PLAN_SELECT }>;

/**
 * Reads and writes payment plan versions (US-08, US-20, US-21). A version is never changed: a
 * change inserts the next version (BR-10). The plan for cycle n is the highest version whose
 * effective_from_cycle is n or less, so the latest version is the one the next cycle takes.
 * Queries go through `txHost.tx`, limited to the academy in TenantContext.
 */
@Injectable()
export class PaymentPlanRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /** The student's highest version, or null when they never had a plan. */
  findLatestForStudent(studentId: string): Promise<PlanRow | null> {
    return this.txHost.tx.paymentPlan.findFirst({
      where: { studentId },
      orderBy: { version: 'desc' },
      select: PLAN_SELECT,
    });
  }

  /** Every version of the student's plan, the first first. */
  listForStudent(studentId: string): Promise<PlanRow[]> {
    return this.txHost.tx.paymentPlan.findMany({
      where: { studentId },
      orderBy: { version: 'asc' },
      select: PLAN_SELECT,
    });
  }

  /** Every version of the instructor's plan, the first first. */
  listForInstructor(instructorId: string): Promise<PlanRow[]> {
    return this.txHost.tx.paymentPlan.findMany({
      where: { instructorId },
      orderBy: { version: 'asc' },
      select: PLAN_SELECT,
    });
  }

  /** The instructor's highest version, or null when they never had a plan. */
  findLatestForInstructor(instructorId: string): Promise<PlanRow | null> {
    return this.txHost.tx.paymentPlan.findFirst({
      where: { instructorId },
      orderBy: { version: 'desc' },
      select: PLAN_SELECT,
    });
  }

  /** Inserts a version of an instructor's plan. The caller picks the version and the first cycle. */
  createForInstructor(input: {
    instructorId: string;
    version: number;
    sessionsPerCycle: number;
    amount: Prisma.Decimal;
    effectiveFromCycle: number;
  }): Promise<PlanRow> {
    const academyId = this.tenant.requireAcademyId();
    return this.txHost.tx.paymentPlan.create({
      data: {
        academyId,
        payeeType: 'instructor',
        instructorId: input.instructorId,
        instructorAcademyId: academyId,
        version: input.version,
        sessionsPerCycle: input.sessionsPerCycle,
        amount: input.amount,
        effectiveFromCycle: input.effectiveFromCycle,
      },
      select: PLAN_SELECT,
    });
  }

  /** Inserts a version of a student's plan. The caller picks the version and the first cycle. */
  createForStudent(input: {
    studentId: string;
    version: number;
    sessionsPerCycle: number;
    amount: Prisma.Decimal;
    effectiveFromCycle: number;
  }): Promise<PlanRow> {
    const academyId = this.tenant.requireAcademyId();
    return this.txHost.tx.paymentPlan.create({
      data: {
        academyId,
        payeeType: 'student',
        studentId: input.studentId,
        studentAcademyId: academyId,
        version: input.version,
        sessionsPerCycle: input.sessionsPerCycle,
        amount: input.amount,
        effectiveFromCycle: input.effectiveFromCycle,
      },
      select: PLAN_SELECT,
    });
  }
}
