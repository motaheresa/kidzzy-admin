import { useParams } from 'react-router';
import { StudentGroupHistory } from '@/features/enrollments';
import { StudentProfile } from '@/features/students';

/** /students/:id: one student's profile and the groups they were in. Composition only. */
export function StudentPage() {
  const { id = '' } = useParams();
  return (
    <div key={id} className="flex flex-col gap-6">
      <StudentProfile id={id} />
      <StudentGroupHistory studentId={id} />
    </div>
  );
}
