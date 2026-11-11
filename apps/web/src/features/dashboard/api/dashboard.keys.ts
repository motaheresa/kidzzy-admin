import { DASHBOARD_QUERY_ROOT } from '@/lib/query';

// Query keys of the dashboard feature, built in one place so a key is never retyped by hand.
// The root is shared with lib/query, which refreshes it after every successful mutation.
export const dashboardKeys = {
  all: DASHBOARD_QUERY_ROOT,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
};
