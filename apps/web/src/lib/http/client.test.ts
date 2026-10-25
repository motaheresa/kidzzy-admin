import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppError } from '@/lib/errors';
import { http, REQUEST_TIMEOUT_MS } from './client';
import { REFRESH_LOCK } from './refresh';
import { onSessionExpired } from './session-events';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Error', status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
const later = <T>(value: T, ms = 10) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

let fetchMock: MockInstance<typeof fetch>;
/** "METHOD /path" for every fetch call, in order. */
let calls: string[];

function routeFetch(handler: (path: string, init: RequestInit) => Response | Promise<Response>) {
  fetchMock.mockImplementation((input, init = {}) => {
    const path = String(input).replace('/api/v1', '');
    calls.push(`${init.method ?? 'GET'} ${path}`);
    return Promise.resolve(handler(path, init));
  });
}
const count = (call: string) => calls.filter((c) => c === call).length;

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('http client', () => {
  it('sends JSON to /api/v1 on the same origin and parses the JSON answer', async () => {
    routeFetch(() => json(200, { ok: true }));
    await expect(http.post('/things', { name: 'x' })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/things');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ name: 'x' }),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
  });

  it('resolves 204 to undefined', async () => {
    routeFetch(() => new Response(null, { status: 204 }));
    await expect(http.delete('/things/1')).resolves.toBeUndefined();
  });

  it('turns a Problem Details answer into an AppError, never a raw Response', async () => {
    routeFetch(() => problem(409, 'CYCLE_ALREADY_PAID'));
    const error: unknown = await http.post('/pay').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind: 'conflict', status: 409, code: 'CYCLE_ALREADY_PAID' });
  });

  it('turns a non-JSON 502 from a proxy into kind server', async () => {
    routeFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(http.get('/x')).rejects.toMatchObject({ kind: 'server', status: 502 });
  });

  it('turns a failed fetch (TypeError) into kind network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(http.get('/x')).rejects.toMatchObject({ kind: 'network' });
  });

  it(`fails with kind timeout after ${REQUEST_TIMEOUT_MS} ms`, async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = http.get('/slow').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toMatchObject({ kind: 'timeout' });
  });

  it('rejects with the AbortError, not an AppError, when the caller cancels', async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = http.get('/x', { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    const error = await pending;
    expect(error).not.toBeInstanceOf(AppError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });
});

describe('http client: refresh on 401 UNAUTHENTICATED', () => {
  it('shares ONE refresh between 3 parallel 401s, then retries each request once', async () => {
    let refreshed = false;
    routeFetch(async (path) => {
      if (path === '/auth/refresh') {
        refreshed = await later(true);
        return new Response(null, { status: 204 });
      }
      return refreshed ? json(200, { path }) : problem(401, 'UNAUTHENTICATED');
    });

    const results = await Promise.all([http.get('/a'), http.get('/b'), http.post('/c', { x: 1 })]);

    expect(results).toEqual([{ path: '/a' }, { path: '/b' }, { path: '/c' }]);
    expect(count('POST /auth/refresh')).toBe(1);
    expect([count('GET /a'), count('GET /b'), count('POST /c')]).toEqual([2, 2, 2]);
  });

  it('emits session expired ONCE when the refresh is refused, and rejects every caller', async () => {
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    routeFetch(async (path) =>
      path === '/auth/refresh'
        ? later(problem(401, 'UNAUTHENTICATED'))
        : problem(401, 'UNAUTHENTICATED'),
    );

    const errors = await Promise.all(
      ['/a', '/b', '/c'].map((path) => http.get(path).catch((e: unknown) => e)),
    );

    for (const error of errors) expect(error).toMatchObject({ kind: 'unauthenticated' });
    expect(count('POST /auth/refresh')).toBe(1);
    expect(expired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not sign the user out when the refresh fails on the network', async () => {
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    routeFetch((path) => {
      if (path === '/auth/refresh') throw new TypeError('Failed to fetch');
      return problem(401, 'UNAUTHENTICATED');
    });

    await expect(http.get('/a')).rejects.toMatchObject({ kind: 'network' });
    expect(expired).not.toHaveBeenCalled();
    unsubscribe();
  });

  it.each(['/auth/login', '/auth/refresh'])('never refreshes for %s', async (path) => {
    routeFetch(() => problem(401, 'UNAUTHENTICATED'));
    await expect(http.post(path)).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(calls).toEqual([`POST ${path}`]);
  });

  it('refreshes and retries a call once after a 401, so an expired access token is renewed', async () => {
    let refreshed = false;
    routeFetch((path) => {
      if (path === '/auth/refresh') {
        refreshed = true;
        return new Response(null, { status: 204 });
      }
      return refreshed ? new Response(null, { status: 204 }) : problem(401, 'UNAUTHENTICATED');
    });
    await expect(http.post('/x')).resolves.toBeUndefined();
    expect(calls).toEqual(['POST /x', 'POST /auth/refresh', 'POST /x']);
  });

  it('does not refresh for a 401 with another code, or for other statuses', async () => {
    routeFetch((path) =>
      path === '/x' ? problem(401, 'INVALID_CREDENTIALS') : problem(403, 'FORBIDDEN'),
    );
    await expect(http.get('/x')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(http.get('/y')).rejects.toMatchObject({ kind: 'forbidden' });
    expect(count('POST /auth/refresh')).toBe(0);
  });

  it('retries only once: a second 401 after a refresh goes back to the caller', async () => {
    routeFetch((path) =>
      path === '/auth/refresh'
        ? new Response(null, { status: 204 })
        : problem(401, 'UNAUTHENTICATED'),
    );
    await expect(http.get('/a')).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(calls).toEqual(['GET /a', 'POST /auth/refresh', 'GET /a']);
  });

  it('refreshes inside the cross-tab Web Lock when the browser has one', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      let refreshed = false;
      routeFetch((path) => {
        if (path === '/auth/refresh') {
          refreshed = true;
          return new Response(null, { status: 204 });
        }
        return refreshed ? json(200, {}) : problem(401, 'UNAUTHENTICATED');
      });
      await http.get('/a');
      expect(request).toHaveBeenCalledExactlyOnceWith(REFRESH_LOCK, expect.any(Function));
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });
});
