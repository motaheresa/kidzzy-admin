import { useApiQuery } from '@/lib/query';
import { getDashboard } from '../api/dashboard.api';
import { dashboardKeys } from '../api/dashboard.keys';

/** The admin dashboard. The screen shows its own error, with a retry. */
export function useDashboard() {
  return useApiQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: ({ signal }) => getDashboard(signal),
    meta: { errorHandling: 'local' },
  });
}
