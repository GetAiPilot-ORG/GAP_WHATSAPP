const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

export async function trackOnboardingEvent({ user, accountId, event, metadata = {} }) {
    if (!user?.id || !event) return

    try {
        const token = window.localStorage.getItem('sb-uklxlappjcuvdqjvecfh-auth-token')
        let parsedToken = ''
        if (token) {
            try {
                parsedToken = JSON.parse(token)?.access_token || ''
            } catch {}
        }

        await fetch(`${API_BASE}/whatsapp/onboarding-events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(parsedToken ? { Authorization: `Bearer ${parsedToken}` } : {}),
            },
            body: JSON.stringify({
                user_id: user.id,
                wa_account_id: accountId || null,
                event_name: event,
                metadata,
            }),
        }).catch(() => null)
    } catch {
        // Analytics must never interrupt onboarding.
    }
}
