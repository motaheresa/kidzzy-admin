import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
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

/**
 * Writes the audit log (NFR-06, US-35). It only inserts: an entry is never edited or deleted.
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
}
