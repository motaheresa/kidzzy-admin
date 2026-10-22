import { useParams } from 'react-router';
import { GroupStudents } from '@/features/enrollments';
import { GroupDetails } from '@/features/groups';
import { GroupSessions } from '@/features/sessions';

/** /groups/:id: one group, its current students and its sessions. Composition only. */
export function GroupPage() {
  const { id = '' } = useParams();
  return (
    <div key={id} className="flex flex-col gap-6">
      <GroupDetails id={id} />
      <GroupStudents groupId={id} />
      <GroupSessions groupId={id} />
    </div>
  );
}
