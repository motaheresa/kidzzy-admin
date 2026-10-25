import type { AuditListParams } from '../types';

// Query keys of the audit feature, built in one place so a key is never retyped by hand.
export const auditKeys = {
  all: ['audit'] as const,
  lists: () => [...auditKeys.all, 'list'] as const,
  list: (params: AuditListParams) => [...auditKeys.lists(), params] as const,
};
