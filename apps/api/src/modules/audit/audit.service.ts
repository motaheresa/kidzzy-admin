import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type AuditLog, type Page } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import { toAuditLog } from './audit.mapper';
import { AuditRepository, type AuditEntry } from './audit.repository';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs.query';

/**
 * The audit log (NFR-06, US-35).
 *
 * Writing: what a service calls to leave a trace of a change that matters. The actor is the
 * signed-in user (AccessContext), never a value from a request body, so a caller cannot write an
 * entry in someone else's name. Call it inside the same @Transactional() method as the change,
 * so the entry and the change commit or roll back together.
 *
 * The log is append-only: neither this service nor the repository has an update or a delete,
 * and nothing in the app changes a row after it is written.
 *
 * Reading: the admin lists it, newest first (audit.read, scope any).
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly audit: AuditRepository,
    private readonly access: AccessContext,
  ) {}

  record(entry: Omit<AuditEntry, 'actorId'>): Promise<void> {
    return this.audit.record({ ...entry, actorId: this.access.userId });
  }

  async list(query: ListAuditLogsQueryDto): Promise<Page<AuditLog>> {
    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'from must be before to',
      );
    }
    const { rows, total } = await this.audit.list(
      {
        entityType: query.entityType,
        entityId: query.entityId,
        actorId: query.actorId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      pageWindow(query),
    );
    return toPage(rows.map(toAuditLog), query, total);
  }
}
