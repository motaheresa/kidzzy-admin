import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApiMutation, useQueryClient, type QueryClient } from '@/lib/query';
import { createInstructor, setInstructorActive, updateInstructor } from '../api/instructors.api';
import { instructorKeys } from '../api/instructors.keys';
import type { Instructor, InstructorCreate, InstructorDetail, InstructorUpdate } from '../types';

/** After a change: every list page is stale, and the detail takes the new values at once. */
function applyChange(queryClient: QueryClient, instructor: Instructor) {
  queryClient.setQueryData<InstructorDetail>(instructorKeys.detail(instructor.id), (detail) =>
    detail ? { ...detail, ...instructor } : detail,
  );
  return queryClient.invalidateQueries({ queryKey: instructorKeys.lists() });
}

/** Creating an account. The form shows the errors; on success the new instructor opens. */
export function useCreateInstructor() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<Instructor, InstructorCreate>({
    mutationFn: createInstructor,
    meta: { errorHandling: 'local' },
    onSuccess: async (instructor) => {
      await applyChange(queryClient, instructor);
      toast.success('اتضاف المدرس');
      await navigate(`/instructors/${instructor.id}`, { replace: true });
    },
  });
}

/** Editing name, email or phone. The form shows the errors; on success the detail opens. */
export function useUpdateInstructor(id: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<Instructor, InstructorUpdate>({
    mutationFn: (input) => updateInstructor(id, input),
    meta: { errorHandling: 'local' },
    onSuccess: async (instructor) => {
      await applyChange(queryClient, instructor);
      toast.success('اتحفظت البيانات');
      await navigate(`/instructors/${id}`, { replace: true });
    },
  });
}

/** Deactivating (false) or reactivating (true). An error is toasted by the global reporter. */
export function useSetInstructorActive(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<Instructor, boolean>({
    mutationFn: (active) => setInstructorActive(id, active),
    onSuccess: async (instructor) => {
      await applyChange(queryClient, instructor);
      toast.success(instructor.isActive ? 'المدرس رجع شغال' : 'المدرس اتوقف');
    },
  });
}
