import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useListParams } from './useListParams';

/** Renders the hook in a memory router; `search()` is the current URL query, decoded. */
function setup(initialUrl: string) {
  const result = {} as { current: ReturnType<typeof useListParams> };
  function HookHost() {
    result.current = useListParams();
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
});
