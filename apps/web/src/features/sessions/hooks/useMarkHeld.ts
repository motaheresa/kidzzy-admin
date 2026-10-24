import type { Session } from '@kidzzy/shared';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { markSessionHeld } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/** Marks one session Held. The screen shows the error. See applySessionChange for the refresh. */
export function useMarkHeld(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => markSessionHeld(id),
    meta: { errorHandling: 'local' },
    onSuccess: (result) => {
      const session: Session = {
        id: result.id,
        group: result.group,
        instructorId: result.instructorId,
        instructorName: result.instructorName,
        scheduledAt: result.scheduledAt,
        durationMin: result.durationMin,
        status: result.status,
        sessionNumber: result.sessionNumber,
        isMakeup: result.isMakeup,
        compensatesSessionId: result.compensatesSessionId,
        cancelReason: result.cancelReason,
      };
      applySessionChange(queryClient, session);
    },
  });
}
