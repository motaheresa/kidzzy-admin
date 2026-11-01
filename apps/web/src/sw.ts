// The app's service worker (docs/design-system.md, "PWA policy").
//
// It exists for two things only: making the app installable and, later, receiving web push.
// It caches NOTHING: no precache, no runtime caching, no navigation fallback and no fetch
// handler, so every request goes to the network and the app is never served stale.
//
// The previous worker (vite-plugin-pwa generateSW) precached the whole app on devices that had
// opened it. This one takes over at once and deletes every cache it finds, so no device keeps
// serving an old build.

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
  // Replace the old worker immediately instead of waiting for every tab to close.
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      // Control the open tabs now, so they stop using the old worker's caches.
      await sw.clients.claim();
    })(),
  );
});

// ── Web push (TS-02, ADR-0008) ───────────────────────────────────────────────────────────────
// Shows a notification the server pushed. No caching and no request handler: the app stays online.

interface PushData {
  title?: string;
  body?: string;
  url?: string;
}

function readPush(event: PushEvent): PushData {
  if (!event.data) return {};
  try {
    return event.data.json() as PushData;
  } catch {
    return { body: event.data.text() };
  }
}

function sameSitePath(raw: unknown): string | undefined {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.startsWith('/\\')
  ) {
    return undefined;
  }
  if (raw.includes('\\')) return undefined;
  return raw;
}

sw.addEventListener('push', (event) => {
  const payload = readPush(event);
  const url = sameSitePath(payload.url);
  event.waitUntil(
    sw.registration.showNotification(payload.title || 'كيدزي كودرز', {
      body: payload.body,
      icon: '/pwa-192x192.png',
      data: url ? { url } : {},
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = sameSitePath((event.notification.data as { url?: unknown } | undefined)?.url);
  if (!url) return;
  const absolute = new URL(url, sw.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url === absolute);
      if (open) {
        await open.focus();
        return;
      }
      await sw.clients.openWindow(absolute);
    })(),
  );
});

export {};
