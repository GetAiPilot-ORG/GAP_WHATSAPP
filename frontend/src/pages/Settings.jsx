import { createElement, useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Save, Upload, FileText, Trash2, Bot, Database, Globe, Users, ShoppingBag, Key, Webhook, Copy, Check, User, Mail, UserPlus, X, Trash, Image, RefreshCw, AlertCircle, Loader2, Building2, PhoneCall, Link as LinkIcon, Clock, Send, Bell, Volume2, VolumeX, Play, BellRing, CalendarClock, Headphones, Info, MonitorCheck, ShieldCheck, SlidersHorizontal, Sparkles, ArrowRight, Shield, Activity, Calendar, ChevronDown, BarChart2, TrendingUp, Send as SendIcon, CheckCircle2, XCircle, Eye, Megaphone, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useNotificationSound } from '../hooks/useNotificationSound'
import TourButton from '../onboarding/TourButton'
import { useQueryClient } from '@tanstack/react-query'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const DESKTOP_NOTIFICATION_KEY = 'gap_desktop_notifications_enabled'
const QUIET_HOURS_ENABLED_KEY = 'gap_notification_quiet_hours_enabled'
const QUIET_HOURS_FROM_KEY = 'gap_notification_quiet_hours_from'
const QUIET_HOURS_TO_KEY = 'gap_notification_quiet_hours_to'

const readStoredBoolean = (key, fallback) => {
    try {
        const stored = localStorage.getItem(key)
        return stored == null ? fallback : stored === 'true'
    } catch {
        return fallback
    }
}

const readStoredText = (key, fallback) => {
    try {
        return localStorage.getItem(key) || fallback
    } catch {
        return fallback
    }
}

export default function Settings() {
    const { session, userRole, loginType, apiCall, user, memberProfile } = useAuth()
    const queryClient = useQueryClient()
    const avatarColor = memberProfile?.avatar_color || user?.user_metadata?.avatar_color || '#4f46e5'
    const { alertDialog, confirmDialog } = useDialog()
    const [billingOverview, setBillingOverview] = useState(null)
    const [, setIsLoadingBilling] = useState(true)
    const [broadcastInsights, setBroadcastInsights] = useState(null)
    const [isLoadingBroadcastInsights, setIsLoadingBroadcastInsights] = useState(false)
    const [broadcastInsightsError, setBroadcastInsightsError] = useState('')
    const {
        isEnabled: notificationSoundEnabled,
        setIsEnabled: setNotificationSoundEnabled,
        selectedSoundId,
        setSelectedSoundId,
        volume: notificationVolume,
        setVolume: setNotificationVolume,
        sounds: notificationSounds,
        playNotification,
    } = useNotificationSound()
    const [searchParams, setSearchParams] = useSearchParams()
    const activeTab = searchParams.get('tab') || 'general'
    const setActiveTab = (tab) => {
        if (tab === 'knowledge' && documents.length === 0) setIsLoadingKnowledge(true)
        if (tab === 'account' && accounts.length === 0) setIsLoadingAccounts(true)
        setSearchParams({ tab })
    }
    const [documents, setDocuments] = useState([])
    const [knowledgeStats, setKnowledgeStats] = useState({ total_documents: 0, total_characters: 0 })
    const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(activeTab === 'knowledge')
    const [isUploadingKnowledge, setIsUploadingKnowledge] = useState(false)
    const [knowledgeError, setKnowledgeError] = useState('')
    const [knowledgeSuccess, setKnowledgeSuccess] = useState('')
    const [isDraggingKnowledge, setIsDraggingKnowledge] = useState(false)
    const knowledgeFileInputRef = useRef(null)


    const [accounts, setAccounts] = useState([])
    const [selectedAccountId, setSelectedAccountId] = useState('')
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
    const [isLoadingProfile, setIsLoadingProfile] = useState(false)
    const [isSavingProfile, setIsSavingProfile] = useState(false)
    const [profileError, setProfileError] = useState('')
    const [profileSuccess, setProfileSuccess] = useState('')
    const [lastProfileSyncAt, setLastProfileSyncAt] = useState(null)
    const [profileImageFile, setProfileImageFile] = useState(null)
    const [profileImagePreview, setProfileImagePreview] = useState('')
    const [businessProfile, setBusinessProfile] = useState({
        local_name: '',
        about: '',
        description: '',
        email: '',
        address: '',
        websites: '',
        vertical: '',
        profile_picture_url: ''
    })
    const [testSoundStatus, setTestSoundStatus] = useState('')
    const [isSoundDropdownOpen, setIsSoundDropdownOpen] = useState(false)
    const soundDropdownRef = useRef(null)
    const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(() => readStoredBoolean(DESKTOP_NOTIFICATION_KEY, false))
    const [quietHoursEnabled, setQuietHoursEnabled] = useState(() => readStoredBoolean(QUIET_HOURS_ENABLED_KEY, false))
    const [quietHours, setQuietHours] = useState(() => ({
        from: readStoredText(QUIET_HOURS_FROM_KEY, '22:00'),
        to: readStoredText(QUIET_HOURS_TO_KEY, '09:00')
    }))
    const [browserPermission, setBrowserPermission] = useState(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
        return window.Notification.permission
    })

    const authHeaders = {
        Authorization: `Bearer ${session?.access_token || ''}`,
        'X-Auth-Portal': loginType || 'owner'
    }

    useEffect(() => {
        try {
            localStorage.setItem(DESKTOP_NOTIFICATION_KEY, String(desktopNotificationsEnabled))
        } catch {
            // Browser storage can fail in private mode; settings still work for this session.
        }
    }, [desktopNotificationsEnabled])

    useEffect(() => {
        try {
            localStorage.setItem(QUIET_HOURS_ENABLED_KEY, String(quietHoursEnabled))
            localStorage.setItem(QUIET_HOURS_FROM_KEY, quietHours.from)
            localStorage.setItem(QUIET_HOURS_TO_KEY, quietHours.to)
        } catch {
            // Non-critical preference persistence.
        }
    }, [quietHoursEnabled, quietHours])

    useEffect(() => {
        if (!isSoundDropdownOpen) return

        const handleDropdownClose = (event) => {
            if (event.key === 'Escape') {
                setIsSoundDropdownOpen(false)
                return
            }

            if (event.type === 'mousedown' && soundDropdownRef.current && !soundDropdownRef.current.contains(event.target)) {
                setIsSoundDropdownOpen(false)
            }
        }

        document.addEventListener('mousedown', handleDropdownClose)
        document.addEventListener('keydown', handleDropdownClose)

        return () => {
            document.removeEventListener('mousedown', handleDropdownClose)
            document.removeEventListener('keydown', handleDropdownClose)
        }
    }, [isSoundDropdownOpen])

    const handleTestNotificationSound = async () => {
        setTestSoundStatus('playing')
        const didPlay = await playNotification({ force: true, messageId: `test-${Date.now()}` })
        setTestSoundStatus(didPlay ? 'played' : 'blocked')
        window.setTimeout(() => setTestSoundStatus(''), 3500)
    }

    const handleSoundSelect = async (soundId) => {
        setSelectedSoundId(soundId)
        setIsSoundDropdownOpen(false)
        setTestSoundStatus('')
        window.setTimeout(async () => {
            await playNotification({ force: true, messageId: `preview-${soundId}-${Date.now()}` })
        }, 50)
    }

    const requestDesktopNotificationPermission = async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            setBrowserPermission('unsupported')
            return
        }
        if (window.Notification.permission === 'granted') {
            setBrowserPermission('granted')
            setDesktopNotificationsEnabled(true)
            return
        }
        const permission = await window.Notification.requestPermission()
        setBrowserPermission(permission)
        setDesktopNotificationsEnabled(permission === 'granted')
    }

    const formatKnowledgeDate = (value) => {
        if (!value) return 'Just now'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return 'Just now'
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const fetchKnowledgeBase = async () => {
        if (!session?.access_token) return
        setIsLoadingKnowledge(true)
        setKnowledgeError('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/settings/knowledge-base`, {
                headers: authHeaders
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to load knowledge base')
            setDocuments(Array.isArray(data.documents) ? data.documents.map(doc => ({
                ...doc,
                size: doc.size_label || 'File',
                date: formatKnowledgeDate(doc.created_at)
            })) : [])
            setKnowledgeStats({
                total_documents: data.total_documents || 0,
                total_characters: data.total_characters || 0
            })
        } catch (e) {
            console.error('Failed to load knowledge base', e)
            setKnowledgeError(e?.message || 'Failed to load knowledge base.')
        } finally {
            setIsLoadingKnowledge(false)
        }
    }

    const uploadKnowledgeFiles = async (files) => {
        const list = Array.from(files || [])
        if (!list.length || !session?.access_token) return
        setIsUploadingKnowledge(true)
        setKnowledgeError('')
        setKnowledgeSuccess('')
        try {
            for (const file of list) {
                const form = new FormData()
                form.append('file', file)
                const res = await fetch(`${BACKEND_BASE}/api/settings/knowledge-base`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: form
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data?.error || `Failed to upload ${file.name}`)
            }
            setKnowledgeSuccess(`${list.length} document${list.length > 1 ? 's' : ''} indexed for AI replies.`)
            await fetchKnowledgeBase()
        } catch (e) {
            console.error('Failed to upload knowledge document', e)
            setKnowledgeError(e?.message || 'Failed to upload document.')
        } finally {
            setIsUploadingKnowledge(false)
            if (knowledgeFileInputRef.current) knowledgeFileInputRef.current.value = ''
        }
    }

    const handleDelete = async (id) => {
        if (!session?.access_token) return
        const confirmed = await confirmDialog('Delete this knowledge document? AI replies will stop using it.', {
            title: 'Delete knowledge document',
            tone: 'danger',
            confirmLabel: 'Delete document',
        })
        if (!confirmed) return
        setKnowledgeError('')
        setKnowledgeSuccess('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/settings/knowledge-base/${id}`, {
                method: 'DELETE',
                headers: authHeaders
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to delete document')
            setDocuments(prev => prev.filter(doc => doc.id !== id))
            setKnowledgeSuccess('Document removed from knowledge base.')
            await fetchKnowledgeBase()
        } catch (e) {
            console.error('Failed to delete knowledge document', e)
            setKnowledgeError(e?.message || 'Failed to delete document.')
        }
    }

    const fetchBillingOverview = async () => {
        if (!session?.access_token) return
        setIsLoadingBilling(true)
        try {
            const res = await apiCall(`${BACKEND_BASE}/api/billing/overview`)
            const data = await res.json().catch(() => ({}))
            if (res.ok) {
                setBillingOverview(data)
            } else {
                console.warn("Failed to load billing overview in settings:", data?.error || res.statusText)
            }
        } catch (e) {
            console.error('Failed to load billing overview', e)
        } finally {
            setIsLoadingBilling(false)
        }
    }

    const formatPlanDate = (dateString) => {
        if (!dateString) return 'N/A'
        try {
            const date = new Date(dateString)
            if (Number.isNaN(date.getTime())) return 'N/A'
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        } catch {
            return 'N/A'
        }
    }

    const getDaysRemaining = (endDateString) => {
        if (!endDateString) return null
        try {
            const end = new Date(endDateString)
            const now = new Date()
            const diffTime = end.getTime() - now.getTime()
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            return diffDays > 0 ? diffDays : 0
        } catch {
            return null
        }
    }

    const getFallbackCycleDates = (createdAt, billingCycle = 'monthly') => {
        const created = createdAt ? new Date(createdAt) : new Date()
        const now = new Date()

        let start = new Date(now.getFullYear(), now.getMonth(), created.getDate())
        if (start > now) {
            start = new Date(now.getFullYear(), now.getMonth() - 1, created.getDate())
        }

        let end = new Date(start)
        if (billingCycle === 'yearly') {
            end.setFullYear(start.getFullYear() + 1)
        } else {
            end.setMonth(start.getMonth() + 1)
        }

        return {
            start: start.toISOString(),
            end: end.toISOString()
        }
    }

    const getUserInitials = () => {
        const name = memberProfile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || ''
        if (!name) return 'U'
        return name
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()
    }

    const getJoinedDate = () => {
        const dateStr = memberProfile?.created_at || user?.created_at
        if (!dateStr) return 'N/A'
        return formatPlanDate(dateStr)
    }

    const getUpgradeRecommendation = (currentPlanId) => {
        const pId = String(currentPlanId || '').toLowerCase()
        if (pId.includes('pro') || pId.includes('ultimate') || pId.includes('max') || pId.includes('ecosystem')) {
            return null // Already on highest tiers
        }
        if (pId.includes('growth')) {
            return {
                name: 'Pro',
                price: '₹3,499/mo',
                features: ['50,000 contacts', '10 agents', 'API & Webhooks']
            }
        }
        // If starter or no active plan
        return {
            name: 'Growth',
            price: '₹1,999/mo',
            features: ['10,000 contacts', 'Unlimited flows', 'Broadcast campaigns']
        }
    }

    const fetchAccounts = async () => {
        if (!session?.access_token) return
        setIsLoadingAccounts(true)
        setProfileError('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/whatsapp/accounts`, {
                headers: authHeaders
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setAccounts(Array.isArray(data) ? data : [])
            if (!selectedAccountId && data?.[0]?.id) setSelectedAccountId(data[0].id)
        } catch (e) {
            console.error('Failed to fetch WhatsApp accounts', e)
            setProfileError('Could not load WhatsApp accounts.')
        } finally {
            setIsLoadingAccounts(false)
        }
    }

    const handleDisconnectAccount = async (e, id) => {
        e.stopPropagation() // Prevent selecting the account when clicking disconnect
        if (!session?.access_token) return

        const confirmed = await confirmDialog('Are you sure you want to disconnect this account? This will stop all bots and automations for this number.', {
            title: 'Disconnect WhatsApp Account',
            tone: 'danger',
            confirmLabel: 'Disconnect',
        })
        if (!confirmed) return

        setProfileError('')
        setProfileSuccess('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/whatsapp/accounts/${id}`, {
                method: 'DELETE',
                headers: authHeaders
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to disconnect account')

            setProfileSuccess('Account disconnected successfully.')
            if (selectedAccountId === id) {
                setSelectedAccountId('')
                setBusinessProfile({
                    local_name: '', about: '', description: '', email: '', address: '', websites: '', vertical: '', profile_picture_url: ''
                })
            }
            await fetchAccounts()
            await queryClient.invalidateQueries({
                queryKey: ['whatsapp-accounts', memberProfile?.organization_id || null],
            })
        } catch (e) {
            console.error('Failed to disconnect account', e)
            setProfileError(e?.message || 'Failed to disconnect account.')
        }
    }

    const loadBusinessProfile = async (accountId = selectedAccountId) => {
        if (!session?.access_token || !accountId) return
        setIsLoadingProfile(true)
        setProfileError('')
        setProfileSuccess('')
        try {
            const existingAccount = accounts.find(acc => acc.id === accountId) || {}
            if (existingAccount.id && !existingAccount.whatsapp_business_account_id) {
                setBusinessProfile(prev => ({
                    ...prev,
                    local_name: existingAccount.name || 'WhatsApp Business',
                    about: '',
                    description: '',
                    email: '',
                    address: '',
                    websites: '',
                    vertical: '',
                    profile_picture_url: ''
                }))
                setLastProfileSyncAt(null)
                setProfileImageFile(null)
                setProfileImagePreview('')
                setProfileError('This is a QR/session connected account. Meta business profile sync, profile photo update, templates and official Cloud API settings are available only for Meta API accounts.')
                return
            }

            const res = await fetch(`${BACKEND_BASE}/api/whatsapp/accounts/${accountId}/business-profile`, {
                headers: authHeaders
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to load profile')

            const profile = data.profile || {}
            const account = data.account || accounts.find(acc => acc.id === accountId) || {}
            setBusinessProfile({
                local_name: account.name || '',
                about: profile.about || '',
                description: profile.description || '',
                email: profile.email || '',
                address: profile.address || '',
                websites: Array.isArray(profile.websites) ? profile.websites.join('\n') : '',
                vertical: profile.vertical || '',
                profile_picture_url: profile.profile_picture_url || ''
            })
            setLastProfileSyncAt(new Date())
            setProfileImageFile(null)
            setProfileImagePreview('')
            if (data.profile_error) setProfileError(data.profile_error)
        } catch (e) {
            console.error('Failed to load business profile', e)
            setProfileError(e?.message || 'Failed to load business profile.')
        } finally {
            setIsLoadingProfile(false)
        }
    }

    const saveBusinessProfile = async (e) => {
        e.preventDefault()
        if (!selectedAccountId || !session?.access_token) return
        setIsSavingProfile(true)
        setProfileError('')
        setProfileSuccess('')
        try {
            const form = new FormData()
            Object.entries(businessProfile).forEach(([key, value]) => {
                if (key === 'profile_picture_url') return
                form.append(key, value || '')
            })
            if (profileImageFile) form.append('profile_picture', profileImageFile)

            const res = await fetch(`${BACKEND_BASE}/api/whatsapp/accounts/${selectedAccountId}/business-profile`, {
                method: 'PATCH',
                headers: authHeaders,
                body: form
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to save business profile')

            setProfileSuccess('WhatsApp business profile saved.')
            await fetchAccounts()
            await loadBusinessProfile(selectedAccountId)
        } catch (e) {
            console.error('Failed to save business profile', e)
            setProfileError(e?.message || 'Failed to save business profile.')
        } finally {
            setIsSavingProfile(false)
        }
    }

    const [apiKey] = useState('sk_live_51M...')
    const [copied, setCopied] = useState(false)

    const copyToClipboard = () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const fetchMembers = async () => {
        if (!session?.access_token) return
        setIsLoadingMembers(true)
        try {
            const res = await fetch(`${BACKEND_BASE}/api/team/members`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setMembers(data)
            }
        } catch (e) {
            console.error("Failed to fetch members", e)
        } finally {
            setIsLoadingMembers(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'team_members') {
            fetchMembers()
        }
    }, [activeTab, session])

    useEffect(() => {
        if (activeTab === 'general') {
            fetchAccounts()
            fetchBillingOverview()
        }
    }, [activeTab, session?.access_token])

    useEffect(() => {
        if (activeTab === 'knowledge_base') {
            fetchKnowledgeBase()
        }
    }, [activeTab, session?.access_token])

    useEffect(() => {
        if (activeTab === 'general' && selectedAccountId) {
            loadBusinessProfile(selectedAccountId)
        }
    }, [activeTab, selectedAccountId])

    const fetchBroadcastInsights = async () => {
        if (!session?.access_token) return
        setIsLoadingBroadcastInsights(true)
        setBroadcastInsightsError('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/broadcasts/insights`, {

                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    'X-Auth-Portal': loginType || 'owner'
                }
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to load broadcast insights')
            setBroadcastInsights(data)
        } catch (e) {
            setBroadcastInsightsError(e?.message || 'Failed to load broadcast insights.')
        } finally {
            setIsLoadingBroadcastInsights(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'broadcast_insights') {
            fetchBroadcastInsights()
        }
    }, [activeTab])

    const selectedNotificationSound = notificationSounds.find(sound => sound.id === selectedSoundId) || notificationSounds[0]

    return (
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 sm:px-6 lg:flex-row lg:gap-8 lg:px-6">
            {/* Sidebar */}
            <div className="w-full flex-shrink-0 lg:w-60">
                <div className="mb-4 flex items-center justify-between gap-3 lg:mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                    <TourButton compact />
                </div>
                <nav className="flex gap-1.5 overflow-x-auto p-1 bg-gray-100/60 rounded-xl lg:bg-transparent lg:p-0 lg:block lg:space-y-1 lg:overflow-visible scrollbar-none">
                    {['General', 'Notifications', 'Knowledge Base', 'Integrations', 'Developer API', 'Broadcast Insights'].map((tab) => {
                        const id = tab.toLowerCase().replace(' ', '_')
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(id)}
                                className={`flex shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 lg:w-full lg:shrink ${activeTab === id
                                    ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/50 lg:bg-indigo-50 lg:border-transparent lg:shadow-none font-semibold'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50 lg:hover:bg-gray-50 lg:text-gray-700'
                                    }`}
                            >
                                {id === 'general' && <Globe className="mr-2 h-4 w-4 shrink-0 text-indigo-600/70 lg:mr-3 lg:h-5 lg:w-5 lg:text-gray-400" />}
                                {id === 'notifications' && <Bell className="mr-2 h-4 w-4 shrink-0 text-indigo-600/70 lg:mr-3 lg:h-5 lg:w-5 lg:text-gray-400" />}
                                {id === 'knowledge_base' && <Database className="mr-2 h-4 w-4 shrink-0 text-indigo-600/70 lg:mr-3 lg:h-5 lg:w-5 lg:text-gray-400" />}
                                {id === 'integrations' && <ShoppingBag className="mr-2 h-4 w-4 shrink-0 text-indigo-600/70 lg:mr-3 lg:h-5 lg:w-5 lg:text-gray-400" />}
                                {id === 'developer_api' && <Bot className="mr-2 h-4 w-4 shrink-0 text-indigo-600/70 lg:mr-3 lg:h-5 lg:w-5 lg:text-gray-400" />}
                                {id === 'broadcast_insights' && <BarChart2 className="mr-2 h-4 w-4 shrink-0 text-indigo-600/70 lg:mr-3 lg:h-5 lg:w-5 lg:text-gray-400" />}
                                {tab}
                            </button>
                        )
                    })}
                    <Link
                        to="/privacy-policy"
                        target="_blank"
                        className="flex shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 text-gray-600 hover:text-gray-900 hover:bg-white/50 lg:hover:bg-gray-50 lg:text-gray-700 lg:w-full lg:shrink"
                    >
                        <Shield className="mr-2 h-4 w-4 shrink-0 text-indigo-600/70 lg:mr-3 lg:h-5 lg:w-5 lg:text-gray-400" />
                        Privacy Policy
                        <ExternalLink className="ml-1.5 h-3 w-3 text-gray-400/80 lg:ml-auto lg:h-3.5 lg:w-3.5" />
                    </Link>
                </nav>
            </div>

            {/* Content */}
            <div className="min-h-[600px] min-w-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                {activeTab === 'general' && (() => {
                    const fallbackCycle = getFallbackCycleDates(
                        billingOverview?.organization?.created_at || user?.created_at,
                        billingOverview?.organization?.billing_cycle || 'monthly'
                    )
                    const startDate = billingOverview?.organization?.plan_start_date || fallbackCycle.start
                    const endDate = billingOverview?.organization?.plan_end_date || fallbackCycle.end
                    const daysLeft = getDaysRemaining(endDate)

                    return (
                        <div className="bg-gray-50/60">
                            <div className="flex flex-col gap-4 border-b border-gray-200 bg-white px-4 py-5 sm:px-8 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-center gap-4">
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm p-2">
                                        <img src="/logo.png" alt="GetAiPilot" className="h-full w-full object-contain" />
                                    </span>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 leading-tight">General</h2>
                                        <p className="mt-1 text-sm text-gray-500">Manage your WhatsApp Business profile and settings across all connected numbers.</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchAccounts}
                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Refresh
                                </button>
                            </div>

                            {/* Profile & Subscription Overview Card */}
                            <div className="border-b border-gray-200 bg-white px-4 py-6 sm:px-8">
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                    {/* Business Profile Details */}
                                    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm transition-all duration-300 hover:shadow-md min-h-[220px] flex flex-col justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 tracking-tight mb-4">Business profile</h4>
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-md overflow-hidden"
                                                    style={avatarColor?.startsWith('/images/avatars/') ? {} : { backgroundColor: avatarColor || '#6366f1' }}>
                                                    {avatarColor?.startsWith('/images/avatars/') ? (
                                                        <img src={avatarColor} className="h-full w-full object-cover" alt="User avatar" />
                                                    ) : (
                                                        getUserInitials()
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center flex-wrap gap-2">
                                                        <h3 className="truncate text-base font-bold text-gray-900 leading-none">
                                                            {memberProfile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'User'}
                                                        </h3>
                                                        <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                                                            {userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'Owner'}
                                                        </span>
                                                    </div>
                                                    <p className="truncate text-xs text-gray-500 mt-1.5">
                                                        {memberProfile?.email || user?.email || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 border-t border-gray-100 pt-5 space-y-4">
                                            {/* Account Status */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                                        <Activity className="h-4.5 w-4.5" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-gray-900 leading-none">Account status</p>
                                                        <p className="text-[10px] text-gray-400 mt-1">Your account is active and in good standing.</p>
                                                    </div>
                                                </div>
                                                <span className="inline-flex items-center gap-1.5 font-bold text-[10px] text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full ring-1 ring-inset ring-emerald-600/10 uppercase tracking-wider">
                                                    Active
                                                </span>
                                            </div>

                                            {/* Joined Date */}
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                                    <Calendar className="h-4.5 w-4.5" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-gray-900 leading-none">Joined on</p>
                                                    <p className="text-[10px] text-gray-500 mt-1 font-semibold">{getJoinedDate()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Subscription & Plan Details */}
                                    {!billingOverview ? (
                                        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm min-h-[220px] flex flex-col justify-between animate-pulse">
                                            <div>
                                                <div className="flex gap-2">
                                                    <div className="h-6 w-24 bg-gray-250 bg-slate-200 rounded-full"></div>
                                                    <div className="h-6 w-16 bg-gray-250 bg-slate-200 rounded-full"></div>
                                                </div>
                                                <div className="mt-4 h-8 w-32 bg-gray-250 bg-slate-200 rounded-lg"></div>
                                                <div className="mt-2 h-4 w-48 bg-gray-250 bg-slate-200 rounded-lg"></div>
                                            </div>
                                            <div className="mt-6 h-12 w-full bg-gray-250 bg-slate-100 rounded-xl"></div>
                                        </div>
                                    ) : (() => {
                                        const planId = billingOverview?.organization?.plan_id || user?.plan;
                                        const isActivePlan = (billingOverview?.organization?.plan_status === 'active' || user?.subscription_status === 'active') && !!planId;

                                        return (
                                            <div className="relative bg-purple-50 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-indigo-50/10 p-4 sm:p-6 shadow-sm transition-all duration-300 hover:shadow-md min-h-[220px] flex flex-col justify-between">
                                                {/* 3D Asset watermark */}
                                                <div className="absolute -right-6 -bottom-6 h-36 w-36 opacity-90 pointer-events-none select-none transform rotate-12 transition-transform duration-500 hover:scale-105">
                                                    <img src="/images/money.png" alt="3D Currency Coins" className="h-full w-full object-contain" />
                                                </div>

                                                <div className="relative z-10">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${isActivePlan ? 'bg-indigo-50 text-indigo-700 ring-indigo-700/10' : 'bg-gray-100 text-gray-650 ring-gray-500/10'}`}>
                                                            <Sparkles className="h-3 w-3" />
                                                            {isActivePlan ? 'Active Plan' : 'Subscription Plan'}
                                                        </span>
                                                        {isActivePlan && endDate && (
                                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${daysLeft < 5
                                                                ? 'bg-rose-50 text-rose-700 ring-rose-600/10 animate-pulse'
                                                                : 'bg-gray-50 text-gray-650 ring-gray-500/10'
                                                                }`}>
                                                                {daysLeft} days left
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="mt-3 text-2xl font-bold text-gray-900 tracking-tight">
                                                        {isActivePlan ? (billingOverview?.current_plan?.name || planId) : 'Free Tier'}
                                                    </h4>
                                                    <p className="mt-1 text-xs text-gray-500 font-medium">
                                                        {isActivePlan ? `Cycle: ${formatPlanDate(startDate)} – ${formatPlanDate(endDate)}` : 'No active subscription plan.'}
                                                    </p>
                                                </div>

                                                {/* Upgrade / Subscription recommendations */}
                                                {isActivePlan ? (
                                                    getUpgradeRecommendation(billingOverview?.current_plan?.id || planId) ? (
                                                        <div className="relative z-10 mt-6 rounded-xl bg-white/75 backdrop-blur-md border border-white/40 p-4 shadow-sm flex items-center justify-between gap-4">
                                                            <div className="min-w-0">
                                                                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Available Upgrade</p>
                                                                <h5 className="text-sm font-bold text-gray-900 mt-0.5">
                                                                    Upgrade to {getUpgradeRecommendation(billingOverview?.current_plan?.id || planId).name}
                                                                </h5>
                                                                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                                                    Unlock: {getUpgradeRecommendation(billingOverview?.current_plan?.id || planId).features.join(' • ')}
                                                                </p>
                                                            </div>
                                                            <Link
                                                                to="/billing"
                                                                className="inline-flex shrink-0 items-center justify-center h-9 w-9 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                                                            >
                                                                <ArrowRight className="h-4 w-4" />
                                                            </Link>
                                                        </div>
                                                    ) : null
                                                ) : (
                                                    <div className="relative z-10 mt-6 rounded-xl bg-white/75 backdrop-blur-md border border-white/40 p-4 shadow-sm flex items-center justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Get WhatsApp Plan</p>
                                                            <h5 className="text-sm font-bold text-gray-900 mt-0.5">
                                                                Subscribe to a WhatsApp Plan
                                                            </h5>
                                                            <p className="text-[11px] text-gray-500 mt-0.5">
                                                                Unlock official cloud API broadcasts, template messages & flows.
                                                            </p>
                                                        </div>
                                                        <Link
                                                            to="/billing"
                                                            className="inline-flex shrink-0 items-center justify-center h-9 w-9 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                                                        >
                                                            <ArrowRight className="h-4 w-4" />
                                                        </Link>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {profileError && (
                                <div className="mx-4 mt-5 flex items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-[#f4f8ff] p-4 text-xs leading-relaxed text-blue-900 sm:mx-8 sm:mt-6 relative">
                                    <div className="flex items-start gap-3.5">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e6f0ff] text-blue-600 shadow-sm">
                                            <ShieldCheck className="h-5 w-5" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-750">
                                                {profileError}
                                            </p>
                                            <a
                                                href="https://getaipilot.in/whatsapp-docs"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-block mt-1 font-bold text-blue-650 hover:underline"
                                            >
                                                Learn more
                                            </a>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setProfileError('')}
                                        className="text-gray-405 hover:text-gray-700 rounded-md p-1 transition-colors self-start sm:self-center"
                                        aria-label="Dismiss warning"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            )}

                            {profileSuccess && (
                                <div className="mx-4 mt-5 flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50/50 px-4 py-3 text-xs font-medium text-green-800 sm:mx-8 sm:mt-6">
                                    <Check className="h-4 w-4 shrink-0 text-green-600" />
                                    <span>{profileSuccess}</span>
                                </div>
                            )}

                            {isLoadingAccounts ? (
                                <div className="py-16 text-center text-sm text-gray-500">Loading WhatsApp accounts...</div>
                            ) : accounts.length === 0 ? (
                                <div className="m-8 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
                                    <PhoneCall className="mx-auto h-10 w-10 text-gray-300" />
                                    <h3 className="mt-3 text-sm font-semibold text-gray-900">No WhatsApp accounts connected</h3>
                                    <p className="mt-1 text-sm text-gray-500">Connect an account first, then you can edit its business profile here.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-0 xl:grid-cols-[320px_1fr]">
                                    <aside className="border-b border-gray-200 bg-white p-4 sm:p-6 xl:border-b-0 xl:border-r">
                                        <div className="mb-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Connected accounts</div>
                                        <div className="space-y-3">
                                            {accounts.map(account => (
                                                <div
                                                    key={account.id}
                                                    onClick={() => setSelectedAccountId(account.id)}
                                                    className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition-all duration-300 hover:shadow-sm ${selectedAccountId === account.id
                                                        ? 'border-indigo-600 bg-gradient-to-br from-white to-indigo-50/20 ring-1 ring-indigo-600'
                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${selectedAccountId === account.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                                                            }`}>
                                                            <Globe className="h-5 w-5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-semibold text-gray-900">{account.name || 'WhatsApp Business'}</div>
                                                            <div className="truncate text-xs text-gray-500">{account.display_phone_number || account.phone_number_id}</div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3.5 flex items-center justify-between text-xs">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${(account.status || 'connected') === 'connected'
                                                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10'
                                                                : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10'
                                                                }`}>
                                                                <span className={`h-1 w-1 rounded-full ${(account.status || 'connected') === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                                                                    }`} />
                                                                {account.status || 'connected'}
                                                            </span>
                                                            <span className="text-[11px] text-gray-400 font-medium">ID {String(account.phone_number_id || '').slice(-5)}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDisconnectAccount(e, account.id)}
                                                            className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-all duration-200 border border-transparent hover:border-rose-100"
                                                            title="Disconnect Account"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </aside>

                                    <form onSubmit={saveBusinessProfile} className="min-w-0 bg-gray-50/40">
                                        <div className="border-b border-gray-200 bg-white px-4 sm:px-8 py-5">
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <h3 className="text-base font-semibold text-gray-900">Business profile</h3>
                                                    <p className="mt-1 text-sm text-gray-500">These details are shown to customers on WhatsApp where Meta supports them.</p>
                                                    {lastProfileSyncAt && (
                                                        <p className="mt-1 text-xs text-gray-400">
                                                            Last read from Meta at {lastProfileSyncAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => loadBusinessProfile(selectedAccountId)}
                                                        disabled={isLoadingProfile}
                                                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 w-full sm:w-auto justify-center"
                                                    >
                                                        {isLoadingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                                        Sync from Meta
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6 p-4 sm:p-8">
                                            <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
                                                <div className="mb-5">
                                                    <h4 className="text-sm font-bold text-gray-900">Profile identity</h4>
                                                    <p className="mt-1 text-xs text-gray-500">Photo and internal label for this connected number.</p>
                                                </div>

                                                <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[210px_1fr]">
                                                    <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
                                                        <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
                                                            {(profileImagePreview || businessProfile.profile_picture_url) ? (
                                                                <img
                                                                    src={profileImagePreview || businessProfile.profile_picture_url}
                                                                    alt="Business profile"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            ) : (
                                                                <Image className="h-9 w-9 text-gray-300" />
                                                            )}
                                                        </div>
                                                        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-205 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                                                            <Upload className="h-4 w-4" />
                                                            Upload photo
                                                            <input
                                                                type="file"
                                                                accept="image/jpeg,image/png"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0] || null
                                                                    setProfileImageFile(file)
                                                                    setProfileImagePreview(file ? URL.createObjectURL(file) : '')
                                                                }}
                                                            />
                                                        </label>
                                                        <p className="mt-2.5 text-center text-[10px] leading-relaxed text-gray-400">Use a clear square JPG or PNG. Meta may review business branding.</p>
                                                        <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 text-[11px] leading-relaxed text-amber-800 flex items-start gap-2">
                                                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                                                            <p>WhatsApp Cloud API supports profile photo here, but does not expose a cover/banner image field.</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                                                        <label className="block">
                                                            <span className="text-xs font-semibold text-gray-700">Account label in this app</span>
                                                            <div className="relative mt-1.5">
                                                                <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                                <input
                                                                    value={businessProfile.local_name}
                                                                    onChange={(e) => setBusinessProfile(p => ({ ...p, local_name: e.target.value }))}
                                                                    className="h-10 w-full rounded-lg border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                    placeholder="Support number"
                                                                />
                                                            </div>
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-xs font-semibold text-gray-700">Business category</span>
                                                            <div className="relative mt-1.5">
                                                                <SlidersHorizontal className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                                <select
                                                                    value={businessProfile.vertical}
                                                                    onChange={(e) => setBusinessProfile(p => ({ ...p, vertical: e.target.value }))}
                                                                    className="h-10 w-full rounded-lg border-gray-200 bg-white pl-10 pr-10 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                >
                                                                    <option value="">Select category</option>
                                                                    {['AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN', 'EVENT_PLAN', 'FINANCE', 'GROCERY', 'GOVT', 'HOTEL', 'HEALTH', 'NONPROFIT', 'PROF_SERVICES', 'RETAIL', 'TRAVEL', 'RESTAURANT', 'OTHER'].map(value => (
                                                                        <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </label>
                                                        <label className="block lg:col-span-2">
                                                            <span className="text-xs font-semibold text-gray-700">About / bio</span>
                                                            <span className="ml-2 text-[11px] text-gray-400">Usually the first line people notice in WhatsApp profile.</span>
                                                            <div className="relative mt-1.5">
                                                                <FileText className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                                <input
                                                                    value={businessProfile.about}
                                                                    onChange={(e) => setBusinessProfile(p => ({ ...p, about: e.target.value }))}
                                                                    maxLength={139}
                                                                    className="h-10 w-full rounded-lg border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                    placeholder="Short WhatsApp bio"
                                                                />
                                                            </div>
                                                            <div className="mt-1 text-right text-[10px] text-gray-400">{businessProfile.about.length}/139</div>
                                                        </label>
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
                                                <div className="mb-5">
                                                    <h4 className="text-sm font-bold text-gray-900">Business details</h4>
                                                    <p className="mt-1 text-xs text-gray-500">Customer-facing description and ways to contact the business.</p>
                                                </div>

                                                <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                                                    <label className="block 2xl:col-span-2">
                                                        <span className="text-xs font-semibold text-gray-700">Business description</span>
                                                        <span className="ml-2 text-[11px] text-gray-400">Can take time to appear in customer WhatsApp apps because WhatsApp clients cache profiles.</span>
                                                        <textarea
                                                            value={businessProfile.description}
                                                            onChange={(e) => setBusinessProfile(p => ({ ...p, description: e.target.value }))}
                                                            rows={4}
                                                            className="mt-1.5 w-full resize-y rounded-lg border-gray-200 text-sm leading-5 focus:border-indigo-500 focus:ring-indigo-500"
                                                            placeholder="Tell customers what this account is for"
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-xs font-semibold text-gray-700">Email</span>
                                                        <div className="relative">
                                                            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                            <input
                                                                value={businessProfile.email}
                                                                onChange={(e) => setBusinessProfile(p => ({ ...p, email: e.target.value }))}
                                                                className="h-11 w-full rounded-lg border-gray-200 bg-white pl-10 pr-3 text-sm leading-5 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-indigo-500"
                                                                placeholder="support@example.com"
                                                            />
                                                        </div>
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-xs font-semibold text-gray-700">Websites</span>
                                                        <div className="relative">
                                                            <LinkIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                            <textarea
                                                                value={businessProfile.websites}
                                                                onChange={(e) => setBusinessProfile(p => ({ ...p, websites: e.target.value }))}
                                                                rows={2}
                                                                className="min-h-[44px] w-full resize-y rounded-lg border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm leading-5 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-indigo-500"
                                                                placeholder={'https://example.com\nhttps://shop.example.com'}
                                                            />
                                                        </div>
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-xs font-semibold text-gray-700">Address</span>
                                                        <div className="relative">
                                                            <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                            <textarea
                                                                value={businessProfile.address}
                                                                onChange={(e) => setBusinessProfile(p => ({ ...p, address: e.target.value }))}
                                                                rows={2}
                                                                className="min-h-[44px] w-full resize-y rounded-lg border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm leading-5 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-indigo-500"
                                                                placeholder="Business address"
                                                            />
                                                        </div>
                                                    </label>
                                                </div>
                                            </section>

                                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-relaxed text-indigo-900 flex gap-2.5">
                                                <Info className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
                                                <div>
                                                    <div className="font-semibold text-indigo-950">Meta and WhatsApp app visibility</div>
                                                    <p className="mt-1 text-indigo-950/80">After saving, this page reads the profile back from Meta. If Meta shows the new value here but WhatsApp still shows an old one, the customer WhatsApp app is using cached profile data. The short About/bio is usually more visible than the longer business description.</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-white/95 px-4 sm:px-8 py-4 backdrop-blur-md z-20">
                                            <div className="text-xs text-gray-400 font-medium">
                                                Changes apply to the selected WhatsApp account only.
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={isSavingProfile || isLoadingProfile}
                                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                                            >
                                                {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                Save changes
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    );
                })()}
                {activeTab === 'notifications' && (
                    <div data-tour="settings-notifications" className="bg-gray-50/60">
                        <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="max-w-3xl">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                        <Sparkles className="h-3.5 w-3.5" />
                                        Agent alert center
                                    </div>
                                    <h2 className="mt-3 text-2xl font-semibold text-gray-950">Notifications</h2>
                                    <p className="mt-2 text-sm leading-6 text-gray-600">
                                        Jab customer ka new WhatsApp message kisi aur chat me aaye, agents ko yahan selected sound alert milega. Ye settings is browser/device ke liye save hoti hain.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <button
                                        type="button"
                                        onClick={handleTestNotificationSound}
                                        className="inline-flex h-10 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#0070d1] px-5 text-sm font-semibold text-white hover:bg-[#0064b7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0070d1]/30"
                                    >
                                        <Play className="h-4 w-4" />
                                        Test sound
                                    </button>
                                    <button
                                        type="button"
                                        onClick={requestDesktopNotificationPermission}
                                        className="inline-flex h-10 min-w-40 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0070d1]/20"
                                    >
                                        <MonitorCheck className="h-4 w-4" />
                                        Browser permission
                                    </button>
                                </div>
                            </div>
                            {testSoundStatus ? (
                                <div className={`mt-4 inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-sm ${testSoundStatus === 'blocked' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                                    {testSoundStatus === 'blocked' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
                                    <span className="min-w-0 truncate">
                                        {testSoundStatus === 'playing' && 'Playing notification preview...'}
                                        {testSoundStatus === 'played' && 'Sound test successful. Incoming message alerts should be audible.'}
                                        {testSoundStatus === 'previewed' && 'Preview played. Tone selected.'}
                                        {testSoundStatus === 'blocked' && 'Browser blocked audio. Click anywhere in the app once, then press Test sound again.'}
                                    </span>
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-6 p-4 sm:p-8">
                            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <NotificationStatusCard
                                    icon={notificationSoundEnabled ? Volume2 : VolumeX}
                                    title="Message sound"
                                    value={notificationSoundEnabled ? 'Enabled' : 'Muted'}
                                    text="Only new client messages from chats not currently open will trigger sound."
                                    tone={notificationSoundEnabled ? 'green' : 'gray'}
                                />
                                <NotificationStatusCard
                                    icon={MonitorCheck}
                                    title="Browser alerts"
                                    value={browserPermission === 'granted' && desktopNotificationsEnabled ? 'Allowed' : formatPermission(browserPermission)}
                                    text={browserPermission === 'granted' && desktopNotificationsEnabled ? 'Browser permission is ready for future desktop pop-up alerts.' : 'Use Browser permission if you want this browser ready for desktop pop-up alerts later.'}
                                    tone={browserPermission === 'granted' ? 'green' : browserPermission === 'denied' ? 'amber' : 'blue'}
                                />
                                <NotificationStatusCard
                                    icon={CalendarClock}
                                    title="Quiet hours"
                                    value={quietHoursEnabled ? `${quietHours.from} - ${quietHours.to}` : 'Off'}
                                    text="Use this as an operating guideline for team shift handovers."
                                    tone={quietHoursEnabled ? 'amber' : 'blue'}
                                />
                            </section>

                            <section className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${notificationSoundEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {notificationSoundEnabled ? <BellRing className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900">Incoming message sound</h3>
                                            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                                                Recommended ON for live support teams. Agar agent same chat open karke baitha hai, duplicate sound avoid karne ke liye alert nahi bajta.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setNotificationSoundEnabled(prev => !prev)}
                                        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${notificationSoundEnabled ? 'bg-[#0070d1]' : 'bg-gray-300'}`}
                                        aria-pressed={notificationSoundEnabled}
                                    >
                                        <span className={`inline-block h-6 w-6 rounded-full bg-white transition-transform ${notificationSoundEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </section>

                            <section className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
                                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900">Choose alert tone</h3>
                                        <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">Future me sounds zyada honge, isliye list dropdown me rakhi hai. Option select karte hi preview bajega.</p>
                                    </div>
                                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                        <Headphones className="h-3.5 w-3.5" />
                                        {notificationSounds.length} tones available
                                    </span>
                                </div>
                                <div ref={soundDropdownRef} className="relative max-w-3xl">
                                    <button
                                        type="button"
                                        onClick={() => setIsSoundDropdownOpen(prev => !prev)}
                                        className="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0070d1]/25"
                                        aria-haspopup="listbox"
                                        aria-expanded={isSoundDropdownOpen}
                                    >
                                        <span className="flex min-w-0 items-start gap-3">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eef7ff] text-[#0070d1]">
                                                <Headphones className="h-5 w-5" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className="truncate text-sm font-semibold text-gray-950">{selectedNotificationSound?.label || 'Select sound'}</span>
                                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">{selectedNotificationSound?.tone || 'Custom'}</span>
                                                </span>
                                                <span className="mt-1 block truncate text-sm text-gray-500">{selectedNotificationSound?.description || getSoundDescription(selectedSoundId)}</span>
                                            </span>
                                        </span>
                                        <ChevronDown className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${isSoundDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isSoundDropdownOpen ? (
                                        <div className="absolute left-0 right-0 z-40 mt-2 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl" role="listbox">
                                            {notificationSounds.map(sound => {
                                                const selected = selectedSoundId === sound.id
                                                const fileName = getSoundFileName(sound.src)
                                                const description = sound.description || getSoundDescription(sound.id)
                                                const tone = sound.tone || 'Custom'

                                                return (
                                                    <button
                                                        key={sound.id}
                                                        type="button"
                                                        onClick={() => handleSoundSelect(sound.id)}
                                                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0070d1]/25 ${selected ? 'bg-[#eef7ff]' : 'hover:bg-gray-50'}`}
                                                        role="option"
                                                        aria-selected={selected}
                                                        title={fileName}
                                                    >
                                                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-[#0070d1] bg-[#0070d1] text-white' : 'border-gray-200 bg-white text-gray-400'}`}>
                                                            {selected ? <Check className="h-4 w-4" /> : <Play className="h-3.5 w-3.5" />}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex flex-wrap items-center gap-2">
                                                                <span className="truncate text-sm font-semibold text-gray-950">{sound.label}</span>
                                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selected ? 'bg-white text-[#0064b7]' : 'bg-gray-100 text-gray-600'}`}>{tone}</span>
                                                            </span>
                                                            <span className="mt-0.5 block truncate text-xs text-gray-500">{description}</span>
                                                        </span>
                                                        <span className={`shrink-0 text-xs font-semibold ${selected ? 'text-[#0064b7]' : 'text-gray-400'}`}>{selected ? 'Active' : 'Preview'}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            </section>

                            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                                <div className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
                                    <div className="mb-5 flex items-center justify-between gap-4">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900">Volume</h3>
                                            <p className="mt-1 text-sm text-gray-500">Set a comfortable alert level for this browser.</p>
                                        </div>
                                        <span className="text-sm font-semibold text-gray-700">{Math.round(notificationVolume * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={notificationVolume}
                                        onChange={(e) => setNotificationVolume(e.target.value)}
                                        className="w-full accent-[#0070d1]"
                                    />
                                    <div className="mt-4 grid grid-cols-3 gap-2">
                                        {[0.35, 0.7, 1].map(level => (
                                            <button
                                                key={level}
                                                type="button"
                                                onClick={() => setNotificationVolume(level)}
                                                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${Math.abs(notificationVolume - level) < 0.01 ? 'border-[#0070d1] bg-[#eef7ff] text-[#0064b7]' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                                            >
                                                {level === 0.35 ? 'Soft' : level === 0.7 ? 'Balanced' : 'Loud'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
                                    <div className="mb-4 flex items-start justify-between gap-4">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900">Quiet hours note</h3>
                                            <p className="mt-1 text-sm leading-6 text-gray-500">Team ko bataane ke liye shift timing save karein. Live sound mute karna ho to Message sound toggle OFF karein.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setQuietHoursEnabled(prev => !prev)}
                                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${quietHoursEnabled ? 'bg-[#0070d1]' : 'bg-gray-300'}`}
                                            aria-pressed={quietHoursEnabled}
                                        >
                                            <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${quietHoursEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="block">
                                            <span className="text-xs font-medium text-gray-600">From</span>
                                            <input
                                                type="time"
                                                value={quietHours.from}
                                                onChange={(e) => setQuietHours(prev => ({ ...prev, from: e.target.value }))}
                                                className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[#0070d1] focus:outline-none focus:ring-2 focus:ring-[#0070d1]/10"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-xs font-medium text-gray-600">To</span>
                                            <input
                                                type="time"
                                                value={quietHours.to}
                                                onChange={(e) => setQuietHours(prev => ({ ...prev, to: e.target.value }))}
                                                className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[#0070d1] focus:outline-none focus:ring-2 focus:ring-[#0070d1]/10"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </section>

                            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div className="rounded-lg border border-blue-100 bg-blue-50 p-5 text-sm text-blue-900">
                                    <div className="flex items-start gap-3">
                                        <Info className="mt-0.5 h-5 w-5 shrink-0" />
                                        <div>
                                            <p className="font-semibold">How alerts work</p>
                                            <p className="mt-1 leading-6">Sound sirf incoming customer messages ke liye hai. Agent ke apne sent messages, same open chat ke messages, aur duplicate socket events avoid kiye jaate hain.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                                    <div className="flex items-start gap-3">
                                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                                        <div>
                                            <p className="font-semibold">If sound does not play</p>
                                            <p className="mt-1 leading-6">Browser audio first click/key press ke baad start hota hai. App open karne ke baad ek baar Test sound press karein, tab future alerts reliable rahenge.</p>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                )}
                {activeTab === 'knowledge_base' && (
                    <div data-tour="settings-knowledge" className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-gray-200 px-4 sm:px-8 py-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Knowledge Base</h2>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                    Upload company documents once and active AI agents will use them while replying in WhatsApp chats.
                                </p>
                            </div>
                            <button
                                onClick={fetchKnowledgeBase}
                                disabled={isLoadingKnowledge || isUploadingKnowledge}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 shrink-0 w-full sm:w-auto justify-center"
                            >
                                {isLoadingKnowledge ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Refresh
                            </button>
                        </div>

                        <div className="space-y-6 p-4 sm:p-8">
                            {(knowledgeError || knowledgeSuccess) && (
                                <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${knowledgeError ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
                                    {knowledgeError ? <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                                    <span>{knowledgeError || knowledgeSuccess}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Documents</div>
                                    <div className="mt-2 text-2xl font-semibold text-gray-900">{knowledgeStats.total_documents || documents.length}</div>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Indexed text</div>
                                    <div className="mt-2 text-2xl font-semibold text-gray-900">{Number(knowledgeStats.total_characters || 0).toLocaleString()}</div>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-green-50 p-4">
                                    <div className="text-xs font-medium uppercase tracking-wide text-green-700">AI usage</div>
                                    <div className="mt-2 text-sm font-medium text-green-900">Automatically available to active bot agents</div>
                                </div>
                            </div>

                            <div
                                onClick={() => knowledgeFileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault()
                                    setIsDraggingKnowledge(true)
                                }}
                                onDragLeave={() => setIsDraggingKnowledge(false)}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    setIsDraggingKnowledge(false)
                                    uploadKnowledgeFiles(e.dataTransfer.files)
                                }}
                                className={`cursor-pointer rounded-xl border-2 border-dashed p-6 sm:p-10 text-center transition-colors ${isDraggingKnowledge ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-green-300 hover:bg-green-50/40'}`}
                            >
                                <input
                                    ref={knowledgeFileInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json"
                                    className="hidden"
                                    onChange={(e) => uploadKnowledgeFiles(e.target.files)}
                                />
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200">
                                    {isUploadingKnowledge ? <Loader2 className="h-6 w-6 animate-spin text-green-600" /> : <Upload className="h-6 w-6" />}
                                </div>
                                <h3 className="text-sm font-semibold text-gray-900">{isUploadingKnowledge ? 'Indexing document...' : 'Upload knowledge documents'}</h3>
                                <p className="mt-1 text-xs text-gray-500">PDF, DOCX, TXT, MD, CSV, JSON up to 10MB each</p>
                                <p className="mt-3 text-xs text-gray-400">Readable text is extracted and added to AI context for this workspace.</p>
                            </div>

                            <div className="rounded-xl border border-gray-200">
                                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900">Uploaded documents</h3>
                                        <p className="mt-0.5 text-xs text-gray-500">{documents.length} indexed source{documents.length === 1 ? '' : 's'}</p>
                                    </div>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {isLoadingKnowledge ? (
                                        <div className="px-5 py-10 text-center text-sm text-gray-500">Loading knowledge base...</div>
                                    ) : documents.length === 0 ? (
                                        <div className="px-5 py-10 text-center text-sm text-gray-500">No knowledge documents yet.</div>
                                    ) : documents.map((doc) => (
                                        <div key={doc.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-10 w-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 shrink-0">
                                                    <FileText className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm font-medium text-gray-900 truncate" title={doc.name}>{doc.name}</h4>
                                                    <p className="text-xs text-gray-500 truncate">{doc.size} • {doc.date}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${doc.status === 'INDEXED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                    {doc.status}
                                                </span>
                                                <button
                                                    onClick={() => handleDelete(doc.id)}
                                                    className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'integrations' && (
                    <div className="relative min-h-[600px] overflow-hidden">
                        <div className="pointer-events-none select-none p-4 sm:p-8 space-y-8 blur-[3px] opacity-45">
                            <div>
                                <h2 className="text-lg font-medium text-gray-900">E-commerce Integrations</h2>
                                <p className="text-sm text-gray-500">Connect your store to automate order notifications and abandoned cart recovery.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="border border-gray-200 rounded-xl p-6 flex flex-col justify-between bg-gradient-to-br from-white to-gray-50">
                                    <div>
                                        <div className="h-10 w-10 bg-[#95BF47]/20 rounded-lg flex items-center justify-center mb-4 text-[#95BF47] font-bold">S</div>
                                        <h3 className="font-bold text-gray-900">Shopify</h3>
                                        <p className="text-xs text-gray-500 mt-1">Sync products, orders, and customers.</p>
                                    </div>
                                    <div className="mt-4">
                                        <button type="button" className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium">Connect Store</button>
                                    </div>
                                </div>

                                <div className="border border-gray-200 rounded-xl p-6 flex flex-col justify-between bg-gradient-to-br from-white to-gray-50">
                                    <div>
                                        <div className="h-10 w-10 bg-[#96588a]/20 rounded-lg flex items-center justify-center mb-4 text-[#96588a] font-bold">W</div>
                                        <h3 className="font-bold text-gray-900">WooCommerce</h3>
                                        <p className="text-xs text-gray-500 mt-1">Open source e-commerce plugin for WordPress.</p>
                                    </div>
                                    <div className="mt-4">
                                        <button type="button" className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium">Connect Plugin</button>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-6">
                                <h3 className="text-sm font-medium text-gray-900 mb-4">Automation Triggers</h3>
                                <div className="space-y-3">
                                    {['Abandoned Cart Recovery', 'Order Confirmation', 'Shipping Update', 'COD Confirmation'].map(trigger => (
                                        <div key={trigger} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <span className="text-sm text-gray-700">{trigger}</span>
                                            <div className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200">
                                                <span className="translate-x-0 pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="absolute inset-0 flex items-center justify-center bg-white/35 backdrop-blur-[1px]">
                            <div className="mx-6 max-w-sm rounded-xl border border-gray-200 bg-white/95 px-8 py-7 text-center shadow-xl">
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                                    <ShoppingBag className="h-5 w-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Coming soon</h3>
                                <p className="mt-2 text-sm leading-6 text-gray-500">
                                    Store integrations and automation triggers are being prepared and will be available in a future update.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'developer_api' && (
                    <div data-tour="settings-developer" className="relative min-h-[600px] overflow-hidden">
                        <div className="pointer-events-none select-none p-4 sm:p-8 space-y-8 blur-[3px] opacity-45">
                            <div>
                                <h2 className="text-lg font-medium text-gray-900">Developer API</h2>
                                <p className="text-sm text-gray-500">Manage your API keys and webhooks for custom integrations.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Live API Key</label>
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        readOnly
                                        value={apiKey}
                                        className="flex-1 rounded-lg border-gray-300 bg-gray-50 font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={copyToClipboard}
                                        className="p-2 border border-gray-300 rounded-lg text-gray-600"
                                    >
                                        {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
                                    </button>
                                    <button type="button" className="p-2 border border-gray-300 rounded-lg text-gray-600">
                                        <Key className="h-5 w-5" />
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Never share your API key. Use it to authenticate requests to our API.</p>
                            </div>

                            <div className="border-t border-gray-100 pt-6">
                                <h3 className="text-sm font-medium text-gray-900 mb-4">Webhooks</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                                        <input
                                            type="text"
                                            placeholder="https://your-server.com/webhook"
                                            className="w-full rounded-lg border-gray-300 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Verified Events</label>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {['message.received', 'message.sent', 'status.update'].map(evt => (
                                                <span key={evt} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">{evt}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <button type="button" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                                        <Webhook className="h-4 w-4" /> Save Webhook Settings
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="absolute inset-0 flex items-center justify-center bg-white/35 backdrop-blur-[1px]">
                            <div className="mx-6 max-w-sm rounded-xl border border-gray-200 bg-white/95 px-8 py-7 text-center shadow-xl">
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                                    <Key className="h-5 w-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Coming soon</h3>
                                <p className="mt-2 text-sm leading-6 text-gray-500">
                                    Developer API keys and webhook controls are being prepared and will be available in a future update.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'broadcast_insights' && (() => {
                    const allMsg = broadcastInsights?.all_messages || {}
                    const msgDelivered = broadcastInsights?.messages_delivered || {}
                    const freeDelivered = broadcastInsights?.free_messages_delivered || {}
                    const paidDelivered = broadcastInsights?.paid_messages_delivered || {}
                    const charges = broadcastInsights?.approximate_total_charges || {}
                    const recent = broadcastInsights?.recent_campaigns || []

                    const fmtRupees = (paise) => `₹${((Number(paise) || 0) / 100).toFixed(2)}`
                    const fmtNum = (n) => Number(n || 0).toLocaleString()
                    const isLoading = isLoadingBroadcastInsights && !broadcastInsights

                    const CAT_COLORS = {
                        marketing: '#1877f2',
                        marketing_lite: '#f0a500',
                        utility: '#e03c31',
                        authentication: '#e03c31',
                        authentication_international: '#e03c31',
                        ai_provider: '#e03c31',
                        service: '#1877f2',
                        free_customer_service: '#1877f2',
                        free_entry_point: '#e03c31',
                    }

                    const statusColor = (st) => ({
                        completed: 'bg-emerald-100 text-emerald-700',
                        processing: 'bg-blue-100 text-blue-700',
                        queued: 'bg-amber-100 text-amber-700',
                        failed: 'bg-red-100 text-red-700',
                        cancelled: 'bg-gray-100 text-gray-600',
                        scheduled: 'bg-purple-100 text-purple-700',
                        paused: 'bg-orange-100 text-orange-700',
                    }[st] || 'bg-gray-100 text-gray-500')

                    const DashIcon = ({ colorKey }) => (
                        <span className="shrink-0 inline-flex gap-0.5 items-center">
                            {[0, 1, 2].map(i => (
                                <span key={i} className="inline-block h-[2px] w-[6px] rounded-full"
                                    style={{ backgroundColor: CAT_COLORS[colorKey] || '#999', opacity: i === 1 ? 0.5 : 1 }}
                                />
                            ))}
                        </span>
                    )

                    const CategoryRow = ({ label, value, colorKey }) => (
                        <div className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                                <DashIcon colorKey={colorKey} />
                                <span className="text-sm text-gray-600 truncate">{label}</span>
                            </div>
                            <span className="text-sm font-medium text-gray-900 ml-3 shrink-0 tabular-nums">{value}</span>
                        </div>
                    )

                    const InsightPanel = ({ title, total, totalLabel, rows }) => (
                        <div className="rounded border border-gray-200 bg-white overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    <span className="inline-block h-0.5 w-4 rounded-full bg-gray-700" />
                                    <span className="text-sm font-semibold text-gray-800">{title}</span>
                                </div>
                                {(total !== undefined || totalLabel) && (
                                    <span className="text-sm font-bold text-gray-900 tabular-nums">{totalLabel !== undefined ? totalLabel : fmtNum(total)}</span>
                                )}
                            </div>
                            <div className="px-4 py-1">
                                {isLoading ? (
                                    <div className="space-y-2 py-2">
                                        {[1, 2, 3].map(i => <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" />)}
                                    </div>
                                ) : rows.length === 0 ? (
                                    <p className="text-sm text-gray-400 py-5 text-center">No data for this period.</p>
                                ) : (
                                    <div className="divide-y divide-gray-50">
                                        {rows.map(row => (
                                            <CategoryRow key={row.key || row.label} label={row.label} value={row.value} colorKey={row.key} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )

                    return (
                        <div className="bg-white min-h-full">
                            {/* Header */}
                            <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-gray-900">Insights</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">WhatsApp Business message analytics</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchBroadcastInsights}
                                    disabled={isLoadingBroadcastInsights}
                                    className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors self-start sm:self-auto"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingBroadcastInsights ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>



                            {broadcastInsightsError && (
                                <div className="mx-5 mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {broadcastInsightsError}
                                </div>
                            )}

                            <div className="p-5 space-y-4">

                                {/* Top 3-panel grid */}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                    <InsightPanel
                                        title="All Messages"
                                        rows={[
                                            { key: 'marketing', label: 'Messages sent', value: fmtNum(allMsg.total_sent) },
                                            { key: 'service', label: 'Messages delivered', value: fmtNum(allMsg.total_delivered) },
                                            { key: 'utility', label: 'Messages received', value: fmtNum(allMsg.total_received) },
                                        ]}
                                    />
                                    <InsightPanel
                                        title="Messages Delivered"
                                        total={msgDelivered.total}
                                        rows={(msgDelivered.categories || []).map(c => ({
                                            key: c.key, label: c.label, value: fmtNum(c.delivered)
                                        }))}
                                    />
                                    <InsightPanel
                                        title="Free Messages Delivered"
                                        total={freeDelivered.total}
                                        rows={(freeDelivered.categories || []).map(c => ({
                                            key: c.key, label: c.label, value: fmtNum(c.delivered)
                                        }))}
                                    />
                                </div>

                                {/* Bottom 2-panel grid */}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <InsightPanel
                                        title="Paid Messages Delivered"
                                        total={paidDelivered.total}
                                        rows={(paidDelivered.categories || []).map(c => ({
                                            key: c.key, label: c.label, value: fmtNum(c.delivered)
                                        }))}
                                    />
                                    <InsightPanel
                                        title="Approximate Total Charges"
                                        totalLabel={fmtRupees(charges.total_paise)}
                                        rows={(charges.categories || []).map(c => ({
                                            key: c.key, label: c.label, value: fmtRupees(c.charges_paise)
                                        }))}
                                    />
                                </div>

                            </div>
                        </div>
                    )
                })()}

                {activeTab !== 'general' && activeTab !== 'notifications' && activeTab !== 'knowledge_base' && activeTab !== 'integrations' && activeTab !== 'developer_api' && activeTab !== 'team_members' && activeTab !== 'broadcast_insights' && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        Content for {activeTab.replace('_', ' ')} coming soon...
                    </div>
                )}
            </div>
        </div>
    )
}

function NotificationStatusCard({ icon, title, value, text, tone }) {
    const toneClass = {
        green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        amber: 'bg-amber-50 text-amber-800 border-amber-100',
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        gray: 'bg-gray-50 text-gray-600 border-gray-200'
    }[tone] || 'bg-gray-50 text-gray-600 border-gray-200'

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-950">{title}</p>
                    <p className="mt-1 text-2xl font-light leading-none text-gray-950">{value}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
                    {createElement(icon, { className: 'h-5 w-5' })}
                </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-500">{text}</p>
        </div>
    )
}

function formatPermission(permission) {
    if (permission === 'granted') return 'Allowed'
    if (permission === 'denied') return 'Blocked'
    if (permission === 'unsupported') return 'Not supported'
    return 'Not asked'
}

function getSoundDescription(soundId) {
    const descriptions = {
        'dragon-studio': 'Soft and professional, best for long support shifts.',
        'universfield-033': 'Short pop, good when agents are active on multiple tabs.',
        'universfield-038': 'Brighter ping for busy teams who need noticeable alerts.',
        'universfield-051': 'Rounded alert that feels present without being harsh.',
        'universfield-056': 'Clean tap with low distraction.',
        'universfield-057': 'Clean new-message cue with a little more lift.',
        'universfield-09': 'Very short alert for quiet workspaces.'
    }
    return descriptions[soundId] || 'Notification preview sound.'
}

function getSoundFileName(src) {
    return String(src || '').split('/').pop() || 'Custom sound'
}
