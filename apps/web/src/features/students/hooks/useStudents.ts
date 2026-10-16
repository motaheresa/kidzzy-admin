import { useApiQuery } from '@/lib/query';
import { getStudent, listStudents } from '../api/students.api';
import { studentKeys } from '../api/students.keys';
import type { StudentListParams } from '../types';

/**
 * One page of students. The previous page stays on screen while the next one loads
 * (placeholderData). The list shows its own error.
 */
export function useStudents(params: StudentListParams) {
  return useApiQuery({
    queryKey: studentKeys.list(params),
    queryFn: ({ signal }) => listStudents(params, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}

/** One student. The screen shows its own error (404 and 403 included). */
export function useStudent(id: string) {
  return useApiQuery({
    queryKey: studentKeys.detail(id),
    queryFn: ({ signal }) => getStudent(id, signal),
    meta: { errorHandling: 'local' },
  });
}
