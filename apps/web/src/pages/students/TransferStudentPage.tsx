import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui';
import { TransferStudentForm } from '@/features/enrollments';

/** /students/:id/transfer: move a student to another group. Composition only. */
export function TransferStudentPage() {
  const { id = '' } = useParams();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="نقل الطالب لجروب تاني"
        description="الدورة والخطة بتمشي مع الطالب، والسيشنات بتتحسب من تاريخ النقل."
      />
      <TransferStudentForm key={id} studentId={id} />
    </div>
  );
}
