import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../supabaseClient'
import { API_BASE } from '../config/api'
import { getNumberCapacity } from '../utils/numberCapacity'

const WhatsAppAccountContext = createContext(null)

const SELECTED_WA_ACCOUNT_KEY = 'selected_wa_account_id'

export function WhatsAppAccountProvider({ children }) {
    const { session, apiCall } = useAuth()
    const [numberPlan, setNumberPlan] = useState(null)
    const refreshNumberPlan = useCallback(async () => {
        if (!session?.access_token) { setNumberPlan(null); return }
        try {
            const response = await apiCall(`${API_BASE}/billing/overview`)
            if (response.ok) { const data = await response.json(); setNumberPlan(data.current_plan) }
        } catch { /* Keep the last known plan during a temporary connection failure. */ }
    }, [session?.access_token, apiCall])
    useEffect(() => {
        setNumberPlan(null)
        refreshNumberPlan()
        window.addEventListener('focus', refreshNumberPlan)
        return () => window.removeEventListener('focus', refreshNumberPlan)
    }, [refreshNumberPlan])
    const [accounts, setAccounts] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedAccountId, setSelectedAccountId] = useState(
        () => localStorage.getItem(SELECTED_WA_ACCOUNT_KEY) || 'All'
    )

    const fetchAccounts = useCallback(async () => {
        if (!session?.access_token) {
            setAccounts([])
            setIsLoading(false)
            return
        }

        try {
            setIsLoading(true)
            setError(null)
            const res = await apiCall(`${API_BASE}/whatsapp/accounts`)
            const data = await res.json().catch(() => [])

            if (!res.ok) {
                throw new Error(data?.error || `Could not fetch accounts (${res.status})`)
            }

            const list = Array.isArray(data) ? data : []
            setAccounts(list)
        } catch (err) {
            console.error('[WhatsAppAccountContext] Error fetching accounts:', err)
            setError(err.message || 'Could not load WhatsApp accounts')
        } finally {
            setIsLoading(false)
        }
    }, [session?.access_token, apiCall])

    // Initial Fetch on session load
    useEffect(() => {
        fetchAccounts()
    }, [fetchAccounts])

    // Supabase Realtime CDC Subscription on w_wa_accounts table
    useEffect(() => {
        if (!session?.access_token) return

        const channel = supabase
            .channel('public:w_wa_accounts')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'w_wa_accounts' },
                (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        const updatedRow = payload.new
                        if (updatedRow.status === 'disconnected') {
                            setAccounts(prev => prev.filter(acc => String(acc.id) !== String(updatedRow.id)))
                            return
                        }
                        const isMetaRow = Boolean(
                            updatedRow.whatsapp_business_account_id ||
                            updatedRow.access_token_encrypted ||
                            updatedRow.has_access_token
                        )
                        const connUpper = String(updatedRow.connection_status || updatedRow.status || 'CONNECTED').toUpperCase()
                        const reconnectingRow = !isMetaRow && (connUpper === 'CHECKING' || connUpper === 'CONNECTING' || updatedRow.status === 'connecting')
                        const sendReadyRow = isMetaRow
                            ? Boolean(
                                updatedRow.phone_number_id &&
                                updatedRow.whatsapp_business_account_id &&
                                (updatedRow.access_token_encrypted || updatedRow.has_access_token) &&
                                updatedRow.status !== 'disconnected'
                              )
                            : (updatedRow.status === 'connected' || updatedRow.status === 'active') &&
                              !['DISCONNECTED', 'WARNING', 'FAILED', 'TOKEN_INVALID'].includes(connUpper)

                        setAccounts(prev => {
                            const index = prev.findIndex(acc => String(acc.id) === String(updatedRow.id))
                            const normalizedHealth = {
                                connection: isMetaRow ? connUpper : (sendReadyRow ? 'CONNECTED' : (reconnectingRow ? 'CHECKING' : 'DISCONNECTED')),
                                messaging: sendReadyRow ? 'SEND_READY' : 'PAUSED',
                                token: isMetaRow ? (updatedRow.token_status || 'VALID') : 'MISSING',
                                verification: updatedRow.business_verification_status || 'VERIFIED',
                                quality: updatedRow.quality_rating || 'GREEN',
                                has_access_token: Boolean(updatedRow.access_token_encrypted || updatedRow.has_access_token),
                                health_version: Number(updatedRow.health_version || 1),
                                last_updated: updatedRow.last_health_check_at || updatedRow.updated_at || new Date().toISOString(),
                            }
                            if (index >= 0) {
                                const current = prev[index]
                                const currentVer = Number(current.health_version || current.health?.health_version || 1)
                                const newVer = Number(updatedRow.health_version || 1)

                                // Ignore stale updates (newest update wins)
                                if (newVer < currentVer && updatedRow.status !== 'disconnected') return prev

                                const next = [...prev]
                                next[index] = {
                                    ...current,
                                    ...updatedRow,
                                    has_access_token: Boolean(updatedRow.access_token_encrypted || updatedRow.has_access_token),
                                    connection_type: isMetaRow ? 'meta_cloud_api' : 'qr_session',
                                    send_ready: sendReadyRow,
                                    reconnecting: reconnectingRow,
                                    health: normalizedHealth,
                                }
                                return next
                            } else {
                                return [{
                                    ...updatedRow,
                                    has_access_token: Boolean(updatedRow.access_token_encrypted || updatedRow.has_access_token),
                                    connection_type: isMetaRow ? 'meta_cloud_api' : 'qr_session',
                                    send_ready: sendReadyRow,
                                    reconnecting: reconnectingRow,
                                    health: normalizedHealth,
                                }, ...prev]
                            }
                        })
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old?.id
                        if (deletedId) {
                            setAccounts(prev => prev.filter(acc => String(acc.id) !== String(deletedId)))
                        }
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [session?.access_token])

    useEffect(() => {
        const handleAccountChange = (e) => {
            const nextId = e?.detail?.accountId ?? localStorage.getItem(SELECTED_WA_ACCOUNT_KEY) ?? 'All'
            setSelectedAccountId(String(nextId || 'All'))
        }
        const handleStorage = (e) => {
            if (e.key === SELECTED_WA_ACCOUNT_KEY) {
                setSelectedAccountId(String(e.newValue || 'All'))
            }
        }
        window.addEventListener('selected-wa-account-change', handleAccountChange)
        window.addEventListener('storage', handleStorage)
        return () => {
            window.removeEventListener('selected-wa-account-change', handleAccountChange)
            window.removeEventListener('storage', handleStorage)
        }
    }, [])

    const handleSelectAccount = useCallback((id) => {
        const val = String(id || 'All')
        setSelectedAccountId(val)
        try {
            localStorage.setItem(SELECTED_WA_ACCOUNT_KEY, val)
        } catch {}
        window.dispatchEvent(new CustomEvent('selected-wa-account-change', { detail: { accountId: val } }))
    }, [])

    const selectedAccount = useMemo(() => {
        if (!selectedAccountId || selectedAccountId === 'All') return null
        return accounts.find(acc =>
            String(acc.id) === selectedAccountId ||
            String(acc.phone_number_id) === selectedAccountId ||
            String(acc.display_phone_number) === selectedAccountId
        ) || null
    }, [accounts, selectedAccountId])

    const value = useMemo(() => ({
        accounts,
        numberCapacity: getNumberCapacity(accounts, numberPlan),
        refreshNumberPlan,
        selectedAccount,
        selectedAccountId,
        setSelectedAccount: handleSelectAccount,
        isLoading,
        error,
        refetchAccounts: fetchAccounts,
    }), [accounts, numberPlan, refreshNumberPlan, selectedAccount, selectedAccountId, handleSelectAccount, isLoading, error, fetchAccounts])

    return (
        <WhatsAppAccountContext.Provider value={value}>
            {children}
        </WhatsAppAccountContext.Provider>
    )
}

export function useWhatsAppAccounts() {
    const context = useContext(WhatsAppAccountContext)
    if (!context) {
        throw new Error('useWhatsAppAccounts must be used within a WhatsAppAccountProvider')
    }
    return context
}
