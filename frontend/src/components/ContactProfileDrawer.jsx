import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    X,
    MessageSquare,
    Phone,
    Mail,
    Calendar,
    Edit,
    Clock,
    Send,
    User,
    Flame,
    Target,
    ClipboardList,
    BadgeInfo,
    StickyNote,
    UserPlus,
    RefreshCw,
    Sparkles,
    ListChecks,
    HelpCircle,
    Lightbulb,
    Activity,
} from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import DiceBearAvatar from './DiceBearAvatar'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const INTERNAL_CUSTOM_FIELD_KEYS = new Set([
    'profile_photo_url',
    'profile_photo_checked_at',
    'private_notes',
    'captured_name',
    'captured_phone',
    'lead_summary',
    'lead_next_step',
    'lead_topics',
    'lead_temperature',
    'lead_interest',
    'sales_note_auto',
])

const FOLLOW_UP_RE = /\b(today|tomorrow|morning|afternoon|evening|night|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const AMOUNT_RE = /(?:rs\.?|inr|\u20B9|\$)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:rs|inr|rupees|dollars|usd)\b/i
const PHONE_RE = /(?:phone|mobile|contact|whatsapp)?\s*:?\s*(?:\+?\d[\d\s-]{7,}\d)/i
const NAME_RE = /\bname\s*:\s*(.*?)(?=\s*(?:•|\||,?\s*email\s*:|,?\s*phone\s*:|,?\s*mobile\s*:|,?\s*customer\s+intent\b|$))/i

function formatPhoneForDisplay(value) {
    const raw = String(value || '')
    if (!raw) return ''
    const [left, right] = raw.includes('@') ? raw.split('@') : [raw, '']
    if (right && right !== 's.whatsapp.net') return ''

    const digits = String(left).replace(/[^0-9]/g, '')
    if (!digits) return ''
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
    if (digits.length === 12 && digits.startsWith('91')) {
        const local = digits.slice(2)
        return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
    }
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
    return ''
}

function getMessageText(message) {
    if (!message) return ''
    const candidates = [
        message.text,
        message.body,
        message.content,
        message.caption,
        message.message,
        message.raw?.text,
        message.raw?.body,
    ]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
        if (candidate && typeof candidate === 'object') {
            const nested = candidate.text || candidate.body || candidate.caption
            if (typeof nested === 'string' && nested.trim()) return nested.trim()
        }
    }
    return ''
}

function isIncomingMessage(message) {
    return Boolean(
        message?.direction === 'incoming' ||
        message?.from_me === false ||
        message?.fromMe === false ||
        message?.sender === 'customer' ||
        message?.sender_type === 'customer'
    )
}

function buildSalesInsights(messages, contact) {
    const cleaned = messages
        .map((message) => ({
            text: getMessageText(message),
            incoming: isIncomingMessage(message),
        }))
        .filter((message) => message.text)
        .slice(-40)

    const inbound = cleaned.filter((message) => message.incoming)
    const outbound = cleaned.filter((message) => !message.incoming)
    const clientText = inbound.map((message) => message.text).join(' ')
    const allText = cleaned.map((message) => message.text).join(' ')
    const lowerClient = clientText.toLowerCase()
    const lowerAll = allText.toLowerCase()

    const topicRules = [
        ['Pricing', /\b(price|pricing|cost|amount|budget|fee|charges|payment|invoice|quote)\b/i],
        ['Service fit', /\b(website|landing|design|video|poster|marketing|campaign|plan|package|subscription|service)\b/i],
        ['Follow-up', /\b(call|contact|meeting|demo|schedule|available|tomorrow|today|morning|evening|time)\b/i],
        ['Support', /\b(help|issue|problem|track|order|status|delivery|support)\b/i],
        ['Decision', /\b(interested|need|want|send|share|yes|ok|confirm|final)\b/i],
    ]
    const topics = topicRules.filter(([, rule]) => rule.test(lowerAll)).map(([label]) => label)

    let score = 10
    if (EMAIL_RE.test(clientText)) score += 20
    if (FOLLOW_UP_RE.test(clientText)) score += 20
    if (AMOUNT_RE.test(clientText) || /\b(price|cost|budget|quote|invoice)\b/i.test(clientText)) score += 20
    if (/\b(interested|need|want|send|share|yes|ok|confirm|call me|contact me)\b/i.test(clientText)) score += 25
    if (/\b(not interested|don't|dont|stop|cancel|no need|later)\b/i.test(clientText)) score -= 35
    if (inbound.length >= 3) score += 10
    score = Math.max(0, Math.min(100, score))

    const temperature = score >= 70 ? 'Hot' : score >= 45 ? 'Warm' : score >= 20 ? 'Cold' : 'New'
    const interest = /\b(not interested|don't|dont|stop|cancel|no need)\b/i.test(lowerClient)
        ? 'Not interested'
        : score >= 45
            ? 'Interested'
            : 'Needs qualification'

    const latestClient = inbound.at(-1)?.text || ''
    const latestAgent = outbound.at(-1)?.text || ''
    const summaryParts = []
    if (latestClient) summaryParts.push(`Client last said: "${latestClient.slice(0, 140)}${latestClient.length > 140 ? '...' : ''}"`)
    if (latestAgent) summaryParts.push(`Agent last replied about: "${latestAgent.slice(0, 120)}${latestAgent.length > 120 ? '...' : ''}"`)
    if (!summaryParts.length) summaryParts.push('No readable chat messages available yet.')

    const followUpMatch = clientText.match(FOLLOW_UP_RE)?.[0]
    const nextStep = followUpMatch
        ? `Follow up around ${followUpMatch}.`
        : temperature === 'Hot'
            ? 'Call or message quickly with pricing, proof, and next action.'
            : temperature === 'Warm'
                ? 'Qualify budget, timeline, and required service.'
                : 'Start with a short discovery question before pitching.'

    const objections = []
    if (/\b(price|cost|expensive|budget|high)\b/i.test(lowerClient)) objections.push('Pricing or budget')
    if (/\b(later|busy|tomorrow|time|after)\b/i.test(lowerClient)) objections.push('Timing')
    if (/\b(not interested|no need|cancel|stop)\b/i.test(lowerClient)) objections.push('Low intent')

    return {
        hasMessages: cleaned.length > 0,
        score,
        temperature,
        interest,
        topics: topics.length ? topics : ['General inquiry'],
        summary: summaryParts.join(' '),
        nextStep,
        objections,
        latestClient,
        inboundCount: inbound.length,
        outboundCount: outbound.length,
        savedEmail: contact?.custom_fields?.captured_email || contact?.email || '',
        savedFollowUp: contact?.custom_fields?.follow_up_time || '',
        savedAmount: contact?.custom_fields?.captured_amount || '',
    }
}

function extractClientInfo(messages) {
    const inboundText = messages
        .filter(isIncomingMessage)
        .map(getMessageText)
        .filter(Boolean)
        .join(' ')
    return {
        email: inboundText.match(EMAIL_RE)?.[0] || '',
        followUp: inboundText.match(FOLLOW_UP_RE)?.[0] || '',
        amount: inboundText.match(AMOUNT_RE)?.[0] || '',
    }
}

function extractStructuredClientInfo(text) {
    const source = String(text || '')
    const email = source.match(EMAIL_RE)?.[0] || ''
    const phoneRaw = source.match(PHONE_RE)?.[0] || ''
    const phone = phoneRaw ? phoneRaw.replace(/^(phone|mobile|contact|whatsapp)\s*:?\s*/i, '').replace(/\s+/g, ' ').trim() : ''
    const name = source.match(NAME_RE)?.[1]?.replace(/[:•|]+$/g, '').trim() || ''
    return { name, email, phone }
}

function isPersonalFact(value) {
    const text = String(value || '').toLowerCase()
    return (
        text.startsWith('name:') ||
        text.startsWith('email:') ||
        text.startsWith('phone:') ||
        text.startsWith('mobile:') ||
        EMAIL_RE.test(text) ||
        /\b(phone|mobile|contact)\s*:/.test(text)
    )
}

function prettifyLabel(value) {
    return String(value || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getNoteCreatedAt(note) {
    return note?.created_at || note?.metadata?.generated_at || note?.metadata?.created_at || null
}

function getNotePresentation(note) {
    const type = String(note?.note_type || note?.record_kind || 'note').toLowerCase()
    if (type.includes('intent')) return { label: 'Customer intent', icon: Target, accent: 'text-blue-700 bg-blue-50 border-blue-100' }
    if (type.includes('next')) return { label: 'Next action', icon: ListChecks, accent: 'text-green-700 bg-green-50 border-green-100' }
    if (type.includes('question')) return { label: 'Open question', icon: HelpCircle, accent: 'text-amber-700 bg-amber-50 border-amber-100' }
    if (type.includes('summary')) return { label: 'AI summary', icon: ClipboardList, accent: 'text-violet-700 bg-violet-50 border-violet-100' }
    if (type.includes('human')) return { label: 'Private note', icon: StickyNote, accent: 'text-gray-700 bg-gray-50 border-gray-100' }
    return { label: prettifyLabel(type), icon: Lightbulb, accent: 'text-slate-700 bg-slate-50 border-slate-100' }
}

function normalizeNote(note) {
    const presentation = getNotePresentation(note)
    return {
        ...note,
        title: presentation.label,
        Icon: presentation.icon,
        accent: presentation.accent,
        body: String(note?.body || note?.summary_text || '').trim(),
        source: String(note?.source || note?.generated_by || '').trim(),
        createdAt: getNoteCreatedAt(note),
        metadata: note?.metadata && typeof note.metadata === 'object' ? note.metadata : {},
    }
}

export default function ContactProfileDrawer({
    isOpen,
    onClose,
    contact,
    conversationId = null,
    onEdit,
    onContactUpdated,
    focusAliasOnOpen = false,
    botEnabled = false,
    onToggleBot = null,
    messages = [],
}) {
    const { apiCall } = useAuth()
    const [activeTab, setActiveTab] = useState('chat')
    const [customName, setCustomName] = useState('')
    const [noteDraft, setNoteDraft] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isSavingNote, setIsSavingNote] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [autoSaveStatus, setAutoSaveStatus] = useState('')
    const [flowSession, setFlowSession] = useState(null)
    const [handoffSummary, setHandoffSummary] = useState(null)
    const [summaryMeta, setSummaryMeta] = useState(null)
    const [conversationNotes, setConversationNotes] = useState([])
    const [summaryError, setSummaryError] = useState('')
    const [isRequestingSummary, setIsRequestingSummary] = useState(false)
    const [isSavingContact, setIsSavingContact] = useState(false)

    const aliasInputRef = useRef(null)
    const autoSavedKeyRef = useRef('')

    const displayName = useMemo(() => {
        const custom = String(contact?.custom_name || '').trim()
        if (custom) return custom
        const raw = String(contact?.name || '').trim()
        if (raw && !raw.includes('@') && !/^\d+$/.test(raw)) return raw
        const phone = contact?.phone || contact?.wa_id || ''
        return formatPhoneForDisplay(phone) || 'Unknown'
    }, [contact])

    const phoneDisplay = useMemo(() => formatPhoneForDisplay(contact?.phone || contact?.wa_id || ''), [contact])
    const profilePhotoUrl = contact?.profile_photo_url || contact?.profilePhotoUrl || contact?.photo_url || ''
    const customFields = useMemo(() => contact?.custom_fields && typeof contact.custom_fields === 'object' ? contact.custom_fields : {}, [contact])
    const salesInsights = useMemo(() => buildSalesInsights(messages, contact), [messages, contact])
    const extractedInfo = useMemo(() => extractClientInfo(messages), [messages])
    const aiCapturedInfo = useMemo(() => {
        const noteText = conversationNotes.map((note) => `${note.body || ''} ${JSON.stringify(note.metadata || {})}`).join(' ')
        const summaryText = [
            handoffSummary?.summary_text,
            ...(Array.isArray(handoffSummary?.important_facts) ? handoffSummary.important_facts.map((item) => typeof item === 'string' ? item : JSON.stringify(item)) : []),
        ].filter(Boolean).join(' ')
        return extractStructuredClientInfo(`${summaryText} ${noteText}`)
    }, [conversationNotes, handoffSummary])
    const displayInsights = useMemo(() => {
        if (!handoffSummary) return salesInsights
        const factTopics = Array.isArray(handoffSummary.important_facts)
            ? handoffSummary.important_facts.map((item) => typeof item === 'string' ? item : item?.label || item?.text).filter(Boolean)
            : []
        const productTopics = Array.isArray(handoffSummary.products_discussed)
            ? handoffSummary.products_discussed.map((item) => typeof item === 'string' ? item : item?.name || item?.text).filter(Boolean)
            : []
        const quality = handoffSummary.lead_quality || salesInsights.temperature
        const normalizedQuality = String(quality || '').toLowerCase()
        const score = normalizedQuality.includes('hot') ? 85 : normalizedQuality.includes('warm') ? 60 : normalizedQuality.includes('cold') ? 25 : salesInsights.score
        return {
            ...salesInsights,
            score,
            temperature: quality,
            interest: handoffSummary.customer_intent || handoffSummary.customer_stage || salesInsights.interest,
            topics: [...factTopics, ...productTopics].filter((topic) => !isPersonalFact(topic)).slice(0, 6).length ? [...factTopics, ...productTopics].filter((topic) => !isPersonalFact(topic)).slice(0, 6) : salesInsights.topics,
            summary: handoffSummary.summary_text || salesInsights.summary,
            nextStep: handoffSummary.next_best_action || salesInsights.nextStep,
            objections: Array.isArray(handoffSummary.objections) && handoffSummary.objections.length ? handoffSummary.objections : salesInsights.objections,
        }
    }, [handoffSummary, salesInsights])

    const manualNotes = useMemo(() => {
        const notes = customFields.private_notes
        return Array.isArray(notes) ? notes : []
    }, [customFields.private_notes])

    const aiNotes = useMemo(() => {
        return conversationNotes
            .map(normalizeNote)
            .filter((note) => note.body && note.source !== 'human')
    }, [conversationNotes])

    const humanDbNotes = useMemo(() => {
        return conversationNotes
            .map(normalizeNote)
            .filter((note) => note.body && (note.source === 'human' || String(note.note_type || '').includes('human')))
    }, [conversationNotes])

    const customerIntentNote = useMemo(() => {
        return aiNotes.find((note) => String(note.note_type || '').toLowerCase().includes('intent'))
    }, [aiNotes])

    const nextActionNote = useMemo(() => {
        return aiNotes.find((note) => String(note.note_type || '').toLowerCase().includes('next')) || aiNotes.find((note) => note.title === 'Next action')
    }, [aiNotes])

    const briefMetadata = useMemo(() => {
        return customerIntentNote?.metadata || nextActionNote?.metadata || handoffSummary?.metadata || {}
    }, [customerIntentNote, nextActionNote, handoffSummary])

    const visibleCustomFields = useMemo(() => {
        return Object.entries(customFields).filter(([key, value]) => {
            if (INTERNAL_CUSTOM_FIELD_KEYS.has(key)) return false
            return value !== undefined && value !== null && String(value).trim() !== ''
        })
    }, [customFields])

    const isContactSaved = Boolean(contact?.saved_at || contact?.save_source === 'manual' || contact?.save_source === 'import' || contact?.save_source === 'broadcast')

    const patchContact = useCallback(async (payload) => {
        const id = contact?.id
        if (!id) throw new Error('Contact is not synced yet.')
        const res = await apiCall(`${API_BASE}/contacts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(body || `Failed to save (HTTP ${res.status})`)
        }
        const updated = await res.json().catch(() => null)
        if (updated && typeof onContactUpdated === 'function') onContactUpdated(updated)
        return updated
    }, [apiCall, contact?.id, onContactUpdated])

    const patchCustomFields = useCallback(async (fieldsPatch) => {
        return patchContact({
            custom_fields: {
                ...customFields,
                ...fieldsPatch,
            },
        })
    }, [customFields, patchContact])

    const fetchSummary = useCallback(async () => {
        if (!conversationId) return null
        const res = await apiCall(`${API_BASE}/conversations/${conversationId}/summary`)
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(body || `Failed to fetch summary (HTTP ${res.status})`)
        }
        const data = await res.json().catch(() => null)
        setHandoffSummary(data?.summary || null)
        setSummaryMeta(data?.conversation || null)
        setConversationNotes(Array.isArray(data?.notes) ? data.notes : [])
        return data
    }, [apiCall, conversationId])

    useEffect(() => {
        setCustomName(String(contact?.custom_name || ''))
        setSaveError('')
        setIsSaving(false)
        setNoteDraft('')
        setAutoSaveStatus('')
        autoSavedKeyRef.current = ''

        if (contact?.id) {
            apiCall(`${API_BASE}/flow-sessions/${contact.id}`)
                .then((res) => res.ok ? res.json() : null)
                .then((data) => setFlowSession(data))
                .catch((err) => console.error('Error fetching flow session', err))
        } else {
            setFlowSession(null)
        }
    }, [apiCall, contact?.id, contact?.custom_name])

    useEffect(() => {
        if (!isOpen || !conversationId) {
            setHandoffSummary(null)
            setSummaryMeta(null)
            setConversationNotes([])
            return
        }

        setSummaryError('')
        fetchSummary().catch((err) => console.error('Error fetching handoff summary', err))
    }, [conversationId, fetchSummary, isOpen])

    useEffect(() => {
        if (!isOpen || !conversationId || summaryMeta?.summary_status !== 'pending') return
        const timer = setInterval(() => {
            fetchSummary().catch((err) => console.error('Error refreshing handoff summary', err))
        }, 3000)
        return () => clearInterval(timer)
    }, [conversationId, fetchSummary, isOpen, summaryMeta?.summary_status])

    useEffect(() => {
        if (!isOpen || !contact?.id || !isContactSaved) return

        const fieldsPatch = {}
        const resolvedEmail = extractedInfo.email || aiCapturedInfo.email
        const resolvedPhone = aiCapturedInfo.phone
        const resolvedName = aiCapturedInfo.name

        if (resolvedEmail && customFields.captured_email !== resolvedEmail) fieldsPatch.captured_email = resolvedEmail
        if (resolvedPhone && customFields.captured_phone !== resolvedPhone) fieldsPatch.captured_phone = resolvedPhone
        if (resolvedName && customFields.captured_name !== resolvedName) fieldsPatch.captured_name = resolvedName
        if (extractedInfo.followUp && customFields.follow_up_time !== extractedInfo.followUp) fieldsPatch.follow_up_time = extractedInfo.followUp
        if (extractedInfo.amount && customFields.captured_amount !== extractedInfo.amount) fieldsPatch.captured_amount = extractedInfo.amount

        const insightPatch = {
            lead_temperature: displayInsights.temperature,
            lead_interest: displayInsights.interest,
            lead_summary: displayInsights.summary,
            lead_next_step: displayInsights.nextStep,
            lead_topics: displayInsights.topics.join(', '),
            sales_note_auto: `Lead ${displayInsights.temperature} (${displayInsights.interest}). ${displayInsights.summary} Next: ${displayInsights.nextStep}`,
        }

        Object.entries(insightPatch).forEach(([key, value]) => {
            if (value && customFields[key] !== value) fieldsPatch[key] = value
        })

        const patchKey = JSON.stringify(fieldsPatch)
        if (!Object.keys(fieldsPatch).length || autoSavedKeyRef.current === patchKey) return

        autoSavedKeyRef.current = patchKey
        setAutoSaveStatus('Saving captured info...')
        patchCustomFields(fieldsPatch)
            .then(() => setAutoSaveStatus('Captured info saved'))
            .catch((err) => {
                console.error('Failed to auto-save contact insights', err)
                setAutoSaveStatus('Auto-save failed')
            })
    }, [isOpen, contact?.id, isContactSaved, extractedInfo, aiCapturedInfo, displayInsights, customFields, patchCustomFields])

    useEffect(() => {
        if (!isOpen || !focusAliasOnOpen) return
        setActiveTab('overview')
        const t = setTimeout(() => {
            aliasInputRef.current?.focus?.()
            aliasInputRef.current?.select?.()
        }, 50)
        return () => clearTimeout(t)
    }, [isOpen, focusAliasOnOpen])

    const cancelFlow = async () => {
        if (!flowSession?.id) return
        try {
            await apiCall(`${API_BASE}/flow-sessions/${flowSession.id}`, { method: 'DELETE' })
            setFlowSession(null)
        } catch (e) {
            console.error('Failed to cancel flow', e)
        }
    }

    const saveCustomName = async () => {
        setIsSaving(true)
        setSaveError('')
        try {
            await patchContact({ custom_name: customName })
        } catch (e) {
            setSaveError(e?.message || 'Failed to save')
        } finally {
            setIsSaving(false)
        }
    }

    const saveManualNote = async () => {
        const text = noteDraft.trim()
        if (!text) return
        setIsSavingNote(true)
        setSaveError('')
        try {
            await patchCustomFields({
                private_notes: [
                    {
                        text,
                        at: new Date().toISOString(),
                        author: 'You',
                    },
                    ...manualNotes,
                ],
            })
            setNoteDraft('')
        } catch (e) {
            setSaveError(e?.message || 'Failed to save note')
        } finally {
            setIsSavingNote(false)
        }
    }

    const saveContact = async () => {
        if (!contact?.id) return
        setIsSavingContact(true)
        setSaveError('')
        try {
            const res = await apiCall(`${API_BASE}/contacts/${contact.id}/save`, { method: 'POST' })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(body || `Failed to save contact (HTTP ${res.status})`)
            }
            const updated = await res.json().catch(() => null)
            if (updated && typeof onContactUpdated === 'function') onContactUpdated(updated)
        } catch (e) {
            setSaveError(e?.message || 'Failed to save contact')
        } finally {
            setIsSavingContact(false)
        }
    }

    const requestSummary = async () => {
        if (!conversationId) return
        setIsRequestingSummary(true)
        setSummaryError('')
        try {
            const res = await apiCall(`${API_BASE}/conversations/${conversationId}/request-summary`, { method: 'POST' })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(body || `Failed to request summary (HTTP ${res.status})`)
            }
            const data = await res.json().catch(() => null)
            setSummaryMeta(data?.conversation || { ...(summaryMeta || {}), summary_status: 'pending' })
            setTimeout(() => {
                fetchSummary().catch((err) => console.error('Error fetching requested summary', err))
            }, 1200)
        } catch (e) {
            setSummaryError(e?.message || 'Failed to request summary')
        } finally {
            setIsRequestingSummary(false)
        }
    }

    if (!isOpen || !contact) return null

    const heatClass = displayInsights.temperature === 'Hot'
        ? 'bg-red-50 text-red-700 border-red-200'
        : displayInsights.temperature === 'Warm'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-slate-50 text-slate-700 border-slate-200'

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
                <div className="w-screen max-w-lg transform bg-white shadow-2xl flex flex-col h-full">
                    <div className="border-b border-gray-100 bg-white px-4 py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                                    title="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                                <h2 className="text-base font-semibold text-gray-900">Contact info</h2>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => onEdit(contact)}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                                    title="Edit contact"
                                >
                                    <Edit className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex items-start gap-3">
                            <div className="shrink-0">
                                {profilePhotoUrl ? (
                                    <img
                                        src={profilePhotoUrl}
                                        alt={displayName}
                                        className="h-14 w-14 rounded-full object-cover shadow-sm ring-1 ring-gray-200"
                                    />
                                ) : (
                                    <DiceBearAvatar seed={displayName} className="h-14 w-14 rounded-full object-cover shrink-0 shadow-sm ring-1 ring-gray-200" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-lg font-semibold leading-6 text-gray-950">{displayName}</h3>
                                        <div className="mt-0.5 truncate font-mono text-xs text-gray-500">{phoneDisplay || 'No phone'}</div>
                                    </div>
                                    {!isContactSaved ? (
                                        <button
                                            type="button"
                                            onClick={saveContact}
                                            disabled={isSavingContact}
                                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-60"
                                        >
                                            <UserPlus className="h-3.5 w-3.5" />
                                            {isSavingContact ? 'Saving' : 'Save'}
                                        </button>
                                    ) : null}
                                </div>

                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${heatClass}`}>
                                        <Flame className="h-3 w-3" />
                                        {displayInsights.temperature}
                                    </span>
                                    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                        <Target className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{customerIntentNote?.body || displayInsights.interest}</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-b border-gray-200 bg-white">
                        <nav className="-mb-px flex px-4" aria-label="Tabs">
                            {[
                                ['overview', 'Overview'],
                                ['chat', 'Sales brief'],
                                ['notes', 'Notes'],
                            ].map(([tab, label]) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`w-1/3 border-b-2 px-1 py-3 text-center text-sm font-medium ${
                                        activeTab === tab
                                            ? 'border-green-500 text-green-700'
                                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
                        {activeTab === 'overview' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2.5">
                                    <button
                                        onClick={() => onEdit(contact)}
                                        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                                    >
                                        <Edit className="h-4 w-4" /> Edit Details
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
                                    >
                                        <MessageSquare className="h-4 w-4" /> Send Message
                                    </button>
                                </div>

                                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                                    <div className="space-y-3 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-semibold text-gray-900">Chat alias</div>
                                                <p className="mt-0.5 text-xs text-gray-500">Private display name.</p>
                                            </div>
                                            {saveError ? <div className="text-xs text-red-600">{saveError}</div> : null}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                ref={aliasInputRef}
                                                value={customName}
                                                onChange={(e) => setCustomName(e.target.value)}
                                                placeholder="Name shown in chat"
                                                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                                            />
                                            <button
                                                type="button"
                                                onClick={saveCustomName}
                                                disabled={isSaving}
                                                className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                                            >
                                                {isSaving ? 'Saving' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                                    <div className="space-y-3 p-4">
                                        <div className="flex items-center gap-3 text-sm">
                                            <Mail className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-900">{customFields.captured_email || contact.email || 'No email provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Phone className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-900 font-mono">{phoneDisplay || 'No phone provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-500">Joined {format(new Date(contact.created_at || Date.now()), 'MMMM d, yyyy')}</span>
                                        </div>
                                        {customFields.follow_up_time ? (
                                            <div className="flex items-center gap-3 text-sm">
                                                <Clock className="h-4 w-4 text-gray-400" />
                                                <span className="text-gray-900">Follow up: {customFields.follow_up_time}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 ml-1">Automation status</h4>
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 flex justify-between items-center text-sm border-b border-gray-100">
                                            <span className="text-gray-500 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Bot auto reply</span>
                                            <button
                                                onClick={() => onToggleBot && onToggleBot(!botEnabled)}
                                                className={`font-semibold px-3 py-1 rounded-full text-xs transition-colors shadow-sm active:scale-95 ${
                                                    botEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                }`}
                                            >
                                                {botEnabled ? 'ENABLED' : 'DISABLED'}
                                            </button>
                                        </div>
                                        <div className="px-4 py-3 flex justify-between items-center text-sm">
                                            <span className="text-gray-500 flex items-center gap-2"><Send className="h-4 w-4" /> Active flow</span>
                                            <div className="flex items-center gap-2">
                                                {flowSession ? (
                                                    <>
                                                        <span className="font-semibold px-2 py-0.5 rounded-md text-xs bg-green-100 text-green-700 max-w-[160px] truncate" title={flowSession?.flows?.name}>
                                                            {flowSession?.flows?.name || 'In Progress'}
                                                        </span>
                                                        <button onClick={cancelFlow} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded" title="Stop flow">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="font-semibold text-gray-500 text-xs">None</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 ml-1">Custom attributes</h4>
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                                        {visibleCustomFields.length > 0 ? (
                                            visibleCustomFields.map(([key, value]) => (
                                                <div key={key} className="px-4 py-3 flex justify-between gap-4 text-sm">
                                                    <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                                    <span className="font-medium text-gray-900 text-right">{String(value)}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-4 text-sm text-gray-500 text-center italic">No custom attributes found</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'chat' && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                                    <div className="border-b border-gray-100 px-4 py-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className="h-4 w-4 text-green-600" />
                                                    <div className="text-sm font-semibold text-gray-950">Executive brief</div>
                                                </div>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {handoffSummary
                                                        ? `Generated by ${handoffSummary.generated_by || 'n8n'}`
                                                        : summaryMeta?.summary_status === 'pending'
                                                            ? 'Summary is being generated.'
                                                            : 'Generate a sales-ready summary from this conversation.'}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={requestSummary}
                                                disabled={!conversationId || isRequestingSummary || summaryMeta?.summary_status === 'pending'}
                                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <RefreshCw className={`h-3.5 w-3.5 ${isRequestingSummary || summaryMeta?.summary_status === 'pending' ? 'animate-spin' : ''}`} />
                                                {summaryMeta?.summary_status === 'pending' ? 'Generating' : handoffSummary ? 'Regenerate' : 'Generate'}
                                            </button>
                                        </div>
                                        {summaryError ? <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{summaryError}</div> : null}
                                    </div>

                                    <div className="p-4">
                                        <div className="grid grid-cols-3 gap-2">
                                            <MetricTile label="Score" value={`${displayInsights.score}/100`} tone={heatClass} />
                                            <MetricTile label="Quality" value={briefMetadata.lead_quality || displayInsights.temperature} />
                                            <MetricTile label="Stage" value={briefMetadata.customer_stage || handoffSummary?.customer_stage || 'Open'} />
                                        </div>

                                        <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
                                                <ClipboardList className="h-3.5 w-3.5" />
                                                Conversation summary
                                            </div>
                                            <p className="mt-2 text-sm leading-6 text-gray-800">{displayInsights.summary}</p>
                                        </div>

                                        <div className="mt-3 rounded-lg border border-green-100 bg-green-50 p-3">
                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-green-700">
                                                <Target className="h-3.5 w-3.5" />
                                                Next best action
                                            </div>
                                            <p className="mt-2 text-sm font-medium leading-6 text-green-950">{nextActionNote?.body || displayInsights.nextStep}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
                                            <Activity className="h-3.5 w-3.5" />
                                            Intent
                                        </div>
                                        <div className="mt-2 text-sm font-semibold leading-5 text-gray-950">{customerIntentNote?.body || displayInsights.interest}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
                                            <MessageSquare className="h-3.5 w-3.5" />
                                            Messages
                                        </div>
                                        <div className="mt-2 text-sm font-semibold text-gray-950">{salesInsights.inboundCount} client / {salesInsights.outboundCount} agent</div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="text-sm font-semibold text-gray-900">Main topics</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {displayInsights.topics.map((topic) => (
                                            <span key={topic} className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                                                {topic}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="text-sm font-semibold text-gray-900">Captured client info</div>
                                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                                        <InfoRow label="Name" value={customFields.captured_name || aiCapturedInfo.name || displayName || 'Not shared'} />
                                        <InfoRow label="Email" value={customFields.captured_email || extractedInfo.email || aiCapturedInfo.email || 'Not shared'} />
                                        <InfoRow label="Phone" value={customFields.captured_phone || aiCapturedInfo.phone || phoneDisplay || 'Not shared'} />
                                        <InfoRow label="Follow-up" value={customFields.follow_up_time || extractedInfo.followUp || 'Not shared'} />
                                        <InfoRow label="Amount" value={customFields.captured_amount || extractedInfo.amount || 'Not shared'} />
                                    </div>
                                    {autoSaveStatus ? <div className="mt-3 text-xs text-gray-500">{autoSaveStatus}</div> : null}
                                </div>

                                {displayInsights.objections.length ? (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                                            <BadgeInfo className="h-4 w-4" />
                                            Watch points
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {displayInsights.objections.map((item) => (
                                                <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                                                <Sparkles className="h-4 w-4 text-green-600" />
                                                Analysis notes
                                            </div>
                                            <p className="mt-1 text-xs text-gray-500">Structured notes generated by n8n/AI analysis.</p>
                                        </div>
                                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{aiNotes.length} AI</span>
                                    </div>

                                    {aiNotes.length ? (
                                        <div className="mt-4 space-y-3">
                                            {aiNotes.map((note, index) => (
                                                <InsightNoteCard key={note.id || `${note.note_type}-${index}`} note={note} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500">
                                            No AI analysis notes yet.
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <StickyNote className="h-4 w-4 text-green-600" />
                                        Private notes
                                    </div>
                                    <textarea
                                        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                                        rows={4}
                                        value={noteDraft}
                                        onChange={(e) => setNoteDraft(e.target.value)}
                                        placeholder="Add a private note about this contact..."
                                    />
                                    <button
                                        onClick={saveManualNote}
                                        disabled={isSavingNote || !noteDraft.trim()}
                                        className="mt-3 w-full bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        {isSavingNote ? 'Saving...' : 'Save note'}
                                    </button>
                                </div>

                                {manualNotes.length || humanDbNotes.length ? (
                                    <div className="space-y-3">
                                        {humanDbNotes.map((note, index) => (
                                            <InsightNoteCard key={note.id || `human-${index}`} note={note} />
                                        ))}
                                        {manualNotes.map((note, index) => (
                                            <div key={`${note.at || 'note'}-${index}`} className="rounded-xl border border-yellow-100 bg-yellow-50 p-4">
                                                <p className="text-sm leading-6 text-gray-800">{note.text}</p>
                                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                                    <Clock className="h-3 w-3" />
                                                    {note.at ? format(new Date(note.at), 'MMM d, h:mm a') : 'Saved note'} by {note.author || 'You'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-500">
                                        No manual notes yet.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function InfoRow({ label, value }) {
    return (
        <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-3">
            <span className="text-gray-500">{label}</span>
            <span className="min-w-0 break-words text-right font-medium text-gray-900">{value}</span>
        </div>
    )
}

function MetricTile({ label, value, tone = 'border-gray-200 bg-white text-gray-900' }) {
    return (
        <div className={`min-w-0 rounded-lg border px-3 py-2 ${tone}`}>
            <div className="truncate text-[11px] font-semibold uppercase opacity-70">{label}</div>
            <div className="mt-1 truncate text-sm font-bold">{value || '-'}</div>
        </div>
    )
}

function InsightNoteCard({ note, compact = false }) {
    const Icon = note.Icon || StickyNote
    const createdAt = note.createdAt ? new Date(note.createdAt) : null
    const createdLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? format(createdAt, 'MMM d, h:mm a') : ''
    const sourceLabel = note.source ? prettifyLabel(note.source) : ''
    const stage = note.metadata?.customer_stage
    const quality = note.metadata?.lead_quality

    return (
        <div className={`rounded-lg border bg-white ${compact ? 'p-3' : 'p-4'} ${note.accent || 'border-gray-100'}`}>
            <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${note.accent || 'border-gray-100 bg-gray-50 text-gray-600'}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-gray-950">{note.title}</div>
                        {sourceLabel ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{sourceLabel}</span> : null}
                    </div>
                    <p className={`${compact ? 'mt-1 text-xs leading-5' : 'mt-2 text-sm leading-6'} text-gray-700`}>{note.body}</p>
                    {(stage || quality || createdLabel) ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-gray-500">
                            {quality ? <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-gray-200">Quality: {prettifyLabel(quality)}</span> : null}
                            {stage ? <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-gray-200">Stage: {prettifyLabel(stage)}</span> : null}
                            {createdLabel ? <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-gray-200"><Clock className="h-3 w-3" />{createdLabel}</span> : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
