import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { savePlan } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';
import type { Payee, PaymentPlan, PlanSaveInput } from '../types';

/**
 * Saving a payee's plan. The form shows the errors; on success the plan versions are stale and
 * the payee's screen opens. The cycle in progress keeps its plan, so nothing else is refetched.
 */
export function useSavePlan(payee: Payee) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<PaymentPlan, PlanSaveInput>({
    mutationFn: (input) => savePlan(payee, input),
    meta: { errorHandling: 'local' },
    onSuccess: async (plan) => {
      await queryClient.invalidateQueries({ queryKey: paymentKeys.payeePlans(payee) });
      toast.success(
        plan.effectiveFromCycle === 1
          ? 'اتحفظت الخطة'
          : 'اتحفظت الخطة الجديدة، وهتشتغل من الدورة الجاية',
      );
      await navigate(`/${payee.type === 'student' ? 'students' : 'instructors'}/${payee.id}`, {
        replace: true,
      });
    },
  });
}
