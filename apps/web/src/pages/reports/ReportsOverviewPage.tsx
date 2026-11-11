import { PageHeader } from '@/components/ui';
import { OverviewScreen } from '@/features/reports';

/** /reports: the value of one full cycle round (US-38). */
export function ReportsOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="نظرة عامة" description="قيمة دورة كاملة من الدفعات والمصروفات" />
      <OverviewScreen />
    </div>
  );
}
