import { useParams } from 'react-router';
import { InstructorDetails } from '@/features/instructors';
import { InstructorCycles, PlanHistory } from '@/features/payments';

/** /instructors/:id: one instructor, their payment plans and their cycles, per group. Composition only. */
export function InstructorPage() {
  const { id = '' } = useParams();
  return (
    <div key={id} className="flex flex-col gap-6">
      <InstructorDetails id={id} />
      <PlanHistory payee={{ type: 'instructor', id }} />
      <InstructorCycles instructorId={id} />
    </div>
  );
}
