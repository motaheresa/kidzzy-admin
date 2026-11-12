import { PageHeader } from '@/components/ui';
import { SessionsReportScreen } from '@/features/reports';

/** /reports/sessions: the sessions of the period (US-39). */
export function ReportsSessionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الحصص"
        description="اللي اتعمل واللي اتلغى واللي لسه ومحدش سجله في الفترة المختارة"
      />
      <SessionsReportScreen />
    </div>
  );
}
