import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { fromResponse, timeoutError } from '../errors';
import { createQueryClient, shouldRetryQuery } from './client';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const network = new TypeError('Failed to fetch');
const server = fromResponse(503, null);
const conflict = fromResponse(409, { status: 409, code: 'CYCLE_ALREADY_PAID' });

describe('shouldRetryQuery', () => {
  it.each([
    ['network', network],
    ['timeout', timeoutError()],
    ['server', server],
  ])('retries a %s error at most twice', (_kind, error) => {
    expect([0, 1, 2].map((failures) => shouldRetryQuery(failures, error))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it.each([
    ['400', fromResponse(400, { status: 400, code: 'VALIDATION_FAILED' })],
    ['401', fromResponse(401, { status: 401, code: 'UNAUTHENTICATED' })],
    ['403', fromResponse(403, { status: 403, code: 'FORBIDDEN' })],
    ['404', fromResponse(404, { status: 404, code: 'NOT_FOUND' })],
    ['409', conflict],
    ['429', fromResponse(429, { status: 429, code: 'RATE_LIMITED' })],
  ])('never retries a %s', (_status, error) => {
    expect(shouldRetryQuery(0, error)).toBe(false);
  });
});

describe('createQueryClient', () => {
  afterEach(() => vi.mocked(toast.error).mockClear());

  it('never retries mutations, even on a server error', async () => {
    const client = createQueryClient();
    const mutationFn = vi.fn().mockRejectedValue(server);
    await expect(
      client.getMutationCache().build(client, { mutationFn }).execute(undefined),
    ).rejects.toBe(server);
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('reports a failed query globally (a toast)', async () => {
    const client = createQueryClient();
    await client
      .fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(conflict), retry: false })
      .catch(() => undefined);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(conflict.message, { id: conflict.message });
  });

  it('does not report a query whose meta says errorHandling: local', async () => {
    const client = createQueryClient();
    await client
      .fetchQuery({
        queryKey: ['y'],
        queryFn: () => Promise.reject(conflict),
        retry: false,
        meta: { errorHandling: 'local' },
      })
      .catch(() => undefined);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a failed mutation unless its meta says local', async () => {
    const client = createQueryClient();
    const fail = () => Promise.reject(conflict);
    await client
      .getMutationCache()
      .build(client, { mutationFn: fail })
      .execute(undefined)
      .catch(() => undefined);
    await client
      .getMutationCache()
      .build(client, { mutationFn: fail, meta: { errorHandling: 'local' } })
      .execute(undefined)
      .catch(() => undefined);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
