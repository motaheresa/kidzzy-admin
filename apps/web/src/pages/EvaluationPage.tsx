import { PageHeader } from '@/components/ui';
import { LogoutButton } from '@/features/auth';
import { EvaluationRequiredScreen } from '@/features/evaluations';

/**
 * /evaluation: the only screen while an evaluation must be written (US-42), so it also offers
 * logging out, like the change-password screen. Composition only.
 */
export function EvaluationPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="تقييم مطلوب"
        description="اكتب تقييم الطالب عشان تقدر تكمل شغلك على التطبيق"
        actions={<LogoutButton />}
      />
      <EvaluationRequiredScreen />
    </div>
  );
}
