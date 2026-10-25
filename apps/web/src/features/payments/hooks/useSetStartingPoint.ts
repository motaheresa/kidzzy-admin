import { toast } from 'sonner';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { setStartingPoint } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';
import type { PaymentCycle } from '../types';

/**
 * Correcting the starting point of a first cycle (US-36). The dialog shows the errors. The cycles
 * are stale after it settles, and also after a refusal about the cycle's state (it is not a first
 * cycle in progress any more), so the screen shows what the cycle really is now.
 */
export function useSetStartingPoint(cycleId: string, onChanged?: () => void) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: paymentKeys.cycles() });
  return useApiMutation<PaymentCycle, number>({
    mutationFn: (openingCount) => setStartingPoint(cycleId, openingCount),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      onChanged?.();
      toast.success('اتغيرت نقطة البداية');
    },
    onError: (error) => {
      if (error.code === 'STARTING_POINT_LOCKED') {
        void refresh();
        onChanged?.();
      }
    },
  });
}
