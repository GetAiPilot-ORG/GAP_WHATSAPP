/**
 * Safe Storage Helpers for Safari Private Browsing and restricted contexts.
 * In Safari Private Browsing mode or when cookies/storage are blocked,
 * accessing or writing to localStorage/sessionStorage throws SecurityError / QuotaExceededError.
 */

class MemoryStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(String(key)) ? this.store.get(String(key)) : null;
    }
    setItem(key, value) {
        this.store.set(String(key), String(value));
    }
    removeItem(key) {
        this.store.delete(String(key));
    }
    clear() {
        this.store.clear();
    }
    get length() {
        return this.store.size;
    }
    key(index) {
        return Array.from(this.store.keys())[index] || null;
    }
}

const memoryLocalStorage = new MemoryStorage();
const memorySessionStorage = new MemoryStorage();

function createSafeStorage(getStorage, memoryFallback) {
    return {
        getItem(key) {
            try {
                const storage = getStorage();
                if (storage) {
                    return storage.getItem(key);
                }
            } catch (e) {
                // Storage restricted
            }
            return memoryFallback.getItem(key);
        },
        setItem(key, value) {
            try {
                const storage = getStorage();
                if (storage) {
                    storage.setItem(key, value);
                    return;
                }
            } catch (e) {
                // Quota exceeded or private mode restriction
            }
            memoryFallback.setItem(key, value);
        },
        removeItem(key) {
            try {
                const storage = getStorage();
                if (storage) {
                    storage.removeItem(key);
                    return;
                }
            } catch (e) {
                // Ignore
            }
            memoryFallback.removeItem(key);
        },
        clear() {
            try {
                const storage = getStorage();
                if (storage) {
                    storage.clear();
                }
            } catch (e) {
                // Ignore
            }
            memoryFallback.clear();
        }
    };
}

export const safeLocalStorage = createSafeStorage(() => (typeof window !== 'undefined' ? window.localStorage : null), memoryLocalStorage);
export const safeSessionStorage = createSafeStorage(() => (typeof window !== 'undefined' ? window.sessionStorage : null), memorySessionStorage);
