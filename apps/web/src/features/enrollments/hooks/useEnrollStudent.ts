import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { groupKeys } from '@/features/groups';
import { studentKeys } from '@/features/students';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { enrollStudent } from '../api/enrollments.api';
import { enrollmentKeys } from '../api/enrollments.keys';
import type { Enrollment, EnrollRequest } from '../types';

/**
 * Enrolling a student. The form shows the errors; on success the group's students, the group
 * (its student count) and the student (current group and cycle) are stale, and the group opens.
 */
export function useEnrollStudent(groupId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<Enrollment, EnrollRequest>({
    mutationFn: (input) => enrollStudent(groupId, input),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: enrollmentKeys.group(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
      ]);
      toast.success('اتسجل الطالب في الجروب');
      await navigate(`/groups/${groupId}`, { replace: true });
    },
  });
}
