import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApiMutation, useQueryClient, type QueryClient } from '@/lib/query';
import { createStudent, deactivateStudent, updateStudent } from '../api/students.api';
import { studentKeys } from '../api/students.keys';
import type { Student, StudentCreate, StudentUpdate } from '../types';

/** After a change: the detail takes the new record at once, and every list page is stale. */
function applyChange(queryClient: QueryClient, student: Student) {
  queryClient.setQueryData(studentKeys.detail(student.id), student);
  return queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
}

/** Creating a record. The form shows the errors; on success the student opens. */
export function useCreateStudent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<Student, StudentCreate>({
    mutationFn: createStudent,
    meta: { errorHandling: 'local' },
    onSuccess: async (student) => {
      await applyChange(queryClient, student);
      toast.success('اتضاف الطالب');
      await navigate(`/students/${student.id}`, { replace: true });
    },
  });
}

/** Editing a record. The form shows the errors; on success the student opens. */
export function useUpdateStudent(id: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<Student, StudentUpdate>({
    mutationFn: (input) => updateStudent(id, input),
    meta: { errorHandling: 'local' },
    onSuccess: async (student) => {
      await applyChange(queryClient, student);
      toast.success('اتحفظت البيانات');
      await navigate(`/students/${id}`, { replace: true });
    },
  });
}

/** Deactivating. An error is toasted by the global reporter. */
export function useDeactivateStudent(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<Student, void>({
    mutationFn: () => deactivateStudent(id),
    onSuccess: async (student) => {
      await applyChange(queryClient, student);
      toast.success('الطالب اتوقف');
    },
  });
}
