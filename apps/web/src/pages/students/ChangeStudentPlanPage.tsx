import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui';
import { PlanForm } from '@/features/payments';

/** /students/:id/plan: change a student's payment plan. Composition only. */
export function ChangeStudentPlanPage() {
  const { id = '' } = useParams();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="تغيير خطة الدفع" description="الخطة الجديدة بتشتغل من الدورة الجاية بس." />
      <PlanForm key={id} payee={{ type: 'student', id }} />
    </div>
  );
}
