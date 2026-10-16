import { isAppError } from '../../../lib/errors';
import { useApiQuery } from '../../../lib/query';
import { getMe } from '../api/auth.api';
import { authKeys } from '../api/auth.keys';
import { SESSION_STALE_TIME_MS } from '../session';
import type { Me } from '../types';

/**
 * The session: the signed-in user, or null when nobody is signed in. GET /auth/me answers it;
 * an expired access token is refreshed by the http client before this sees anything. Signed
 * out is data (null), not an error, so it is never retried or toasted.
 */
export function useSession() {
  return useApiQuery<Me | null>({
    queryKey: authKeys.me(),
    queryFn: async ({ signal }) => {
      try {
        return await getMe(signal);
      } catch (error) {
        if (isAppError(error) && error.kind === 'unauthenticated') return null;
        throw error;
      }
    },
    retry: false,
    staleTime: SESSION_STALE_TIME_MS,
    meta: { errorHandling: 'local' }, // the layouts show a failed session check themselves
  });
}
