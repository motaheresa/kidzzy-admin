import { useApiMutation, useQueryClient } from '@/lib/query';
import { rescheduleSession } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/**
 * Moves one Scheduled session to another instant. The dialog shows the error. The session lists
 * are refreshed like after any change, so the session follows the screens by its new time (it
 * leaves "needs marking" when moved ahead, and today's list when moved to another day).
 */
export function useRescheduleSession(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (scheduledAt: string) => rescheduleSession(id, scheduledAt),
    meta: { errorHandling: 'local' },
    onSuccess: (session) => applySessionChange(queryClient, session),
  });
}
