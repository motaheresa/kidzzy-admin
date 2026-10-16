import { useApiQuery } from '@/lib/query';
import { listInstructors } from '../api/instructors.api';
import { instructorKeys } from '../api/instructors.keys';
import type { InstructorListParams } from '../types';

/**
 * One page of instructors. While the next page or a new search loads, the previous page stays
 * on screen (placeholderData), so the table does not flash empty. The list shows its own error.
 */
export function useInstructors(params: InstructorListParams) {
  return useApiQuery({
    queryKey: instructorKeys.list(params),
    queryFn: ({ signal }) => listInstructors(params, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}
