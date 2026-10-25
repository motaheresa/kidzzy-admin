import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(value: string | null): string | undefined {
  return value && DATE.test(value) ? value : undefined;
}

/**
 * What the audit screen keeps in the URL (?entityType=sessions&entityId=…&actorId=…&from=…&to=…
 * &page=2), so a reload, the back button, a shared link and the "history" links keep it. from and
 * to are academy-local days (YYYY-MM-DD). A new filter goes back to page 1; defaults stay out of
 * the URL.
 */
export function useAuditParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const page = Number(searchParams.get('page'));
    return {
      page: Number.isInteger(page) && page > 1 ? page : 1,
      entityType: searchParams.get('entityType') || undefined,
      entityId: searchParams.get('entityId') || undefined,
      actorId: searchParams.get('actorId') || undefined,
      from: readDate(searchParams.get('from')),
      to: readDate(searchParams.get('to')),
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

  return {
    ...params,
    setPage: useCallback(
      (page: number) => update({ page: page > 1 ? String(page) : null }),
      [update],
    ),
    setEntityType: useCallback(
      (entityType: string) => update({ entityType: entityType || null, page: null }),
      [update],
    ),
    clearEntity: useCallback(() => update({ entityId: null, page: null }), [update]),
    setActorId: useCallback((actorId: string | null) => update({ actorId, page: null }), [update]),
    setFrom: useCallback((from: string) => update({ from: from || null, page: null }), [update]),
    setTo: useCallback((to: string) => update({ to: to || null, page: null }), [update]),
    clearRange: useCallback(() => update({ from: null, to: null, page: null }), [update]),
  };
}
