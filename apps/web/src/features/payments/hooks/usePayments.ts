import { useApiQuery } from '@/lib/query';
import { listPayments } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';
import type { PaymentListParams } from '../types';

/** The payment history that matches the filters. `enabled` skips the request (a bad range). */
export function usePayments(params: PaymentListParams, enabled = true) {
  return useApiQuery({
    queryKey: paymentKeys.historyList(params),
    queryFn: ({ signal }) => listPayments(params, signal),
    placeholderData: (previous) => previous,
    enabled,
    meta: { errorHandling: 'local' },
  });
}
