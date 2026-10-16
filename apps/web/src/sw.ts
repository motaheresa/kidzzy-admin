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

// ── Web push (TS-02) ─────────────────────────────────────────────────────────────────────────
// The 'push' and 'notificationclick' handlers go here when web push is built (ADR-0008).
// Do not add a 'fetch' handler or any caching: offline support is out of scope by decision.

export {};
