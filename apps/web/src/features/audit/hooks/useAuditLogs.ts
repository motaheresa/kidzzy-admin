import { useApiQuery } from '@/lib/query';
import { listAuditLogs } from '../api/audit.api';
import { auditKeys } from '../api/audit.keys';
import type { AuditListParams } from '../types';

/** One page of the audit log. The screen shows its own error. `enabled` skips a bad date range. */
export function useAuditLogs(params: AuditListParams, enabled = true) {
  return useApiQuery({
    queryKey: auditKeys.list(params),
    queryFn: ({ signal }) => listAuditLogs(params, signal),
    placeholderData: (previous) => previous,
    enabled,
    meta: { errorHandling: 'local' },
  });
}
