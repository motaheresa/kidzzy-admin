import type { HeldRequest, Session } from '@kidzzy/shared';
import { authKeys } from '@/features/auth';
import { refreshSession } from '@/lib/http';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { markSessionHeld } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/** Marks one session Held. The screen shows the error. See applySessionChange for the refresh. */
export function useMarkHeld(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: HeldRequest) => markSessionHeld(id, body),
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
        topic: result.topic,
        actualStartedAt: result.actualStartedAt,
        actualEndedAt: result.actualEndedAt,
        actualDurationMin: result.actualDurationMin,
      };
      applySessionChange(queryClient, session);
      // A student cycle that became Due may ask this user for an evaluation (US-42): refresh the
      // session at once so the token and /auth/me say so, instead of waiting up to 15 minutes.
      if (result.cyclesUpdated.some((c) => c.payeeType === 'student' && c.status === 'due')) {
        void refreshSession().then(() =>
          queryClient.invalidateQueries({ queryKey: authKeys.me() }),
        );
      }
    },
  });
}
