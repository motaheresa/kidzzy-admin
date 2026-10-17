import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { createGroup } from '../api/groups.api';
import { groupKeys } from '../api/groups.keys';
import type { Group, GroupCreate } from '../types';

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
