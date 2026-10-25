import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
import type { PageWindow } from '../../common/pagination/page';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

/** What one audit entry holds. before and after are the fields that changed, as plain JSON. */
export interface AuditEntry {
  actorId: string;
  /** What happened, for example session.held_undone. */
  action: string;
  /** The kind of record it happened to, for example sessions. */
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/** What GET /audit-logs can filter by. `from` is inclusive and `to` exclusive. */
export interface AuditLogFilter {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
}

const AUDIT_LOG_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  before: true,
  after: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} as const satisfies Prisma.AuditLogSelect;

export type AuditLogRow = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_LOG_SELECT }>;

/**
 * Writes and reads the audit log (NFR-06, US-35). It only inserts and reads: there is no update
 * and no delete method, so an entry is never edited or deleted.
 * It goes through `txHost.tx`, so inside a @Transactional() service method the entry is part of
 * the same transaction as the change it describes: if the change rolls back, so does the entry.
 */
@Injectable()
export class AuditRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.txHost.tx.auditLog.create({
      data: {
        academyId: this.tenant.requireAcademyId(),
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
      },
    });
  }

  /** One page of entries, the newest first, with who made each change. */
  async list(
    filter: AuditLogFilter,
    window: PageWindow,
  ): Promise<{ rows: AuditLogRow[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.txHost.tx.auditLog.findMany({
        where,
        select: AUDIT_LOG_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.txHost.tx.auditLog.count({ where }),
    ]);
    return { rows, total };
  }
}
