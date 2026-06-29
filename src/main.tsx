import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { JargonProvider } from './context/JargonContext'
import { DataEventProvider } from './context/DataEventContext'

// Unregister stale service workers (old caching SWs) but keep push-sw.js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(r => {
      // Skip our push-only SW — only unregister old caching SWs
      if (r.active?.scriptURL?.includes('push-sw.js')) return;
      r.unregister();
    });
  });
  // Clear old caches (push-sw.js doesn't create any)
  if ('caches' in window) {
    caches.keys().then(names => names.forEach(name => caches.delete(name)));
  }
}

// The kill-switch worker (public/sw.js) appends ?_swrefresh=1 when it force-reloads a
// stuck tab after retiring the old PWA cache. Strip it on load so it doesn't linger in
// the URL bar (or ride along on a bookmark/share). Hash/view + any other params are kept.
try {
  const u = new URL(window.location.href);
  if (u.searchParams.has('_swrefresh')) {
    u.searchParams.delete('_swrefresh');
    window.history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
} catch { /* ignore */ }

// Register push-only service worker (no caching — just push event handling)
import { registerPushSW } from './utils/push';
registerPushSW();


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <JargonProvider>
          <DataEventProvider>
            <App />
          </DataEventProvider>
        </JargonProvider>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
