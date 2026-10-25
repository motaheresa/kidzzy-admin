import { useApiMutation, useQueryClient } from '@/lib/query';
import { sessionKeys } from '../api/sessions.keys';
import { createSession, type SessionCreateInput } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/**
 * Adds a make-up or extra session to a group. The dialog shows the error. The session lists
 * (the group's, today's and "needs marking") and the group are refreshed like after any change.
 */
export function useCreateSession(groupId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (input: SessionCreateInput) => createSession(groupId, input),
    meta: { errorHandling: 'local' },
    onSuccess: (session) => applySessionChange(queryClient, session),
    // A refusal about the link means the lists the dialog offers are stale.
    onError: () => void queryClient.invalidateQueries({ queryKey: sessionKeys.lists() }),
  });
}
