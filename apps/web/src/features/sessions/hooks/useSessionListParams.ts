import { useCallback, useMemo } from 'react';
import { SessionStatus, type SessionStatus as SessionStatusValue } from '@kidzzy/shared';
import { useSearchParams } from 'react-router';

const STATUSES = new Set<string>([
  SessionStatus.Scheduled,
  SessionStatus.Held,
  SessionStatus.Cancelled,
]);

/**
 * Page and status of a group's session list, kept in the URL (?page=2&status=held).
 * A new status goes back to page 1. Defaults stay out of the URL.
 */
export function useSessionListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const page = Number(searchParams.get('page'));
    const status = searchParams.get('status');
    return {
      page: Number.isInteger(page) && page > 1 ? page : 1,
      status: status && STATUSES.has(status) ? (status as SessionStatusValue) : undefined,
    };
  }, [searchParams]);

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const setPage = useCallback(
    (page: number) => update({ page: page > 1 ? String(page) : null }),
    [update],
  );
  const setStatus = useCallback(
    (status: SessionStatusValue | undefined) => update({ status: status ?? null, page: null }),
    [update],
  );

  return { ...params, setPage, setStatus };
}
