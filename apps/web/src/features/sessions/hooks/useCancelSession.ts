import { useApiMutation, useQueryClient } from '@/lib/query';
import { cancelSession } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/** Cancels one session with a reason. The screen shows the error (a bad reason is a field error). */
export function useCancelSession(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (reason: string) => cancelSession(id, reason),
    meta: { errorHandling: 'local' },
    onSuccess: (session) => applySessionChange(queryClient, session),
  });
}
