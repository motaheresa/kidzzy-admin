import { useApiQuery } from '@/lib/query';
import { listActiveInstructors } from '../api/instructors.api';
import { instructorKeys } from '../api/instructors.keys';

/**
 * The active instructors, for a choice list (the instructor of a group). Other features reach
 * it through the feature's index. The form shows its own loading and error state.
 */
export function useInstructorOptions() {
  return useApiQuery({
    queryKey: instructorKeys.options(),
    queryFn: ({ signal }) => listActiveInstructors(signal),
    meta: { errorHandling: 'local' },
  });
}
