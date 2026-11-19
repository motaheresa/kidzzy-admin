import { PageHeader } from '@/components/ui';
import { EvaluationSettingsScreen } from '@/features/evaluations';

/** /settings/evaluations: the evaluation rule and the pending requests (US-42, the admin). */
export function EvaluationSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="التقييمات"
        description="تقييم إجباري للطالب لما دورته تخلص، والطلبات اللي لسه مستنية"
      />
      <EvaluationSettingsScreen />
    </div>
  );
}
