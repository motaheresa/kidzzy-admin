import { useApiQuery } from '@/lib/query';
import { getGroup, listGroupOptions, listGroups } from '../api/groups.api';
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

/** One group. The screen shows its own error (404 and 403 included). */
export function useGroup(id: string) {
  return useApiQuery({
    queryKey: groupKeys.detail(id),
    queryFn: ({ signal }) => getGroup(id, signal),
    meta: { errorHandling: 'local' },
  });
}
