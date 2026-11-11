import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
import { CYCLE_SELECT, type PaymentCycleRow } from '../payments/payment-cycle.repository';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { SESSION_SELECT, type SessionRow } from '../sessions/session.repository';

const HELD_SELECT = {
  id: true,
  instructorId: true,
  instructor: { select: { name: true } },
  scheduledAt: true,
  topic: true,
  actualStartedAt: true,
  actualEndedAt: true,
  group: { select: { id: true, name: true } },
} as const satisfies Prisma.SessionSelect;

export type HeldSessionRow = Prisma.SessionGetPayload<{ select: typeof HELD_SELECT }>;

/** Present and enrolled students of a session, from its attendance rows. */
export interface AttendanceCount {
  present: number;
  enrolled: number;
}

/**
 * The reads behind GET /dashboard (US-34). It only reads, so there is no transaction. Queries go
 * through `txHost.tx`, limited to the academy in TenantContext; there is no raw SQL here.
 * A range is `from` inclusive and `to` exclusive, like everywhere else.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly txHost: TransactionHost<TenantTransactionalAdapter>) {}

  /** Every session in the range, in time order, whatever its status. */
  listSessionsBetween(from: Date, to: Date): Promise<SessionRow[]> {
    return this.txHost.tx.session.findMany({
      where: { scheduledAt: { gte: from, lt: to } },
      select: SESSION_SELECT,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
  }

  countCancelledBetween(from: Date, to: Date): Promise<number> {
    return this.txHost.tx.session.count({
      where: { status: 'cancelled', scheduledAt: { gte: from, lt: to } },
    });
  }

  /** Sessions whose start has passed and that are still Scheduled: nobody marked them. */
  countUnmarked(now: Date): Promise<number> {
    return this.txHost.tx.session.count({
      where: { status: 'scheduled', scheduledAt: { lt: now } },
    });
  }

  /** The most recently marked Held sessions, newest first. */
  listRecentHeld(limit: number): Promise<HeldSessionRow[]> {
    return this.txHost.tx.session.findMany({
      where: { status: 'held' },
      select: HELD_SELECT,
      orderBy: [
        { statusChangedAt: { sort: 'desc', nulls: 'last' } },
        { scheduledAt: 'desc' },
        { id: 'asc' },
      ],
      take: limit,
    });
  }

  /** Attendance rows counted per session, in one query. */
  async countAttendance(sessionIds: readonly string[]): Promise<Map<string, AttendanceCount>> {
    const counts = new Map<string, AttendanceCount>();
    if (sessionIds.length === 0) return counts;
    const groups = await this.txHost.tx.attendance.groupBy({
      by: ['sessionId', 'status'],
      where: { sessionId: { in: [...sessionIds] } },
      _count: { _all: true },
    });
    for (const group of groups) {
      const entry = counts.get(group.sessionId) ?? { present: 0, enrolled: 0 };
      entry.enrolled += group._count._all;
      if (group.status === 'present') entry.present += group._count._all;
      counts.set(group.sessionId, entry);
    }
    return counts;
  }

  /** Due cycles of one payee type, the longest waiting first. */
  listDueCycles(payeeType: 'student' | 'instructor', limit: number): Promise<PaymentCycleRow[]> {
    return this.txHost.tx.paymentCycle.findMany({
      where: { status: 'due', payeeType },
      select: CYCLE_SELECT,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: limit,
    });
  }

  countDueCycles(payeeType: 'student' | 'instructor'): Promise<number> {
    return this.txHost.tx.paymentCycle.count({ where: { status: 'due', payeeType } });
  }
}
