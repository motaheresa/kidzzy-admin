import { useApiQuery } from '@/lib/query';
import { getSession, listSessions } from '../api/sessions.api';
import { sessionKeys } from '../api/sessions.keys';
import type { SessionListParams } from '../types';

/** One page of sessions. The screen shows its own error. `enabled` skips the request when the caller may not read sessions. */
export function useSessions(params: SessionListParams, enabled = true) {
  return useApiQuery({
    queryKey: sessionKeys.list(params),
    queryFn: ({ signal }) => listSessions(params, signal),
    placeholderData: (previous) => previous,
    enabled,
    meta: { errorHandling: 'local' },
  });
}

/** One session. Named apart from the auth session (`useSession` in the auth feature). */
export function useSessionDetail(id: string) {
  return useApiQuery({
    queryKey: sessionKeys.detail(id),
    queryFn: ({ signal }) => getSession(id, signal),
    meta: { errorHandling: 'local' },
  });
}
