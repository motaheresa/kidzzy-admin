import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../generated/prisma/client';
import type { PageWindow } from '../../common/pagination/page';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import type { CycleFilter } from './dto/list-payment-cycles.query';
import type { PlanRow } from './payment-plan.repository';

/** What a cycle row holds for the API (openapi.yaml: PaymentCycle). */
export const CYCLE_SELECT = {
  id: true,
  payeeType: true,
  studentId: true,
  instructorId: true,
  groupId: true,
  cycleNumber: true,
  sessionsPerCycle: true,
  openingCount: true,
  sessionsCounted: true,
  status: true,
  dueAt: true,
  paidAt: true,
  student: { select: { name: true } },
  instructor: { select: { name: true } },
  group: { select: { name: true } },
  plan: { select: { amount: true } },
} as const satisfies Prisma.PaymentCycleSelect;

export type PaymentCycleRow = Prisma.PaymentCycleGetPayload<{ select: typeof CYCLE_SELECT }>;

const COUNTABLE_SELECT = {
  id: true,
  payeeType: true,
  studentId: true,
  instructorId: true,
  groupId: true,
  cycleNumber: true,
  sessionsPerCycle: true,
  sessionsCounted: true,
  openingCount: true,
  status: true,
} as const satisfies Prisma.PaymentCycleSelect;

/** What GET /payment-cycles can filter by. The filters are combined with AND. */
export interface CycleListFilter {
  status?: CycleFilter;
  payeeType?: 'student' | 'instructor';
  studentId?: string;
  instructorId?: string;
}

/** A cycle as counting a Held session needs it (US-22). */
export type CountableCycle = Prisma.PaymentCycleGetPayload<{ select: typeof COUNTABLE_SELECT }>;

/**
 * Reads and writes payment cycles (FR-15, FR-16). A student's cycle belongs to the student, never
 * to a group, so enrollments and transfers do not touch it (BR-11). An instructor is paid per
 * group (ADR-0015): their cycles belong to an (instructor, group) pair. Counting held sessions
 * is US-22.
 * Queries go through `txHost.tx`, limited to the academy in TenantContext.
 */
@Injectable()
export class PaymentCycleRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of cycles, by payee name, then group name, then the latest cycle first, so a payee's
   * current cycle of each group comes first.
   */
  async list(
    filter: CycleListFilter,
    window: PageWindow,
  ): Promise<{ rows: PaymentCycleRow[]; total: number }> {
    const where: Prisma.PaymentCycleWhereInput = {
      ...(filter.payeeType ? { payeeType: filter.payeeType } : {}),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
      ...(filter.instructorId ? { instructorId: filter.instructorId } : {}),
      ...(await this.statusWhere(filter.status)),
    };
    const [rows, total] = await Promise.all([
      this.txHost.tx.paymentCycle.findMany({
        where,
        select: CYCLE_SELECT,
        orderBy: [
          { student: { name: 'asc' } },
          { instructor: { name: 'asc' } },
          { group: { name: 'asc' } },
          { cycleNumber: 'desc' },
          { id: 'asc' },
        ],
        skip: window.skip,
        take: window.take,
      }),
      this.txHost.tx.paymentCycle.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * The status filter. "Approaching" is a cycle in progress with one or two sessions left, which
   * compares two columns of the same row, so the ids come from raw SQL (filtered by academy_id,
   * since raw SQL is not tenant-scoped).
   */
  private async statusWhere(status?: CycleFilter): Promise<Prisma.PaymentCycleWhereInput> {
    if (!status) return {};
    if (status !== 'approaching') return { status };
    const rows = await this.txHost.tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM payment_cycles
      WHERE academy_id = ${this.tenant.requireAcademyId()}::uuid
        AND status = 'in_progress'
        AND sessions_per_cycle - sessions_counted <= 2`);
    return { id: { in: rows.map((row) => row.id) } };
  }

  /** The student's cycle in progress (at most one, by a partial unique index), or null. */
  findOpenForStudent(studentId: string): Promise<PaymentCycleRow | null> {
    return this.txHost.tx.paymentCycle.findFirst({
      where: { studentId, status: 'in_progress' },
      select: CYCLE_SELECT,
    });
  }

  /**
   * The instructor's cycle in progress for this group (at most one per instructor and group, by a
   * partial unique index), or null. An instructor has a cycle line per group (ADR-0015).
   */
  findOpenForInstructor(instructorId: string, groupId: string): Promise<PaymentCycleRow | null> {
    return this.txHost.tx.paymentCycle.findFirst({
      where: { instructorId, groupId, status: 'in_progress' },
      select: CYCLE_SELECT,
    });
  }

  /**
   * The first cycle of an (instructor, group) pair under plan version 1: cycle 1, counting from
   * the starting point (BR-14). The caller checks 0 <= openingCount < N; a check constraint holds
   * it too.
   */
  async createFirstForInstructor(
    instructorId: string,
    groupId: string,
    plan: PlanRow,
    openingCount: number,
  ): Promise<PaymentCycleRow> {
    const academyId = this.tenant.requireAcademyId();
    return this.txHost.tx.paymentCycle.create({
      data: {
        academyId,
        payeeType: 'instructor',
        instructorId,
        instructorAcademyId: academyId,
        groupId,
        groupAcademyId: academyId,
        planId: plan.id,
        sessionsPerCycle: plan.sessionsPerCycle,
        cycleNumber: 1,
        openingCount,
        sessionsCounted: openingCount,
      },
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

  /** One cycle with its plan amount, or null when this academy has none with that id. */
  findById(id: string): Promise<PaymentCycleRow | null> {
    return this.txHost.tx.paymentCycle.findUnique({ where: { id }, select: CYCLE_SELECT });
  }

  /**
   * Locks one cycle row until the transaction ends, so two payments of the same cycle run one
   * after the other and the second sees the first. Call findById again after it. Raw SQL is not
   * tenant-scoped, so academy_id is filtered here.
   */
  async lock(id: string): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM payment_cycles
      WHERE id = ${id}::uuid AND academy_id = ${this.tenant.requireAcademyId()}::uuid
      FOR UPDATE`;
  }

  /** How many sessions the cycle counted (its cycle_sessions rows). */
  countSessions(cycleId: string): Promise<number> {
    return this.txHost.tx.cycleSession.count({ where: { cycleId } });
  }

  /**
   * Sets the starting point and the counter together, in one UPDATE, because the check
   * constraints tie sessions_counted to opening_count and to N. Call it with the cycle locked.
   */
  async setStartingPoint(id: string, openingCount: number, sessionsCounted: number): Promise<void> {
    await this.txHost.tx.paymentCycle.update({
      where: { id },
      data: { openingCount, sessionsCounted },
    });
  }

  /** Marks a Due cycle paid. One UPDATE: a check constraint ties status to paid_at. */
  async markPaid(id: string, paidAt: Date): Promise<void> {
    await this.txHost.tx.paymentCycle.update({ where: { id }, data: { status: 'paid', paidAt } });
  }

  /**
   * The ids of the cycles in progress of these students and of this instructor for this group:
   * one each at most. The instructor's other groups have their own cycles and are not touched.
   */
  async findOpenIds(
    studentIds: string[],
    instructorId: string,
    groupId: string,
  ): Promise<string[]> {
    const rows = await this.txHost.tx.paymentCycle.findMany({
      where: {
        status: 'in_progress',
        OR: [{ studentId: { in: studentIds } }, { instructorId, groupId }],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Locks these cycles until the transaction ends, in ONE statement and in id order, so two
   * transactions that share cycles always take them in the same order and cannot deadlock.
   * A cycle that stopped being in progress while this waited (a concurrent Held session
   * completed it) is not returned: the caller reads the open cycles again. Raw SQL is not
   * tenant-scoped, so academy_id is filtered here.
   */
  async lockOpen(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.txHost.tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM payment_cycles
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        AND academy_id = ${this.tenant.requireAcademyId()}::uuid
        AND status = 'in_progress'
      ORDER BY id
      FOR UPDATE`);
    return rows.map((row) => row.id);
  }

  /** The cycles as they are now (read after the lock), by id. */
  findCountable(ids: string[]): Promise<CountableCycle[]> {
    return this.txHost.tx.paymentCycle.findMany({
      where: { id: { in: ids } },
      select: COUNTABLE_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  /** The cycles that counted this session (one per payee it was counted for), by id. */
  findCountingSession(sessionId: string): Promise<CountableCycle[]> {
    return this.txHost.tx.paymentCycle.findMany({
      where: { sessions: { some: { sessionId } } },
      select: COUNTABLE_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  /** The cycles of the same payee after this one (a student's, or an instructor's for the same group). */
  findLater(cycle: CountableCycle): Promise<CountableCycle[]> {
    return this.txHost.tx.paymentCycle.findMany({
      where: {
        ...(cycle.studentId
          ? { studentId: cycle.studentId }
          : { instructorId: cycle.instructorId, groupId: cycle.groupId }),
        cycleNumber: { gt: cycle.cycleNumber },
      },
      select: COUNTABLE_SELECT,
      orderBy: { cycleNumber: 'asc' },
    });
  }

  /**
   * Locks these cycles, whatever their status, in ONE statement and in id order, the same order
   * as lockOpen, so an undo and a Held session that share cycles cannot deadlock.
   */
  async lockAny(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.txHost.tx.$queryRaw`
      SELECT id FROM payment_cycles
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        AND academy_id = ${this.tenant.requireAcademyId()}::uuid
      ORDER BY id
      FOR UPDATE`;
  }

  /** Deletes a cycle that counted nothing (the one opened after a completed cycle). */
  async deleteEmpty(id: string): Promise<void> {
    await this.txHost.tx.paymentCycle.delete({ where: { id } });
  }

  /** Takes the session out of the cycle (its cycle_sessions row). */
  async removeSession(cycleId: string, sessionId: string): Promise<void> {
    await this.txHost.tx.cycleSession.delete({
      where: { cycleId_sessionId: { cycleId, sessionId } },
    });
  }

  /**
   * Sets the counter after a session was taken out, and puts the cycle back In progress with no
   * due date, in one UPDATE: a check constraint ties the status to the counter and to due_at.
   */
  async setCountAfterUndo(id: string, sessionsCounted: number): Promise<void> {
    await this.txHost.tx.paymentCycle.update({
      where: { id },
      data: { sessionsCounted, status: 'in_progress', dueAt: null },
    });
  }

  /** Records that the session is counted in the cycle (cycle_sessions). */
  async addSession(cycleId: string, sessionId: string): Promise<void> {
    await this.txHost.tx.cycleSession.create({
      data: { academyId: this.tenant.requireAcademyId(), cycleId, sessionId },
    });
  }

  /**
   * Sets the counter. With dueAt the cycle is complete: it becomes Due in the same statement,
   * because a check constraint ties the status to the counter and to due_at.
   */
  async setCount(id: string, sessionsCounted: number, dueAt: Date | null): Promise<void> {
    await this.txHost.tx.paymentCycle.update({
      where: { id },
      data: dueAt ? { sessionsCounted, status: 'due', dueAt } : { sessionsCounted },
    });
  }

  /** Opens the cycle after a completed one, under the given plan version, counting from 0. */
  async createNext(previous: CountableCycle, plan: PlanRow): Promise<void> {
    const academyId = this.tenant.requireAcademyId();
    await this.txHost.tx.paymentCycle.create({
      data: {
        academyId,
        payeeType: previous.payeeType,
        ...(previous.studentId
          ? { studentId: previous.studentId, studentAcademyId: academyId }
          : {
              instructorId: previous.instructorId,
              instructorAcademyId: academyId,
              groupId: previous.groupId,
              groupAcademyId: academyId,
            }),
        planId: plan.id,
        sessionsPerCycle: plan.sessionsPerCycle,
        cycleNumber: previous.cycleNumber + 1,
        openingCount: 0,
        sessionsCounted: 0,
      },
    });
  }
}
