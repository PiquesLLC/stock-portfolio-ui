import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { JargonProvider } from './context/JargonContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <JargonProvider>
          <App />
        </JargonProvider>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
