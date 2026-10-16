import type { QueryClient } from '../../lib/query';
import { authKeys } from './api/auth.keys';

/** How long a known session is trusted before GET /auth/me is asked again (no refetch per page). */
export const SESSION_STALE_TIME_MS = 5 * 60_000;

/**
 * Marks the user as signed out: the me query holds null. The protected layout then sends the
 * user to the login page. Used by logout and by the app layer when the session expires.
 */
export function markSignedOut(queryClient: QueryClient): void {
  queryClient.setQueryData(authKeys.me(), null);
}
