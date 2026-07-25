import { createElement, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    AlertCircle,
    ArrowRight,
    BadgeCheck,
    Building2,
    CheckCircle2,
    ChevronDown,
    FileCheck2,
    HelpCircle,
    KeyRound,
    Loader2,
    MessageSquareText,
    PhoneCall,
    QrCode,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Wallet,
    X,
} from 'lucide-react'
import WhatsAppLogin from '../components/WhatsAppLogin'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { formatINRFromPaise } from '../config/whatsappPricing'
import TourButton from '../onboarding/TourButton'
import { loadFacebookSDK } from '../services/facebookSdkLoader'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${API_URL}/api`
const META_APP_ID = import.meta.env.VITE_META_APP_ID || '1459710399100167'
const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID || '1108075894853600'
const META_EMBEDDED_SIGNUP_VERSION = import.meta.env.VITE_META_EMBEDDED_SIGNUP_VERSION || 'v4'
const META_EMBEDDED_SESSION_INFO_VERSION = import.meta.env.VITE_META_EMBEDDED_SESSION_INFO_VERSION || '3'

export default function WhatsAppConnect() {
    const { session, apiCall } = useAuth()
    const { alertDialog, confirmDialog } = useDialog()
    const [accounts, setAccounts] = useState([])
    const [loadingAccounts, setLoadingAccounts] = useState(true)
    const [accountsLoadError, setAccountsLoadError] = useState('')
    const [billing, setBilling] = useState(null)
    const [embedStatus, setEmbedStatus] = useState('idle')
    const [embedError, setEmbedError] = useState('')
    const [manualOpen, setManualOpen] = useState(true)
    const [manualCreds, setManualCreds] = useState({ businessAccountId: '', accessToken: '' })
    const [manualPhoneNumbers, setManualPhoneNumbers] = useState([])
    const [manualSelectedPhoneId, setManualSelectedPhoneId] = useState('')
    const [manualStatus, setManualStatus] = useState('idle')
    const [manualError, setManualError] = useState('')
    const [diagnostics, setDiagnostics] = useState({})
    const [diagnosticsLoadingId, setDiagnosticsLoadingId] = useState(null)
    const [hasIntegrationConsent, setHasIntegrationConsent] = useState(() => {
        if (import.meta.env.VITE_ENABLE_COOKIE_CONSENT !== 'true') return true
        try {
            const stored = localStorage.getItem('gap_cookie_consent')
            if (stored) {
                const parsed = JSON.parse(stored)
                return !!parsed.integrations
            }
        } catch (e) {
            console.error(e)
        }
        return false
    })
    const [isSdkLoading, setIsSdkLoading] = useState(false)
    const [activeAccordion, setActiveAccordion] = useState(0)

    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    const isSecureForMetaLogin = window.location.protocol === 'https:' || isLocalHost
    const activeConnections = useMemo(() => accounts, [accounts])

    useEffect(() => {
        if (!session?.access_token) return
        fetchAccounts()
        fetchBilling()
    }, [session?.access_token])

    useEffect(() => {
        const refreshMetaStatuses = () => {
            accounts
                .filter(account => account.whatsapp_business_account_id)
                .forEach(account => runAccountDiagnostics(account.id, { silent: true }))
        }
        window.addEventListener('focus', refreshMetaStatuses)
        return () => window.removeEventListener('focus', refreshMetaStatuses)
    }, [accounts])

    useEffect(() => {
        if (import.meta.env.VITE_ENABLE_COOKIE_CONSENT === 'true') {
            if (hasIntegrationConsent) {
                setIsSdkLoading(true)
                loadFacebookSDK()
                    .then(() => setIsSdkLoading(false))
                    .catch((err) => {
                        console.error('Failed to load Facebook SDK:', err)
                        setIsSdkLoading(false)
                    })
            }
        } else {
            // Rollback safety: load SDK automatically when compliance is disabled
            loadFacebookSDK().catch((err) => {
                console.error('Failed to load Facebook SDK (compliance disabled):', err)
            })
        }
    }, [hasIntegrationConsent])

    useEffect(() => {
        const checkConsent = () => {
            if (import.meta.env.VITE_ENABLE_COOKIE_CONSENT === 'true') {
                try {
                    const stored = localStorage.getItem('gap_cookie_consent')
                    if (stored) {
                        const parsed = JSON.parse(stored)
                        if (!!parsed.integrations !== hasIntegrationConsent) {
                            setHasIntegrationConsent(!!parsed.integrations)
                        }
                    }
                } catch (e) { }
            }
        }

        window.addEventListener('focus', checkConsent)
        const interval = setInterval(checkConsent, 1000)

        return () => {
            window.removeEventListener('focus', checkConsent)
            clearInterval(interval)
        }
    }, [hasIntegrationConsent])

    const getAuthHeader = () => {
        const token = session?.access_token
        return token ? { Authorization: `Bearer ${token}` } : {}
    }

    const fetchBilling = async () => {
        try {
            const res = await apiCall(`${API_BASE}/billing/overview`)
            const data = await res.json().catch(() => ({}))
            if (res.ok) setBilling(data)
        } catch {
            setBilling(null)
        }
    }

    const fetchAccounts = async () => {
        setLoadingAccounts(true)
        setAccountsLoadError('')
        try {
            const res = await fetch(`${API_BASE}/whatsapp/accounts`, {
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            })
            const data = await res.json().catch(() => [])
            if (!res.ok) throw new Error(data?.error || `Could not load accounts (${res.status})`)
            const list = Array.isArray(data) ? data : []
            setAccounts(list)
            list.filter(acc => acc.connection_type === 'meta_cloud_api' || acc.whatsapp_business_account_id)
                .slice(0, 3)
                .forEach(acc => runAccountDiagnostics(acc.id, { silent: true }))
            return list
        } catch (error) {
            setAccounts([])
            setAccountsLoadError(error?.message || 'Could not load connected WhatsApp numbers.')
            return []
        } finally {
            setLoadingAccounts(false)
        }
    }

    const runAccountDiagnostics = async (id, options = {}) => {
        if (!options.silent) setDiagnosticsLoadingId(id)
        try {
            const res = await fetch(`${API_BASE}/whatsapp/accounts/${id}/diagnostics`, {
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to inspect account')
            setDiagnostics(prev => ({ ...prev, [id]: data }))
        } catch (err) {
            setDiagnostics(prev => ({ ...prev, [id]: { send_ready: false, issues: [err.message] } }))
        } finally {
            if (!options.silent) setDiagnosticsLoadingId(null)
        }
    }

    const handleDeleteAccount = async (id) => {
        const confirmed = await confirmDialog('Disconnect this WhatsApp account?', {
            title: 'Disconnect account',
            tone: 'danger',
            confirmLabel: 'Disconnect',
        })
        if (!confirmed) return

        try {
            const res = await fetch(`${API_BASE}/whatsapp/accounts/${id}`, {
                method: 'DELETE',
                headers: { ...getAuthHeader() },
            })
            if (res.ok) setAccounts(prev => prev.filter(a => a.id !== id))
        } catch {
            alertDialog('Failed to disconnect account', { title: 'Disconnect failed', tone: 'danger' })
        }
    }

    const handleEmbeddedSignupResponse = async (response) => {
        if (!response.authResponse?.code) {
            setEmbedStatus('idle')
            return
        }

        setEmbedStatus('saving')
        setEmbedError('')
        try {
            const res = await fetch(`${API_BASE}/wa/connect/callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ code: response.authResponse.code }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Connection failed')
            setEmbedStatus('saved')
            setEmbedError('')
            if (Array.isArray(data.accounts) && data.accounts.length > 0) {
                setAccounts(prev => mergeAccounts(prev, data.accounts))
            }
            await fetchAccounts()
            await fetchBilling()
            setTimeout(() => setEmbedStatus('idle'), 5000)
        } catch (err) {
            const refreshedAccounts = await fetchAccounts()
            await fetchBilling()
            const hasConnectedMetaAccount = refreshedAccounts.some(acc => acc.connection_type === 'meta_cloud_api' || acc.whatsapp_business_account_id)
            if (hasConnectedMetaAccount && String(err.message || '').toLowerCase().includes('limit reached')) {
                setEmbedError('')
                setEmbedStatus('saved')
                setTimeout(() => setEmbedStatus('idle'), 5000)
                return
            }
            setEmbedError(err.message || 'Connection failed')
            setEmbedStatus('error')
        }
    }

    const handleEnableAndConnect = async () => {
        const consent = {
            necessary: true,
            analytics: false,
            integrations: true,
            version: 1
        }
        try {
            const stored = localStorage.getItem('gap_cookie_consent')
            if (stored) {
                const parsed = JSON.parse(stored)
                Object.assign(consent, parsed, { integrations: true })
            }
        } catch (e) { }

        localStorage.setItem('gap_cookie_consent', JSON.stringify(consent))
        setHasIntegrationConsent(true)

        setIsSdkLoading(true)
        try {
            await loadFacebookSDK()
            setIsSdkLoading(false)
            // Trigger login immediately
            setEmbedStatus('loading')
            setEmbedError('')
            window.FB.login((response) => handleEmbeddedSignupResponse(response), {
                config_id: META_CONFIG_ID,
                response_type: 'code',
                override_default_response_type: true,
                extras: {
                    setup: {},
                    featureType: '',
                    sessionInfoVersion: META_EMBEDDED_SESSION_INFO_VERSION,
                    version: META_EMBEDDED_SIGNUP_VERSION,
                },
            })
        } catch (err) {
            setIsSdkLoading(false)
            alertDialog(err.message || 'Failed to load Facebook SDK. Check connection.', { title: 'Load failed', tone: 'danger' })
        }
    }

    const handleEmbeddedSignup = () => {
        if (!isSecureForMetaLogin) {
            setEmbedStatus('error')
            setEmbedError('Meta login requires HTTPS. Use your deployed URL or HTTPS ngrok URL.')
            return
        }
        if (!window.FB) {
            if (import.meta.env.VITE_ENABLE_COOKIE_CONSENT === 'true' && !hasIntegrationConsent) {
                handleEnableAndConnect()
                return
            }
            alertDialog('Facebook SDK is loading. Try again in a moment.', { title: 'Meta login not ready', tone: 'warning' })
            return
        }

        setEmbedStatus('loading')
        setEmbedError('')
        window.FB.login((response) => handleEmbeddedSignupResponse(response), {
            config_id: META_CONFIG_ID,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
                setup: {},
                featureType: '',
                sessionInfoVersion: META_EMBEDDED_SESSION_INFO_VERSION,
                version: META_EMBEDDED_SIGNUP_VERSION,
            },
        })
    }

    const handleManualConnect = async (event) => {
        event.preventDefault()
        const businessAccountId = manualCreds.businessAccountId.trim()
        const accessToken = manualCreds.accessToken.trim()
        if (!businessAccountId || !accessToken) {
            setManualError('Please enter both WABA ID and access token.')
            return
        }

        if (manualPhoneNumbers.length === 0) {
            setManualStatus('validating')
            setManualError('')
            try {
                const res = await fetch(`https://graph.facebook.com/v21.0/${businessAccountId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`)
                const data = await res.json()
                if (data.error) throw new Error(data.error.message)
                if (!data.data?.length) throw new Error('No phone numbers found for this WABA.')
                setManualPhoneNumbers(data.data)
                setManualSelectedPhoneId(data.data[0].id)
                setManualStatus('idle')
            } catch (err) {
                setManualError(err.message)
                setManualStatus('error')
            }
            return
        }

        setManualStatus('saving')
        setManualError('')
        try {
            const selectedPhone = manualPhoneNumbers.find(p => p.id === manualSelectedPhoneId)
            const res = await fetch(`${API_BASE}/whatsapp/accounts/meta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({
                    phone_number_id: manualSelectedPhoneId,
                    waba_id: businessAccountId,
                    access_token: accessToken,
                    display_phone_number: selectedPhone?.display_phone_number || '',
                    name: selectedPhone?.verified_name || 'WhatsApp Business',
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to save account')
            setManualStatus('saved')
            setManualCreds({ businessAccountId: '', accessToken: '' })
            setManualPhoneNumbers([])
            setManualSelectedPhoneId('')
            await fetchAccounts()
        } catch (err) {
            setManualError(err.message)
            setManualStatus('error')
        }
    }

    const walletBalance = billing?.wallet?.balance_paise || 0
    const monthSpend = billing?.spend?.month_spend_paise || 0

    return (
        <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6 pb-12 sm:pb-20">
            <section className="rounded-lg border border-[#b9dcfb] bg-white">
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_360px]">
                    <div className="border-b border-[#d9ecfd] bg-[#eef7ff] p-5 sm:p-6 lg:border-b-0 lg:border-r rounded-t-lg lg:rounded-l-lg lg:rounded-tr-none">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#b9dcfb] bg-white px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-[#0064b7]">
                            <Sparkles className="h-3.5 w-3.5" />
                            Start here
                        </div>
                        <h1 className="mt-3 sm:mt-4 max-w-3xl text-base sm:text-3xl font-semibold leading-normal sm:leading-tight text-gray-950">Connect WhatsApp so your dashboard, chats, broadcasts and automations can start working.</h1>
                        <p className="mt-2.5 sm:mt-3 max-w-3xl text-[11px] sm:text-sm leading-relaxed sm:leading-6 text-gray-600">
                            Simple meaning: aapka business WhatsApp number is platform se link hoga. Connection ke baad messages sync honge, templates create honge, wallet billing track hogi, and AI/flows ko real inbox access milega.
                        </p>
                        <div className="mt-4 sm:mt-5 flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={hasIntegrationConsent ? handleEmbeddedSignup : handleEnableAndConnect}
                                data-tour="connect-primary"
                                disabled={embedStatus === 'loading' || embedStatus === 'saving' || isSdkLoading}
                                className="inline-flex min-h-9 sm:min-h-12 items-center justify-center gap-2 rounded-full bg-[#0070d1] px-4 sm:px-6 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-[#0064b7] disabled:cursor-not-allowed disabled:bg-[#79b8ef]"
                            >
                                {embedStatus === 'loading' || embedStatus === 'saving' || isSdkLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {isSdkLoading ? 'Enabling...' : embedStatus === 'saving' ? 'Saving account...' : 'Opening Meta signup...'}
                                    </>
                                ) : (
                                    <>
                                        <Smartphone className="h-4 w-4" />
                                        {hasIntegrationConsent ? 'Connect WhatsApp account' : 'Enable & Connect'}
                                    </>
                                )}
                            </button>
                            <Link
                                to="/whatsapp-number"
                                className="inline-flex min-h-9 sm:min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 sm:px-6 text-xs sm:text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                            >
                                <PhoneCall className="h-4 w-4" />
                                I need a new number
                            </Link>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-2 sm:p-3 lg:grid-cols-1">
                        <MiniMetric icon={Wallet} label="Wallet" value={formatINRFromPaise(walletBalance)} tone="green" />
                        <MiniMetric icon={FileCheck2} label="This month spend" value={formatINRFromPaise(monthSpend)} tone="blue" />
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-1.5 md:gap-4 md:grid-cols-3">
                <GuideCard
                    icon={Building2}
                    title="Before you start"
                    stepNumber={1}
                    isExpanded={activeAccordion === 0}
                    onToggle={() => setActiveAccordion(prev => prev === 0 ? -1 : 0)}
                    items={[
                        'Facebook/Meta admin login ready rakhein.',
                        'Business name, website and email accurate honi chahiye.',
                        'Number par SMS/call OTP receive kar paana zaroori hai.',
                    ]}
                />
                <GuideCard
                    icon={BadgeCheck}
                    title="Meta will verify"
                    stepNumber={2}
                    isExpanded={activeAccordion === 1}
                    onToggle={() => setActiveAccordion(prev => prev === 1 ? -1 : 1)}
                    items={[
                        'Business portfolio select ya create hoga.',
                        'WhatsApp Business Account and phone number link hoga.',
                        'Some accounts may need Meta review before full sending.',
                    ]}
                />
                <GuideCard
                    icon={MessageSquareText}
                    title="After connection"
                    stepNumber={3}
                    isExpanded={activeAccordion === 2}
                    onToggle={() => setActiveAccordion(prev => prev === 2 ? -1 : 2)}
                    items={[
                        'Dashboard zero values real message data se replace honge.',
                        'Templates, broadcasts, live chat and flows unlock honge.',
                        'Diagnostics batayega number send-ready hai ya kya pending hai.',
                    ]}
                />
            </section>

             {activeConnections.length > 0 && (
                <section data-tour="connect-accounts" className="mb-6 mt-4 sm:mb-10 sm:mt-6">
                    {/* Mobile Compact Status Row */}
                    <div className="flex items-center justify-between gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5 md:hidden mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                                <ShieldCheck className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-950">Live Status</p>
                                <p className="text-[10px] text-emerald-700 font-semibold">{activeConnections.length} active connection{activeConnections.length > 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        <Link to="/billing" className="inline-flex shrink-0 h-7 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-[10px] font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">
                            <Wallet className="h-3 w-3" />
                            Recharge
                        </Link>
                    </div>

                    {/* Desktop/Tablet Header */}
                    <div className="hidden md:flex md:items-start md:justify-between md:mb-8">
                        <div>
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-800">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Live Status
                            </div>
                            <h2 className="mt-4 text-[28px] font-bold tracking-tight text-gray-950">Active WhatsApp Connections</h2>
                            <p className="mt-1 text-[15px] text-gray-500">Your connected numbers are ready for messaging, templates, and automations.</p>
                        </div>
                        <Link to="/billing" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-50">
                            <Wallet className="h-4 w-4" />
                            Recharge wallet
                        </Link>
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 sm:gap-6 lg:grid-cols-2">
                        {activeConnections.map(account => (
                            <AccountCard
                                key={account.id}
                                account={account}
                                diagnostics={diagnostics[account.id]}
                                loading={diagnosticsLoadingId === account.id}
                                onCheck={() => runAccountDiagnostics(account.id)}
                                onReconnect={handleEmbeddedSignup}
                                onDisconnect={() => handleDeleteAccount(account.id)}
                            />
                        ))}
                    </div>
                </section>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-3.5 sm:p-6">
                <div className="flex flex-col gap-3.5 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 sm:px-3 sm:py-1 text-xs font-semibold text-green-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Official WhatsApp Cloud API
                        </div>
                        <h1 className="mt-2.5 sm:mt-4 text-lg sm:text-2xl font-semibold text-gray-950">Connect your business WhatsApp number</h1>
                        <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-gray-600">
                            Existing business number connect karo, ya fresh dedicated number request karo. Meta admin login, OTP verification aur policy approval official process ka part hai; platform setup ko guided aur trackable banata hai.
                        </p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4 text-xs sm:text-sm leading-5 sm:leading-6 text-amber-900 lg:max-w-sm">
                        <p className="font-semibold">Tip for first-time users</p>
                        <p className="mt-1">Agar aapko WABA, token, phone number ID jaise words confusing lag rahe hain, bas recommended Meta button use karein. Manual token setup advanced users ke liye hai.</p>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-2.5 sm:gap-4 lg:grid-cols-5">
                <div data-tour="connect-primary" className="rounded-lg border border-[#b9dcfb] bg-white lg:col-span-3">
                    <div className="border-b border-green-100 bg-green-50/80 p-3.5 sm:p-6">
                        <div className="mb-2 sm:mb-3 inline-flex items-center gap-1.5 rounded-full bg-green-600 px-2 py-0.5 sm:px-3 sm:py-1 text-xs font-bold uppercase text-white">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Recommended
                        </div>
                        <h2 className="text-base sm:text-lg font-semibold text-gray-950">Connect with Meta</h2>
                        <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-gray-600">Templates, campaigns, live chat, flows and reliable delivery ke liye official Cloud API use hoga.</p>
                    </div>
                    <div className="space-y-3.5 sm:space-y-5 p-3.5 sm:p-6">
                        {embedStatus === 'saved' && <Notice tone="success" title="Number connected" text="Account save ho gaya. Neeche readiness status automatically refresh ho jayega." />}
                        {embedStatus === 'error' && embedError && (
                            <Notice tone="danger" title="Connection failed" text={embedError} onClose={() => { setEmbedStatus('idle'); setEmbedError('') }} />
                        )}
                        {!isSecureForMetaLogin && (
                            <Notice tone="danger" title="HTTPS required" text="Meta login deployed HTTPS ya ngrok HTTPS URL par test karein. Localhost bhi allowed hai." />
                        )}

                        {!hasIntegrationConsent ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5 space-y-3 sm:space-y-4">
                                <div className="flex items-start gap-2.5 sm:gap-3">
                                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-semibold text-amber-900">Meta Integration Cookie Permission Required</h3>
                                        <p className="text-[11px] sm:text-xs text-amber-800 mt-1 leading-relaxed">
                                            To connect your WhatsApp business numbers, please enable integration cookies. This allows official Meta signup SDK elements to load securely.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleEnableAndConnect}
                                    disabled={isSdkLoading}
                                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-4 py-2.5 transition-colors shadow-sm disabled:bg-amber-400 disabled:cursor-not-allowed"
                                >
                                    {isSdkLoading ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Enabling...
                                        </>
                                    ) : (
                                        'Enable & Connect'
                                    )}
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={handleEmbeddedSignup}
                                    disabled={embedStatus === 'loading' || embedStatus === 'saving'}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3.5 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-green-100 transition hover:bg-[#20b956] disabled:cursor-not-allowed disabled:bg-green-400"
                                >
                                    {embedStatus === 'loading' || embedStatus === 'saving' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {embedStatus === 'saving' ? 'Saving account...' : 'Opening Meta signup...'}
                                        </>
                                    ) : (
                                        <>
                                            <Smartphone className="h-4 w-4" />
                                            Connect WhatsApp with Meta
                                        </>
                                    )}
                                </button>

                                <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
                                    {[
                                        ['1', 'Prepare business', 'Legal name, website and admin access ready rakhein.'],
                                        ['2', 'Login with Meta', 'Business portfolio select/create karein.'],
                                        ['3', 'Verify number', 'Fresh/dedicated number OTP complete karein.'],
                                        ['4', 'Start setup', 'Templates, wallet and automations unlock honge.'],
                                    ].map(([step, title, text]) => (
                                        <div key={step} className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                                            <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-green-600 text-[10px] sm:text-xs font-bold text-white">{step}</div>
                                            <p className="mt-2 sm:mt-3 text-xs sm:text-sm font-semibold text-gray-950">{title}</p>
                                            <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs leading-4 sm:leading-5 text-gray-500">{text}</p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-3.5 sm:p-6 lg:col-span-2">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-base sm:text-lg font-semibold text-gray-950">Need a new business number?</h2>
                            <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-gray-600">Fresh number best hota hai production WhatsApp API ke liye. Request submit karo; team number sourcing aur Meta onboarding assist karegi.</p>
                        </div>
                        <PhoneCall className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="mt-3.5 rounded-xl border border-blue-100 bg-blue-50 p-3 sm:p-4 text-xs sm:text-sm leading-5 sm:leading-6 text-blue-900">
                        Official process me number ownership/OTP, business details aur Meta policy approval required hota hai. Hum isko guided service ke form me manage karenge.
                    </div>
                    <Link
                        to="/whatsapp-number"
                        className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white hover:bg-gray-800"
                    >
                        Request new number
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>

            {activeConnections.length === 0 && (
                <section data-tour="connect-accounts" className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-col gap-2 border-b border-gray-100 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <div>
                            <h2 className="text-base sm:text-lg font-semibold text-gray-950">Connected numbers</h2>
                            <p className="mt-0.5 text-xs sm:text-sm text-gray-500">Connection ke baad yahan send readiness, wallet and next actions visible rahenge.</p>
                        </div>
                    </div>
                    <div className="p-3.5 sm:p-6">
                        {loadingAccounts ? (
                            <div className="flex min-h-32 items-center justify-center text-sm text-gray-500">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading accounts...
                            </div>
                        ) : accountsLoadError ? (
                            <div className="flex min-h-32 flex-col items-center justify-center text-center">
                                <p className="text-sm font-semibold text-gray-900">Couldn&apos;t load connected numbers</p>
                                <p className="mt-1 text-xs text-gray-500">{accountsLoadError}</p>
                                <button type="button" onClick={fetchAccounts} className="mt-3 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50">
                                    Retry
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-[#b9dcfb] bg-[#eef7ff] p-4 sm:p-6 text-center">
                                <p className="text-sm font-semibold text-gray-950">No official Cloud API number connected yet.</p>
                                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Connect with Meta for existing number, ya new dedicated number request karein.</p>
                                <div className="mt-3.5 flex flex-col justify-center gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={hasIntegrationConsent ? handleEmbeddedSignup : handleEnableAndConnect}
                                        disabled={embedStatus === 'loading' || embedStatus === 'saving' || isSdkLoading}
                                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0070d1] px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#0064b7] disabled:bg-[#79b8ef]"
                                    >
                                        <Smartphone className="h-4 w-4" />
                                        {isSdkLoading ? 'Enabling...' : hasIntegrationConsent ? 'Connect now' : 'Enable & Connect'}
                                    </button>
                                    <Link to="/whatsapp-number" className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-gray-800 hover:bg-gray-50">
                                        <PhoneCall className="h-4 w-4" />
                                        New number
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            <section className="grid grid-cols-1 gap-2.5 sm:gap-4 lg:grid-cols-2">
                <div data-tour="connect-manual" className="rounded-lg border border-gray-200 bg-white p-3.5 sm:p-6">
                    <button
                        type="button"
                        onClick={() => setManualOpen(prev => !prev)}
                        className="flex w-full items-center justify-between gap-4 text-left"
                    >
                        <span>
                            <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-950">
                                <KeyRound className="h-4 w-4 text-blue-600" />
                                Advanced manual token setup
                            </span>
                            <span className="mt-0.5 block text-xs sm:text-sm text-gray-500">Only for teams who already have WABA ID, phone number ID and permanent token.</span>
                        </span>
                        <ArrowRight className={`h-4 w-4 text-gray-400 transition ${manualOpen ? 'rotate-90' : ''}`} />
                    </button>
                    {manualOpen && (
                        <form onSubmit={handleManualConnect} className="mt-5 space-y-3">
                            {manualStatus === 'error' && manualError && <Notice tone="danger" title="Manual setup failed" text={manualError} />}
                            {manualStatus === 'saved' && <Notice tone="success" title="Account saved" text="Manual Cloud API account connected successfully." />}
                            <input
                                type="text"
                                autoComplete="off"
                                placeholder="WhatsApp Business Account ID"
                                value={manualCreds.businessAccountId}
                                onChange={e => setManualCreds(prev => ({ ...prev, businessAccountId: e.target.value }))}
                                disabled={manualPhoneNumbers.length > 0}
                                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs sm:text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:bg-gray-50"
                            />
                            <input
                                type="text"
                                autoComplete="new-password"
                                placeholder="Access Token"
                                value={manualCreds.accessToken}
                                onChange={e => setManualCreds(prev => ({ ...prev, accessToken: e.target.value }))}
                                disabled={manualPhoneNumbers.length > 0}
                                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs sm:text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:bg-gray-50"
                            />
                            {manualPhoneNumbers.length > 0 && (
                                <select
                                    value={manualSelectedPhoneId}
                                    onChange={e => setManualSelectedPhoneId(e.target.value)}
                                    className="w-full rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
                                >
                                    {manualPhoneNumbers.map(phone => (
                                        <option key={phone.id} value={phone.id}>{phone.verified_name} ({phone.display_phone_number})</option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="submit"
                                disabled={manualStatus === 'validating' || manualStatus === 'saving'}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                            >
                                {(manualStatus === 'validating' || manualStatus === 'saving') && <Loader2 className="h-4 w-4 animate-spin" />}
                                {manualPhoneNumbers.length > 0 ? 'Link to platform' : 'Validate access'}
                            </button>
                            <div className="pt-3">
                                <div className="overflow-hidden rounded-xl border border-gray-100 shadow-sm">
                                    <video
                                        src="https://v1.pinimg.com/videos/iht/expMp4/f0/9b/a6/f09ba694033f34eb5017ec4a8101ef5f_720w.mp4"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                        className="w-full h-auto object-cover"
                                    />
                                </div>
                            </div>
                        </form>
                    )}
                </div>

                <div className="rounded-lg border border-amber-200 bg-white p-3.5 sm:p-6">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold uppercase text-amber-800">
                        <QrCode className="h-3.5 w-3.5" />
                        Testing only
                    </div>
                    <h2 className="mt-2.5 sm:mt-4 text-base sm:text-lg font-semibold text-gray-950">QR session connection</h2>
                    <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-gray-600">Internal demo/testing ke liye QR use ho sakta hai. Production campaigns, approved templates, reliable delivery aur compliance ke liye official Cloud API hi recommended hai.</p>
                    <div className="mt-5">
                        <WhatsAppLogin onAccountConnected={fetchAccounts} />
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <InfoBox title="Can I use my existing number?" text="Haan, but number WhatsApp Cloud API me migrate/link hoga. Agar number already WhatsApp mobile app me active hai, Meta flow ke during instructions follow karni padengi." />
                <InfoBox title="Why templates are needed?" text="Customer ko first message ya broadcast bhejne ke liye Meta-approved templates required hote hain. Customer reply kare to normal service conversation open hoti hai." />
                <InfoBox title="What if I am not technical?" text="Recommended Meta signup button use karein. Manual token section ko ignore kar sakte hain unless support team specifically bole." />
            </section>
        </div>
    )
}

function mergeAccounts(currentAccounts, incomingAccounts) {
    const byId = new Map(currentAccounts.map(account => [account.id, account]))
    incomingAccounts.forEach(account => {
        if (!account?.id) return
        byId.set(account.id, { ...byId.get(account.id), ...account })
    })
    return Array.from(byId.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

function GuideCard({ icon, title, items, stepNumber, isExpanded, onToggle }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white transition-all duration-300 md:rounded-lg md:p-3.5 md:sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            {/* Header row: clickable only on mobile (< md) */}
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-2 text-left focus:outline-none md:cursor-default md:pointer-events-none p-2.5 sm:p-3 md:p-0"
            >
                <div className="flex items-center gap-2 md:gap-2.5 sm:gap-3 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eef7ff] text-[#0064b7] md:h-8 md:w-8 md:sm:h-10 md:sm:w-10">
                        {createElement(icon, { className: 'h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-4 md:w-4 md:sm:h-5 md:sm:w-5' })}
                    </span>
                    {/* Step badge */}
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0064b7] text-[10px] font-bold text-white md:hidden">
                        {stepNumber}
                    </span>
                    <h2 className="text-xs sm:text-sm font-semibold tracking-tight text-gray-950 md:text-sm md:sm:text-base">{title}</h2>
                </div>
                {/* Chevron */}
                <div className="flex items-center md:hidden shrink-0">
                    <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </div>
            </button>

            {/* Content list with smooth CSS grid height transition */}
            <div
                className={`grid transition-all duration-300 ease-in-out md:block md:opacity-100 ${
                    isExpanded ? 'grid-rows-[1fr] opacity-100 border-t border-gray-100/60 md:border-t-0' : 'grid-rows-[0fr] opacity-0'
                }`}
            >
                <div className="overflow-hidden">
                    <div className="p-2.5 pt-2 sm:p-3 sm:pt-2.5 md:p-0 md:mt-3 md:sm:mt-4">
                        <ul className="space-y-1 sm:space-y-1.5 md:space-y-1.5 md:sm:space-y-2">
                            {items.map((item, index) => (
                                <li key={index} className="flex gap-1.5 md:gap-2 text-[11px] sm:text-xs leading-4 sm:leading-5 text-gray-600 md:text-xs md:sm:text-sm md:leading-5 md:sm:leading-6">
                                    <CheckCircle2 className="mt-0.5 h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-emerald-600 md:h-3.5 md:w-3.5" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}

function InfoBox({ title, text }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3.5 sm:p-5">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-950">
                <HelpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#0064b7]" />
                {title}
            </div>
            <p className="mt-1.5 text-xs sm:text-sm leading-5 sm:leading-6 text-gray-600">{text}</p>
        </div>
    )
}

function MiniMetric({ icon, label, value, tone }) {
    const toneClass = tone === 'green' ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50'
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-2.5 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between gap-1.5">
                <p className="text-[10px] sm:text-xs font-semibold tracking-tight text-gray-500 truncate">{label}</p>
                <span className={`flex h-6 w-6 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
                    {createElement(icon, { className: 'h-3.5 w-3.5 sm:h-4 sm:w-4' })}
                </span>
            </div>
            <p className="mt-1.5 sm:mt-3 text-sm sm:text-xl font-bold tracking-tight text-gray-900 truncate">{value}</p>
        </div>
    )
}

function Notice({ tone, title, text, onClose }) {
    const classes = tone === 'success'
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-red-200 bg-red-50 text-red-800'
    const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
    return (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs sm:text-sm ${classes}`}>
            <Icon className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-[11px] sm:text-xs leading-4 sm:leading-5">{text}</p>
            </div>
            {onClose && (
                <button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/60">
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    )
}

const STATUS_CONFIG = {
    connected: {
        label: 'Connected',
        badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
        dotClass: 'bg-emerald-500',
        bannerClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    pending: {
        label: 'Pending Verification',
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-100',
        dotClass: 'bg-amber-500',
        bannerClass: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    failed: {
        label: 'Disconnected',
        badgeClass: 'bg-red-50 text-red-700 border border-red-100',
        dotClass: 'bg-red-500',
        bannerClass: 'border-red-200 bg-red-50 text-red-800',
    }
};

function getAccountStatus(account, diagnostics) {
    const isMeta = account.connection_type !== 'qr_session';
    const isReady = diagnostics?.send_ready ?? account.send_ready;
    const issueCodes = diagnostics?.issue_codes || [];
    const tokenExpired = diagnostics?.reconnect_required || issueCodes.includes('token_expired');
    const tokenMissing = issueCodes.includes('token_missing') || (!account.access_token_encrypted && !diagnostics?.has_access_token);

    if (tokenExpired || account.status === 'failed' || account.status === 'disconnected') {
        return 'failed';
    }

    // Check Meta strict verification status
    const isCodeNotVerified = isMeta && diagnostics?.phone_number_access?.code_verification_status === 'NOT_VERIFIED';

    const isPending =
        tokenMissing ||
        account.status === 'pending' ||
        account.status === 'connecting' ||
        (!isMeta && !isReady) ||
        (isMeta && !account.whatsapp_business_account_id) ||
        isCodeNotVerified;

    if (isPending) {
        return 'pending';
    }

    return 'connected';
}

function AccountCard({ account, diagnostics, loading, onCheck, onReconnect, onDisconnect }) {
    const ready = diagnostics?.send_ready ?? account.send_ready
    const issueCodes = diagnostics?.issue_codes || []
    const tokenMissing = issueCodes.includes('token_missing') || (!account.access_token_encrypted && !diagnostics?.has_access_token)
    const tokenExpired = diagnostics?.reconnect_required || issueCodes.includes('token_expired')
    const reconnectRequired = tokenExpired || tokenMissing
    const summary = getAccountSummary(account, diagnostics, tokenExpired, tokenMissing)

    const currentStatus = getAccountStatus(account, diagnostics)
    const config = STATUS_CONFIG[currentStatus]

    const statusLabel = currentStatus === 'connected' ? 'Connected' : tokenMissing ? 'Not Connected' : 'Disconnected'
    const messagingStatus = currentStatus === 'connected' ? 'Send Ready' : 'Paused'
    const templateStatus = currentStatus === 'connected' ? 'Unlocked' : tokenMissing ? 'Link Required' : 'Reconnect Required'
    const noticeClass = config.bannerClass
    const businessVerification = diagnostics?.business_verification
    const businessVerified = String(businessVerification?.status || '').toLowerCase() === 'verified'
    const verificationUrl = businessVerification?.business_id
        ? `https://business.facebook.com/settings/security?business_id=${encodeURIComponent(businessVerification.business_id)}`
        : 'https://business.facebook.com/settings/security'

    const [showFullWarning, setShowFullWarning] = useState(false)
    const isLongSummary = summary && summary.length > 80
    const displayedSummary = isLongSummary && !showFullWarning 
        ? `${summary.slice(0, 80)}...` 
        : summary

    return (
        <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 border border-green-100 text-green-600">
                        <MessageSquareText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-[18px] sm:text-[20px] font-bold tracking-tight text-gray-900">
                            {account.display_phone_number || account.phone_number_id || 'WhatsApp number'}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-gray-500">
                            {account.connection_type === 'qr_session' ? 'QR Session Connection' : `WABA: ${maskId(account.whatsapp_business_account_id) || 'Pending'}`}
                        </p>
                    </div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.badgeClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
                    {statusLabel}
                </span>
            </div>

            <div className="flex items-center gap-4 mb-4 text-xs font-medium text-gray-600">
                <div className="flex items-center gap-1.5 border-r border-gray-200 pr-4">
                    <span className="uppercase text-[10px] font-bold text-gray-400">Messaging:</span>
                    <span className="text-gray-900">{messagingStatus}</span>
                </div>
                <div className="flex items-center gap-1.5 border-r border-gray-200 pr-4">
                    <span className="uppercase text-[10px] font-bold text-gray-400">Templates:</span>
                    <span className="text-gray-900">{account.connection_type === 'qr_session' ? 'N/A' : templateStatus}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="uppercase text-[10px] font-bold text-gray-400">API:</span>
                    <span className="text-gray-900">{account.connection_type === 'qr_session' ? 'QR' : 'Cloud'}</span>
                </div>
            </div>

            {account.connection_type !== 'qr_session' && businessVerification && (
                <div className={`mb-4 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${businessVerified ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex min-w-0 items-start gap-2.5">
                        {businessVerified
                            ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            : <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                        <div className="min-w-0">
                            <p className={`text-xs font-semibold ${businessVerified ? 'text-emerald-900' : 'text-amber-950'}`}>
                                Business verification: {businessVerified ? 'Verified' : 'Action required'}
                            </p>
                            <p className={`mt-0.5 truncate text-[10px] ${businessVerified ? 'text-emerald-700' : 'text-amber-800'}`}>
                                {businessVerification.business_name || 'Meta Business Portfolio'} · {String(businessVerification.status || 'unknown').replaceAll('_', ' ')}
                            </p>
                        </div>
                    </div>
                    {!businessVerified && (
                        <a
                            href={verificationUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 text-[10px] font-semibold text-white transition hover:bg-amber-700"
                        >
                            Start on Meta <ArrowRight className="h-3 w-3" />
                        </a>
                    )}
                </div>
            )}

            <div className={`flex items-start gap-2.5 rounded-xl p-3 text-[13px] font-medium border ${noticeClass}`}>
                {currentStatus === 'connected' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <div className="min-w-0 flex-1">
                    <p className="leading-relaxed">
                        {displayedSummary || 'Run diagnostics to verify live Meta permissions.'}
                        {isLongSummary && (
                            <button
                                type="button"
                                onClick={() => setShowFullWarning(prev => !prev)}
                                className="ml-1 text-[11px] font-bold underline hover:opacity-80 inline-block focus:outline-none"
                            >
                                {showFullWarning ? 'Read less' : 'Read more'}
                            </button>
                        )}
                    </p>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-5 border-t border-gray-100">
                {reconnectRequired ? (
                    <button
                        type="button"
                        onClick={onReconnect}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-all hover:bg-blue-700 w-full sm:w-auto"
                    >
                        <Smartphone className="h-4 w-4" />
                        {tokenMissing ? 'Connect Meta' : 'Reconnect Meta'}
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={onCheck}
                    disabled={loading}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white border border-gray-200 px-4 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 w-full sm:w-auto"
                >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" /> : <ShieldCheck className="h-3.5 w-3.5 text-gray-500" />}
                    Verify Check
                </button>
                {!reconnectRequired && account.connection_type !== 'qr_session' && (
                    <Link
                        to="/templates"
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white border border-gray-200 px-4 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 w-full sm:w-auto"
                    >
                        <MessageSquareText className="h-3.5 w-3.5 text-gray-500" />
                        Templates
                    </Link>
                )}
                <button
                    type="button"
                    onClick={onDisconnect}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white border border-gray-200 px-4 text-xs font-semibold text-red-600 transition-all hover:bg-red-50 hover:border-red-200 w-full sm:w-auto"
                >
                    Disconnect
                </button>
            </div>
        </div>
    )
}

function getAccountSummary(account, diagnostics, tokenExpired, tokenMissing) {
    if (account.connection_type === 'qr_session') {
        return diagnostics?.send_ready ?? account.send_ready
            ? 'QR testing session is connected and ready for messaging.'
            : 'QR testing session is disconnected. Scan the QR code below to reconnect.'
    }
    if (diagnostics?.send_ready) return 'Cloud API send access verified. Ready for production.'
    if (tokenMissing) {
        return 'Is WhatsApp number ke saath Meta API permissions linked nahi hain. "Connect Meta" click karke is account ko Connect with Meta se link karein.'
    }
    if (tokenExpired) {
        return 'Is connected account ka Meta token expire ho gaya hai. "Reconnect Meta" click karke same number ko fresh permission ke saath link karein.'
    }
    if (diagnostics?.issues?.length) return diagnostics.issues.join(', ')
    return account.diagnostics_summary
}

function StatusTile({ label, value }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-[8px] sm:rounded-[12px] border border-gray-100 bg-white p-1.5 sm:p-3 text-center shadow-sm">
            <p className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-1 w-full truncate text-xs sm:text-[13px] font-bold text-gray-900">{value}</p>
        </div>
    )
}

function maskId(value) {
    if (!value) return ''
    const text = String(value)
    if (text.length <= 8) return text
    return `${text.slice(0, 4)}...${text.slice(-4)}`
}
