import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

const LINK_SELECT = {
  id: true,
  title: true,
  url: true,
  sortOrder: true,
} as const satisfies Prisma.MaterialLinkSelect;

export type MaterialLinkRow = Prisma.MaterialLinkGetPayload<{ select: typeof LINK_SELECT }>;

/** Where a link goes in the list. */
export interface Placement {
  id: string;
  sortOrder: number;
}

/**
 * The academy's material links (US-32). The only class that queries them. Queries go through
 * `txHost.tx`, limited to the academy in TenantContext.
 */
@Injectable()
export class MaterialLinkRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Locks the academy row until the end of the transaction, so two writes to the list never
   * interleave (the limit, the next position and the order). Call it first in every
   * @Transactional() write. NO KEY UPDATE does not block inserts that only reference the academy.
   * Raw SQL: it filters by id itself.
   */
  async lockAcademy(): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM academies
      WHERE id = ${this.tenant.requireAcademyId()}::uuid
      FOR NO KEY UPDATE`;
  }

  list(): Promise<MaterialLinkRow[]> {
    return this.txHost.tx.materialLink.findMany({
      select: LINK_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** The links after a position, in order. */
  listAfter(sortOrder: number): Promise<MaterialLinkRow[]> {
    return this.txHost.tx.materialLink.findMany({
      where: { sortOrder: { gt: sortOrder } },
      select: LINK_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  }

  findById(id: string): Promise<MaterialLinkRow | null> {
    return this.txHost.tx.materialLink.findFirst({ where: { id }, select: LINK_SELECT });
  }

  count(): Promise<number> {
    return this.txHost.tx.materialLink.count();
  }

  /** The position of the last link, or 0 when there is none. */
  async lastPosition(): Promise<number> {
    const result = await this.txHost.tx.materialLink.aggregate({ _max: { sortOrder: true } });
    return result._max.sortOrder ?? 0;
  }

  create(input: { title: string; url: string; sortOrder: number }): Promise<MaterialLinkRow> {
    return this.txHost.tx.materialLink.create({
      data: { academyId: this.tenant.requireAcademyId(), ...input },
      select: LINK_SELECT,
    });
  }

  update(id: string, data: { title?: string; url?: string }): Promise<MaterialLinkRow> {
    return this.txHost.tx.materialLink.update({
      where: { id_academyId: { id, academyId: this.tenant.requireAcademyId() } },
      data,
      select: LINK_SELECT,
    });
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.materialLink.delete({
      where: { id_academyId: { id, academyId: this.tenant.requireAcademyId() } },
    });
  }

  /**
   * Moves links to new positions without two rows ever sharing one: the unique index on
   * (academy_id, sort_order) is checked row by row. First the moved links go to the negative of
   * their position, which frees every position they hold; then each takes its new one. Call it
   * inside a transaction, after lockAcademy, so nobody sees the step in between. The new
   * positions must be free or held by the moved links themselves.
   */
  async place(placements: Placement[]): Promise<void> {
    if (placements.length === 0) return;
    await this.txHost.tx.materialLink.updateMany({
      where: { id: { in: placements.map((placement) => placement.id) } },
      data: { sortOrder: { multiply: -1 } },
    });
    const academyId = this.tenant.requireAcademyId();
    for (const { id, sortOrder } of placements) {
      await this.txHost.tx.materialLink.update({
        where: { id_academyId: { id, academyId } },
        data: { sortOrder },
      });
    }
  }
}
