import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import axios from 'axios'

// Safe diagnostic logging for unhandled errors without leaking credentials
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[Global Error Diagnostic]:', event?.message || event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global Unhandled Rejection]:', event?.reason?.message || event?.reason || 'Unknown rejection');
  });
}

const backendUrl = import.meta.env.VITE_BACKEND_URL || ''

const shouldSkipNgrokWarning = (resource) => {
  try {
    const url = typeof resource === 'string' ? resource : resource?.url
    return Boolean(url && (url.includes('ngrok-free.dev') || (backendUrl && url.startsWith(backendUrl))))
  } catch {
    return false
  }
}

axios.interceptors.request.use((config) => {
  if (shouldSkipNgrokWarning(config.url)) {
    config.headers = config.headers || {}
    config.headers['ngrok-skip-browser-warning'] = 'true'
  }
  return config
})

// Bypass Ngrok's anti-abuse warning screen for backend API fetches safely.
const originalFetch = window.fetch;
if (typeof originalFetch === 'function') {
  window.fetch = async (...args) => {
    try {
      let [resource, config] = args;
      if (shouldSkipNgrokWarning(resource)) {
        config = config || {}
        const headers = new Headers(config.headers || {})
        headers.set('ngrok-skip-browser-warning', 'true')
        config.headers = headers
      }
      return await originalFetch(resource, config);
    } catch (err) {
      throw err;
    }
  };
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

