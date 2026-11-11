import { useApiMutation, useQueryClient } from '@/lib/query';
import { updateSessionTimes } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/**
 * Corrects when a Held session really started and ended (SCRUM-80). The dialog shows the errors:
 * a refused time is a field error on the end.
 */
export function useUpdateSessionTimes(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (times: { startedAt: string; endedAt: string }) => updateSessionTimes(id, times),
    meta: { errorHandling: 'local' },
    onSuccess: (session) => applySessionChange(queryClient, session),
  });
}
