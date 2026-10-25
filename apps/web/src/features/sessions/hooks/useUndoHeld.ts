import { paymentKeys } from '@/features/payments';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { undoSessionHeld } from '../api/sessions.api';
import { applySessionChange } from './applySessionChange';

/**
 * Returns one Held session to Scheduled (US-17). The dialog shows the refusal. On success the
 * session takes its new status at once (see applySessionChange), and the payment cycles are read
 * again, because the session left the ones that counted it.
 */
export function useUndoHeld(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => undoSessionHeld(id),
    meta: { errorHandling: 'local' },
    onSuccess: (session) => {
      applySessionChange(queryClient, session);
      void queryClient.invalidateQueries({ queryKey: paymentKeys.cycles() });
    },
  });
}
