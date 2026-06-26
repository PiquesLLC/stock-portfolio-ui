// Kill-switch service worker.
//
// nalaai.com was briefly a VitePWA PWA whose precaching worker — registered at
// /sw.js, scope / — cached the entire app shell and then served it indefinitely,
// hiding every deploy from returning users. VitePWA is disabled now, but those
// stale workers are STILL installed in people's browsers and keep serving the
// old app. They could not self-retire because /sw.js had been returning the
// SPA's HTML (invalid as a worker script), so the browser's update check failed
// every time and the old worker lived on.
//
// This file IS /sw.js now. The next time a stuck browser update-checks its
// worker it receives THIS script instead. It takes over, deletes every Cache
// Storage entry (the old precache only — NOT cookies, localStorage, or
// IndexedDB, so the user stays signed in; auth is a cookie), claims open tabs,
// and unregisters itself. After that the browser serves the app from the network
// normally and main.tsx re-registers the harmless push-only worker.
//
// There is deliberately NO fetch handler here — this worker never caches or
// intercepts anything. Once we're confident no stale workers remain in the wild,
// this file can be deleted.

self.addEventListener('install', () => {
  // Activate immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Take control of open tabs FIRST, so this (fetch-handler-less, pure
    // network-passthrough) worker is serving them before we touch any cache —
    // the displaced precache worker can't cache-miss mid-deletion.
    try { await self.clients.claim(); } catch (_e) { /* ignore */ }
    // Delete only Cache Storage (the stale app-shell precache). Cookies,
    // localStorage and IndexedDB are untouched, so the session survives.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_e) { /* best-effort */ }
    // Retire this registration entirely. With no fetch handler and no
    // registration, nothing intercepts requests anymore — the app loads live.
    try { await self.registration.unregister(); } catch (_e) { /* ignore */ }
  })());
});
