import { useApiQuery } from '@/lib/query';
import { listPlans } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';
import type { Payee } from '../types';

/** The versions of a payee's plan. The card and the form show their own error. */
export function usePlans(payee: Payee) {
  return useApiQuery({
    queryKey: paymentKeys.payeePlans(payee),
    queryFn: ({ signal }) => listPlans(payee, signal),
    meta: { errorHandling: 'local' },
  });
}
