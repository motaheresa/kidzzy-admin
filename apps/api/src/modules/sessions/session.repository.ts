import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { SessionStatus } from '@kidzzy/shared';
import type { PageWindow } from '../../common/pagination/page';
import { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import { stringToDate } from './dates';
import type { PlannedSession, SlotRule } from './occurrences';

/**
 * What GET /sessions can filter by. visibleToInstructorId keeps a session when that person is
 * the group's current instructor OR the instructor on the session.
 */
export interface SessionListFilter {
  from?: Date;
  to?: Date;
  groupId?: string;
  visibleToInstructorId?: string;
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

  /** True when this instructor is on at least one session of the group (they taught or will teach it). */
  async instructorHasSession(groupId: string, instructorId: string): Promise<boolean> {
    const found = await this.txHost.tx.session.findFirst({
      where: { groupId, instructorId },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * One page of sessions, earliest first. `from` is inclusive and `to` exclusive.
   * visibleToInstructorId keeps a row when they currently teach the group or they are the
   * instructor on that session, so a past session stays visible to whoever taught it.
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

  /**
   * Locks the group row until this transaction commits, so two Held marks of the same group
   * run one after the other. The order check and the next number then see the earlier write.
   * Raw SQL is not tenant-scoped, so academy_id is filtered here. Same shape as GroupRepository.lock.
   */
  async lockGroup(groupId: string): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM groups
      WHERE id = ${groupId}::uuid AND academy_id = ${this.tenant.requireAcademyId()}::uuid
      FOR UPDATE`;
  }

  /**
   * Sessions of this group that are still Scheduled and strictly earlier than `scheduledAt`.
   * An equal time does not count, so two sessions at the same instant do not block each other.
   */
  async countEarlierScheduled(groupId: string, scheduledAt: Date): Promise<number> {
    return this.txHost.tx.session.count({
      where: { groupId, status: 'scheduled', scheduledAt: { lt: scheduledAt } },
    });
  }

  /** Held sessions of this group whose time is strictly later. Equal times do not count. */
  async countLaterHeld(groupId: string, scheduledAt: Date): Promise<number> {
    return this.txHost.tx.session.count({
      where: { groupId, status: 'held', scheduledAt: { gt: scheduledAt } },
    });
  }

  /** The next number for the group: one more than the highest Held number, or 1 when none. */
  async nextSessionNumber(groupId: string): Promise<number> {
    const aggregate = await this.txHost.tx.session.aggregate({
      where: { groupId },
      _max: { sessionNumber: true },
    });
    return (aggregate._max.sessionNumber ?? 0) + 1;
  }

  /**
   * Marks the session Held with its number and who changed the status. Does not renumber any
   * other row. The academy mirror equals this academy, matching the check constraint.
   */
  async markHeld(
    id: string,
    sessionNumber: number,
    changedById: string,
    changedAt: Date,
  ): Promise<void> {
    await this.txHost.tx.session.update({
      where: { id },
      data: {
        status: 'held',
        sessionNumber,
        statusChangedById: changedById,
        statusChangedByAcademyId: this.tenant.requireAcademyId(),
        statusChangedAt: changedAt,
      },
    });
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
      ...(filter.visibleToInstructorId
        ? {
            OR: [
              { instructorId: filter.visibleToInstructorId },
              { group: { instructorId: filter.visibleToInstructorId } },
            ],
          }
        : {}),
    };
  }
}
