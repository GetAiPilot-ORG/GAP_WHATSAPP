const SETUP_STORAGE_PREFIX = 'gap:setup-guide'

function userKey(user) {
    return user?.id || user?.email || 'anonymous'
}

function accountKey(accountId) {
    return accountId ? String(accountId) : 'no-account'
}

export function getSetupGuideStorageKey(user, accountId) {
    return `${SETUP_STORAGE_PREFIX}:${userKey(user)}:${accountKey(accountId)}`
}

export function getSetupGuidePreference(user, accountId) {
    if (typeof window === 'undefined') return { dismissed: false, welcomeDismissed: false, goal: null, skippedSteps: [] }

    try {
        const value = window.localStorage.getItem(getSetupGuideStorageKey(user, accountId))
        return value ? JSON.parse(value) : { dismissed: false, welcomeDismissed: false, goal: null, skippedSteps: [] }
    } catch {
        return { dismissed: false, welcomeDismissed: false, goal: null, skippedSteps: [] }
    }
}

export function updateSetupGuidePreference(user, accountId, updates) {
    if (typeof window === 'undefined') return

    const current = getSetupGuidePreference(user, accountId)
    window.localStorage.setItem(getSetupGuideStorageKey(user, accountId), JSON.stringify({
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
    }))
}

export function setSetupGuideDismissed(user, accountId, dismissed) {
    updateSetupGuidePreference(user, accountId, { dismissed: Boolean(dismissed) })
}

export function setSetupGoal(user, accountId, goal) {
    updateSetupGuidePreference(user, accountId, { goal, welcomeDismissed: true, dismissed: false })
}

export function dismissSetupWelcome(user, accountId) {
    updateSetupGuidePreference(user, accountId, { welcomeDismissed: true })
}

export function requestSetupGuideOpen() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('gap:open-setup-guide'))
}
