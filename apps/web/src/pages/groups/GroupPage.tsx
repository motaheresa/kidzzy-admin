import { useParams } from 'react-router';
import { GroupStudents } from '@/features/enrollments';
import { GroupDetails } from '@/features/groups';

/** /groups/:id: one group and its current students. Composition only. */
export function GroupPage() {
  const { id = '' } = useParams();
  return (
    <div key={id} className="flex flex-col gap-6">
      <GroupDetails id={id} />
      <GroupStudents groupId={id} />
    </div>
  );
}
