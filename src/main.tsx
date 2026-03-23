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

// Register push-only service worker (no caching — just push event handling)
import { registerPushSW } from './utils/push';
registerPushSW();

// DEBUG: Global error catcher — renders error on screen even when React crashes
// Remove after TestFlight notification bug is fixed
window.onerror = (msg, src, line, col, err) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999999;background:#900;color:#fff;font:12px monospace;padding:40px 16px 16px;overflow:auto;pointer-events:auto';
  el.innerHTML = `<b>JS CRASH</b><br>${msg}<br>at ${src}:${line}:${col}<br><pre>${err?.stack || 'no stack'}</pre><br><button onclick="location.reload()" style="background:#ff0;color:#000;padding:8px 20px;font-weight:bold;border-radius:4px;margin-top:8px">RELOAD APP</button>`;
  document.body.appendChild(el);
};

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
