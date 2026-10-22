import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { SessionStatus } from '@kidzzy/shared';
import type { PageWindow } from '../../common/pagination/page';
import { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import { stringToDate } from './dates';
import type { PlannedSession, SlotRule } from './occurrences';

/** What GET /sessions can filter by. instructorId is the group's current instructor. */
export interface SessionListFilter {
  from?: Date;
  to?: Date;
  groupId?: string;
  instructorId?: string;
  status?: SessionStatus;
}

const SESSION_SELECT = {
  id: true,
  instructorId: true,
  scheduledAt: true,
  durationMin: true,
  status: true,
  sessionNumber: true,
  isMakeup: true,
  compensatesSessionId: true,
  cancelReason: true,
  group: { select: { id: true, name: true, instructorId: true } },
} as const satisfies Prisma.SessionSelect;

export type SessionRow = Prisma.SessionGetPayload<{ select: typeof SESSION_SELECT }>;

/** An active group with its active slots: what generation needs. */
export interface GroupToGenerate {
  id: string;
  instructorId: string;
  /** Academy-local YYYY-MM-DD */
  startDate: string;
  slots: SlotRule[];
}

/**
 * Reads and writes sessions (US-11). Queries go through `txHost.tx` (the open transaction or
 * `prisma.db`), limited to the academy in TenantContext.
 */
@Injectable()
export class SessionRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * The ACTIVE groups (one, or all of the academy) with their slots. An inactive group never
   * generates (AC). A read of the group aggregate for generation, like findGroupRefs.
   */
  async findGroupsToGenerate(groupId?: string): Promise<GroupToGenerate[]> {
    const groups = await this.txHost.tx.group.findMany({
      where: { isActive: true, ...(groupId ? { id: groupId } : {}) },
      select: {
        id: true,
        instructorId: true,
        startDate: true,
        slots: {
          // A retired slot is history: it no longer generates (US-10).
          where: { retiredAt: null },
          select: { id: true, weekday: true, startTime: true, durationMin: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    return groups.map((group) => ({
      id: group.id,
      instructorId: group.instructorId,
      startDate: group.startDate.toISOString().slice(0, 10),
      slots: group.slots.map((slot) => ({
        id: slot.id,
        weekday: slot.weekday,
        startTime: slot.startTime.toISOString().slice(11, 16),
        durationMin: slot.durationMin,
      })),
    }));
  }

  /**
   * Deletes the GENERATED sessions that are still ahead and still Scheduled, of the given slots
   * (or of every slot of a group). Held and Cancelled sessions, past sessions and make-ups
   * (no slot) are never touched (AC of US-10). Returns how many were deleted.
   */
  async deleteFutureScheduled(
    scope: { slotIds: readonly string[] } | { groupId: string },
    now: Date,
  ): Promise<number> {
    // Generated sessions have a slot; a make-up (null slot) is added by hand and stays.
    const target =
      'slotIds' in scope
        ? { slotId: { in: [...scope.slotIds] } }
        : { groupId: scope.groupId, slotId: { not: null } };
    const { count } = await this.txHost.tx.session.deleteMany({
      where: { ...target, status: 'scheduled', scheduledAt: { gt: now } },
    });
    return count;
  }

  /** Which of these slots still have sessions (so they can only be retired, not deleted). */
  async findSlotsInUse(slotIds: readonly string[]): Promise<string[]> {
    if (slotIds.length === 0) return [];
    const rows = await this.txHost.tx.session.findMany({
      where: { slotId: { in: [...slotIds] } },
      select: { slotId: true },
      distinct: ['slotId'],
    });
    return rows.flatMap((row) => (row.slotId ? [row.slotId] : []));
  }

  /**
   * A new instructor for the sessions still ahead and Scheduled. Sessions that were held or
   * cancelled keep the instructor they had (the history is right), and so do past ones.
   */
  async reassignFutureScheduled(groupId: string, instructorId: string, now: Date): Promise<number> {
    const { count } = await this.txHost.tx.session.updateMany({
      where: { groupId, status: 'scheduled', scheduledAt: { gt: now } },
      data: { instructorId },
    });
    return count;
  }

  /**
   * Inserts the planned Scheduled sessions of a group, skipping the ones that already exist:
   * createMany with skipDuplicates is INSERT ... ON CONFLICT DO NOTHING against the unique index
   * (slot_id, occurrence_date). So running twice, or two runs at once, never duplicates a day,
   * and a session that was rescheduled (same occurrence_date, new time) is not generated again.
   * Returns how many were really created.
   */
  async createPlanned(
    group: { id: string; instructorId: string },
    planned: readonly PlannedSession[],
  ): Promise<number> {
    if (planned.length === 0) return 0;
    const academyId = this.tenant.requireAcademyId();
    const { count } = await this.txHost.tx.session.createMany({
      data: planned.map((session) => ({
        academyId,
        groupId: group.id,
        instructorId: group.instructorId, // copied: a later change of instructor keeps history
        slotId: session.slotId,
        slotAcademyId: academyId,
        occurrenceDate: stringToDate(session.occurrenceDate),
        scheduledAt: session.scheduledAt,
        durationMin: session.durationMin,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  /** The group's current instructor, or null when this academy has no such group. */
  async findGroup(groupId: string): Promise<{ instructorId: string } | null> {
    return this.txHost.tx.group.findUnique({
      where: { id: groupId },
      select: { instructorId: true },
    });
  }

  /**
   * One page of sessions, earliest first. `from` is inclusive and `to` exclusive.
   * instructorId filters by the group the caller currently teaches, not the copied
   * sessions.instructor_id (a later change of instructor must not hide the session).
   */
  async list(
    filter: SessionListFilter,
    window: PageWindow,
  ): Promise<{ rows: SessionRow[]; total: number }> {
    const where = this.where(filter);
    const [rows, total] = await Promise.all([
      this.txHost.tx.session.findMany({
        where,
        select: SESSION_SELECT,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.txHost.tx.session.count({ where }),
    ]);
    return { rows, total };
  }

  /** One session, or null when this academy has none with that id. */
  async findById(id: string): Promise<SessionRow | null> {
    return this.txHost.tx.session.findUnique({ where: { id }, select: SESSION_SELECT });
  }

  private where(filter: SessionListFilter): Prisma.SessionWhereInput {
    return {
      ...(filter.from || filter.to
        ? {
            scheduledAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.instructorId ? { group: { instructorId: filter.instructorId } } : {}),
    };
  }
}
