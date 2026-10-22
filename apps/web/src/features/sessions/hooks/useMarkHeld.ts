import type { Session } from '@kidzzy/shared';
import { groupKeys } from '@/features/groups';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { markSessionHeld } from '../api/sessions.api';
import { sessionKeys } from '../api/sessions.keys';

/**
 * Marks one session Held. The screen shows the error. The detail takes the new session at once,
 * and the session lists plus the group (held count and next session) are refreshed.
 */
export function useMarkHeld(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => markSessionHeld(id),
    meta: { errorHandling: 'local' },
    onSuccess: async (result) => {
      const session: Session = {
        id: result.id,
        group: result.group,
        instructorId: result.instructorId,
        scheduledAt: result.scheduledAt,
        durationMin: result.durationMin,
        status: result.status,
        sessionNumber: result.sessionNumber,
        isMakeup: result.isMakeup,
        compensatesSessionId: result.compensatesSessionId,
        cancelReason: result.cancelReason,
      };
      queryClient.setQueryData(sessionKeys.detail(session.id), session);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: groupKeys.detail(session.group.id) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.lists() }),
      ]);
    },
  });
}
