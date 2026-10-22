import type { Session } from '@kidzzy/shared';
import { groupKeys } from '@/features/groups';
import type { useQueryClient } from '@/lib/query';
import { sessionKeys } from '../api/sessions.keys';

/**
 * After a session changed status: the detail takes the new session at once, and the session
 * lists plus the group (held count and next session) are refreshed in the background, so a
 * confirm dialog closes without waiting for them.
 */
export function applySessionChange(
  queryClient: ReturnType<typeof useQueryClient>,
  session: Session,
): void {
  queryClient.setQueryData(sessionKeys.detail(session.id), session);
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: sessionKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: groupKeys.detail(session.group.id) }),
    queryClient.invalidateQueries({ queryKey: groupKeys.lists() }),
  ]);
}
