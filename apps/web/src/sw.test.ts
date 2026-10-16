import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;

describe('service worker', () => {
  const listeners = new Map<string, Listener>();
  const skipWaiting = vi.fn(() => Promise.resolve());
  const claim = vi.fn(() => Promise.resolve());
  const deleted: string[] = [];

  beforeEach(async () => {
    listeners.clear();
    deleted.length = 0;
    vi.stubGlobal('self', {
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
      skipWaiting,
      clients: { claim },
    });
    vi.stubGlobal('caches', {
      keys: () => Promise.resolve(['workbox-precache-v2-https://app/', 'old-runtime']),
      delete: (name: string) => {
        deleted.push(name);
        return Promise.resolve(true);
      },
    });
    vi.resetModules();
    await import('./sw');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('listens to install and activate only: no fetch handler, so nothing is served from cache', () => {
    expect([...listeners.keys()].sort()).toEqual(['activate', 'install']);
  });

  it('takes over at once on install', () => {
    listeners.get('install')?.({ waitUntil: () => undefined });
    expect(skipWaiting).toHaveBeenCalled();
  });

  it('deletes every cache left by the old worker, then claims the open tabs', async () => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get('activate')?.({ waitUntil: (promise) => (done = promise) });
    await done;

    expect(deleted).toEqual(['workbox-precache-v2-https://app/', 'old-runtime']);
    expect(claim).toHaveBeenCalled();
  });
});
