import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

// Map raw plan IDs → display names
function resolvePlanName(plan) {
    if (!plan) return 'No active plan'
    const p = plan.toLowerCase()
    if (p === 'free' || p === 'whatsapp_free' || p === '') return 'No active plan'
    return plan
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState(null)
    const [memberProfile, setMemberProfile] = useState(null)
    const [isProfileLoading, setIsProfileLoading] = useState(false)
    const fetchedForProfileKey = useRef(null) // tracks which user + portal we last fetched profile for
    const lastSubscriptionCheckRef = useRef(0)
    const [loginType, setLoginType] = useState(localStorage.getItem('auth_login_type') || 'owner')

    const fetchUserProfile = useCallback(async (sessionUser) => {
        try {
            // Find organization owner to get their subscription status
            const { data: member } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', sessionUser.id)
                .maybeSingle()

            let ownerId = sessionUser.id
            if (member?.organization_id) {
                const { data: ownerMember } = await supabase
                    .from('organization_members')
                    .select('user_id')
                    .eq('organization_id', member.organization_id)
                    .eq('role', 'owner')
                    .maybeSingle()
                if (ownerMember?.user_id) {
                    ownerId = ownerMember.user_id
                }
            }

            const { data: sub } = await supabase
                .from('app_user_subscriptions')
                .select('plan_id, plan_label, expires_at')
                .eq('user_id', ownerId)
                .maybeSingle()

            const isSubActive = sub?.expires_at ? new Date(sub.expires_at) > new Date() : false
            let resolvedPlan = isSubActive
                ? (sub?.plan_label || sub?.plan_id || 'No active plan')
                : 'No active plan'
            const resolvedStatus = isSubActive ? 'active' : (sub ? 'expired' : 'inactive')

            resolvedPlan = resolvePlanName(resolvedPlan)

            setUser(prev => prev ? { ...prev, plan: resolvedPlan, subscription_status: resolvedStatus, subscription_checked: true } : null)
        } catch (err) {
            console.error('[AUTH] fetchUserProfile error:', err)
            setUser(prev => prev ? { ...prev, subscription_checked: true } : null)
        }
    }, [])

    const refreshProfile = useCallback(async () => {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession?.user) {
            await supabase.auth.refreshSession()
            const { data: { session: fresh } } = await supabase.auth.getSession()
            if (fresh?.user) await fetchUserProfile(fresh.user)
        }
    }, [fetchUserProfile])

    const fetchMemberProfile = async (token, userId) => {
        // Avoid re-fetching on TOKEN_REFRESHED (tab focus) — only fetch when user actually changes
        const profileKey = `${userId}:${loginType || 'owner'}:${token}`
        if (fetchedForProfileKey.current === profileKey && userRole !== null) return
        fetchedForProfileKey.current = profileKey
        setUserRole(null)
        setMemberProfile(null)
        setIsProfileLoading(true)
        try {
            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/my-profile`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Auth-Portal': loginType
                }
            })
            if (res.ok) {
                const data = await res.json()
                const role = data?.role || (loginType === 'agent' ? 'agent' : 'owner')
                setUserRole(role)
                setMemberProfile(data)
            } else {
                const errorData = await res.json().catch(() => ({}))
                console.warn("Failed to resolve profile role:", res.status, errorData?.error || res.statusText)
                setUserRole('agent')
                setMemberProfile(null)
            }
        } catch (e) {
            console.error("Failed to fetch member profile", e)
            setUserRole('agent')
            setMemberProfile(null)
        } finally {
            setIsProfileLoading(false)
        }
    }

    useEffect(() => {
        // Initial session load — sets loading=false exactly once
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session ?? null)
            if (session?.user) {
                setUser({ ...session.user, plan: resolvePlanName(session.user.user_metadata?.plan), subscription_status: session.user.user_metadata?.subscription_status || 'inactive' })
                fetchUserProfile(session.user)
                lastSubscriptionCheckRef.current = Date.now()
            } else {
                setUser(null)
            }
            setLoading(false)
        })

        // Listen for auth state changes (login, logout, token refresh on tab focus, etc.)
        // Do NOT call setLoading here — it causes children to unmount/remount on
        // TOKEN_REFRESHED events (tab switching), wiping form state in child pages.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            setSession(session ?? null)
            if (session?.user) {
                setUser(prev => {
                    const isSameUser = prev && prev.id === session.user.id;
                    return {
                        ...session.user,
                        plan: isSameUser && prev.subscription_checked ? prev.plan : resolvePlanName(session.user.user_metadata?.plan),
                        subscription_status: isSameUser && prev.subscription_checked ? prev.subscription_status : (session.user.user_metadata?.subscription_status || 'inactive'),
                        subscription_checked: isSameUser ? (prev.subscription_checked || false) : false
                    };
                });
                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    fetchUserProfile(session.user)
                    lastSubscriptionCheckRef.current = Date.now()
                } else if (event === 'TOKEN_REFRESHED') {
                    const fiveMinutes = 5 * 60 * 1000
                    if (Date.now() - lastSubscriptionCheckRef.current > fiveMinutes) {
                        fetchUserProfile(session.user)
                        lastSubscriptionCheckRef.current = Date.now()
                    }
                }
            } else {
                setUser(null)
            }

            // Handle sign out on token expiry
            if (event === 'SIGNED_OUT') {
                setUserRole(null)
                setMemberProfile(null)
                setIsProfileLoading(false)
                fetchedForProfileKey.current = null
            }
        })

        return () => subscription.unsubscribe()
    }, [fetchUserProfile])

    useEffect(() => {
        if (session?.access_token && session?.user?.id) {
            fetchMemberProfile(session.access_token, session.user.id)
        } else if (!session) {
            // Logged out — reset everything
            fetchedForProfileKey.current = null
            setUserRole(null)
            setMemberProfile(null)
            setIsProfileLoading(false)
        }
    }, [session?.user?.id, session?.access_token, loginType])

    const updateMyOnlineStatus = async (isOnline) => {
        const token = session?.access_token
        if (!token) throw new Error('No session token')

        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Auth-Portal': loginType || 'owner'
            },
            body: JSON.stringify({ is_online: isOnline })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to update online status')

        setMemberProfile(prev => prev ? { ...prev, is_online: isOnline } : prev)
        return data
    }

    useEffect(() => {
        if (session?.access_token && memberProfile && memberProfile.role !== 'owner') {
            let sent = false;
            const handleUnload = () => {
                if (sent) return;
                sent = true;
                const token = session.access_token;
                const url = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/status`;
                fetch(url, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Auth-Portal': loginType || 'owner'
                    },
                    body: JSON.stringify({ is_online: false }),
                    keepalive: true
                }).catch(() => { });
            };

            window.addEventListener('beforeunload', handleUnload);
            window.addEventListener('pagehide', handleUnload);
            return () => {
                window.removeEventListener('beforeunload', handleUnload);
                window.removeEventListener('pagehide', handleUnload);
            };
        }
    }, [session?.access_token, memberProfile, loginType]);

    const updateMyProfile = async ({ name, avatar_color }) => {
        const token = session?.access_token
        if (!token) throw new Error('No session token')

        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/my-profile`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Auth-Portal': loginType || 'owner'
            },
            body: JSON.stringify({ name, avatar_color })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to update profile')

        setMemberProfile(data)
        setUser(prev => prev ? {
            ...prev,
            user_metadata: {
                ...(prev.user_metadata || {}),
                full_name: data.name || name,
                name: data.name || name,
                avatar_color: data.avatar_color || avatar_color
            }
        } : prev)
        return data
    }

    const value = {
        signUp: (data) => supabase.auth.signUp(data),
        signIn: async (data, type = 'owner') => {
            fetchedForProfileKey.current = null
            setUserRole(null)
            setMemberProfile(null)
            setLoginType(type)
            localStorage.setItem('auth_login_type', type)
            return supabase.auth.signInWithPassword(data)
        },
        signInWithGoogle: () => supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard`
            }
        }),
        signOut: async () => {
            if (session?.access_token && memberProfile && memberProfile.role !== 'owner') {
                try {
                    await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/status`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.access_token}`,
                            'X-Auth-Portal': loginType || 'owner'
                        },
                        body: JSON.stringify({ is_online: false })
                    });
                } catch (e) {
                    console.error("Failed to set offline status on signOut", e);
                }
            }
            setUserRole(null)
            setMemberProfile(null)
            fetchedForProfileKey.current = null
            localStorage.removeItem('auth_login_type')
            return supabase.auth.signOut()
        },
        refreshProfile,
        // Utility function for API calls with automatic token refresh
        apiCall: async (url, options = {}) => {
            const makeRequest = async (retryCount = 0, tokenOverride = null) => {
                try {
                    let { data: { session: currentSession } } = await supabase.auth.getSession()
                    const expiresAtMs = currentSession?.expires_at ? currentSession.expires_at * 1000 : null
                    const isExpiring = expiresAtMs && expiresAtMs < Date.now() + 60_000

                    if (!tokenOverride && isExpiring) {
                        const { data, error } = await supabase.auth.refreshSession()
                        if (error) {
                            supabase.auth.signOut().catch(() => {});
                            throw error;
                        }
                        currentSession = data.session
                        if (data.session) {
                            setSession(data.session)
                            setUser(data.session.user)
                        }
                    }

                    const token = tokenOverride || currentSession?.access_token || session?.access_token;
                    if (!token) throw new Error('No session token');
                    const headers = {
                        'Authorization': `Bearer ${token}`,
                        'X-Auth-Portal': loginType || 'owner',
                        ...options.headers
                    }

                    if (!(options.body instanceof FormData)) {
                        headers['Content-Type'] = 'application/json'
                    }

                    const response = await fetch(url, {
                        ...options,
                        headers
                    });

                    // If 401, try to refresh token once
                    if (response.status === 401 && retryCount === 0) {
                        const { data, error } = await supabase.auth.refreshSession();
                        if (error) {
                            supabase.auth.signOut().catch(() => {});
                            throw error;
                        }
                        if (data.session) {
                            setSession(data.session);
                            setUser(data.session.user);
                            // Retry the request with new token
                            return makeRequest(1, data.session.access_token);
                        }
                    }

                    return response;
                } catch (error) {
                    console.error('API call error:', error);
                    throw error;
                }
            };

            return makeRequest();
        },
        user,
        session,
        userRole,
        memberProfile,
        isProfileLoading,
        loginType,
        updateMyProfile,
        updateMyOnlineStatus,
        setMemberProfile
    }

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
