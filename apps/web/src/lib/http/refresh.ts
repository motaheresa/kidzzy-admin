import { emitSessionExpired } from './session-events';

/** 'refreshed': new cookies are set. 'expired': the API refused the refresh token. */
export type RefreshOutcome = 'refreshed' | 'expired';

/** Name of the cross-tab lock (Web Locks API) held while one tab refreshes. */
export const REFRESH_LOCK = 'kidzzy-auth-refresh';

let inFlight: Promise<RefreshOutcome> | null = null;

/**
 * Refreshes the session ONCE for every caller that asks while a refresh is running
 * ("single flight"). Each refresh token works once (ADR-0005): if three requests got 401 at the
 * same time and each sent its own refresh, the second would present a used token and the API
 * would revoke the whole session. Sharing one promise means one refresh, then every caller
 * retries with the new cookies.
 *
 * Across tabs the same race exists (they share the cookies), so the refresh runs under a Web
 * Lock: a second tab waits, then refreshes with the cookie the first tab just received.
 * Browsers without `navigator.locks` (and jsdom) run it without the lock.
 *
 * An 'expired' outcome emits the session-expired event once per flight, not once per caller.
 * A network failure during the refresh rejects instead: it is not a reason to sign the user out.
 */
export function refreshOnce(send: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  inFlight ??= withRefreshLock(send)
    .then((outcome) => {
      if (outcome === 'expired') emitSessionExpired();
      return outcome;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function withRefreshLock(send: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(REFRESH_LOCK, () => send()) : send();
}
