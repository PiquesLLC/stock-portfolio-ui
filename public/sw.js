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
    // The tabs we just claimed are STILL showing the old shell the stale precache
    // served before we took over — clearing Cache Storage doesn't repaint them, so
    // the user keeps seeing the old app until they happen to manually hard-refresh.
    // Reload each open window once so it pulls the live app from the network right
    // away. Do this BEFORE unregister() while the clients are still definitely
    // controlled by this worker — WindowClient.navigate() requires the client's
    // active worker to be us, which is spec-murky once the registration is
    // uninstalling. We add a one-shot ?_swrefresh param so the navigation is a real
    // document load (a plain same-URL navigate on a hash-routed SPA can be treated
    // as a no-op fragment jump); routing is hash-based so the param doesn't affect
    // it, and main.tsx strips it from the URL on load. Loop-safe: the reload goes
    // straight to the network (no fetch handler; the registration is unregistered
    // just below), gets current code, and main.tsx registers only the push worker —
    // nothing re-runs this. This whole worker only ever runs in browsers that still
    // carried the old PWA worker, so users who were never stuck are untouched.
    try {
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const win of windows) {
        if (typeof win.navigate !== 'function') continue;
        let target = win.url;
        try {
          const u = new URL(win.url);
          u.searchParams.set('_swrefresh', '1');
          target = u.href;
        } catch (_e) { /* malformed URL — fall back to a plain same-URL navigate */ }
        win.navigate(target).catch(() => { /* ignore per-client navigation failure */ });
      }
    } catch (_e) { /* best-effort */ }
    // Retire this registration entirely. With no fetch handler and no registration,
    // nothing intercepts requests anymore — subsequent loads come from the network.
    try { await self.registration.unregister(); } catch (_e) { /* ignore */ }
  })());
});
