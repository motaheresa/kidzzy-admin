import { isCancelledError, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { normalizeError, reportError, type ErrorKind } from '../errors';
import type { ApiMeta } from './register';

/** Failures worth trying again: the request may succeed a moment later. */
const RETRYABLE_KINDS: ReadonlySet<ErrorKind> = new Set(['network', 'timeout', 'server']);
const MAX_QUERY_RETRIES = 2;

/**
 * Retry policy of queries (reads): at most 2 retries, and only for network, timeout and server
 * errors. A 4xx is an answer, not a glitch: asking again gives the same answer.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && RETRYABLE_KINDS.has(normalizeError(error).kind);
}

/** The global error handler for one query or mutation, unless its meta opts out. */
function report(error: unknown, meta: ApiMeta | undefined): void {
  if (meta?.errorHandling === 'local' || isCancelledError(error)) return;
  reportError(error);
}

/**
 * The app's QueryClient (one per app instance, see src/app/providers.tsx).
 * - Queries retry as shouldRetryQuery says.
 * - Mutations never retry: a POST that timed out or got a 5xx may have been applied already,
 *   and sending it again could, for example, record a payment twice.
 * - Every failure goes to the global reporter unless meta.errorHandling is 'local'.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => report(error, query.meta) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => report(error, mutation.meta),
    }),
    defaultOptions: {
      queries: { retry: shouldRetryQuery },
      mutations: { retry: false },
    },
  });
}
