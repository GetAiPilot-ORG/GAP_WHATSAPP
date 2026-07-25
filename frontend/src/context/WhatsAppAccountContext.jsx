import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../supabaseClient'

const WhatsAppAccountContext = createContext(null)

const SELECTED_WA_ACCOUNT_KEY = 'selected_wa_account_id'
const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`

export function WhatsAppAccountProvider({ children }) {
    const { session, apiCall } = useAuth()
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
                        setAccounts(prev => {
                            const index = prev.findIndex(acc => String(acc.id) === String(updatedRow.id))
                            if (index >= 0) {
                                const current = prev[index]
                                const currentVer = Number(current.health_version || current.health?.health_version || 1)
                                const newVer = Number(updatedRow.health_version || 1)

                                // Ignore stale updates (newest update wins)
                                if (newVer < currentVer) return prev

                                const next = [...prev]
                                next[index] = {
                                    ...current,
                                    ...updatedRow,
                                    has_access_token: Boolean(updatedRow.access_token_encrypted || updatedRow.has_access_token),
                                    health: {
                                        connection: String(updatedRow.connection_status || updatedRow.status || 'CONNECTED').toUpperCase(),
                                        messaging: updatedRow.status === 'connected' ? 'SEND_READY' : 'PAUSED',
                                        token: updatedRow.token_status || 'VALID',
                                        verification: updatedRow.business_verification_status || 'VERIFIED',
                                        quality: updatedRow.quality_rating || 'GREEN',
                                        has_access_token: Boolean(updatedRow.access_token_encrypted || updatedRow.has_access_token),
                                        health_version: newVer,
                                        last_updated: updatedRow.last_health_check_at || updatedRow.updated_at || new Date().toISOString(),
                                    }
                                }
                                return next
                            } else {
                                return [updatedRow, ...prev]
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

    const handleSelectAccount = useCallback((id) => {
        const val = String(id || 'All')
        setSelectedAccountId(val)
        localStorage.setItem(SELECTED_WA_ACCOUNT_KEY, val)
        window.dispatchEvent(new CustomEvent('selected-wa-account-change', { detail: { accountId: val } }))
    }, [])

    const selectedAccount = useMemo(() => {
        if (selectedAccountId === 'All') return null
        return accounts.find(acc => String(acc.id) === selectedAccountId || String(acc.phone_number_id) === selectedAccountId) || null
    }, [accounts, selectedAccountId])

    const value = useMemo(() => ({
        accounts,
        selectedAccount,
        selectedAccountId,
        setSelectedAccount: handleSelectAccount,
        isLoading,
        error,
        refetchAccounts: fetchAccounts,
    }), [accounts, selectedAccount, selectedAccountId, handleSelectAccount, isLoading, error, fetchAccounts])

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
