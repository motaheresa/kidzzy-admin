import { PageHeader } from '@/components/ui';
import { FinanceScreen } from '@/features/reports';

/** /reports/finance: the money of the period (US-38). */
export function ReportsFinancePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="الفلوس" description="الفعلي والمتوقع والمستحق في الفترة المختارة" />
      <FinanceScreen />
    </div>
  );
}
