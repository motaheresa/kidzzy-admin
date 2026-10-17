import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApiMutation, useQueryClient, type QueryClient } from '@/lib/query';
import { createGroup, replaceGroupSchedule, updateGroup } from '../api/groups.api';
import { groupKeys } from '../api/groups.keys';
import type { Group, GroupCreate, GroupUpdate, ScheduleSlot } from '../types';

/** After a change: the detail takes the new group at once, and every list page is stale. */
function applyChange(queryClient: QueryClient, group: Group) {
  queryClient.setQueryData(groupKeys.detail(group.id), group);
  return queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
}

/** Creating a group. The form shows the errors; on success the new group opens. */
export function useCreateGroup() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useApiMutation<Group, GroupCreate>({
    mutationFn: createGroup,
    meta: { errorHandling: 'local' },
    onSuccess: async (group) => {
      queryClient.setQueryData(groupKeys.detail(group.id), group);
      await queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
      toast.success('اتضاف الجروب');
      await navigate(`/groups/${group.id}`, { replace: true });
    },
  });
}

/** Editing the details. The form shows the errors; the user stays on the edit screen. */
export function useUpdateGroup(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<Group, GroupUpdate>({
    mutationFn: (input) => updateGroup(id, input),
    meta: { errorHandling: 'local' },
    onSuccess: async (group) => {
      await applyChange(queryClient, group);
      toast.success('اتحفظت البيانات');
    },
  });
}

/** Replacing the weekly schedule. The editor shows the errors; the user stays on the screen. */
export function useReplaceSchedule(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<Group, ScheduleSlot[]>({
    mutationFn: (schedule) => replaceGroupSchedule(id, { schedule }),
    meta: { errorHandling: 'local' },
    onSuccess: async (group) => {
      await applyChange(queryClient, group);
      toast.success('اتحفظت المواعيد واتعملت السيشنات الجاية من جديد');
    },
  });
}
