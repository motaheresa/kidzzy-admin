import { useApiQuery } from '@/lib/query';
import { listGroupEnrollments } from '../api/enrollments.api';
import { enrollmentKeys } from '../api/enrollments.keys';

/** A group's current students. The card shows its own error. */
export function useGroupEnrollments(groupId: string) {
  return useApiQuery({
    queryKey: enrollmentKeys.group(groupId),
    queryFn: ({ signal }) => listGroupEnrollments(groupId, signal),
    meta: { errorHandling: 'local' },
  });
}
