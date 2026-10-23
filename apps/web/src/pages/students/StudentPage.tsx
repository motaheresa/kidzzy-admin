import { useParams } from 'react-router';
import { StudentAttendanceList } from '@/features/attendance';
import { StudentGroupHistory } from '@/features/enrollments';
import { PlanHistory } from '@/features/payments';
import { StudentProfile } from '@/features/students';

/** /students/:id: one student's profile, plan versions, the groups they were in and their attendance. Composition only. */
export function StudentPage() {
  const { id = '' } = useParams();
  return (
    <div key={id} className="flex flex-col gap-6">
      <StudentProfile id={id} />
      <PlanHistory payee={{ type: 'student', id }} />
      <StudentGroupHistory studentId={id} />
      <StudentAttendanceList studentId={id} />
    </div>
  );
}
