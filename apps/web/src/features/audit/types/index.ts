import type { AuditLog, Page } from '@kidzzy/shared';

/** The API's audit entry shape (openapi.yaml: AuditLog). */
export type { AuditLog, Page };

/**
 * What GET /audit-logs is asked for. from and to are UTC instants (from inclusive, to exclusive),
 * made from the academy-local days the screen keeps in the URL.
 */
export interface AuditListParams {
  page: number;
  pageSize?: number;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
}
