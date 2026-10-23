import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { AttendanceRange } from '../types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(value: string | null): string | undefined {
  return value && DATE.test(value) ? value : undefined;
}

/**
 * The date range of a group's attendance grid, kept in the URL (?from=2026-10-01&to=2026-10-31),
 * so a reload, the back button and a shared link keep it. Both dates are academy-local and
 * included; a date that is not YYYY-MM-DD is ignored. Other query parameters are left as they are.
 */
export function useAttendanceRange() {
  const [searchParams, setSearchParams] = useSearchParams();

  const range = useMemo<AttendanceRange>(
    () => ({ from: readDate(searchParams.get('from')), to: readDate(searchParams.get('to')) }),
    [searchParams],
  );

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

  const setFrom = useCallback((from: string) => update({ from: from || null }), [update]);
  const setTo = useCallback((to: string) => update({ to: to || null }), [update]);
  const clear = useCallback(() => update({ from: null, to: null }), [update]);

  return { ...range, setFrom, setTo, clear };
}
