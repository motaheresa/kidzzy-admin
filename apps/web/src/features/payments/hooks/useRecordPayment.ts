import { toast } from 'sonner';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { recordPayment } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';
import type { Payment, PaymentCreate } from '../types';

/**
 * Recording the payment of one Due cycle. The dialog shows the errors. The cycles are stale after
 * it settles, and also after a refusal about the cycle's state (it was paid meanwhile, or is not
 * Due), so the screen shows what the cycle really is now.
 */
export function useRecordPayment(cycleId: string, onRecorded?: () => void) {
  const queryClient = useQueryClient();
  // The cycles change, and so does the payment history.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: paymentKeys.cycles() }),
      queryClient.invalidateQueries({ queryKey: paymentKeys.history() }),
    ]);
  return useApiMutation<Payment, PaymentCreate>({
    mutationFn: (input) => recordPayment(cycleId, input),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      onRecorded?.();
      toast.success('اتسجلت الدفعة');
    },
    onError: (error) => {
      if (error.code === 'CYCLE_ALREADY_PAID' || error.code === 'CYCLE_NOT_DUE') {
        void refresh();
        onRecorded?.();
      }
    },
  });
}
