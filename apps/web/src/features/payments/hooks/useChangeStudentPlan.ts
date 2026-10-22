import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { changeStudentPlan } from '../api/payments.api';
import { paymentKeys } from '../api/payments.keys';
import type { PaymentPlan, PlanInput } from '../types';

/**
 * Changing a student's plan. The form shows the errors; on success the plan versions are stale
 * and the profile opens. The cycle in progress keeps its plan, so the student is not refetched.
 */
export function useChangeStudentPlan(studentId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<PaymentPlan, PlanInput>({
    mutationFn: (input) => changeStudentPlan(studentId, input),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentKeys.studentPlans(studentId) });
      toast.success('اتحفظت الخطة الجديدة، وهتشتغل من الدورة الجاية');
      await navigate(`/students/${studentId}`, { replace: true });
    },
  });
}
