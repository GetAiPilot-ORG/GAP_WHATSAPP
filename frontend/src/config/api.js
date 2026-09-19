/**
 * Dynamic API Base & Backend URL resolution
 * Ensures production builds NEVER attempt to call localhost:3001 in a live browser.
 */
const resolveBackendUrl = () => {
    const envUrl = (import.meta.env.VITE_BACKEND_URL || '').trim();
    const isBrowser = typeof window !== 'undefined';
    const isLocal = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);

    if (envUrl) {
        // If envUrl accidentally contains localhost but the user is on a live site, use live backend
        if (isBrowser && !isLocal && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
            return 'https://whatsapp.getaipilot.in';
        }
        return envUrl.replace(/\/+$/, '');
    }

    // When running on a live domain (e.g. wb.getaipilot.in, vercel, etc.) without explicit env var
    if (isBrowser && !isLocal) {
        return 'https://whatsapp.getaipilot.in';
    }

    return 'http://localhost:3001';
};

export const BACKEND_URL = resolveBackendUrl();
export const API_BASE = `${BACKEND_URL}/api`;

export const getBackendUrl = () => BACKEND_URL;
export const getApiBase = () => API_BASE;
