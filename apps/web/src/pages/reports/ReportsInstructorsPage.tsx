import { PageHeader } from '@/components/ui';
import { InstructorsReportScreen } from '@/features/reports';

/** /reports/instructors: the instructors of the period (US-40). */
export function ReportsInstructorsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المدرسين"
        description="الحصص والمدفوعات والمتوقع لكل مدرس في الفترة المختارة"
      />
      <InstructorsReportScreen />
    </div>
  );
}
