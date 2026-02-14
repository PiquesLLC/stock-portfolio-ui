import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { JargonProvider } from './context/JargonContext'
import { DataEventProvider } from './context/DataEventContext'

// Unregister any existing service workers to clear stale caches
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(r => r.unregister());
  });
  // Also clear all caches
  if ('caches' in window) {
    caches.keys().then(names => names.forEach(name => caches.delete(name)));
  }
}

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
