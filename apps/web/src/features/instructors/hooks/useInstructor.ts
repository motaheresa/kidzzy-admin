import { useApiQuery } from '@/lib/query';
import { getInstructor } from '../api/instructors.api';
import { instructorKeys } from '../api/instructors.keys';

/** One instructor with their groups. The screen shows its own error (404 included). */
export function useInstructor(id: string) {
  return useApiQuery({
    queryKey: instructorKeys.detail(id),
    queryFn: ({ signal }) => getInstructor(id, signal),
    meta: { errorHandling: 'local' },
  });
}
