import { useApiQuery } from '@/lib/query';
import { getGroup, listGroupOptions, listGroups, listInstructorGroups } from '../api/groups.api';
import { groupKeys } from '../api/groups.keys';
import type { GroupListParams } from '../types';

/**
 * One page of groups. The previous page stays on screen while the next one loads
 * (placeholderData). The list shows its own error.
 */
export function useGroups(params: GroupListParams) {
  return useApiQuery({
    queryKey: groupKeys.list(params),
    queryFn: ({ signal }) => listGroups(params, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}

/**
 * The active groups, for a choice list (the target of a transfer). Other features reach it
 * through the feature's index. The form shows its own loading and error state.
 */
export function useGroupOptions() {
  return useApiQuery({
    queryKey: groupKeys.options(),
    queryFn: ({ signal }) => listGroupOptions(signal),
    meta: { errorHandling: 'local' },
  });
}

/**
 * The active groups an instructor teaches now, for a choice list (the group of their payment
 * plan, which is per group). Other features reach it through the feature's index.
 */
export function useInstructorGroups(instructorId: string, enabled = true) {
  return useApiQuery({
    queryKey: groupKeys.ofInstructor(instructorId),
    queryFn: ({ signal }) => listInstructorGroups(instructorId, signal),
    enabled,
    meta: { errorHandling: 'local' },
  });
}

/** One group. The screen shows its own error (404 and 403 included). */
export function useGroup(id: string) {
  return useApiQuery({
    queryKey: groupKeys.detail(id),
    queryFn: ({ signal }) => getGroup(id, signal),
    meta: { errorHandling: 'local' },
  });
}
