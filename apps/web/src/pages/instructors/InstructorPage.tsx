import { useParams } from 'react-router';
import { InstructorDetails } from '@/features/instructors';
import { PlanHistory } from '@/features/payments';

/** /instructors/:id: one instructor and their payment plan. Composition only. */
export function InstructorPage() {
  const { id = '' } = useParams();
  return (
    <div key={id} className="flex flex-col gap-6">
      <InstructorDetails id={id} />
      <PlanHistory payee={{ type: 'instructor', id }} />
    </div>
  );
}
