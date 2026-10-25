import type { AuditLog } from '@kidzzy/shared';
import type { AuditLogRow } from './audit.repository';

/** openapi.yaml: AuditLog. Built field by field. */
export function toAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    actor: { id: row.actor.id, name: row.actor.name },
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: asObject(row.before),
    after: asObject(row.after),
    createdAt: row.createdAt.toISOString(),
  };
}

/** The JSON column holds objects (or nothing); anything else would be a bug in the writer. */
function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
