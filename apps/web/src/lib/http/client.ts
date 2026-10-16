import { API_PREFIX, ErrorCode } from '@kidzzy/shared';
import { fromResponse, isAppError, normalizeError, timeoutError } from '@/lib/errors';
import { refreshOnce, type RefreshOutcome } from './refresh';

/** A request that has not answered after this long fails with kind 'timeout'. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Paths that must never trigger a refresh: login answers 401 for wrong credentials, and a
 *  refresh that answers 401 means the session is over. Logout is refreshed on purpose, so an
 *  expired access token still revokes the server-side session. */
const NO_REFRESH = new Set(['/auth/login', '/auth/refresh']);

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Sent as JSON. */
  body?: unknown;
  /** Cancels the request (TanStack Query passes one per query); combined with the timeout. */
  signal?: AbortSignal;
}

/**
 * The only place in the web app that calls fetch (ESLint bans it elsewhere). Every request:
 * - goes to /api/v1 on the same origin, so the browser sends the httpOnly auth cookies;
 * - sends and accepts JSON, and resolves 204 (or an empty body) to undefined;
 * - fails within REQUEST_TIMEOUT_MS, with an AppError of kind 'timeout';
 * - turns every non-2xx answer into an AppError (lib/errors), never a raw Response or string;
 * - on 401 UNAUTHENTICATED, refreshes the session once (shared by concurrent requests) and
 *   retries the request once.
 * A request the caller cancels rejects with the browser's AbortError, which TanStack Query
 * treats as a cancellation and the error layer never reports.
 */
export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, options),
};

async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await attempt<T>(method, path, options);
  } catch (error) {
    if (!needsRefresh(error, path)) throw error;
    if ((await refreshOnce(sendRefresh)) === 'expired') throw error;

    // Retry once with the new cookies. Safe even for a POST: a 401 UNAUTHENTICATED comes from the
    // global JwtAuthGuard, which runs BEFORE the route handler, so the first attempt changed
    // nothing on the server. (Rule in CLAUDE.md: a handler never throws UNAUTHENTICATED after a
    // side effect.) A second 401 is not refreshed again; it is returned to the caller.
    return attempt<T>(method, path, options);
  }
}

function needsRefresh(error: unknown, path: string): boolean {
  return (
    isAppError(error) &&
    error.status === 401 &&
    error.code === ErrorCode.Unauthenticated &&
    !NO_REFRESH.has(path)
  );
}

/** POST /auth/refresh: the browser sends the refresh cookie, which is scoped to that path. */
async function sendRefresh(): Promise<RefreshOutcome> {
  try {
    await attempt<void>('POST', '/auth/refresh', {});
    return 'refreshed';
  } catch (error) {
    if (isAppError(error) && error.kind === 'unauthenticated') return 'expired';
    throw error; // network, timeout or server: the session may still be fine
  }
}

/** One fetch, with the timeout, the JSON handling and the error mapping; no refresh. */
async function attempt<T>(method: Method, path: string, { body, signal }: RequestOptions) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(`/${API_PREFIX}${path}`, {
      method,
      credentials: 'same-origin',
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await readBody(response);
    if (!response.ok) throw fromResponse(response.status, payload);
    return payload as T;
  } catch (error) {
    if (isAppError(error)) throw error;
    if (timedOut) throw timeoutError(error);
    if (signal?.aborted) throw error; // cancelled by the caller: a cancellation, not an AppError
    throw normalizeError(error); // fetch's TypeError -> network
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** JSON (including application/problem+json), text for anything else, undefined when empty. */
async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  if (!(response.headers.get('Content-Type') ?? '').includes('json')) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
