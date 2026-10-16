import { useParams } from 'react-router';
import { StudentProfile } from '@/features/students';

/** /students/:id: one student's profile. Composition only. */
export function StudentPage() {
  const { id = '' } = useParams();
  return <StudentProfile key={id} id={id} />;
}
