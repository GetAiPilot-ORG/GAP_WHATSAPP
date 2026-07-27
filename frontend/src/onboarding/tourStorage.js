const STORAGE_PREFIX = 'gap:onboarding'

export function getOnboardingUserKey(user) {
    return user?.id || user?.email || 'anon'
}

export function getTourStorageKey(user, tourId) {
    return `${STORAGE_PREFIX}:${getOnboardingUserKey(user)}:${tourId}`
}

export function getTourState(user, tourId) {
    if (!tourId || typeof window === 'undefined') return null
    try {
        const raw = window.localStorage.getItem(getTourStorageKey(user, tourId))
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export function hasTourCompleted(user, tourId) {
    const state = getTourState(user, tourId)
    return state?.status === 'completed' || state?.status === 'dismissed'
}

export function setTourState(user, tourId, status) {
    if (!tourId || typeof window === 'undefined') return
    const payload = {
        status,
        updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(getTourStorageKey(user, tourId), JSON.stringify(payload))
}

export function clearTourState(user, tourId) {
    if (!tourId || typeof window === 'undefined') return
    window.localStorage.removeItem(getTourStorageKey(user, tourId))
}

export function clearAllTourStates(user) {
    if (typeof window === 'undefined') return
    const userKey = `${STORAGE_PREFIX}:${getOnboardingUserKey(user)}:`
    Object.keys(window.localStorage)
        .filter(key => key.startsWith(userKey))
        .forEach(key => window.localStorage.removeItem(key))
}
