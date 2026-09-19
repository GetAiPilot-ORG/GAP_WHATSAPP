import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import axios from 'axios'
import { BACKEND_URL } from './config/api'

const backendUrl = BACKEND_URL

const shouldSkipNgrokWarning = (resource) => {
  const url = typeof resource === 'string' ? resource : resource?.url
  return url?.includes('ngrok-free.dev') || (backendUrl && url?.startsWith(backendUrl))
}

axios.interceptors.request.use((config) => {
  if (shouldSkipNgrokWarning(config.url)) {
    config.headers = config.headers || {}
    config.headers['ngrok-skip-browser-warning'] = 'true'
  }
  return config
})

// Bypass Ngrok's anti-abuse warning screen for backend API fetches.
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  if (shouldSkipNgrokWarning(resource)) {
    config = config || {}
    const headers = new Headers(config.headers || {})
    headers.set('ngrok-skip-browser-warning', 'true')
    config.headers = headers
  }
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
