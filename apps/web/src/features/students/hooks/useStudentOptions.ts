import { useApiQuery } from '@/lib/query';
import { listStudentOptions } from '../api/students.api';
import { studentKeys } from '../api/students.keys';

/**
 * The active students matching a search, for a picker (enrolling a student in a group). Other
 * features reach it through the feature's index. The previous result stays while the next
 * search loads; the form shows its own error.
 */
export function useStudentOptions(search: string) {
  return useApiQuery({
    queryKey: studentKeys.options(search),
    queryFn: ({ signal }) => listStudentOptions(search, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}
