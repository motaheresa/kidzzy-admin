import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import { stringToDate } from './dates';
import type { PlannedSession, SlotRule } from './occurrences';

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
        slots: { select: { id: true, weekday: true, startTime: true, durationMin: true } },
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
}
