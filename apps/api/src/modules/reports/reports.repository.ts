import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { stringToDate } from '../sessions/dates';
import type { StatSession } from './session-stats';

/** What a student contributes to the projection and to the overview. */
const STUDENT_SELECT = {
  id: true,
  enrollments: { where: { endDate: null }, select: { groupId: true } },
  cycles: {
    where: { status: 'in_progress' },
    select: { sessionsPerCycle: true, sessionsCounted: true, plan: { select: { amount: true } } },
  },
  plans: {
    orderBy: { version: 'desc' },
    take: 1,
    select: { sessionsPerCycle: true, amount: true },
  },
} as const satisfies Prisma.StudentSelect;

export type StudentReportRow = Prisma.StudentGetPayload<{ select: typeof STUDENT_SELECT }>;

const GROUP_SELECT = {
  id: true,
  instructorId: true,
  slots: {
    where: { retiredAt: null },
    select: { id: true, weekday: true, startTime: true, durationMin: true },
  },
} as const satisfies Prisma.GroupSelect;

export type GroupReportRow = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

/** An in-progress instructor cycle, which belongs to an (instructor, group) pair (ADR-0015). */
export interface InstructorCycleRow {
  instructorId: string;
  groupId: string;
  sessionsPerCycle: number;
  sessionsCounted: number;
  amount: Prisma.Decimal;
}

/** The latest plan version of an (instructor, group) pair. */
export interface InstructorPlanRow {
  instructorId: string;
  groupId: string;
  sessionsPerCycle: number;
  amount: Prisma.Decimal;
}

/** A cycle with the amount of its plan, for the sums of the report. */
export interface CycleAmountRow {
  payeeType: 'student' | 'instructor';
  amount: Prisma.Decimal;
}

/** A Scheduled session that has not started: all the projection needs to walk. */
export interface FutureSessionRow {
  groupId: string;
  instructorId: string;
  scheduledAt: Date;
}

/**
 * The reads behind the reports (US-38). It only reads, so there is no transaction, and it has no
 * raw SQL. Queries go through `txHost.tx`, limited to the academy in TenantContext. The rules
 * (what completes inside a period, what a round is worth) are in the service and the pure
 * projection; this class only loads rows.
 */
@Injectable()
export class ReportsRepository {
  constructor(private readonly txHost: TransactionHost<TenantTransactionalAdapter>) {}

  /**
   * Sum of the payments on cycles of one payee type with paid_on in [from, to] (academy-local
   * dates, both included). paid_on is a DATE column, so the dates compare as plain dates.
   */
  async sumPaidOn(
    payeeType: 'student' | 'instructor',
    from: string,
    to: string,
  ): Promise<Prisma.Decimal | null> {
    const { _sum } = await this.txHost.tx.payment.aggregate({
      where: {
        cycle: { payeeType },
        paidOn: { gte: stringToDate(from), lte: stringToDate(to) },
      },
      _sum: { amount: true },
    });
    return _sum.amount;
  }

  /** Cycles whose due_at is in [start, end), with their plan amount. */
  async listCyclesDueBetween(start: Date, end: Date): Promise<CycleAmountRow[]> {
    const rows = await this.txHost.tx.paymentCycle.findMany({
      where: { dueAt: { gte: start, lt: end } },
      select: { payeeType: true, plan: { select: { amount: true } } },
    });
    return rows.map((row) => ({ payeeType: row.payeeType, amount: row.plan.amount }));
  }

  /** Cycles that are Due and unpaid, with their plan amount (not filtered by a period). */
  async listOutstandingCycles(): Promise<CycleAmountRow[]> {
    const rows = await this.txHost.tx.paymentCycle.findMany({
      where: { status: 'due' },
      select: { payeeType: true, plan: { select: { amount: true } } },
    });
    return rows.map((row) => ({ payeeType: row.payeeType, amount: row.plan.amount }));
  }

  /**
   * Every student who has an open enrollment or a cycle in progress, with that enrollment's group,
   * the cycle and the latest plan version. Both are what the projection and the overview start from.
   */
  listStudents(): Promise<StudentReportRow[]> {
    return this.txHost.tx.student.findMany({
      where: {
        OR: [
          { enrollments: { some: { endDate: null } } },
          { cycles: { some: { status: 'in_progress' } } },
        ],
      },
      select: STUDENT_SELECT,
    });
  }

  /** Active groups with their active slots (a retired slot left out) and their current instructor. */
  listActiveGroups(): Promise<GroupReportRow[]> {
    return this.txHost.tx.group.findMany({ where: { isActive: true }, select: GROUP_SELECT });
  }

  /** The instructors' cycles in progress, one per (instructor, group) pair at most. */
  async listInstructorCyclesInProgress(): Promise<InstructorCycleRow[]> {
    const rows = await this.txHost.tx.paymentCycle.findMany({
      where: { payeeType: 'instructor', status: 'in_progress' },
      select: {
        instructorId: true,
        groupId: true,
        sessionsPerCycle: true,
        sessionsCounted: true,
        plan: { select: { amount: true } },
      },
    });
    return rows.flatMap((row) =>
      row.instructorId && row.groupId
        ? [
            {
              instructorId: row.instructorId,
              groupId: row.groupId,
              sessionsPerCycle: row.sessionsPerCycle,
              sessionsCounted: row.sessionsCounted,
              amount: row.plan.amount,
            },
          ]
        : [],
    );
  }

  /** The latest plan version of every (instructor, group) pair that has one. */
  async listLatestInstructorPlans(): Promise<InstructorPlanRow[]> {
    const rows = await this.txHost.tx.paymentPlan.findMany({
      where: { payeeType: 'instructor' },
      orderBy: [{ instructorId: 'asc' }, { groupId: 'asc' }, { version: 'desc' }],
      distinct: ['instructorId', 'groupId'],
      select: { instructorId: true, groupId: true, sessionsPerCycle: true, amount: true },
    });
    return rows.flatMap((row) =>
      row.instructorId && row.groupId
        ? [
            {
              instructorId: row.instructorId,
              groupId: row.groupId,
              sessionsPerCycle: row.sessionsPerCycle,
              amount: row.amount,
            },
          ]
        : [],
    );
  }

  /**
   * Scheduled sessions from `now` up to `end` (excluded). A Cancelled or Held session is never
   * here: only a Scheduled one can still complete a cycle. Past the end nothing matters, since a
   * cycle that completes there is outside the period.
   */
  listFutureScheduledSessions(now: Date, end: Date): Promise<FutureSessionRow[]> {
    return this.txHost.tx.session.findMany({
      where: { status: 'scheduled', scheduledAt: { gte: now, lt: end } },
      select: { groupId: true, instructorId: true, scheduledAt: true },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Every session of any state whose scheduled_at is in [start, end): only the fields the statistics read. */
  listSessionsBetween(start: Date, end: Date): Promise<StatSession[]> {
    return this.txHost.tx.session.findMany({
      where: { scheduledAt: { gte: start, lt: end } },
      select: { status: true, scheduledAt: true, actualStartedAt: true, actualEndedAt: true },
    });
  }

  /** The attendance rows of the held sessions scheduled in [start, end): how many, and how many present. */
  async countAttendanceOfHeld(start: Date, end: Date): Promise<{ present: number; total: number }> {
    const groups = await this.txHost.tx.attendance.groupBy({
      by: ['status'],
      where: { session: { status: 'held', scheduledAt: { gte: start, lt: end } } },
      _count: { _all: true },
    });
    let present = 0;
    let total = 0;
    for (const group of groups) {
      total += group._count._all;
      if (group.status === 'present') present = group._count._all;
    }
    return { present, total };
  }
}
