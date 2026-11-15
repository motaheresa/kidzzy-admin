import { PageHeader } from '@/components/ui';
import { StudentsReportScreen } from '@/features/reports';

/** /reports/students: the students of the period (US-41). */
export function ReportsStudentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الطلاب"
        description="الحضور والغياب والتقييم والدورة لكل طالب في الفترة المختارة"
      />
      <StudentsReportScreen />
    </div>
  );
}
