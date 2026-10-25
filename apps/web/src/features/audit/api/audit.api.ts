import { http } from '@/lib/http';
import type { AuditListParams, AuditLog, Page } from '../types';

// The audit log endpoint (openapi.yaml, tag Admin). Components never call it; the hook does.

export const AUDIT_PAGE_SIZE = 20;

/** GET /audit-logs: one page, newest first, with the filters that are set. */
export function listAuditLogs(
  params: AuditListParams,
  signal?: AbortSignal,
): Promise<Page<AuditLog>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize ?? AUDIT_PAGE_SIZE),
  });
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.entityId) query.set('entityId', params.entityId);
  if (params.actorId) query.set('actorId', params.actorId);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return http.get<Page<AuditLog>>('/audit-logs?' + query.toString(), { signal });
}
