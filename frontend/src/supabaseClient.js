import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Provide a resilient lock handler that avoids NavigatorLockAcquireTimeoutError under rapid reloads or ServiceWorker sync
        lock: async (name, acquireTimeout, fn) => {
            if (typeof navigator !== 'undefined' && navigator.locks?.request) {
                try {
                    return await navigator.locks.request(
                        name,
                        { mode: 'exclusive', timeout: Math.max(2000, Number(acquireTimeout) || 2000) },
                        fn
                    )
                } catch {
                    // Fallback to executing directly if lock acquisition times out
                    return await fn()
                }
            }
            return await fn()
        },
    },
})
