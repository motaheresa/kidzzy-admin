import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/** What a list screen keeps in the URL: ?page=2&search=منى&isActive=true */
export interface ListParams {
  page: number;
  search: string;
  /** undefined: everyone; true / false: only active / only inactive. */
  isActive: boolean | undefined;
}

function readBoolean(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * A list's page, search and active filter, kept in the URL query. So the list survives a reload,
 * the back button and a shared link. A new search or filter goes back to page 1. The URL entry is
 * replaced, not pushed, so typing a search does not fill the browser history.
 * Defaults are left out of the URL (page 1, no search, everyone).
 */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<ListParams>(() => {
    const page = Number(searchParams.get('page'));
    return {
      page: Number.isInteger(page) && page > 1 ? page : 1,
      search: searchParams.get('search')?.trim() ?? '',
      isActive: readBoolean(searchParams.get('isActive')),
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
  const setSearch = useCallback(
    (search: string) => update({ search: search.trim() || null, page: null }),
    [update],
  );
  const setIsActive = useCallback(
    (isActive: boolean | undefined) =>
      update({ isActive: isActive === undefined ? null : String(isActive), page: null }),
    [update],
  );

  return { ...params, setPage, setSearch, setIsActive };
}
