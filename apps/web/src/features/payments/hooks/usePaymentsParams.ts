import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { CycleFilter } from '../types';

export type PaymentsTab = 'students' | 'instructors' | 'history';
/** The statuses the overview filters by; the Due ones come first. */
export type OverviewStatus = Extract<CycleFilter, 'due' | 'approaching' | 'in_progress'>;

const TABS = new Set<string>(['students', 'instructors', 'history']);
const STATUSES = new Set<string>(['due', 'approaching', 'in_progress']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(value: string | null): string | undefined {
  return value && DATE.test(value) ? value : undefined;
}

/**
 * What the Payments screen keeps in the URL (?tab=instructors&status=approaching&page=2, and
 * &from=…&to=… on the history), so a reload, the back button and a shared link keep it. Defaults
 * stay out of the URL: the Students tab, the Due status, page 1 and no dates. A new tab, status
 * or date goes back to page 1.
 */
export function usePaymentsParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const tab = searchParams.get('tab');
    const status = searchParams.get('status');
    const page = Number(searchParams.get('page'));
    return {
      tab: (tab && TABS.has(tab) ? tab : 'students') as PaymentsTab,
      status: (status && STATUSES.has(status) ? status : 'due') as OverviewStatus,
      page: Number.isInteger(page) && page > 1 ? page : 1,
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

  const setTab = useCallback(
    (tab: PaymentsTab) => update({ tab: tab === 'students' ? null : tab, page: null }),
    [update],
  );
  const setStatus = useCallback(
    (status: OverviewStatus) => update({ status: status === 'due' ? null : status, page: null }),
    [update],
  );
  const setPage = useCallback(
    (page: number) => update({ page: page > 1 ? String(page) : null }),
    [update],
  );
  const setFrom = useCallback(
    (from: string) => update({ from: from || null, page: null }),
    [update],
  );
  const setTo = useCallback((to: string) => update({ to: to || null, page: null }), [update]);
  const clearRange = useCallback(() => update({ from: null, to: null, page: null }), [update]);

  return { ...params, setTab, setStatus, setPage, setFrom, setTo, clearRange };
}
