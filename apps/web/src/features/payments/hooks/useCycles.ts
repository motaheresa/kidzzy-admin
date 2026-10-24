import { useApiQuery } from '@/lib/query';
import { listCycles } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';
import type { CycleListParams } from '../types';

/** The cycles that match the filters. The card shows its own error. */
export function useCycles(params: CycleListParams) {
  return useApiQuery({
    queryKey: paymentKeys.cycleList(params),
    queryFn: ({ signal }) => listCycles(params, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}
