import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { groupKeys } from '@/features/groups';
import { studentKeys } from '@/features/students';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { transferStudent } from '../api/enrollments.api';
import { enrollmentKeys } from '../api/enrollments.keys';
import type { Enrollment, TransferRequest } from '../types';

/**
 * Moving a student to another group. The form shows the errors; on success every enrollment list,
 * the groups (student counts) and the student (current group) are stale, and the profile opens.
 */
export function useTransferStudent(studentId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<Enrollment, TransferRequest>({
    mutationFn: (input) => transferStudent(studentId, input),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: enrollmentKeys.all }),
        queryClient.invalidateQueries({ queryKey: groupKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
      ]);
      toast.success('اتنقل الطالب للجروب الجديد');
      await navigate(`/students/${studentId}`, { replace: true });
    },
  });
}
