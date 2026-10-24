import { Injectable } from '@nestjs/common';
import { AccessContext } from '../auth/access-context';
import { AuditRepository, type AuditEntry } from './audit.repository';

/**
 * What a service calls to leave a trace of a change that matters (NFR-06). The actor is the
 * signed-in user, so a caller cannot write an entry in someone else's name. Call it inside the
 * same @Transactional() method as the change.
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
}
