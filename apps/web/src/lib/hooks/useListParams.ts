import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/** The page sizes a table offers, where it offers a choice. */
export const PAGE_SIZE_CHOICES = [25, 50, 100] as const;

/** What a list screen keeps in the URL: ?page=2&search=منى&isActive=true */
export interface ListParams {
  page: number;
  search: string;
  /** undefined: everyone; true / false: only active / only inactive. */
  isActive: boolean | undefined;
}

/** What only some screens use: a page size choice and a date range (US-38, the reports). */
export interface ListExtras {
  /** One of PAGE_SIZE_CHOICES from the URL, otherwise the screen's own default. */
  pageSize: number;
  /** Academy-local date, YYYY-MM-DD, or undefined. */
  from: string | undefined;
  /** Academy-local date, YYYY-MM-DD, or undefined. */
  to: string | undefined;
}

/** What a screen can ask of useListParams. */
export interface ListParamsOptions {
  /** The page size when the URL has none. Left out of the URL while it is chosen. */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readBoolean(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function readDate(value: string | null): string | undefined {
  return value !== null && DATE.test(value) ? value : undefined;
}

/**
 * A list's page, search, active filter, page size and date range, kept in the URL query. So the
 * list survives a reload, the back button and a shared link. A new search, filter, range or page
 * size goes back to page 1. The URL entry is replaced, not pushed, so typing a search does not
 * fill the browser history. Defaults are left out of the URL (page 1, no search, everyone, the
 * screen's page size, no range).
 *
 * `param` and `setParam` read and write any other filter a screen has (its own keys, validated by
 * the screen), with the same rules.
 */
export function useListParams(options: ListParamsOptions = {}) {
  const defaultPageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<ListParams & ListExtras>(() => {
    const page = Number(searchParams.get('page'));
    const pageSize = Number(searchParams.get('pageSize'));
    return {
      page: Number.isInteger(page) && page > 1 ? page : 1,
      search: searchParams.get('search')?.trim() ?? '',
      isActive: readBoolean(searchParams.get('isActive')),
      pageSize: (PAGE_SIZE_CHOICES as readonly number[]).includes(pageSize)
        ? pageSize
        : defaultPageSize,
      from: readDate(searchParams.get('from')),
      to: readDate(searchParams.get('to')),
    };
  }, [searchParams, defaultPageSize]);

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
  const setPageSize = useCallback(
    (pageSize: number) =>
      update({ pageSize: pageSize === defaultPageSize ? null : String(pageSize), page: null }),
    [update, defaultPageSize],
  );
  const setRange = useCallback(
    (from: string | undefined, to: string | undefined) =>
      update({ from: from ?? null, to: to ?? null, page: null }),
    [update],
  );
  const param = useCallback((key: string) => searchParams.get(key), [searchParams]);
  const setParam = useCallback(
    (key: string, value: string | null) => update({ [key]: value || null, page: null }),
    [update],
  );

  return { ...params, setPage, setSearch, setIsActive, setPageSize, setRange, param, setParam };
}
