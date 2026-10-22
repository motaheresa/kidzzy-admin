import { useApiQuery } from '@/lib/query';
import { listStudentEnrollments } from '../api/enrollments.api';
import { enrollmentKeys } from '../api/enrollments.keys';

/** A student's group history, the latest first. The card shows its own error. */
export function useStudentEnrollments(studentId: string) {
  return useApiQuery({
    queryKey: enrollmentKeys.student(studentId),
    queryFn: ({ signal }) => listStudentEnrollments(studentId, signal),
    meta: { errorHandling: 'local' },
  });
}
