import { useParams } from 'react-router';
import { GroupDetails } from '@/features/groups';

/** /groups/:id: one group. Composition only. */
export function GroupPage() {
  const { id = '' } = useParams();
  return <GroupDetails key={id} id={id} />;
}
