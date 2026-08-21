import { createElement, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Cell,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Sector,
} from 'recharts'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Bot,
    CheckCircle2,
    ChevronDown,
    Clock3,
    FileText,
    Gauge,
    Grid2X2,
    MessageSquareText,
    PhoneCall,
    RefreshCw,
    Send,
    Smartphone,
    Sparkles,
    TrendingUp,
    UserRoundCheck,
    Users,
    Wallet,
    Workflow,
    Zap,
    ArrowUpRight,
    CheckCheck,
    Eye,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { formatINRFromPaise } from '../config/whatsappPricing'

gsap.registerPlugin(useGSAP)

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const ranges = [
    { label: 'Today', value: 'today' },
    { label: '7 days', value: '7d' },
    { label: '30 days', value: '30d' },
]

const formatter = new Intl.NumberFormat('en-IN')

function n(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function fmt(value) {
    return formatter.format(n(value))
}

function compact(value) {
    return new Intl.NumberFormat('en-IN', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(n(value))
}

function pct(value) {
    return `${Math.max(0, Math.min(100, Math.round(n(value))))}%`
}

function contactsFrom(stats) {
    return typeof stats?.contacts === 'number'
        ? { total: stats.contacts, saved: 0 }
        : { total: n(stats?.contacts?.total), saved: n(stats?.contacts?.saved) }
}

function freshness(updatedAt) {
    if (!updatedAt) return 'Waiting for sync'
    const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
    if (seconds < 10) return 'Updated just now'
    if (seconds < 60) return `Updated ${seconds}s ago`
    return `Updated ${Math.round(seconds / 60)}m ago`
}

export default function Dashboard() {
    const { apiCall, session } = useAuth()
    const [range, setRange] = useState('today')
    const [isAccountsOpen, setIsAccountsOpen] = useState(false)
    const dashboardRef = useRef(null)

    const {
        data: stats,
        isLoading,
        isFetching,
        dataUpdatedAt,
        error,
        refetch,
    } = useQuery({
        queryKey: ['dashboard-stats', session?.access_token, range],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/dashboard-stats?range=${encodeURIComponent(range)}`)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body?.error || 'Failed to fetch dashboard stats')
            return body
        },
        staleTime: 1000 * 30,
        refetchInterval: 15000,
        enabled: !!session?.access_token,
    })

    const { data: billingOverview } = useQuery({
        queryKey: ['billing-overview-compact', session?.access_token],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/billing/overview`)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body?.error || 'Failed to fetch billing overview')
            return body
        },
        staleTime: 1000 * 60,
        refetchInterval: 60000,
        enabled: !!session?.access_token,
    })

    const { data: conversationCount } = useQuery({
        queryKey: ['whatsapp-conversation-count', session?.access_token],
        queryFn: async () => {
            const { count, error } = await supabase
                .from('w_conversations')
                .select('id', { count: 'exact', head: true })

            if (error || typeof count !== 'number' || count === 0) {
                const { data: logs } = await supabase
                    .from('whatsapp_message_usage_logs')
                    .select('conversation_id, contact_id, recipient_number, sender_number, phone_number, to_number, from_number')
                    .limit(500)

                if (logs && logs.length > 0) {
                    const uniqueIds = new Set(
                        logs
                            .map((l) => l.conversation_id || l.contact_id || l.recipient_number || l.sender_number || l.phone_number || l.to_number || l.from_number)
                            .filter(Boolean)
                    )
                    if (uniqueIds.size > 0) return uniqueIds.size
                }

                const { count: contactsCount } = await supabase
                    .from('w_contacts')
                    .select('id', { count: 'exact', head: true })
                if (contactsCount && contactsCount > 0) return contactsCount
            }

            return count ?? 0
        },
        staleTime: 1000 * 30,
        refetchInterval: 15000,
        enabled: !!session?.access_token,
    })

    const model = useMemo(() => {
        const metrics = stats?.metrics || {}
        const contacts = contactsFrom(stats)
        const conversations = stats?.conversations || {}
        const accounts = stats?.accounts || {}
        const automation = stats?.automation || {}
        const campaigns = stats?.campaigns || {}

        const totalMessages = n(metrics.totalMessages)
        const delivered = n(metrics.delivered)
        const read = n(metrics.read)
        const failed = n(metrics.failed)
        const pending = Math.max(0, n(metrics.pending, totalMessages - delivered - failed))
        const deliveryRate = n(metrics.deliveryRate, totalMessages ? (delivered / totalMessages) * 100 : 0)
        const readRate = n(metrics.readRate, totalMessages ? (read / totalMessages) * 100 : 0)
        const failedRate = n(metrics.failedRate, totalMessages ? (failed / totalMessages) * 100 : 0)
        const quality = n(stats?.health?.quality, Math.max(0, 100 - Math.round(failedRate * 2)))

        const activeConvCount = (conversationCount && conversationCount > 0) ? conversationCount : n(conversations.total)

        return {
            metrics,
            contacts,
            conversations: {
                ...conversations,
                total: activeConvCount,
            },
            accounts,
            automation,
            campaigns,
            totalMessages,
            delivered,
            read,
            failed,
            pending,
            deliveryRate,
            readRate,
            failedRate,
            quality,
            timeline: Array.isArray(stats?.timeline) ? stats.timeline : [],
            hourlyTimeline: Array.isArray(stats?.hourlyTimeline) ? stats.hourlyTimeline : [],
            recentActivity: Array.isArray(stats?.recentActivity) ? stats.recentActivity : [],
        }
    }, [stats, conversationCount])

    const rangeLabel = ranges.find((item) => item.value === range)?.label || 'Today'
    const healthLabel = model.failedRate > 15 ? 'Needs review' : model.failedRate > 5 ? 'Monitor' : 'Healthy'
    const hasConnectedAccount = n(model.accounts.active) > 0

    // GSAP Orchestrated Staggered Entrance Animations
    useGSAP(
        () => {
            if (isLoading) return
            const ctx = gsap.context(() => {
                gsap.fromTo('.dash-header',
                    { y: -10, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out', clearProps: 'opacity,transform,filter' }
                )
                gsap.fromTo('.dash-kpi-card',
                    { y: 12, opacity: 0 },
                    { y: 0, opacity: 1, stagger: 0.05, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform,filter' }
                )
                gsap.fromTo('.dash-section',
                    { y: 14, opacity: 0 },
                    { y: 0, opacity: 1, stagger: 0.07, duration: 0.45, ease: 'power2.out', delay: 0.08, clearProps: 'opacity,transform,filter' }
                )
            }, dashboardRef)
            return () => ctx.revert()
        },
        { scope: dashboardRef, dependencies: [isLoading, range] }
    )

    return (
        <div ref={dashboardRef} className="min-h-full bg-transparent p-3.5 sm:p-5 lg:p-6">
            <div className="mx-auto max-w-[1680px] space-y-4 sm:space-y-5">
                {/* Header Section */}
                <div className="dash-header">
                    <Header
                        range={range}
                        setRange={setRange}
                        isFetching={isFetching}
                        refetch={refetch}
                        freshness={freshness(dataUpdatedAt)}
                    />
                </div>

                {/* Error Banner */}
                {error ? (
                    <div className="rounded-lg border border-red-200 bg-red-50/90 px-4 py-3 text-xs font-semibold text-red-700 shadow-2xs">
                        {error.message}
                    </div>
                ) : null}

                {/* First Run Onboarding Banner if no accounts */}
                {!isLoading && !hasConnectedAccount ? <FirstRunOnboarding /> : null}

                {/* Top 4 Primary Metric Cards */}
                <section data-tour="dashboard-metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <MetricCard
                        icon={MessageSquareText}
                        label="Total Messages"
                        value={fmt(model.totalMessages)}
                        detail={`${rangeLabel} synced volume`}
                        accentColor="#2563eb"
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={Users}
                        label="Customer Inbound"
                        value={fmt(model.metrics.inbound)}
                        detail="Incoming customer messages"
                        accentColor="#10b981"
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={Bot}
                        label="AI + Team Replies"
                        value={fmt(n(model.metrics.aiAgent) + n(model.metrics.humanAgent))}
                        detail={`${fmt(model.metrics.aiAgent)} AI / ${fmt(model.metrics.humanAgent)} Team`}
                        accentColor="#8b5cf6"
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={AlertTriangle}
                        label="Failed Delivery Risk"
                        value={`${model.failedRate.toFixed(1)}%`}
                        detail={`${fmt(model.failed)} failed messages`}
                        warning={model.failedRate > 5}
                        accentColor="#ef4444"
                        loading={isLoading}
                    />
                </section>

                {/* Wallet & Billing Strip */}
                <div data-tour="dashboard-wallet" className="dash-section">
                    <BillingOverviewStrip overview={billingOverview} />
                </div>

                {/* Main Usage Performance Section */}
                <section data-tour="dashboard-overview" className="dash-section">
                    <UsagePerformanceDashboard
                        model={model}
                        range={range}
                        rangeLabel={rangeLabel}
                        loading={isLoading}
                        overview={billingOverview}
                        healthLabel={healthLabel}
                    />
                </section>

                {/* System Health & Operational Highlights Section */}
                <section data-tour="dashboard-health" className="dash-section grid grid-cols-1 gap-5 xl:grid-cols-3">
                    <Panel
                        title="System Health"
                        subtitle="Current accounts, inbox, and automation status."
                        action={
                            <span className="p-1.5 rounded-md bg-gray-50 border border-gray-200 text-gray-500">
                                <Gauge className="h-3.5 w-3.5" />
                            </span>
                        }
                    >
                        <div className="space-y-2.5">
                            {/* Interactive WhatsApp Accounts Accordion */}
                            <div className="flex flex-col rounded-lg bg-white border border-gray-200/90 overflow-hidden shadow-2xs">
                                <button
                                    type="button"
                                    onClick={() => setIsAccountsOpen((prev) => !prev)}
                                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-left focus:outline-none w-full hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span
                                            className={`rounded-md p-1.5 ${n(model.accounts.active) > 0 ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                                                }`}
                                        >
                                            <Smartphone className="h-3.5 w-3.5" />
                                        </span>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900">WhatsApp Accounts</p>
                                            <p className="text-[10px] text-gray-500">Connected phone channels</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs font-bold text-gray-900 tabular-nums">
                                            {`${fmt(model.accounts.active)} active / ${fmt(model.accounts.total)} total`}
                                        </span>
                                        <ChevronDown
                                            className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isAccountsOpen ? 'rotate-180' : ''
                                                }`}
                                        />
                                    </div>
                                </button>

                                {isAccountsOpen && (
                                    <div className="border-t border-gray-200/80 bg-white px-3.5 py-2.5 space-y-2 animate-in fade-in duration-200">
                                        {Array.isArray(model.accounts.connected) &&
                                            model.accounts.connected.some(
                                                (acc) => acc.status !== 'disconnected' && acc.status !== 'failed'
                                            ) ? (
                                            model.accounts.connected
                                                .filter((acc) => acc.status !== 'disconnected' && acc.status !== 'failed')
                                                .map((acc) => (
                                                    <div
                                                        key={acc.id}
                                                        className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0"
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-700 font-bold text-[10px]">
                                                                WA
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-mono text-xs font-semibold text-gray-900 truncate">
                                                                    {acc.display_phone_number || 'Unknown'}
                                                                </p>
                                                                <p className="text-[10px] text-gray-500 truncate">
                                                                    {acc.name || 'WhatsApp Business'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                            <span className="text-[9px] font-bold tracking-wider">
                                                                Active
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))
                                        ) : (
                                            <div className="py-2 text-center text-xs text-gray-500 font-medium">
                                                No active phone accounts found.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <HealthRow icon={MessageSquareText} label="Conversations" value={fmt(model.conversations.total)} active />
                            <HealthRow icon={Bot} label="Bot Active Chats" value={fmt(model.conversations.botActive)} active />
                            <HealthRow icon={FileText} label="AI Summaries Ready" value={fmt(model.conversations.summariesReady)} active />
                            <HealthRow
                                icon={AlertTriangle}
                                label="Unread Messages"
                                value={fmt(model.conversations.unread)}
                                active={n(model.conversations.unread) === 0}
                            />
                        </div>
                    </Panel>

                    <Panel title="Contact & Automation Readiness" subtitle="Customer profiles and active flows.">
                        <div className="grid grid-cols-2 gap-2.5">
                            <MiniStat icon={Users} label="Total Contacts" value={fmt(model.contacts.total)} />
                            <MiniStat icon={UserRoundCheck} label="Saved Contacts" value={fmt(model.contacts.saved)} />
                            <MiniStat icon={Workflow} label="Flow Automations" value={`${fmt(model.automation.publishedFlows)} / ${fmt(model.automation.flows)}`} />
                            <MiniStat icon={TrendingUp} label="AI Notes" value={fmt(model.automation.notesGenerated)} />
                        </div>
                    </Panel>

                    <Panel
                        title="Quick Actions"
                        subtitle="Shortcuts for daily operations."
                        action={
                            <span className="p-1.5 rounded-md bg-blue-50 border border-blue-100 text-blue-600">
                                <Zap className="h-3.5 w-3.5" />
                            </span>
                        }
                    >
                        <div className="space-y-2.5">
                            {!hasConnectedAccount ? (
                                <QuickAction
                                    to="/whatsapp-connect"
                                    icon={Smartphone}
                                    title="Connect WhatsApp First"
                                    text="Required before chats and automations work."
                                    primary
                                />
                            ) : null}
                            <QuickAction to="/live-chat" icon={MessageSquareText} title="Open Live Inbox" text="Reply to customers and review AI summaries." />
                            <QuickAction to="/bot-agents" icon={Bot} title="Manage AI Agents" text="Tune automated replies and handoff rules." />
                            <QuickAction to="/broadcast" icon={Send} title="Create Broadcast" text="Launch mass campaigns with quality check." />
                        </div>
                    </Panel>
                </section>

                {/* Real-time Activity & Campaigns Section */}
                <section className="dash-section grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_0.7fr]">
                    <Panel title="Recent Activity" subtitle="Latest real message logs synced from WhatsApp.">
                        <div className="space-y-2.5">
                            {isLoading ? (
                                Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} />)
                            ) : model.recentActivity.length ? (
                                model.recentActivity.map((item) => <ActivityRow key={item.id} item={item} />)
                            ) : (
                                <EmptyState icon={Activity} title="No recent activity" text={`No message activity logged for ${rangeLabel.toLowerCase()}.`} />
                            )}
                        </div>
                    </Panel>

                    <Panel title="Latest Campaigns" subtitle="Broadcast records from database.">
                        <div className="space-y-2.5">
                            {model.campaigns.latest?.length ? (
                                model.campaigns.latest.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} />)
                            ) : (
                                <EmptyState icon={Send} title="No campaigns created" text="Broadcast campaigns will appear here once launched." />
                            )}
                        </div>
                    </Panel>
                </section>
            </div>
        </div>
    )
}

function FirstRunOnboarding() {
    const steps = [
        {
            icon: Smartphone,
            title: 'Connect WhatsApp API',
            text: 'Link your business phone number to Meta Cloud API to start receiving and sending live messages.',
        },
        {
            icon: Wallet,
            title: 'Add Wallet Balance',
            text: 'WhatsApp conversation charges are deducted from your balance in real-time.',
        },
        {
            icon: FileText,
            title: 'Approve Templates',
            text: 'Create Meta-approved message templates for broadcasts and proactive alerts.',
        },
        {
            icon: Bot,
            title: 'Enable AI & Flows',
            text: 'Deploy AI agents and interactive chat flows to automate customer responses 24/7.',
        },
    ]

    return (
        <section className="overflow-hidden rounded-lg border border-blue-200 bg-white p-5 shadow-2xs">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] items-center">
                <div>
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        First-Time Setup
                    </div>
                    <h2 className="mt-2.5 text-lg font-bold leading-snug text-gray-900">
                        Connect your WhatsApp Business account to activate your dashboard.
                    </h2>
                    <p className="mt-1 text-xs text-gray-600 leading-normal max-w-2xl">
                        Follow our quick setup guide: Link your official Meta Cloud API number, add wallet funds, and start managing live chats and broadcasts.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                        <Link
                            to="/whatsapp-connect"
                            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                        >
                            <Smartphone className="h-3.5 w-3.5" />
                            Connect WhatsApp Account
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                            to="/whatsapp-number"
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
                        >
                            <PhoneCall className="h-3.5 w-3.5" />
                            Need a new number?
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {steps.map((step) => (
                        <div key={step.title} className="rounded-md border border-gray-200 bg-gray-50/60 p-3 shadow-2xs">
                            <div className="h-7 w-7 rounded-md bg-white border border-gray-200 text-blue-600 flex items-center justify-center mb-1.5">
                                {createElement(step.icon, { className: 'h-3.5 w-3.5' })}
                            </div>
                            <h3 className="text-xs font-bold text-gray-900">{step.title}</h3>
                            <p className="mt-0.5 text-[10px] text-gray-600 leading-normal">{step.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function Header({ range, setRange, isFetching, refetch, freshness }) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-4">
            <div>
                <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-blue-600">
                    <Grid2X2 className="h-3.5 w-3.5" />
                    Command Center
                </div>
                <h1 className="mt-0.5 text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
                <p className="mt-0.5 text-xs text-gray-500">Real-time WhatsApp performance, customer readiness, and automation health.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {/* Refresh Button */}
                <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-2xs"
                    aria-label="Refresh dashboard data"
                    title={freshness}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                    <span>{isFetching ? 'Refreshing...' : freshness}</span>
                </button>

                {/* Range Selector Pills */}
                <div data-tour="dashboard-range" className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 shadow-2xs">
                    {ranges.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setRange(item.value)}
                            className={`h-7 rounded-md px-3 text-xs font-bold transition-all ${range === item.value
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

function BillingOverviewStrip({ overview }) {
    const categories = overview?.spend?.categories || []
    const marketing = categories.find((item) => item.category === 'marketing')
    const utility = categories.find((item) => item.category === 'utility')

    return (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="group relative rounded-lg border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 hover:shadow-xs transition-all duration-200 ease-out flex flex-col justify-between h-full min-h-[110px] antialiased">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wider text-gray-500">Wallet Balance</span>
                    <div className="h-7 w-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                        <Wallet className="h-3.5 w-3.5" />
                    </div>
                </div>
                <div className="my-2">
                    <p className="text-xl sm:text-[22px] font-bold text-gray-900 tracking-tight tabular-nums">
                        {formatINRFromPaise(overview?.wallet?.balance_paise)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-gray-500">
                        Auto-deducted for Meta messages
                    </p>
                </div>
            </div>

            <div className="group relative rounded-lg border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 hover:shadow-xs transition-all duration-200 ease-out flex flex-col justify-between h-full min-h-[110px] antialiased">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wider text-gray-500">This Month Spend</span>
                    <div className="h-7 w-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                        <TrendingUp className="h-3.5 w-3.5" />
                    </div>
                </div>
                <div className="my-2">
                    <p className="text-xl sm:text-[22px] font-bold text-gray-900 tracking-tight tabular-nums">
                        {formatINRFromPaise(overview?.spend?.month_spend_paise)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-gray-500">
                        Marketing, Utility & Auth usage
                    </p>
                </div>
            </div>

            <div className="group relative rounded-lg border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 hover:shadow-xs transition-all duration-200 ease-out flex flex-col justify-between h-full min-h-[110px] antialiased">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wider text-gray-500">Marketing / Utility</span>
                    <div className="h-7 w-7 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                        <BarChart3 className="h-3.5 w-3.5" />
                    </div>
                </div>
                <div className="my-2">
                    <p className="text-xl sm:text-[22px] font-bold text-gray-900 tracking-tight tabular-nums">
                        {formatINRFromPaise(marketing?.charged_amount_paise)} / {formatINRFromPaise(utility?.charged_amount_paise)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-gray-500">
                        {fmt(marketing?.message_count)} marketing, {fmt(utility?.message_count)} utility
                    </p>
                </div>
            </div>

            <Link
                to="/billing"
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-900 bg-gray-900 px-4 py-3 text-xs font-bold text-white transition-all hover:bg-black shadow-2xs self-stretch"
            >
                Billing Details
                <ArrowRight className="h-3.5 w-3.5" />
            </Link>
        </section>
    )
}

function Panel({ title, subtitle, action, children }) {
    return (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                    <h2 className="text-xs sm:text-sm font-bold text-gray-900 tracking-tight">{title}</h2>
                    {subtitle ? <p className="mt-0.5 text-[11px] text-gray-500">{subtitle}</p> : null}
                </div>
                {action}
            </div>
            <div className="p-4">{children}</div>
        </section>
    )
}

function MetricCard({ icon, label, value, detail, warning, accentColor, loading }) {
    return (
        <div className="dash-kpi-card group relative rounded-lg border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 hover:shadow-xs transition-all duration-200 ease-out flex flex-col justify-between h-full min-h-[110px] antialiased">
            <div className="flex items-center justify-between gap-2">
                <span
                    className="text-xs font-extrabold tracking-wider"
                    style={{ color: '#1e293b' }}
                >
                    {label}
                </span>
                <div
                    className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${warning ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-gray-50 text-gray-600 border border-gray-100'}`}
                    style={!warning && accentColor ? { backgroundColor: `${accentColor}12`, color: accentColor } : {}}
                >
                    {createElement(icon, { className: 'h-3.5 w-3.5' })}
                </div>
            </div>

            <div className="my-2">
                {loading ? (
                    <div className="h-7 w-20 bg-gray-100 rounded animate-pulse" />
                ) : (
                    <p
                        className="text-3xl sm:text-2xl lg:text-[22px] font-bold tracking-tight tabular-nums"
                        style={{ color: '#0f172a' }}
                    >
                        {value}
                    </p>
                )}
                <p
                    className="mt-0.5 text-xs font-semibold"
                    style={{ color: '#64748b' }}
                >
                    {detail}
                </p>
            </div>
        </div>
    );
}

const renderActivePieShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
        <g className="transition-all duration-300">
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={outerRadius + 2}
                outerRadius={outerRadius + 8}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                opacity={0.3}
            />
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius - 2}
                outerRadius={outerRadius + 5}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={2}
                style={{ filter: 'drop-shadow(0px 6px 12px rgba(0, 0, 0, 0.12))' }}
            />
        </g>
    );
};

function CustomPieTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        const item = payload[0];
        return (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-3.5 py-2 text-center shadow-xl">
                <div className="flex items-center gap-1.5 justify-center">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.payload.color }} />
                    <p className="text-xs font-bold text-white">{item.name}</p>
                </div>
                <p className="text-sm font-extrabold text-white mt-0.5 tabular-nums">
                    {fmt(item.value)}
                </p>
                <p className="text-[10px] text-gray-400 font-medium">{item.payload.detail}</p>
            </div>
        );
    }
    return null;
}

/**
 * Premium Compact Stat Row Card with GSAP Micro-Animations
 */
function PastelInteractiveCard({
    title,
    value,
    subtitle,
    color,
    badgeBg,
    borderColor,
    hoverBorder,
    textColor,
    valColor,
    subColor,
    isActive,
    onMouseEnter,
    onMouseLeave,
}) {
    const cardRef = useRef(null)

    useGSAP(
        () => {
            if (!cardRef.current) return
            if (isActive) {
                gsap.to(cardRef.current, {
                    scaleX: 1.012,
                    scaleY: 1.035,
                    boxShadow: '0 6px 18px -4px rgba(0,0,0,0.10)',
                    duration: 0.22,
                    ease: 'back.out(1.7)',
                })
            } else {
                gsap.to(cardRef.current, {
                    scaleX: 1,
                    scaleY: 1,
                    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)',
                    duration: 0.18,
                    ease: 'power2.out',
                })
            }
        },
        { dependencies: [isActive] }
    )

    const handleMouseEnter = (e) => {
        gsap.to(cardRef.current, {
            scaleX: 1.012,
            scaleY: 1.035,
            boxShadow: '0 6px 18px -4px rgba(0,0,0,0.10)',
            duration: 0.22,
            ease: 'back.out(1.7)',
        })
        if (onMouseEnter) onMouseEnter(e)
    }

    const handleMouseLeave = (e) => {
        if (!isActive) {
            gsap.to(cardRef.current, {
                scaleX: 1,
                scaleY: 1,
                boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)',
                duration: 0.18,
                ease: 'power2.out',
            })
        }
        if (onMouseLeave) onMouseLeave(e)
    }

    return (
        <div
            ref={cardRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ willChange: 'transform' }}
            className={`px-4 py-0 rounded-xl border cursor-pointer flex items-center justify-between h-full overflow-hidden transition-colors ${badgeBg} ${isActive ? `${hoverBorder} ring-1 ring-opacity-50` : borderColor
                }`}
        >
            {/* Left: color dot + label + subtitle stacked */}
            <div className="flex items-center gap-2.5 min-w-0">
                <span
                    className="h-7 w-1 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                />
                <div className="min-w-0">
                    <p className={`text-[10px] font-extrabold tracking-widest leading-none ${textColor}`}>{title}</p>
                    <p className={`text-[10px] font-medium mt-0.5 truncate ${subColor}`}>{subtitle}</p>
                </div>
            </div>
            {/* Right: big number */}
            <p className={`text-[28px] font-black tabular-nums tracking-tight leading-none shrink-0 ${valColor}`}>{value}</p>
        </div>
    )
}

/**
 * Fixed-position pie tooltip — always at bottom-center, GSAP fade+scale animated.
 * No more random jumping around the chart.
 */
function PieFixedTooltip({ data }) {
    const ref = useRef(null)
    const prevData = useRef(null)

    useGSAP(
        () => {
            if (!ref.current) return
            if (data) {
                prevData.current = data
                gsap.fromTo(
                    ref.current,
                    { opacity: 0, y: 6, scale: 0.92 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'back.out(1.5)', overwrite: true }
                )
            } else {
                gsap.to(ref.current, {
                    opacity: 0, y: 4, scale: 0.94,
                    duration: 0.16, ease: 'power2.in', overwrite: true,
                })
            }
        },
        { dependencies: [!!data, data?.name] }
    )

    const display = data || prevData.current
    if (!display) return null

    return (
        <div
            ref={ref}
            className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{ opacity: 0 }}
        >
            <div
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl shadow-lg"
                style={{
                    background: 'rgba(15,15,20,0.88)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${display.color}40`,
                }}
            >
                <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: display.color, boxShadow: `0 0 6px ${display.color}80` }}
                />
                <div className="text-left">
                    <p className="text-[10px] font-extrabold tracking-widest text-gray-300 leading-none">{display.name}</p>
                    <p className="text-base font-black text-white tabular-nums leading-tight">{fmt(display.value)}</p>
                    {display.detail && (
                        <p className="text-[10px] text-gray-400 font-medium leading-none mt-0.5">{display.detail}</p>
                    )}
                </div>
            </div>
        </div>
    )
}

function UsagePerformanceDashboard({ model, range, rangeLabel, loading, overview, healthLabel }) {
    const [activePieIndex, setActivePieIndex] = useState(null);

    const isHourly = range === 'today';
    const timeline = isHourly ? model.hourlyTimeline : model.timeline;
    const readSeries = timeline.map((point) => n(point.read));
    const requestSeries = timeline.map((point) => n(point.total));

    const unreadDelivered = Math.max(0, n(model.delivered) - n(model.read));
    const readCount = n(model.read);
    const failedCount = n(model.failed);
    const pendingCount = Math.max(0, n(model.totalMessages) - n(model.delivered) - n(model.failed));

    const pieChartData = [
        {
            name: 'Delivered (Unread)',
            value: unreadDelivered,
            formattedValue: fmt(model.delivered),
            detail: `${pct(model.deliveryRate)} success (${fmt(unreadDelivered)} unread)`,
            color: '#34d399',
        },
        {
            name: 'Read',
            value: readCount,
            formattedValue: fmt(model.read),
            detail: `${pct(model.readRate)} read rate`,
            color: '#a78bfa',
        },
        {
            name: 'Pending',
            value: pendingCount,
            formattedValue: fmt(pendingCount),
            detail: `${pct(model.totalMessages ? (pendingCount / model.totalMessages) * 100 : 0)} pending`,
            color: '#fbbf24',
        },
        {
            name: 'Failed',
            value: failedCount,
            formattedValue: fmt(model.failed),
            detail: `${model.failedRate.toFixed(1)}% risk`,
            color: '#f87171',
        },
    ];

    const totalPieVolume = n(model.totalMessages);

    const capabilityCards = [
        {
            title: 'Replies Handled',
            description: 'AI + human responses',
            value: `${fmt(n(model.metrics.aiAgent) + n(model.metrics.humanAgent))}`,
            detail: `${fmt(model.metrics.aiAgent)} AI / ${fmt(model.metrics.humanAgent)} team`,
            series: requestSeries,
            color: '#8b5cf6',
            gradientId: 'repliesGradient',
            icon: Bot,
        },
        {
            title: 'Broadcast Output',
            description: 'Campaign messages sent',
            value: fmt(model.campaigns.sent),
            detail: `${fmt(model.campaigns.failed)} failed broadcast messages`,
            series: readSeries,
            color: '#10b981',
            gradientId: 'broadcastGradient',
            icon: Send,
        },
        {
            title: 'Delivery Rate',
            description: 'Successfully delivered',
            value: `${pct(model.deliveryRate)}`,
            detail: `${fmt(model.delivered)} messages delivered`,
            series: requestSeries,
            color: '#2563eb',
            gradientId: 'deliveryGradient',
            icon: CheckCheck,
        },
        {
            title: 'Read Rate',
            description: 'Recipient engagement',
            value: `${pct(model.readRate)}`,
            detail: `${fmt(model.read)} messages read`,
            series: readSeries,
            color: '#a78bfa',
            gradientId: 'readGradient',
            icon: Eye,
        },
    ];

    return (
        <div className="space-y-4">


            {/* 1. Single 3D Donut Pie Chart + Perfectly Fitted 2x2 GSAP Hover Cards */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <div>
                        <p className="text-xs font-bold text-gray-900 tracking-wider">
                            Message Status Composition
                        </p>
                        <p className="text-[11px] text-gray-500 font-medium">
                            Interactive 3D real-time performance breakdown
                        </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-bold text-blue-700 tabular-nums">
                        {fmt(totalPieVolume)} Total Messages
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-5 items-stretch">
                    {/* Left: 3D Donut Chart Container with fixed tooltip */}
                    <div className="relative w-full h-[260px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieChartData.map((d) => ({
                                        ...d,
                                        chartValue: d.value > 0 ? d.value : 0,
                                    }))}
                                    dataKey="chartValue"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={66}
                                    outerRadius={100}
                                    paddingAngle={3}
                                    cornerRadius={4}
                                    activeIndex={activePieIndex !== null ? activePieIndex : undefined}
                                    activeShape={renderActivePieShape}
                                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                                    onMouseLeave={() => setActivePieIndex(null)}
                                    isAnimationActive={true}
                                    animationDuration={650}
                                >
                                    {pieChartData.map((entry, index) => (
                                        <Cell
                                            key={`pie-cell-${index}`}
                                            fill={entry.value > 0 ? entry.color : '#f8fafc'}
                                            stroke={entry.value > 0 ? '#ffffff' : '#e2e8f0'}
                                            strokeWidth={2}
                                            style={{
                                                filter: entry.value > 0 ? 'drop-shadow(0px 3px 6px rgba(0,0,0,0.08))' : 'none',
                                                transition: 'all 0.25s ease',
                                            }}
                                        />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>

                        {/* Fixed center label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
                            <span className="text-3xl font-black text-gray-900 leading-none tabular-nums tracking-tight">
                                {fmt(totalPieVolume)}
                            </span>
                            <span className="text-[10px] font-bold tracking-wider text-gray-400 mt-1">
                                Messages
                            </span>
                        </div>

                        {/* Fixed-position pie tooltip — always at bottom-center, GSAP-animated */}
                        <PieFixedTooltip
                            data={activePieIndex !== null ? pieChartData[activePieIndex] : null}
                        />
                    </div>

                    {/* Right: 2×2 Capability Cards matching chart height */}
                    <div className="grid grid-cols-2 gap-2.5 h-[260px]">
                        {capabilityCards.map((card) => (
                            <UsageCapabilityCard key={card.title} {...card} compact />
                        ))}
                    </div>
                </div>
            </div>

        </div>
    )
}

function CustomLineTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-center shadow-md">
                <p className="text-xs font-bold text-white tabular-nums">{fmt(payload[0].value)}</p>
            </div>
        )
    }
    return null
}

function UsageCapabilityCard({ title, value, detail, description, series, color, gradientId, icon, compact }) {
    const data = series ? series.map((val, i) => ({ name: i, value: n(val) })) : []
    const cardRef = useRef(null)

    useGSAP(() => {
        if (!cardRef.current) return
        gsap.fromTo(cardRef.current.querySelector('.card-desc'),
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.15, clearProps: 'opacity,transform' }
        )
    }, { scope: cardRef })

    if (compact) {
        return (
            <div ref={cardRef} className="rounded-lg border border-gray-200 bg-white shadow-2xs hover:border-gray-300 hover:shadow-xs transition-all flex flex-col h-full overflow-hidden">
                {/* Top: icon + title row */}
                <div className="px-3 pt-2.5 flex items-center gap-1.5">
                    {icon ? createElement(icon, { className: 'h-3 w-3 shrink-0', style: { color } }) : null}
                    <h3 className="text-[10px] font-extrabold tracking-wider truncate" style={{ color: '#94a3b8' }}>{title}</h3>
                </div>
                {/* Middle: value + description and detail */}
                <div className="px-3 pt-1 pb-0">
                    <p className="text-[28px] font-black tracking-tight tabular-nums leading-none" style={{ color: '#0f172a' }}>{value}</p>
                    <div className="card-desc flex flex-wrap items-center gap-1 text-[10px] font-medium leading-tight mt-1 text-gray-500">
                        <span>{description}</span>
                        {detail && (
                            <>
                                <span className="text-gray-300 font-bold">·</span>
                                <span className="text-gray-400">{detail}</span>
                            </>
                        )}
                    </div>
                </div>
                {/* Bottom: sparkline bleeding to edge */}
                {data.length > 0 && (
                    <div className="h-10 w-full mt-auto">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id={`${gradientId}-compact`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotoneX"
                                    dataKey="value"
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill={`url(#${gradientId}-compact)`}
                                    isAnimationActive={true}
                                    animationDuration={800}
                                    dot={false}
                                    activeDot={{ r: 3, fill: color, stroke: '#fff', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div ref={cardRef} className="rounded-lg border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 transition-all flex items-center justify-between min-h-[105px]">
            <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                    {icon ? createElement(icon, { className: 'h-3.5 w-3.5', style: { color } }) : null}
                    <h3 className="text-xs font-bold text-gray-900 tracking-tight">{title}</h3>
                </div>
                <p className="text-2xl font-black text-gray-900 tracking-tight tabular-nums">{value}</p>
                <p className="card-desc text-[11px] text-gray-500 font-medium">{detail}</p>
            </div>

            {data.length > 0 && (
                <div className="h-12 w-24 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradientId || 'areaGrad'} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <Tooltip content={<CustomLineTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke={color}
                                strokeWidth={2}
                                fill={`url(#${gradientId || 'areaGrad'})`}
                                isAnimationActive={true}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}

function HealthRow({ icon, label, value, active }) {
    return (
        <div className="flex items-center justify-between gap-2.5 rounded-lg bg-white border border-gray-200 px-3 py-2 shadow-2xs">
            <div className="flex min-w-0 items-center gap-2">
                <span className={`rounded-md p-1 ${active ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                    {createElement(icon, { className: 'h-3.5 w-3.5' })}
                </span>
                <span className="truncate text-xs font-semibold text-gray-800">{label}</span>
            </div>
            <span className="shrink-0 text-xs font-bold text-gray-900 tabular-nums">{value}</span>
        </div>
    )
}

function MiniStat({ icon, label, value }) {
    return (
        <div className="rounded-lg bg-white border border-gray-200 p-3 shadow-2xs">
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-gray-50 border border-gray-200 text-gray-700">
                {createElement(icon, { className: 'h-3.5 w-3.5' })}
            </span>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">{label}</p>
            <p className="mt-0.5 text-base font-bold text-gray-900 tabular-nums">{value}</p>
        </div>
    )
}

function QuickAction({ to, icon, title, text, primary }) {
    return (
        <Link
            to={to}
            className={`group flex items-center gap-2.5 rounded-lg p-3 transition-all ${primary
                ? 'border border-blue-200 bg-blue-50/70 hover:bg-blue-100/70'
                : 'border border-gray-200 bg-white hover:bg-gray-50 shadow-2xs'
                }`}
        >
            <span className={`rounded-md p-1.5 border ${primary ? 'bg-white text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                {createElement(icon, { className: 'h-3.5 w-3.5' })}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-gray-900">{title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-gray-500 font-medium">{text}</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-blue-600 transition-colors shrink-0" />
        </Link>
    )
}

function ActivityRow({ item }) {
    return (
        <div className="flex items-start gap-2.5 rounded-lg bg-white border border-gray-200 p-3 shadow-2xs hover:border-gray-300 transition-colors">
            <span className="mt-0.5 rounded-md bg-blue-50 border border-blue-100 p-1.5 text-blue-600 shrink-0">
                <Activity className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-gray-900">{item.title}</p>
                    <span className="shrink-0 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        {item.status}
                    </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600 leading-normal">{item.description}</p>
                <p className="mt-1 text-[10px] text-gray-400 font-medium">{item.meta}</p>
            </div>
        </div>
    )
}

function CampaignRow({ campaign }) {
    return (
        <div className="rounded-lg bg-white border border-gray-200 p-3 shadow-2xs hover:border-gray-300 transition-colors flex items-center justify-between gap-2">
            <div className="min-w-0">
                <p className="truncate text-xs font-bold text-gray-900">{campaign.name || 'Campaign'}</p>
                <p className="mt-0.5 text-[10px] text-gray-500 font-medium">{campaign.status || 'No status'}</p>
            </div>
            <span className="rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5 text-xs font-bold text-gray-900 tabular-nums shrink-0">
                {fmt(campaign.total_contacts)} contacts
            </span>
        </div>
    )
}

function EmptyState({ icon, title, text, compact }) {
    return (
        <div
            className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white p-5 text-center ${compact ? 'min-h-[120px]' : 'min-h-[140px]'
                }`}
        >
            <div className="rounded-md bg-gray-50 border border-gray-200 p-2 text-gray-400 shadow-2xs mb-1.5">
                {createElement(icon, { className: 'h-4 w-4' })}
            </div>
            <p className="text-xs font-bold text-gray-800">{title}</p>
            <p className="mt-0.5 max-w-sm text-[11px] text-gray-500">{text}</p>
        </div>
    )
}

function SkeletonRow() {
    return (
        <div className="rounded-lg bg-white border border-gray-200 p-3.5 animate-pulse">
            <div className="h-3.5 w-28 bg-gray-200 rounded" />
            <div className="mt-2 h-3 w-full bg-gray-200 rounded" />
        </div>
    )
}

function StatusPill({ label, warning }) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-bold ${warning ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${warning ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {label}
        </span>
    )
}
