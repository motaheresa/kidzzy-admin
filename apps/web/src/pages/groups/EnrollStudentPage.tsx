import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui';
import { EnrollStudentForm } from '@/features/enrollments';

/** /groups/:id/enroll: enroll a student in the group with a payment plan. Composition only. */
export function EnrollStudentPage() {
  const { id = '' } = useParams();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="تسجيل طالب في الجروب"
        description="الدورة والخطة بتمشي مع الطالب، حتى لو اتنقل لجروب تاني."
      />
      <EnrollStudentForm key={id} groupId={id} />
    </div>
  );
}
