import { useEffect, useMemo, useState } from 'react'
import {
    AlertCircle, Check, ChevronDown, CreditCard, Hexagon, Loader2,
    Megaphone, ReceiptText, ShieldCheck, Wallet, Plus, ArrowRight, X,
    Send, Zap, Crown, ThumbsUp, MessageSquare, Bot, Workflow, Tag,
    Calendar, BarChart3, FileDown, Code2, Users2, Headphones
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import TourButton from '../onboarding/TourButton'
import {
    BILLING_INTERVALS,
    FALLBACK_PLANS,
    FALLBACK_RATE_CARDS,
    formatINRFromPaise,
    getMonthlyEquivalent,
    getPlanPrice,
} from '../config/whatsappPricing'

const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`

function normalizePlanFeatures(plan) {
    if (Array.isArray(plan?.features)) return plan.features
    return FALLBACK_PLANS.find(item => item.id === plan?.id)?.features || []
}

function getPlanBadge(planId) {
    if (planId === 'growth') return 'Recommended'
    if (planId === 'pro') return 'Scale'
    return null
}

function isCurrentPlan(currentPlan, plan) {
    return currentPlan?.id === plan?.id || currentPlan?.name === plan?.name
}

function getPlanRank(planOrId) {
    const id = String(planOrId?.id || planOrId || '').toLowerCase()
    if (id.includes('starter')) return 10
    if (id.includes('growth')) return 20
    if (id.includes('pro')) return 30
    if (id.includes('enterprise')) return 40
    return Number(planOrId?.plan_rank || planOrId?.sort_order || 0)
}

function getPlanActionLabel({ current, isDowngrade, scheduled, planName }) {
    if (current) return 'Current Plan'
    if (scheduled) return 'Downgrade scheduled'
    return `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${planName}`
}

function formatPlanDate(value) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

function isPaidSubscriptionPlan(plan) {
    const id = String(plan?.id || '').toLowerCase()
    const name = String(plan?.name || '').toLowerCase()
    return id !== 'enterprise'
        && id !== 'free'
        && !name.includes('free')
        && Number(plan?.monthly_price_paise || 0) > 0
}

async function getFunctionErrorMessage(error, fallback) {
    try {
        if (error?.context?.json) {
            const body = await error.context.json()
            return body?.error || body?.message || error.message || fallback
        }
    } catch {
        // Fall through to generic message.
    }
    return error?.message || fallback
}

const comparisonFeatures = [
    {
        name: 'Automation Flows',
        icon: MessageSquare,
        starter: '5 flows',
        growth: 'Unlimited',
        pro: 'Unlimited',
        highlightGrowth: true,
    },
    {
        name: 'AI Agents Included',
        icon: Bot,
        starter: '—',
        growth: '5 agents',
        pro: 'Unlimited',
        highlightGrowth: true,
    },
    {
        name: 'Visual Flow Builder',
        icon: Workflow,
        starter: 'tick',
        growth: 'tick',
        pro: 'tick',
    },
    {
        name: 'Custom Fields, Tags & Attributes',
        icon: Tag,
        starter: 'Basic',
        growth: 'Advanced',
        pro: 'Advanced',
        highlightGrowth: true,
    },
    {
        name: 'Connected WhatsApp numbers',
        icon: Megaphone,
        starter: '1 number',
        growth: '1 number',
        pro: '2 numbers',
        highlightGrowth: true,
    },
    {
        name: 'Campaign Scheduler',
        icon: Calendar,
        starter: 'cross',
        growth: 'cross',
        pro: 'tick',
    },
    {
        name: 'Analytics Dashboard',
        icon: BarChart3,
        starter: 'Basic',
        growth: 'Standard',
        pro: 'Advanced',
        highlightGrowth: true,
    },
    {
        name: 'Export (CSV)',
        icon: FileDown,
        starter: 'cross',
        growth: 'cross',
        pro: 'tick',
    },
    {
        name: 'Developer API & Webhooks',
        icon: Code2,
        starter: 'cross',
        growth: 'cross',
        pro: 'tick',
    },
    {
        name: 'Team Inbox Seats',
        icon: Users2,
        starter: '5 agents',
        growth: '5 agents',
        pro: '10 agents',
        highlightGrowth: true,
    },
    {
        name: 'Support',
        icon: Headphones,
        starter: 'Standard',
        growth: 'Priority',
        pro: 'VIP Support',
        highlightGrowth: true,
    },
]

export default function BillingPage() {
    const { user, refreshProfile, apiCall } = useAuth()
    const [interval, setInterval] = useState(1)
    const [overview, setOverview] = useState(() => {
        try {
            const cached = localStorage.getItem(`gap_billing_overview_${user?.id || 'default'}`)
            return cached ? JSON.parse(cached) : null
        } catch {
            return null
        }
    })
    const [loading, setLoading] = useState(() => {
        try {
            const cached = localStorage.getItem(`gap_billing_overview_${user?.id || 'default'}`)
            return !cached
        } catch {
            return true
        }
    })
    const [error, setError] = useState('')
    const [upgrading, setUpgrading] = useState(null)
    const [recharging, setRecharging] = useState(null)
    const [isMessageBillingOpen, setIsMessageBillingOpen] = useState(false)
    const [isCustomMode, setIsCustomMode] = useState(false)
    const [customAmount, setCustomAmount] = useState('')
    const [pendingDowngradePlan, setPendingDowngradePlan] = useState(null)
    const [notice, setNotice] = useState(null)
    const [isCancelingScheduledChange, setIsCancelingScheduledChange] = useState(false)

    const refreshBillingOverview = async () => {
        const res = await apiCall(`${API_BASE}/billing/overview`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to load billing')
        setOverview(data)
        try {
            localStorage.setItem(`gap_billing_overview_${user?.id || 'default'}`, JSON.stringify(data))
        } catch (e) {
            console.warn('Failed to cache billing:', e)
        }
        return data
    }

    const showNotice = ({ type = 'info', title, message }) => {
        setNotice({ type, title, message })
    }

    useEffect(() => {
        let cancelled = false
        if (!overview) {
            setLoading(true)
        }
        apiCall(`${API_BASE}/billing/overview`)
            .then(async res => {
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data?.error || 'Failed to load billing')
                if (!cancelled) {
                    setOverview(data)
                    try {
                        localStorage.setItem(`gap_billing_overview_${user?.id || 'default'}`, JSON.stringify(data))
                    } catch (e) {
                        console.warn('Failed to cache billing:', e)
                    }
                }
            })
            .catch(err => {
                if (!cancelled) setError(err.message || 'Failed to load billing')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])

    const plans = (overview?.plans?.length ? overview.plans : FALLBACK_PLANS).filter(isPaidSubscriptionPlan)
    const rateCards = overview?.rate_cards?.length ? overview.rate_cards : FALLBACK_RATE_CARDS
    const categorySpend = overview?.spend?.categories || []
    const currentPlan = overview?.current_plan || null
    const wallet = overview?.wallet || { balance_paise: 0, currency: 'INR', low_balance_threshold_paise: 10000 }
    const subscriptionInvoices = overview?.recent_subscription_invoices || []
    const walletTransactions = (overview?.recent_wallet_transactions || overview?.recent_transactions || [])
        .filter(tx => !['message_debit', 'failed_debit'].includes(String(tx.type || '')))
    const messageChargeRows = overview?.recent_message_charges?.length
        ? overview.recent_message_charges
        : (overview?.recent_transactions || []).filter(tx => ['message_debit', 'failed_debit'].includes(String(tx.type || '')))
    const messageCharges = messageChargeRows
        .filter(tx => ['message_debit', 'failed_debit'].includes(String(tx.type || '')))
        .map(tx => ({
            id: tx.id,
            source: tx.reference_type || 'message',
            category: tx.metadata?.category,
            template_name: tx.metadata?.template_name,
            campaign_id: tx.metadata?.campaign_id || tx.reference_id,
            charged_amount_paise: Math.abs(Number(tx.amount_paise || 0)),
            billing_status: tx.status === 'completed' ? 'charged' : tx.status,
            created_at: tx.created_at,
        }))
        .concat(messageChargeRows
            .filter(tx => !['message_debit', 'failed_debit'].includes(String(tx.type || '')))
            .map(tx => ({
                ...tx,
                charged_amount_paise: Math.abs(Number(tx.charged_amount_paise || 0)),
            })))
    const messageChargesTotalPaise = messageCharges.reduce((sum, charge) => sum + Number(charge.charged_amount_paise || 0), 0)
    const activePlanId = currentPlan?.id || overview?.subscription?.plan_id || overview?.organization?.plan_id || user?.plan
    const activePlanRank = getPlanRank(activePlanId)
    const scheduledPlanId = overview?.subscription?.scheduled_plan_id || overview?.organization?.scheduled_plan_id
    const scheduledEffectiveAt = overview?.subscription?.scheduled_effective_at || overview?.organization?.scheduled_effective_at
    const scheduledPlan = scheduledPlanId ? plans.find(plan => plan.id === scheduledPlanId) : null

    const rateMap = useMemo(() => {
        return rateCards.reduce((acc, rate) => {
            acc[rate.category] = rate
            return acc
        }, {})
    }, [rateCards])

    const submitPlanChange = async (plan) => {
        if (!plan?.id || plan.id === 'enterprise' || isCurrentPlan(currentPlan, plan)) return
        const targetRank = getPlanRank(plan)
        const isDowngrade = activePlanRank > 0 && targetRank > 0 && targetRank < activePlanRank

        try {
            setUpgrading(plan.id)
            const res = await apiCall(`${API_BASE}/billing/change-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: plan.id,
                    interval,
                    currentPlanId: activePlanId,
                    customerName: user?.user_metadata?.full_name || user?.email?.split('@')[0],
                    customerEmail: user?.email,
                }),
            })
            let data = {}
            try {
                data = await res.clone().json()
            } catch (e) {
                const text = await res.text()
                data = { error: text ? `Server Error (${res.status}): ${text.slice(0, 50)}...` : `HTTP ${res.status} ${res.statusText}` }
            }

            if (!res.ok) throw new Error(data?.error || (isDowngrade ? 'Failed to schedule downgrade' : 'Failed to create payment link'))
            if (data?.no_change) {
                showNotice({
                    type: 'info',
                    title: 'No change',
                    message: data.message || 'You are already on this plan.',
                })
                return true
            }
            if (data?.scheduled_downgrade) {
                showNotice({
                    type: 'success',
                    title: 'Downgrade scheduled',
                    message: data.message || `${plan.name} next billing cycle se apply hoga.`,
                })
                await refreshBillingOverview()
                return true
            }
            if (data?.activated) {
                showNotice({
                    type: 'success',
                    title: 'Plan activated',
                    message: `${data.plan || plan.name} plan available credit se activate ho gaya.`,
                })
                await refreshBillingOverview()
                refreshProfile?.()
                return true
            }
            if (data?.success && data?.payment_link) {
                window.location.href = data.payment_link
                return true
            }
            throw new Error(data?.error || 'Failed to create payment link (Missing URL)')
        } catch (err) {
            console.error('Upgrade error:', err)
            showNotice({
                type: 'error',
                title: 'Plan change failed',
                message: err.message || 'Something went wrong. Please try again.',
            })
            return false
        } finally {
            setUpgrading(null)
            refreshProfile?.()
        }
    }

    const handleUpgrade = async (plan) => {
        const targetRank = getPlanRank(plan)
        const isDowngrade = activePlanRank > 0 && targetRank > 0 && targetRank < activePlanRank

        if (isDowngrade) {
            setPendingDowngradePlan(plan)
            return
        }

        await submitPlanChange(plan)
    }

    const handleCancelScheduledChange = async () => {
        try {
            setIsCancelingScheduledChange(true)
            const res = await apiCall(`${API_BASE}/billing/cancel-scheduled-change`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to cancel scheduled downgrade')

            showNotice({
                type: 'success',
                title: 'Downgrade cancelled',
                message: data.message || 'Aapka current plan continue rahega.',
            })
            await refreshBillingOverview()
            refreshProfile?.()
        } catch (err) {
            console.error('Cancel scheduled change error:', err)
            showNotice({
                type: 'error',
                title: 'Cancel failed',
                message: err.message || 'Scheduled downgrade cancel nahi ho paya. Please try again.',
            })
        } finally {
            setIsCancelingScheduledChange(false)
        }
    }

    const handleWalletRecharge = async (amountPaise) => {
        const organizationId = overview?.organization?.id || wallet?.organization_id
        if (!organizationId) {
            showNotice({
                type: 'error',
                title: 'Organization missing',
                message: 'Organization not found. Please refresh and try again.',
            })
            return
        }

        try {
            setRecharging(amountPaise)
            const { data, error: fnError } = await supabase.functions.invoke('create-whatsapp-wallet-recharge-link', {
                body: {
                    organizationId,
                    userId: user?.id,
                    amountPaise,
                    customerName: user?.user_metadata?.full_name || user?.email?.split('@')[0],
                    customerEmail: user?.email,
                },
            })

            if (fnError) throw new Error(await getFunctionErrorMessage(fnError, 'Failed to create recharge link'))
            if (data?.success && data?.payment_link) {
                window.location.href = data.payment_link
                return
            }
            throw new Error(data?.error || 'Failed to create recharge link')
        } catch (err) {
            console.error('Wallet recharge error:', err)
            showNotice({
                type: 'error',
                title: 'Recharge failed',
                message: err.message || 'Could not start wallet recharge.',
            })
        } finally {
            setRecharging(null)
        }
    }

    const handleCustomSubmit = async () => {
        const amt = parseFloat(customAmount)
        if (isNaN(amt) || amt <= 0) {
            showNotice({
                type: 'error',
                title: 'Invalid amount',
                message: 'Please enter a valid amount.',
            })
            return
        }
        if (amt < 100) {
            showNotice({
                type: 'error',
                title: 'Minimum recharge',
                message: 'Minimum recharge amount is ₹100.',
            })
            return
        }
        const amountPaise = Math.round(amt * 100)
        await handleWalletRecharge(amountPaise)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto flex min-h-[420px] max-w-6xl items-center justify-center rounded-2xl border border-gray-200 bg-white">
                    <Loader2 className="mr-3 h-5 w-5 animate-spin text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">Loading billing workspace...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-950">Billing & Usage</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Platform subscription alag hai. Marketing, utility aur authentication message spend wallet se deduct hoga.
                        </p>
                    </div>
                    <div className="hidden md:block">
                        <TourButton />
                    </div>
                </header>

                {error && (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {notice && (
                    <BillingNotice
                        notice={notice}
                        onClose={() => setNotice(null)}
                    />
                )}

                {scheduledPlan && (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide">Scheduled plan change</p>
                                <h2 className="mt-1 text-base font-semibold">
                                    {scheduledPlan.name} starts from {formatPlanDate(scheduledEffectiveAt) || 'next renewal'}
                                </h2>
                                <p className="mt-1 text-sm leading-5">
                                    Tab tak aapka current {currentPlan?.name || user?.plan || 'plan'} active rahega. Downgrade immediate feature cut nahi karta.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                                    Pending downgrade
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCancelScheduledChange}
                                    disabled={isCancelingScheduledChange}
                                    className="inline-flex h-8 items-center justify-center rounded-full bg-amber-900 px-3 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isCancelingScheduledChange ? 'Cancelling...' : 'Cancel downgrade'}
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {/* Current Plan */}
                    <div data-tour="billing-wallet" className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
                        <div className="flex items-center justify-between gap-1">
                            <p className="text-[11px] sm:text-sm font-medium text-gray-500 leading-tight">Current Plan</p>
                            <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 shrink-0" />
                        </div>
                        <p className="mt-2 sm:mt-3 text-lg sm:text-2xl font-semibold text-gray-950 truncate">{currentPlan?.name || user?.plan || 'No active plan'}</p>
                        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500 truncate">{overview?.organization?.plan_status || user?.subscription_status || 'active'}</p>
                    </div>

                    {/* Wallet Balance */}
                    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
                        <div className="flex items-center justify-between gap-1">
                            <p className="text-[11px] sm:text-sm font-medium text-gray-500 leading-tight">Wallet Balance</p>
                            <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0" />
                        </div>
                        <p className="mt-2 sm:mt-3 text-lg sm:text-2xl font-semibold text-gray-950 truncate">{formatINRFromPaise(wallet.balance_paise)}</p>
                        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500 leading-tight">Alert below {formatINRFromPaise(wallet.low_balance_threshold_paise)}</p>
                    </div>

                    {/* This Month Spend */}
                    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
                        <div className="flex items-center justify-between gap-1">
                            <p className="text-[11px] sm:text-sm font-medium text-gray-500 leading-tight">This Month</p>
                            <ReceiptText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 shrink-0" />
                        </div>
                        <p className="mt-2 sm:mt-3 text-lg sm:text-2xl font-semibold text-gray-950 truncate">{formatINRFromPaise(overview?.spend?.month_spend_paise)}</p>
                        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500 leading-tight">Template/message usage</p>
                    </div>

                    {/* Today Spend */}
                    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
                        <div className="flex items-center justify-between gap-1">
                            <p className="text-[11px] sm:text-sm font-medium text-gray-500 leading-tight">Today Spend</p>
                            <Megaphone className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 shrink-0" />
                        </div>
                        <p className="mt-2 sm:mt-3 text-lg sm:text-2xl font-semibold text-gray-950 truncate">{formatINRFromPaise(overview?.spend?.today_spend_paise)}</p>
                        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500 leading-tight">Campaign & automation cost</p>
                    </div>
                </section>


                <section data-tour="billing-recharge" className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-6 md:p-8 text-white shadow-xl shadow-indigo-950/20">
                    {/* Glowing decorative shapes */}
                    <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
                    <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

                    <div className="relative z-10 flex flex-col gap-3 sm:gap-6 lg:flex-row lg:items-center lg:justify-between w-full">
                        {/* Title + description */}
                        <div className="flex items-center gap-3 sm:gap-5">
                            {/* Large image – desktop sm+ only */}
                            <div className="relative hidden shrink-0 sm:block">
                                <div className="absolute -inset-2 rounded-full bg-indigo-500/20 blur-md" />
                                <img
                                    src="/images/money.png"
                                    alt="Money wallet illustration"
                                    className="relative h-20 w-20 object-contain drop-shadow-[0_8px_16px_rgba(99,102,241,0.4)] transition-transform duration-300 hover:scale-110"
                                />
                            </div>
                            <div>
                                <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
                                    {/* Small inline icon – mobile only */}
                                    <span className="sm:hidden shrink-0">
                                        <img src="/images/money.png" alt="Money" className="h-6 w-6 object-contain" />
                                    </span>
                                    Recharge Message Wallet
                                </h2>
                                <p className="mt-1 text-[11px] sm:text-sm text-indigo-200/80 leading-snug sm:leading-relaxed max-w-xl line-clamp-2 sm:line-clamp-none">
                                    Marketing, utility aur authentication message charges wallet se deduct honge. Campaign launch se pehle enough balance rakho.
                                </p>
                            </div>
                        </div>

                        {/* Amount buttons */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:flex sm:flex-wrap items-center">
                            {[50000, 100000, 250000, 500000].map(amount => (
                                <button
                                    key={amount}
                                    type="button"
                                    onClick={() => handleWalletRecharge(amount)}
                                    disabled={recharging !== null}
                                    className="group relative inline-flex min-w-0 sm:min-w-[120px] items-center justify-center gap-1.5 sm:gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:shadow-lg hover:shadow-indigo-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {recharging === amount ? (
                                        <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-indigo-400" />
                                    ) : (
                                        <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-400 transition-transform group-hover:scale-110" />
                                    )}
                                    <span>{formatINRFromPaise(amount)}</span>
                                    <div className="absolute -inset-px -z-10 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                </button>
                            ))}

                            {isCustomMode ? (
                                <div className="col-span-2 sm:col-span-1 relative inline-flex min-w-0 sm:min-w-[180px] items-center gap-2 overflow-hidden rounded-xl border border-indigo-400/40 bg-white/10 pl-3 pr-2 py-2 text-xs sm:text-sm font-semibold text-white backdrop-blur-md shadow-lg shadow-indigo-500/10 transition-all duration-300">
                                    <span className="text-indigo-400 font-bold select-none">₹</span>
                                    <input
                                        type="number"
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="Amount"
                                        min="100"
                                        className="w-full sm:w-20 bg-transparent border-0 outline-none p-0 text-xs sm:text-sm font-bold text-white placeholder-white/30 focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleCustomSubmit()
                                            } else if (e.key === 'Escape') {
                                                setIsCustomMode(false)
                                                setCustomAmount('')
                                            }
                                        }}
                                    />
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={handleCustomSubmit}
                                            disabled={recharging !== null || !customAmount}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white transition-all hover:bg-indigo-500 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                            title="Proceed to pay"
                                        >
                                            {recharging !== null ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                            ) : (
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsCustomMode(false)
                                                setCustomAmount('')
                                            }}
                                            disabled={recharging !== null}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                            title="Cancel"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsCustomMode(true)}
                                    disabled={recharging !== null}
                                    className="col-span-2 sm:col-span-1 group relative inline-flex min-w-0 sm:min-w-[120px] items-center justify-center gap-1.5 sm:gap-2 overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-white/85 backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:border-solid hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white hover:shadow-lg hover:shadow-indigo-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-400 transition-transform group-hover:scale-110" />
                                    <span>Custom</span>
                                    <div className="absolute -inset-px -z-10 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                </button>
                            )}
                        </div>
                    </div>
                </section>


                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
                    <div className="rounded-xl border border-gray-200 bg-white">
                        <div className="border-b border-gray-100 p-5">
                            <h2 className="text-base font-semibold text-gray-950">Message Spend Breakdown</h2>
                            <p className="mt-1 text-sm text-gray-500">User ko yahan clear dikh jayega ki marketing aur utility par kitna spend hua.</p>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 md:grid-cols-4 md:divide-y-0">
                            {['marketing', 'utility', 'authentication', 'service'].map(category => {
                                const spend = categorySpend.find(item => item.category === category) || {}
                                const rate = rateMap[category] || FALLBACK_RATE_CARDS.find(item => item.category === category)
                                return (
                                    <div key={category} className="p-3 sm:p-5">
                                        <p className="text-[11px] sm:text-sm font-semibold text-gray-950 capitalize">{rate?.label || category}</p>
                                        <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-semibold text-gray-950 truncate">{formatINRFromPaise(spend.charged_amount_paise)}</p>
                                        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500">{spend.message_count || 0} msgs</p>
                                        <p className="mt-2 sm:mt-4 text-[10px] sm:text-xs font-medium text-gray-500">{formatINRFromPaise(rate?.rate_paise)}/msg</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white">
                        <div className="border-b border-gray-100 p-5">
                            <h2 className="text-base font-semibold text-gray-950">Message Rate Card</h2>
                            <p className="mt-1 text-sm text-gray-500">Rates admin side se update honge jab Meta pricing change kare.</p>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {rateCards.map(rate => (
                                <div key={rate.category} className="flex items-start justify-between gap-4 p-4">
                                    <div>
                                        <p className="text-sm font-semibold capitalize text-gray-900">{rate.label || rate.category}</p>
                                        <p className="mt-1 text-xs leading-5 text-gray-500">{rate.description || rate.notes}</p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold text-gray-950">{formatINRFromPaise(rate.rate_paise)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section data-tour="billing-activity" className="rounded-xl border border-gray-200 bg-white">
                    <button
                        type="button"
                        onClick={() => setIsMessageBillingOpen(prev => !prev)}
                        className="flex w-full flex-col gap-3 p-5 text-left transition-colors hover:bg-gray-50 sm:flex-row sm:items-start sm:justify-between"
                        aria-expanded={isMessageBillingOpen}
                    >
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-gray-950">Message Billing Activity</h2>
                                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                    Latest {messageCharges.length} records
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-500">
                                Broadcast/template usage charges ka compact preview. Full campaign history Broadcasts page me milegi.
                            </p>
                        </div>
                        <span className="inline-flex w-fit items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
                            <Megaphone className="h-3.5 w-3.5 text-blue-600" />
                            {formatINRFromPaise(messageChargesTotalPaise)}
                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isMessageBillingOpen ? 'rotate-180' : ''}`} />
                        </span>
                    </button>
                    {isMessageBillingOpen ? (
                        <div className="divide-y divide-gray-100 border-t border-gray-100">
                            {messageCharges.length === 0 ? (
                                <p className="p-5 text-sm text-gray-500">Abhi message billing activity empty hai. Broadcast ya paid template send hone ke baad charges yahan aayenge.</p>
                            ) : messageCharges.map(charge => (
                                <div key={charge.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-gray-900">{getMessageChargeTitle(charge)}</p>
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${charge.billing_status === 'charged' ? 'bg-green-50 text-green-700 ring-green-600/20' : charge.billing_status === 'failed' ? 'bg-red-50 text-red-700 ring-red-600/10' : 'bg-gray-50 text-gray-600 ring-gray-200'}`}>
                                                {String(charge.billing_status || 'recorded').replaceAll('_', ' ')}
                                            </span>
                                        </div>
                                        <p className="mt-1 truncate text-xs text-gray-500">
                                            {charge.template_name ? `Template: ${charge.template_name}` : 'No template name'}{charge.campaign_id ? ` - Campaign ${String(charge.campaign_id).slice(0, 8)}` : ''}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-left sm:text-right">
                                        <p className={`text-sm font-semibold ${charge.billing_status === 'failed' ? 'text-red-600' : 'text-gray-950'}`}>
                                            {formatINRFromPaise(charge.charged_amount_paise)}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">{new Date(charge.created_at).toLocaleDateString('en-IN')}</p>
                                    </div>
                                </div>
                            ))}
                            <div className="flex flex-col gap-3 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-gray-600">
                                    Yahan sirf latest usage charges preview hain. Baki broadcast/campaign details history me available hain.
                                </p>
                                <Link
                                    to="/broadcast"
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                                >
                                    Open broadcast history
                                    <Megaphone className="h-4 w-4 text-blue-600" />
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
                            Details hidden. Ye compact latest usage preview hai; full broadcast history Broadcasts page me milegi.
                        </div>
                    )}
                </section>

                <section data-tour="billing-plans" className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">Subscription Plans</h2>
                            <p className="mt-1 text-sm text-gray-500">Plan access ke liye hai. WhatsApp message spend wallet/recharge se alag chalega.</p>
                        </div>
                        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
                            <div className="inline-flex w-full rounded-xl border border-gray-200 bg-white p-1 shadow-sm sm:w-fit">
                                {BILLING_INTERVALS.map(item => (
                                    <button
                                        key={item.months}
                                        type="button"
                                        onClick={() => setInterval(item.months)}
                                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${interval === item.months ? 'bg-[#128C7E] text-white shadow-sm' : 'text-gray-600 hover:bg-emerald-50 hover:text-[#075E54]'
                                            }`}
                                    >
                                        {item.label}
                                        {item.discount > 0 && <span className="ml-2 text-xs text-green-500">-{item.discount}%</span>}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <CreditCard className="h-4 w-4" />
                                Razorpay secure checkout
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {plans.map(plan => {
                            const price = getPlanPrice(plan, interval)
                            const monthlyEquivalent = getMonthlyEquivalent(plan, interval)
                            const current = isCurrentPlan(currentPlan, plan) || String(activePlanId || '').toLowerCase().includes(String(plan.id).toLowerCase())
                            const targetRank = getPlanRank(plan)
                            const isDowngrade = activePlanRank > 0 && targetRank > 0 && targetRank < activePlanRank
                            const scheduled = scheduledPlanId === plan.id
                            const badge = plan.badge || getPlanBadge(plan.id)
                            return (
                                <article
                                    key={plan.id}
                                    className={`relative rounded-xl border p-5 ${plan.id === 'growth' ? 'border-[#128C7E] bg-gradient-to-br from-[#075E54] via-[#0b6f63] to-[#128C7E] text-white shadow-lg shadow-emerald-900/10' : 'border-gray-200 bg-white text-gray-950'
                                        }`}
                                >
                                    {badge && !current && (
                                        <span className="absolute right-4 top-4 rounded-full bg-green-500 px-2.5 py-1 text-xs font-bold text-white">
                                            {badge}
                                        </span>
                                    )}
                                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                                    <p className={`mt-2 min-h-12 text-sm ${plan.id === 'growth' ? 'text-gray-300' : 'text-gray-500'}`}>{plan.description}</p>
                                    <div className="mt-5">
                                        <p className="flex items-baseline gap-1 text-3xl font-bold">
                                            {formatINRFromPaise(monthlyEquivalent)}
                                            {price !== 0 && <span className={`text-sm font-medium ${plan.id === 'growth' ? 'text-emerald-100' : 'text-gray-500'}`}>/month</span>}
                                        </p>
                                        <p className={`mt-1 text-xs ${plan.id === 'growth' ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {price === 0 ? 'Forever' : interval === 12 ? `${formatINRFromPaise(price)} billed yearly` : 'Billed monthly'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={current || scheduled || upgrading === plan.id}
                                        onClick={() => handleUpgrade(plan)}
                                        className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-60 ${plan.id === 'growth'
                                            ? 'bg-white text-[#075E54] hover:bg-emerald-50'
                                            : 'bg-[#128C7E] text-white hover:bg-[#075E54]'
                                            }`}
                                    >
                                        {upgrading === plan.id
                                            ? 'Processing...'
                                            : getPlanActionLabel({ current, isDowngrade, scheduled, planName: plan.name })}
                                    </button>
                                    {isDowngrade && !scheduled && !current ? (
                                        <p className={`mt-2 text-xs leading-5 ${plan.id === 'growth' ? 'text-emerald-100' : 'text-gray-500'}`}>
                                            Downgrade immediately charge nahi karega. Ye next billing cycle se apply hoga.
                                        </p>
                                    ) : null}
                                    {scheduled ? (
                                        <p className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${plan.id === 'growth' ? 'bg-white/10 text-emerald-50' : 'bg-amber-50 text-amber-700'}`}>
                                            Scheduled from {formatPlanDate(scheduledEffectiveAt) || 'next renewal'}.
                                        </p>
                                    ) : null}
                                    <ul className="mt-5 space-y-3">
                                        {normalizePlanFeatures(plan).slice(0, 7).map(feature => (
                                            <li key={feature} className="flex gap-2 text-sm">
                                                <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.id === 'growth' ? 'text-green-400' : 'text-green-600'}`} />
                                                <span className={plan.id === 'growth' ? 'text-gray-200' : 'text-gray-600'}>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            )
                        })}
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════════════
                    COMPREHENSIVE PLANS COMPARISON SECTION (REDESIGNED)
                ═══════════════════════════════════════════════════════════════ */}
                <section className="space-y-4 py-4">
                    <div className="text-center space-y-2 mb-4">
                        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 mx-auto">
                            <span className="text-emerald-500 font-bold">✨</span>
                            Choose the plan that grows with you
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-snug">
                            Compare Plans. Pick Your Perfect Fit.
                        </h2>
                        <p className="text-xs text-gray-500 max-w-xl mx-auto font-medium">
                            All plans include core features to help you connect, automate, and grow.
                        </p>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-gray-100/30">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[700px] border-separate border-spacing-0 text-left">
                                <thead>
                                    <tr>
                                        {/* Column 1: Features Header */}
                                        <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider w-2/5 border-b border-gray-100">
                                            Features
                                        </th>
                                        
                                        {/* Column 2: Starter Header */}
                                        <th className="py-3 px-4 text-center w-1/5 border-b border-gray-100">
                                            <div className="space-y-1.5">
                                                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                                    <Send className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <span className="block text-sm font-bold text-gray-900">Starter</span>
                                                    <span className="block text-[9px] font-medium text-gray-400">Perfect for getting started</span>
                                                </div>
                                            </div>
                                        </th>

                                        {/* Column 3: Growth Header (Highlighted) */}
                                        <th className="py-3 px-4 text-center bg-emerald-50/5 border-t-2 border-l-2 border-r-2 border-emerald-500 rounded-t-xl relative w-1/5">
                                            <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                                                <Check className="h-3 w-3 stroke-[3.5]" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                                                    <Zap className="h-4 w-4 fill-amber-500" />
                                                </div>
                                                <div>
                                                    <span className="block text-sm font-black text-emerald-800">Growth</span>
                                                    <span className="block text-[9px] font-bold text-emerald-600">Recommended for you</span>
                                                </div>
                                            </div>
                                        </th>

                                        {/* Column 4: Pro Header */}
                                        <th className="py-3 px-4 text-center w-1/5 border-b border-gray-100">
                                            <div className="space-y-1.5">
                                                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                                                    <Crown className="h-4 w-4 fill-orange-500" />
                                                </div>
                                                <div>
                                                    <span className="block text-sm font-bold text-gray-900">Pro</span>
                                                    <span className="block text-[9px] font-medium text-gray-400">For advanced businesses</span>
                                                </div>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                
                                <tbody>
                                    {comparisonFeatures.map((feature, idx) => {
                                        const FeatureIcon = feature.icon;
                                        
                                        const renderCellVal = (val, isGrowth = false) => {
                                            if (val === 'tick') {
                                                return (
                                                    <div className="inline-flex items-center justify-center rounded-full bg-emerald-500 p-0.5 text-white shadow-sm">
                                                        <Check className="h-2.5 w-2.5 stroke-[4]" />
                                                    </div>
                                                );
                                            }
                                            if (val === 'cross') {
                                                return <span className="text-gray-300 font-bold text-base">×</span>;
                                            }
                                            if (val === '—') {
                                                return <span className="text-gray-300 font-bold text-base">—</span>;
                                            }
                                            return (
                                                <span className={`text-xs ${isGrowth && feature.highlightGrowth ? 'text-emerald-600 font-extrabold' : 'text-gray-600 font-medium'}`}>
                                                    {val}
                                                </span>
                                            );
                                        };

                                        return (
                                            <tr key={idx} className="hover:bg-gray-50/20 transition-colors">
                                                {/* Feature Name and Icon */}
                                                <td className="px-4 py-2 border-b border-gray-100">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 text-gray-500">
                                                            <FeatureIcon className="h-3.5 w-3.5 stroke-[2]" />
                                                        </div>
                                                        <span className="text-xs font-semibold text-gray-700">{feature.name}</span>
                                                    </div>
                                                </td>

                                                {/* Starter Value */}
                                                <td className="px-4 py-2 text-center border-b border-gray-100">
                                                    {renderCellVal(feature.starter)}
                                                </td>

                                                {/* Growth Value (Highlighted) */}
                                                <td className="px-4 py-2 text-center bg-emerald-50/5 border-l-2 border-r-2 border-emerald-500 border-b border-emerald-100/30">
                                                    {renderCellVal(feature.growth, true)}
                                                </td>

                                                {/* Pro Value */}
                                                <td className="px-4 py-2 text-center border-b border-gray-100">
                                                    {renderCellVal(feature.pro)}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* Pricing Row */}
                                    <tr>
                                        {/* Empty Features Cell */}
                                        <td className="px-4 py-3 border-b border-gray-100"></td>

                                        {/* Starter Price */}
                                        <td className="px-4 py-3 text-center border-b border-gray-100">
                                            {(() => {
                                                const starterPlan = plans.find(p => p.id === 'starter') || FALLBACK_PLANS[0];
                                                const monthlyEquivalent = getMonthlyEquivalent(starterPlan, interval);
                                                return (
                                                    <div className="space-y-0.5">
                                                        <span className="block text-lg font-black text-gray-950">{formatINRFromPaise(monthlyEquivalent)}</span>
                                                        <span className="block text-[9px] font-semibold text-gray-400">/month</span>
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* Growth Price (Highlighted) */}
                                        <td className="px-4 py-3 text-center bg-emerald-50/5 border-l-2 border-r-2 border-emerald-500 border-b border-emerald-100/30">
                                            {(() => {
                                                const growthPlan = plans.find(p => p.id === 'growth') || FALLBACK_PLANS[1];
                                                const monthlyEquivalent = getMonthlyEquivalent(growthPlan, interval);
                                                return (
                                                    <div className="space-y-0.5">
                                                        <span className="block text-lg font-black text-emerald-600">{formatINRFromPaise(monthlyEquivalent)}</span>
                                                        <span className="block text-[9px] font-bold text-emerald-500">/month</span>
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* Pro Price */}
                                        <td className="px-4 py-3 text-center border-b border-gray-100">
                                            {(() => {
                                                const proPlan = plans.find(p => p.id === 'pro') || FALLBACK_PLANS[2];
                                                const monthlyEquivalent = getMonthlyEquivalent(proPlan, interval);
                                                return (
                                                    <div className="space-y-0.5">
                                                        <span className="block text-lg font-black text-gray-950">{formatINRFromPaise(monthlyEquivalent)}</span>
                                                        <span className="block text-[9px] font-semibold text-gray-400">/month</span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>

                                    {/* Action Buttons Row */}
                                    <tr>
                                        {/* Empty Features Cell */}
                                        <td className="px-4 py-3"></td>

                                        {/* Starter Action */}
                                        <td className="px-4 py-3 text-center align-middle">
                                            {(() => {
                                                const starterPlan = plans.find(p => p.id === 'starter') || FALLBACK_PLANS[0];
                                                const current = isCurrentPlan(currentPlan, starterPlan) || String(activePlanId || '').toLowerCase().includes('starter');
                                                const targetRank = getPlanRank(starterPlan);
                                                const isDowngrade = activePlanRank > 0 && targetRank > 0 && targetRank < activePlanRank;
                                                const scheduled = scheduledPlanId === starterPlan.id;
                                                return (
                                                    <button
                                                        type="button"
                                                        disabled={current || scheduled || upgrading === starterPlan.id}
                                                        onClick={() => handleUpgrade(starterPlan)}
                                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
                                                    >
                                                        {upgrading === starterPlan.id ? '...' : getPlanActionLabel({ current, isDowngrade, scheduled, planName: 'Starter' })}
                                                    </button>
                                                );
                                            })()}
                                        </td>

                                        {/* Growth Action (Highlighted) */}
                                        <td className="px-4 py-3 text-center align-middle bg-emerald-50/5 border-l-2 border-r-2 border-b-2 border-emerald-500 rounded-b-xl">
                                            {(() => {
                                                const growthPlan = plans.find(p => p.id === 'growth') || FALLBACK_PLANS[1];
                                                const current = isCurrentPlan(currentPlan, growthPlan) || String(activePlanId || '').toLowerCase().includes('growth');
                                                const targetRank = getPlanRank(growthPlan);
                                                const isDowngrade = activePlanRank > 0 && targetRank > 0 && targetRank < activePlanRank;
                                                const scheduled = scheduledPlanId === growthPlan.id;
                                                return (
                                                    <button
                                                        type="button"
                                                        disabled={current || scheduled || upgrading === growthPlan.id}
                                                        onClick={() => handleUpgrade(growthPlan)}
                                                        className="w-full rounded-lg bg-[#128C7E] hover:bg-[#075E54] text-white px-3 py-1.5 text-[10px] font-bold transition shadow disabled:opacity-60"
                                                    >
                                                        {upgrading === growthPlan.id ? '...' : getPlanActionLabel({ current, isDowngrade, scheduled, planName: 'Growth' })}
                                                    </button>
                                                );
                                            })()}
                                        </td>

                                        {/* Pro Action */}
                                        <td className="px-4 py-3 text-center align-middle">
                                            {(() => {
                                                const proPlan = plans.find(p => p.id === 'pro') || FALLBACK_PLANS[2];
                                                const current = isCurrentPlan(currentPlan, proPlan) || String(activePlanId || '').toLowerCase().includes('pro');
                                                const targetRank = getPlanRank(proPlan);
                                                const isDowngrade = activePlanRank > 0 && targetRank > 0 && targetRank < activePlanRank;
                                                const scheduled = scheduledPlanId === proPlan.id;
                                                return (
                                                    <button
                                                        type="button"
                                                        disabled={current || scheduled || upgrading === proPlan.id}
                                                        onClick={() => handleUpgrade(proPlan)}
                                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
                                                    >
                                                        {upgrading === proPlan.id ? '...' : getPlanActionLabel({ current, isDowngrade, scheduled, planName: 'Pro' })}
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 p-5">
                        <h2 className="text-base font-semibold text-gray-950">Subscription Plan Activity</h2>
                        <p className="mt-1 text-sm text-gray-500">Plan upgrades, prorated invoices, credits, aur scheduled downgrades yahan track honge.</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {scheduledPlan ? (
                            <div className="flex items-center justify-between gap-4 p-4">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">Scheduled downgrade to {scheduledPlan.name}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                            Pending next cycle
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            Current plan continues until {formatPlanDate(scheduledEffectiveAt) || 'renewal date'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-gray-950">No charge now</p>
                                    <p className="mt-1 text-xs text-gray-500">{formatPlanDate(scheduledEffectiveAt) || 'Next cycle'}</p>
                                    <button
                                        type="button"
                                        onClick={handleCancelScheduledChange}
                                        disabled={isCancelingScheduledChange}
                                        className="mt-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isCancelingScheduledChange ? 'Cancelling...' : 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {subscriptionInvoices.length === 0 && !scheduledPlan ? (
                            <p className="p-5 text-sm text-gray-500">Abhi plan invoice ya scheduled plan change history empty hai.</p>
                        ) : subscriptionInvoices.map(invoice => (
                            <SubscriptionInvoiceRow
                                key={invoice.id}
                                invoice={invoice}
                                plans={plans}
                            />
                        ))}
                    </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 p-5">
                        <h2 className="text-base font-semibold text-gray-950">Recent Wallet Transactions</h2>
                        <p className="mt-1 text-sm text-gray-500">Sirf message wallet recharge, refund, adjustment ya payment entries. Subscription plan payments upar separate section me hain.</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {walletTransactions.length === 0 ? (
                            <p className="p-5 text-sm text-gray-500">Abhi wallet recharge/refund transaction history empty hai.</p>
                        ) : walletTransactions.map(tx => {
                            const isPending = tx.status === 'pending';
                            const isCompleted = tx.status === 'completed';
                            return (
                                <div key={tx.id} className="flex items-center justify-between gap-4 p-4">
                                    <div>
                                        <p className="text-sm font-semibold capitalize text-gray-900">{String(tx.type || '').replaceAll('_', ' ')}</p>
                                        <div className="mt-1 flex items-center gap-2">
                                            {isPending ? (
                                                <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                                                    Incomplete / Cancelled
                                                </span>
                                            ) : isCompleted ? (
                                                <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                                    Completed
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-500">{tx.description || tx.status}</span>
                                            )}
                                            {isCompleted && (
                                                <button
                                                    onClick={() => {
                                                        const invoiceDate = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                                                        const invoiceNo = `GAP-${new Date(tx.created_at).getFullYear()}-${tx.id.split('-')[0].toUpperCase()}`;
                                                        const customerName = user?.user_metadata?.organization_name || user?.user_metadata?.full_name || 'Customer';
                                                        const amountFormatted = formatINRFromPaise(Math.abs(tx.amount_paise));

                                                        const receiptContent = `
                                                            <html>
                                                            <head>
                                                            <title>Invoice - ${invoiceNo}</title>
                                                            <style>
                                                            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; margin: 0; color: #111827; background: #fff; }
                                                            .invoice-container { max-width: 800px; margin: 0 auto; }
                                                            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
                                                            .logo-container { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
                                                            .logo-icon { width: 32px; height: 32px; object-fit: contain; }
                                                            .invoice-title { font-size: 28px; font-weight: 500; letter-spacing: 2px; color: #374151; }
                                                            .company-details { margin-top: 10px; font-size: 14px; color: #4b5563; line-height: 1.5; }
                                                            .billing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
                                                            .bill-to h3 { font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: 1px; margin-bottom: 8px; text-transform: uppercase; }
                                                            .bill-to p { font-size: 14px; margin: 0; line-height: 1.5; color: #4b5563; }
                                                            .bill-to strong { color: #111827; font-size: 16px; display: block; margin-bottom: 4px; }
                                                            .meta-table { width: 100%; border-collapse: collapse; }
                                                            .meta-table td { padding: 6px 0; font-size: 14px; }
                                                            .meta-table td:first-child { font-weight: 600; color: #374151; width: 40%; }
                                                            .meta-table td:last-child { text-align: right; color: #111827; }
                                                            .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                                                            .invoice-table th { padding: 12px 0; border-bottom: 2px solid #e5e7eb; font-size: 11px; font-weight: 600; color: #111827; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
                                                            .invoice-table th:first-child { text-align: left; }
                                                            .invoice-table td { padding: 16px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: right; color: #374151; }
                                                            .invoice-table td:first-child { text-align: left; font-weight: 600; color: #111827; }
                                                            .invoice-table .desc-sub { display: block; font-weight: normal; color: #6b7280; font-size: 12px; margin-top: 4px; }
                                                            .summary-container { display: flex; justify-content: flex-end; }
                                                            .summary-table { width: 300px; border-collapse: collapse; }
                                                            .summary-table td { padding: 8px 0; font-size: 14px; text-align: right; }
                                                            .summary-table td:first-child { text-align: left; color: #4b5563; }
                                                            .summary-table .total-row td { padding-top: 12px; border-top: 2px solid #111827; font-weight: 700; font-size: 16px; color: #111827; }
                                                            .memo { margin-top: 60px; font-size: 13px; color: #4b5563; line-height: 1.6; }
                                                            .memo strong { color: #111827; display: block; margin-bottom: 4px; font-size: 14px; }
                                                            </style>
                                                            </head>
                                                            <body>
                                                                <div class="invoice-container">
                                                                    <div class="header">
                                                                        <div>
                                                                            <div class="logo-container">
                                                                                <img src="https://getaipilot.in/logo.png" alt="Get AI Pilot Logo" class="logo-icon" />
                                                                                <span>Get AI Pilot</span>
                                                                            </div>
                                                                            <div class="company-details">
                                                                                Get AI Pilot Automation<br>
                                                                                India<br>
                                                                                support@getaipilot.in
                                                                            </div>
                                                                        </div>
                                                                        <div class="invoice-title">INVOICE</div>
                                                                    </div>
                                                            
                                                                    <div class="billing-grid">
                                                                        <div class="bill-to">
                                                                            <h3>Bill To</h3>
                                                                            <strong>${customerName}</strong>
                                                                            <p>${user?.email || ''}</p>
                                                                            <p>India</p>
                                                                        </div>
                                                                        <div>
                                                                            <table class="meta-table">
                                                                                <tr><td>Invoice number</td><td>${invoiceNo}</td></tr>
                                                                                <tr><td>Invoice date</td><td>${invoiceDate}</td></tr>
                                                                                <tr><td>Amount due</td><td>${amountFormatted}</td></tr>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                            
                                                                    <table class="invoice-table">
                                                                        <thead>
                                                                            <tr>
                                                                                <th>Description</th>
                                                                                <th>Quantity</th>
                                                                                <th>Rate</th>
                                                                                <th>Amount</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            <tr>
                                                                                <td>
                                                                                    WhatsApp Message Wallet Recharge
                                                                                    <span class="desc-sub">Transaction ID: ${tx.id}</span>
                                                                                </td>
                                                                                <td>1</td>
                                                                                <td>${amountFormatted}</td>
                                                                                <td>${amountFormatted}</td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                            
                                                                    <div class="summary-container">
                                                                        <table class="summary-table">
                                                                            <tr><td>Subtotal</td><td>${amountFormatted}</td></tr>
                                                                            <tr><td>Tax</td><td>₹0.00</td></tr>
                                                                            <tr class="total-row"><td>Amount due</td><td>${amountFormatted}</td></tr>
                                                                        </table>
                                                                    </div>
                                                            
                                                                    <div class="memo">
                                                                        <strong>Memo:</strong>
                                                                        Thank you for choosing Get AI Pilot.<br>
                                                                        This invoice is generated for your wallet recharge and account services.<br>
                                                                        Taxes, if applicable, are calculated from the saved billing profile and local regulations.<br>
                                                                        For billing support, contact support@getaipilot.in.
                                                                    </div>
                                                                </div>
                                                                <script>setTimeout(() => window.print(), 500);</script>
                                                            </body>
                                                            </html>
                                                        `;
                                                        const printWin = window.open('', '_blank');
                                                        printWin.document.write(receiptContent);
                                                        printWin.document.close();
                                                    }}
                                                    className="ml-2 text-xs font-semibold text-indigo-600 hover:text-indigo-500 hover:underline"
                                                >
                                                    Download Receipt
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-semibold ${tx.amount_paise < 0 ? 'text-red-600' : 'text-gray-950'} ${isPending ? 'line-through text-gray-400 opacity-60' : ''}`}>
                                            {formatINRFromPaise(Math.abs(tx.amount_paise))}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">{new Date(tx.created_at).toLocaleDateString('en-IN')}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>

            {pendingDowngradePlan && (
                <DowngradePlanModal
                    plan={pendingDowngradePlan}
                    currentPlanName={currentPlan?.name || user?.plan || 'current plan'}
                    effectiveDate={scheduledEffectiveAt || overview?.subscription?.expires_at || overview?.organization?.plan_end_date}
                    isProcessing={upgrading === pendingDowngradePlan.id}
                    onClose={() => {
                        if (!upgrading) setPendingDowngradePlan(null)
                    }}
                    onConfirm={async () => {
                        const plan = pendingDowngradePlan
                        const success = await submitPlanChange(plan)
                        if (success) setPendingDowngradePlan(null)
                    }}
                />
            )}
        </div>
    )
}

function getMessageChargeTitle(charge) {
    const source = String(charge.source || '').toLowerCase()
    const category = String(charge.category || 'message').replaceAll('_', ' ')
    if (source === 'broadcast') return `Broadcast ${category} charge`
    if (source === 'flow') return `Flow automation ${category} charge`
    if (source === 'ai_agent') return `AI agent ${category} charge`
    if (source === 'manual') return `Manual message ${category} charge`
    return `WhatsApp ${category} charge`
}

function getPlanDisplayName(planId, plans = []) {
    const value = String(planId || '').toLowerCase()
    const isWhatsApp = value.startsWith('whatsapp_') || value.startsWith('wa_') || value.startsWith('wa ') || ['starter', 'growth', 'pro', 'enterprise'].includes(value)

    let normalized = value
    if (isWhatsApp) {
        if (value.includes('starter')) normalized = 'starter'
        else if (value.includes('growth')) normalized = 'growth'
        else if (value.includes('pro')) normalized = 'pro'
        else if (value.includes('enterprise')) normalized = 'enterprise'
    }

    return plans.find(plan => String(plan.id).toLowerCase() === normalized)?.name
        || FALLBACK_PLANS.find(plan => String(plan.id).toLowerCase() === normalized)?.name
        || (planId ? String(planId).replaceAll('_', ' ') : 'Plan')
}

function SubscriptionInvoiceRow({ invoice, plans }) {
    const status = String(invoice.status || 'draft')
    const isPaid = status === 'paid'
    const isPending = status === 'pending_payment'
    const isFailed = ['failed', 'void'].includes(status)
    const targetPlanName = getPlanDisplayName(invoice.target_plan_id, plans)
    const currentPlanName = getPlanDisplayName(invoice.current_plan_id, plans)
    const proration = invoice.metadata?.proration || {}

    return (
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                    {invoice.type === 'upgrade'
                        ? `${currentPlanName} to ${targetPlanName} upgrade`
                        : `${targetPlanName} subscription`}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        isPaid
                            ? 'bg-green-50 text-green-700 ring-green-600/20'
                            : isPending
                                ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                                : isFailed
                                    ? 'bg-red-50 text-red-700 ring-red-600/10'
                                    : 'bg-gray-50 text-gray-600 ring-gray-200'
                    }`}>
                        {status.replaceAll('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                        {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-IN') : 'Recorded'}
                    </span>
                </div>
                {Number(invoice.credit_applied_paise || 0) > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">
                        Credit applied: {formatINRFromPaise(invoice.credit_applied_paise)}
                        {proration.remaining_ratio ? ` • ${(proration.remaining_ratio * 100).toFixed(0)}% cycle remaining` : ''}
                    </p>
                ) : null}
            </div>
            <div className="text-left sm:text-right">
                <p className={`text-sm font-semibold ${isFailed ? 'line-through text-gray-400' : 'text-gray-950'}`}>
                    {formatINRFromPaise(invoice.total_paise)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    Subtotal {formatINRFromPaise(invoice.subtotal_paise)}
                </p>
            </div>
        </div>
    )
}

function Tick() {
    return (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] transition-transform duration-200 hover:scale-110">
            <Check className="h-4 w-4 stroke-[2.5]" />
        </span>
    );
}

function Cross() {
    return (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-gray-400 border border-gray-200 transition-transform duration-200 hover:scale-110">
            <X className="h-4 w-4 stroke-[2]" />
        </span>
    );
}

function BillingNotice({ notice, onClose }) {
    const isError = notice.type === 'error'

    return (
        <div className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-sm shadow-sm ${isError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            <div className="flex min-w-0 items-start gap-3">
                {isError ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0">
                    <p className="font-semibold">{notice.title}</p>
                    {notice.message ? <p className="mt-0.5 leading-5 opacity-90">{notice.message}</p> : null}
                </div>
            </div>
            <button
                type="button"
                onClick={onClose}
                className={`shrink-0 rounded-full p-1 transition ${isError ? 'hover:bg-red-100' : 'hover:bg-emerald-100'}`}
                aria-label="Close notification"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}

function DowngradePlanModal({ plan, currentPlanName, effectiveDate, isProcessing, onClose, onConfirm }) {
    const effectiveLabel = formatPlanDate(effectiveDate) || 'next billing cycle'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="downgrade-plan-title">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Scheduled downgrade</p>
                        <h2 id="downgrade-plan-title" className="mt-1 text-xl font-semibold text-gray-950">
                            Downgrade to {plan.name}?
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                            Aapka {currentPlanName} access abhi continue rahega. {plan.name} plan {effectiveLabel} se start hoga.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isProcessing}
                        className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Close downgrade modal"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3 p-5">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-semibold">No immediate refund or feature cut</p>
                        <p className="mt-1 leading-5">
                            Downgrade next renewal par apply hoga. Current billing period tak existing limits aur features active rahenge.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs font-medium text-gray-500">Current access</p>
                            <p className="mt-1 font-semibold text-gray-950">{currentPlanName}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs font-medium text-gray-500">Starts from</p>
                            <p className="mt-1 font-semibold text-gray-950">{effectiveLabel}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isProcessing}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Keep current plan
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#128C7E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#075E54] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Schedule downgrade
                    </button>
                </div>
            </div>
        </div>
    )
}
