import { useParams } from 'react-router';
import { SessionDetails } from '@/features/sessions';

/** /sessions/:id: one session. Composition only. */
export function SessionPage() {
  const { id = '' } = useParams();
  return <SessionDetails key={id} id={id} />;
}
