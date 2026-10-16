import { useParams } from 'react-router';
import { InstructorDetails } from '@/features/instructors';

/** /instructors/:id: one instructor. Composition only. */
export function InstructorPage() {
  const { id = '' } = useParams();
  return <InstructorDetails key={id} id={id} />;
}
