import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { ScheduleSlot } from '@kidzzy/shared';
import { normalizeSearchText } from '../../common/normalize/search-text';
import type { PageWindow } from '../../common/pagination/page';
import { escapeLike } from '../../common/search/escape-like';
import { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { Clock } from '../sessions/clock';
import { TenantContext } from '../tenancy/tenant-context';
import { stringToTime, timeToString } from './schedule';

/** A slot row for the schedule editor: retired ones are history, kept for matching. */
export interface SlotRecord extends ScheduleSlot {
  id: string;
  retired: boolean;
}

/** A group with its instructor's name and its weekly slots, as the mapper needs them. */
export interface GroupRow {
  id: string;
  name: string;
  level: string;
  startDate: Date;
  isActive: boolean;
  instructor: { id: string; name: string };
  slots: { weekday: number; startTime: Date; durationMin: number }[];
  /** Held sessions of the group. */
  _count: { sessions: number };
  /** At most one: the earliest Scheduled session still ahead. */
  sessions: { scheduledAt: Date }[];
}

export interface GroupFilter {
  search?: string;
  isActive?: boolean;
  instructorId?: string;
}

/** What a group row holds. `now` decides which Scheduled session is the next one. */
const groupSelect = (now: Date) =>
  ({
    id: true,
    name: true,
    level: true,
    startDate: true,
    isActive: true,
    instructor: { select: { id: true, name: true } },
    slots: {
      // A retired slot is history (US-10): it is not part of the schedule any more.
      where: { retiredAt: null },
      select: { weekday: true, startTime: true, durationMin: true },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    },
    _count: { select: { sessions: { where: { status: 'held' } } } },
    sessions: {
      where: { status: 'scheduled', scheduledAt: { gt: now } },
      select: { scheduledAt: true },
      orderBy: { scheduledAt: 'asc' },
      take: 1,
    },
  }) as const satisfies Prisma.GroupSelect;

/**
 * Reads and writes groups with their weekly slots (US-07). Queries go through `txHost.tx` (the
 * open transaction or `prisma.db`), limited to the academy in TenantContext. The list is raw
 * SQL, which is never scoped automatically: it filters academy_id itself.
 */
@Injectable()
export class GroupRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
    private readonly clock: Clock,
  ) {}

  /**
   * One page of groups, sorted by name, and the total that match. The search matches part of
   * the name or the level in their search form (escapeLike, so % and _ are literal). The SQL
   * only picks ids; rows are read through the scoped client.
   */
  async list(
    filter: GroupFilter,
    window: PageWindow,
  ): Promise<{ rows: GroupRow[]; total: number }> {
    const conditions = [Prisma.sql`g.academy_id = ${this.tenant.requireAcademyId()}::uuid`];
    if (filter.isActive !== undefined) {
      conditions.push(Prisma.sql`g.is_active = ${filter.isActive}`);
    }
    if (filter.instructorId) {
      conditions.push(Prisma.sql`g.instructor_id = ${filter.instructorId}::uuid`);
    }
    const search = filter.search ? normalizeSearchText(filter.search) : '';
    if (search) {
      conditions.push(Prisma.sql`g.search_text LIKE ${`%${escapeLike(search)}%`} ESCAPE '\\'`);
    }
    const where = Prisma.join(conditions, ' AND ');

    const [counted] = await this.txHost.tx.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM groups g WHERE ${where}`;
    const ids = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT g.id FROM groups g WHERE ${where}
      ORDER BY g.name, g.id
      LIMIT ${window.take} OFFSET ${window.skip}`;

    const rows = await this.txHost.tx.group.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      select: groupSelect(this.clock.now()),
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      rows: ids.flatMap(({ id }) => byId.get(id) ?? []),
      total: Number(counted?.total ?? 0),
    };
  }

  /** The group in the current academy, or null (unknown id or another academy). */
  findById(id: string): Promise<GroupRow | null> {
    return this.txHost.tx.group.findFirst({ where: { id }, select: groupSelect(this.clock.now()) });
  }

  /**
   * Locks the group row until the end of the transaction, so two edits of the same group (or an
   * edit and the daily generation) run one after the other and never interleave their session
   * changes. Call it first in a @Transactional() edit. Raw SQL: it filters academy_id itself.
   */
  async lock(id: string): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM groups
      WHERE id = ${id}::uuid AND academy_id = ${this.tenant.requireAcademyId()}::uuid
      FOR UPDATE`;
  }

  /**
   * Changes the details given; the search text follows the name and the level. Call findById
   * first (it proves the group is in this academy).
   */
  async update(
    id: string,
    changes: { name?: string; level?: string; instructorId?: string; isActive?: boolean },
  ): Promise<void> {
    const data: Prisma.GroupUncheckedUpdateInput = { ...changes };
    if (changes.name !== undefined || changes.level !== undefined) {
      const current = await this.txHost.tx.group.findFirstOrThrow({
        where: { id },
        select: { name: true, level: true },
      });
      data.searchText = normalizeSearchText(
        `${changes.name ?? current.name} ${changes.level ?? current.level}`,
      );
    }
    await this.txHost.tx.group.update({ where: { id }, data });
  }

  /** Every slot of the group, retired ones included: the schedule editor matches against all. */
  async findAllSlots(groupId: string): Promise<SlotRecord[]> {
    const slots = await this.txHost.tx.scheduleSlot.findMany({
      where: { groupId },
      select: { id: true, weekday: true, startTime: true, durationMin: true, retiredAt: true },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    return slots.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      startTime: timeToString(slot.startTime),
      durationMin: slot.durationMin,
      retired: slot.retiredAt !== null,
    }));
  }

  async addSlots(groupId: string, slots: readonly ScheduleSlot[]): Promise<void> {
    if (slots.length === 0) return;
    const academyId = this.tenant.requireAcademyId();
    await this.txHost.tx.scheduleSlot.createMany({
      data: slots.map((slot) => ({
        academyId,
        groupId,
        weekday: slot.weekday,
        startTime: stringToTime(slot.startTime),
        durationMin: slot.durationMin,
      })),
    });
  }

  /** A retired slot that comes back in the schedule is used again (no second row for it). */
  async reviveSlots(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.txHost.tx.scheduleSlot.updateMany({
      where: { id: { in: [...ids] } },
      data: { retiredAt: null },
    });
  }

  /** Slots that sessions still point at stop generating but stay as history. */
  async retireSlots(ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.txHost.tx.scheduleSlot.updateMany({
      where: { id: { in: [...ids] } },
      data: { retiredAt: at },
    });
  }

  /** Only for slots nothing points at (the database refuses otherwise). */
  async deleteSlots(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.txHost.tx.scheduleSlot.deleteMany({ where: { id: { in: [...ids] } } });
  }

  /**
   * Creates the group and its slots. Slots are created with createMany and an explicit
   * academyId (nested creates are not tenant-scoped by the extension).
   * The caller wraps it in @Transactional(): the group and its slots land together.
   */
  async create(input: {
    name: string;
    level: string;
    instructorId: string;
    startDate: string;
    slots: ScheduleSlot[];
  }): Promise<GroupRow> {
    const academyId = this.tenant.requireAcademyId();
    const group = await this.txHost.tx.group.create({
      data: {
        academyId,
        name: input.name,
        level: input.level,
        searchText: normalizeSearchText(`${input.name} ${input.level}`),
        instructorId: input.instructorId,
        startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      },
      select: { id: true },
    });
    await this.txHost.tx.scheduleSlot.createMany({
      data: input.slots.map((slot) => ({
        academyId,
        groupId: group.id,
        weekday: slot.weekday,
        startTime: stringToTime(slot.startTime),
        durationMin: slot.durationMin,
      })),
    });
    return this.txHost.tx.group.findFirstOrThrow({
      where: { id: group.id },
      select: groupSelect(this.clock.now()),
    });
  }
}
