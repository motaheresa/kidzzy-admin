import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useListParams } from './useListParams';

/** Renders the hook in a memory router; `search()` is the current URL query, decoded. */
function setup(initialUrl: string, options?: Parameters<typeof useListParams>[0]) {
  const result = {} as { current: ReturnType<typeof useListParams> };
  function HookHost() {
    result.current = useListParams(options);
    return null;
  }
  const router = createMemoryRouter([{ path: '/list', element: <HookHost /> }], {
    initialEntries: [initialUrl],
  });
  render(<RouterProvider router={router} />);
  return { result, router, search: () => decodeURIComponent(router.state.location.search) };
}

describe('useListParams', () => {
  it('reads page, search and isActive from the URL', () => {
    const { result } = setup('/list?page=3&search=%20منى%20&isActive=false');
    expect(result.current).toMatchObject({ page: 3, search: 'منى', isActive: false });
  });

  it.each([['/list'], ['/list?page=0'], ['/list?page=abc'], ['/list?isActive=yes']])(
    'falls back to the defaults for %s',
    (url) => {
      const { result } = setup(url);
      expect(result.current).toMatchObject({ page: 1, search: '', isActive: undefined });
    },
  );

  it('a new search or filter goes back to page 1; defaults leave the URL', () => {
    const { result, search } = setup('/list?page=4');
    act(() => result.current.setSearch(' منى '));
    expect(search()).toBe('?search=منى');
    act(() => result.current.setPage(2));
    expect(search()).toBe('?search=منى&page=2');
    act(() => result.current.setIsActive(true));
    expect(search()).toBe('?search=منى&isActive=true');
    act(() => result.current.setIsActive(undefined));
    act(() => result.current.setSearch(''));
    expect(search()).toBe('');
  });

  it('replaces the history entry instead of adding one', () => {
    const { result, router } = setup('/list');
    const before = router.state.historyAction;
    act(() => result.current.setSearch('a'));
    expect(before).toBe('POP');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  describe('page size', () => {
    it('is the screen default when the URL has none, or a value that is not a choice', () => {
      expect(setup('/list').result.current.pageSize).toBe(20);
      expect(setup('/list', { pageSize: 50 }).result.current.pageSize).toBe(50);
      expect(setup('/list?pageSize=30', { pageSize: 50 }).result.current.pageSize).toBe(50);
      expect(setup('/list?pageSize=abc', { pageSize: 50 }).result.current.pageSize).toBe(50);
    });

    it('reads 25, 50 and 100 from the URL', () => {
      expect(setup('/list?pageSize=25', { pageSize: 50 }).result.current.pageSize).toBe(25);
      expect(setup('/list?pageSize=100', { pageSize: 50 }).result.current.pageSize).toBe(100);
    });

    it('a new size goes back to page 1, and the default stays out of the URL', () => {
      const { result, search } = setup('/list?page=3', { pageSize: 50 });
      act(() => result.current.setPageSize(100));
      expect(search()).toBe('?pageSize=100');
      act(() => result.current.setPage(2));
      expect(search()).toBe('?pageSize=100&page=2');
      act(() => result.current.setPageSize(50));
      expect(search()).toBe('');
    });
  });

  describe('date range and other filters', () => {
    it('reads from and to, and ignores what is not a date', () => {
      const { result } = setup('/list?from=2026-11-01&to=2026-11-30');
      expect(result.current).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
      const bad = setup('/list?from=yesterday&to=2026-1-1');
      expect(bad.result.current).toMatchObject({ from: undefined, to: undefined });
    });

    it('sets and clears the range, back to page 1', () => {
      const { result, search } = setup('/list?page=3');
      act(() => result.current.setRange('2026-11-01', '2026-11-30'));
      expect(search()).toBe('?from=2026-11-01&to=2026-11-30');
      act(() => result.current.setRange(undefined, undefined));
      expect(search()).toBe('');
    });

    it('keeps any other filter in the URL with param and setParam', () => {
      const { result, search } = setup('/list?page=2&method=cash');
      expect(result.current.param('method')).toBe('cash');
      expect(result.current.param('payeeType')).toBeNull();
      act(() => result.current.setParam('payeeType', 'student'));
      expect(search()).toBe('?method=cash&payeeType=student');
      act(() => result.current.setParam('method', null));
      act(() => result.current.setParam('payeeType', ''));
      expect(search()).toBe('');
    });
  });
});
