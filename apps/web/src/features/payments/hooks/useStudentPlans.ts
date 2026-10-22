import { useApiQuery } from '@/lib/query';
import { listStudentPlans } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';

/** The versions of a student's plan. The card shows its own error. */
export function useStudentPlans(studentId: string) {
  return useApiQuery({
    queryKey: paymentKeys.studentPlans(studentId),
    queryFn: ({ signal }) => listStudentPlans(studentId, signal),
    meta: { errorHandling: 'local' },
  });
}
