import { useParams } from 'react-router';
import { StudentGroupHistory } from '@/features/enrollments';
import { PlanHistory } from '@/features/payments';
import { StudentProfile } from '@/features/students';

/** /students/:id: one student's profile, plan versions and the groups they were in. Composition only. */
export function StudentPage() {
  const { id = '' } = useParams();
  return (
    <div key={id} className="flex flex-col gap-6">
      <StudentProfile id={id} />
      <PlanHistory studentId={id} />
      <StudentGroupHistory studentId={id} />
    </div>
  );
}
