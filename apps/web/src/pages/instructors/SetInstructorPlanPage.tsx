import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui';
import { PlanForm } from '@/features/payments';

/** /instructors/:id/plan: set or change an instructor's payment plan. Composition only. */
export function SetInstructorPlanPage() {
  const { id = '' } = useParams();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="خطة دفع المدرس"
        description="المدرس بياخد فلوسه عن كل جروب لوحده: اختار الجروب. اول خطة للجروب بتفتح الدورة رقم 1، والخطط بعدها بتشتغل من الدورة الجاية."
      />
      <PlanForm key={id} payee={{ type: 'instructor', id }} />
    </div>
  );
}
