import { lazy } from 'react';
import { safeSessionStorage } from './safeStorage';

/**
 * Wraps dynamic React.lazy imports with a single-retry recovery mechanism.
 * If a deployment happens and Safari has a cached index.html requesting an old chunk hash,
 * the chunk fetch will fail (Failed to fetch dynamically imported module).
 * safeLazy catches this and triggers one automatic reload to fetch the latest index.html and chunks.
 */
export function safeLazy(importFn) {
    return lazy(async () => {
        try {
            const module = await importFn();
            return module;
        } catch (error) {
            const isChunkError =
                error?.name === 'ChunkLoadError' ||
                error?.message?.includes('Failed to fetch dynamically imported module') ||
                error?.message?.includes('error loading dynamically imported module') ||
                error?.message?.includes('Importing a module script failed') ||
                error?.message?.includes('Loading chunk');

            const storageKey = `gap_chunk_retry_${typeof window !== 'undefined' ? window.location.pathname : 'global'}`;
            const hasRetried = safeSessionStorage.getItem(storageKey);

            if (isChunkError && !hasRetried) {
                safeSessionStorage.setItem(storageKey, 'true');
                console.warn('[safeLazy] Stale chunk detected, refreshing page once:', error);
                if (typeof window !== 'undefined') {
                    window.location.reload();
                }
                // Return a pending promise so React Suspense waits without throwing before reload completes
                return new Promise(() => {});
            }

            // If already retried or not a chunk error, rethrow to ErrorBoundary
            throw error;
        }
    });
}
