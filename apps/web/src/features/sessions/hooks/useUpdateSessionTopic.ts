import { useApiMutation, useQueryClient } from '@/lib/query';
import { updateSessionTopic } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/** Corrects the topic of a Held session. The screen shows the error (a bad topic is a field error). */
export function useUpdateSessionTopic(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (topic: string) => updateSessionTopic(id, topic),
    meta: { errorHandling: 'local' },
    onSuccess: (session) => applySessionChange(queryClient, session),
  });
}
