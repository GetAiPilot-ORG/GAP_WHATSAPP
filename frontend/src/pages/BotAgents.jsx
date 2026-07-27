import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { Dialog as HeadlessDialog, Transition as HeadlessTransition } from '@headlessui/react'
import {
    AlertCircle,
    ChevronDown,
    Loader2,
} from 'lucide-react'
import {
    ArrowRight,
    Brain,
    Check,
    ChatCircleText,
    Database,
    FileText,
    GearSix,
    Key,
    MagnifyingGlass,
    Plus,
    Robot,
    ShieldCheck,
    Sparkle,
    Target,
    Trash,
    UploadSimple,
    X,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { FALLBACK_PLANS } from '../config/whatsappPricing'
import TourButton from '../onboarding/TourButton'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const MODELS = [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', helper: 'Fast support replies' },
]

const defaultAgent = {
    id: null,
    name: '',
    description: '',
    model: 'gpt-4o-mini',
    temperature: 0.6,
    triggerKeywords: '',
    systemPrompt: '',
    isActive: true,
    selectedKnowledgeIds: [],
    automation: {
        reply_on_keywords: true,
        auto_reply_unknown: true,
        default_for_new_chats: false,
        handoff_on_human_reply: true,
    },
}

const settingsType = '__agent_settings'
const getDocCharCount = (doc) => Number(doc?.character_count ?? String(doc?.content || '').length ?? 0)

export default function BotAgents() {
    const { session, apiCall, user } = useAuth()
    const { alertDialog, confirmDialog } = useDialog()
    const [agents, setAgents] = useState([])
    const [knowledgeDocs, setKnowledgeDocs] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [fetchError, setFetchError] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
    const [showApiSettings, setShowApiSettings] = useState(false)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [draft, setDraft] = useState(defaultAgent)
    const [isSaving, setIsSaving] = useState(false)
    const [query, setQuery] = useState('')
    const [uploadingKb, setUploadingKb] = useState(false)
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmLabel: '',
        cancelLabel: '',
        tone: 'info',
        onConfirm: () => { },
    })
    const fileInputRef = useRef(null)

    const authHeaders = useMemo(() => ({
        Authorization: `Bearer ${session?.access_token}`,
    }), [session?.access_token])

    const getAgentMeta = (agent) => {
        const entries = Array.isArray(agent.knowledge_base_content) ? agent.knowledge_base_content : []
        const item = entries.find(entry => entry?.type === settingsType) || {}
        const settings = item.settings || {}
        const trainedItems = entries.filter(entry => entry?.type !== settingsType)
        return {
            automation: {
                reply_on_keywords: settings.reply_on_keywords !== false,
                auto_reply_unknown: settings.auto_reply_unknown === true,
                default_for_new_chats: settings.default_for_new_chats === true,
                handoff_on_human_reply: settings.handoff_on_human_reply !== false,
            },
            selectedKnowledgeIds: item.selected_knowledge_document_ids || trainedItems.map(entry => entry.id).filter(Boolean),
            trainedAt: item.trained_at || agent.created_at || null,
            documentCount: item.training?.document_count ?? trainedItems.length,
            characterCount: item.training?.character_count ?? trainedItems.reduce((sum, entry) => sum + String(entry?.content || '').length, 0),
        }
    }

    const normalizeAgent = (agent) => {
        const meta = getAgentMeta(agent)
        return {
            id: agent.id,
            name: agent.name || '',
            description: agent.description || '',
            isActive: agent.is_active !== false,
            knowledgeBase: agent.knowledge_base || [],
            knowledgeBaseContent: agent.knowledge_base_content || [],
            triggerKeywords: agent.trigger_keywords || [],
            model: agent.model || 'gpt-4o-mini',
            temperature: Number(agent.temperature ?? 0.6),
            systemPrompt: agent.system_prompt || '',
            ...meta,
        }
    }

    const fetchAgents = async () => {
        if (!session?.access_token) return
        try {
            setFetchError('')
            const res = await apiCall(`${API_BASE}/agents`)
            const data = await res.json().catch(() => [])
            if (!res.ok) throw new Error(data?.error || 'Failed to fetch agents')
            setAgents((Array.isArray(data) ? data : []).map(normalizeAgent))
        } catch (err) {
            setFetchError(err.message || 'Failed to load agents')
        }
    }

    const fetchKnowledgeBase = async () => {
        if (!session?.access_token) return
        const res = await apiCall(`${API_BASE}/settings/knowledge-base`)
        const data = await res.json().catch(() => ({}))
        if (res.ok) setKnowledgeDocs(data.documents || [])
    }

    const fetchApiSettings = async () => {
        if (!session?.access_token) return
        const res = await apiCall(`${API_BASE}/settings/openai`)
        const data = await res.json().catch(() => ({}))
        if (res.ok) setApiKeyConfigured(Boolean(data.configured || data.hasEnvKey))
    }

    const refreshAll = async () => {
        setIsLoading(true)
        await Promise.all([fetchAgents(), fetchKnowledgeBase(), fetchApiSettings()])
        setIsLoading(false)
    }

    useEffect(() => {
        refreshAll()
    }, [session?.access_token])

    const stats = useMemo(() => {
        const active = agents.filter(agent => agent.isActive).length
        const unknown = agents.filter(agent => agent.automation.auto_reply_unknown || agent.automation.default_for_new_chats).length
        const trainedChars = agents.reduce((sum, agent) => sum + Number(agent.characterCount || 0), 0)
        return { total: agents.length, active, unknown, trainedChars }
    }, [agents])

    const currentPlanName = user?.plan || 'No active plan'
    const normalizedPlanName = currentPlanName.toLowerCase()
    const currentPlanConfig = useMemo(() => {
        let lookupKey = normalizedPlanName
        if (
            normalizedPlanName.includes('gap max') || 
            normalizedPlanName.includes('gap core') || 
            normalizedPlanName.includes('gap pro')
        ) {
            lookupKey = 'pro'
        } else if (
            normalizedPlanName.includes('free trial') || 
            normalizedPlanName.includes('trial')
        ) {
            lookupKey = 'starter'
        }
        return FALLBACK_PLANS.find(p => 
            lookupKey.includes(p.id.toLowerCase()) || 
            lookupKey.includes(p.name.toLowerCase())
        )
    }, [normalizedPlanName])
    const aiAgentLimit = currentPlanConfig?.limits?.ai_agents ?? 0
    const isLimitReached = aiAgentLimit !== -1 && agents.length >= aiAgentLimit

    const filteredAgents = agents.filter(agent => {
        const haystack = [agent.name, agent.description, agent.model, ...(agent.triggerKeywords || []), ...(agent.knowledgeBase || [])].join(' ').toLowerCase()
        return !query.trim() || haystack.includes(query.trim().toLowerCase())
    })
    const hasAgents = agents.length > 0
    const setupSteps = [
        { title: 'Add business knowledge', helper: `${knowledgeDocs.length} docs ready`, done: knowledgeDocs.length > 0 },
        { title: 'Create first agent', helper: hasAgents ? `${agents.length} agents created` : 'Click Create Agent', done: hasAgents },
        { title: 'Turn on auto replies', helper: stats.unknown > 0 ? `${stats.unknown} ready` : 'Enable unknown chats', done: stats.unknown > 0 },
    ]

    const openCreate = () => {
        setDraft({
            ...defaultAgent,
            selectedKnowledgeIds: knowledgeDocs.map(doc => doc.id),
        })
        setDrawerOpen(true)
    }

    const openEdit = (agent) => {
        setDraft({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            model: agent.model,
            temperature: agent.temperature,
            triggerKeywords: (agent.triggerKeywords || []).join(', '),
            systemPrompt: agent.systemPrompt,
            isActive: agent.isActive,
            selectedKnowledgeIds: agent.selectedKnowledgeIds || [],
            automation: { ...defaultAgent.automation, ...agent.automation },
        })
        setDrawerOpen(true)
    }

    const selectedDocs = knowledgeDocs.filter(doc => draft.selectedKnowledgeIds.includes(doc.id))
    const selectedCharacters = selectedDocs.reduce((sum, doc) => sum + getDocCharCount(doc), 0)

    const buildPayload = () => ({
        name: draft.name.trim(),
        description: draft.description.trim(),
        model: draft.model,
        temperature: Number(draft.temperature),
        trigger_keywords: draft.triggerKeywords.split(',').map(item => item.trim()).filter(Boolean),
        system_prompt: draft.systemPrompt.trim(),
        selected_knowledge_document_ids: draft.selectedKnowledgeIds,
        automation_settings: draft.automation,
        is_active: draft.isActive,
    })

    const saveAgent = () => {
        if (!draft.name.trim()) return
        const isEditing = Boolean(draft.id)
        setConfirmModal({
            isOpen: true,
            title: isEditing ? 'Save changes?' : 'Create agent?',
            message: isEditing
                ? `Are you sure you want to save the updated settings and re-train the agent "${draft.name}"?`
                : `Are you sure you want to create and train the new agent "${draft.name}"?`,
            confirmLabel: isEditing ? 'Save & Train' : 'Create & Train',
            cancelLabel: 'Cancel',
            tone: 'info',
            onConfirm: () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }))
                executeSaveAgent()
            }
        })
    }

    const executeSaveAgent = async () => {
        setIsSaving(true)
        try {
            const res = await apiCall(`${API_BASE}/agents${draft.id ? `/${draft.id}` : ''}`, {
                method: draft.id ? 'PATCH' : 'POST',
                body: JSON.stringify(buildPayload()),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to save agent')
            setDrawerOpen(false)
            await fetchAgents()
        } catch (err) {
            alertDialog(err.message || 'Failed to save agent', { title: 'Could not save agent', tone: 'danger' })
        } finally {
            setIsSaving(false)
        }
    }

    const toggleAgentStatus = async (agent) => {
        const res = await apiCall(`${API_BASE}/agents/${agent.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: !agent.isActive }),
        })
        if (res.ok) setAgents(prev => prev.map(item => item.id === agent.id ? { ...item, isActive: !item.isActive } : item))
    }

    const deleteAgent = (agent) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete agent?',
            message: `Are you sure you want to delete ${agent.name}? This action is permanent and cannot be undone.`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            tone: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }))
                try {
                    const res = await apiCall(`${API_BASE}/agents/${agent.id}`, { method: 'DELETE' })
                    if (res.ok) {
                        setAgents(prev => prev.filter(item => item.id !== agent.id))
                    } else {
                        const data = await res.json().catch(() => ({}))
                        alertDialog(data.error || 'Failed to delete agent', { title: 'Delete failed', tone: 'danger' })
                    }
                } catch (err) {
                    alertDialog(err.message || 'Failed to delete agent', { title: 'Delete failed', tone: 'danger' })
                }
            }
        })
    }

    const saveApiKey = async () => {
        if (!apiKey.trim()) {
            await alertDialog('Please enter an API key.', { title: 'API key required', tone: 'warning' })
            return
        }
        setIsSaving(true)
        try {
            const res = await apiCall(`${API_BASE}/settings/openai`, {
                method: 'POST',
                body: JSON.stringify({ api_key: apiKey }),
            })
            if (!res.ok) throw new Error('Failed to save API key')
            setApiKey('')
            setApiKeyConfigured(true)
            setShowApiSettings(false)
        } finally {
            setIsSaving(false)
        }
    }

    const uploadKnowledgeFiles = async (files) => {
        const list = Array.from(files || [])
        if (!list.length) return
        setUploadingKb(true)
        try {
            for (const file of list) {
                const formData = new FormData()
                formData.append('file', file)
                const res = await fetch(`${API_BASE}/settings/knowledge-base`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: formData,
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}`)
            }
            await fetchKnowledgeBase()
        } catch (err) {
            alertDialog(err.message || 'Failed to upload knowledge', { title: 'Upload failed', tone: 'danger' })
        } finally {
            setUploadingKb(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
        )
    }

    return (
        <div className="min-h-full bg-[#f5f7fa]  sm:px-4 lg:px-7">
            <div className="space-y-5">
                <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-2xl">
                            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0064b7]">
                                <Sparkle size={14} weight="fill" />
                                WhatsApp AI setup
                            </div>
                            <h1 className="mt-3 text-2xl font-semibold leading-tight text-gray-950 sm:text-3xl">Bot Agents</h1>
                            <p className="mt-2 text-sm leading-6 text-gray-600">Aapke WhatsApp ke liye trained assistant. Pehle docs add karo, phir ek agent create karo, aur auto replies on kar do.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:items-center sm:w-auto">
                            <span className="hidden sm:inline-block"><TourButton /></span>
                            <button onClick={refreshAll} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]">
                                <Database size={18} weight="duotone" />
                                Sync
                            </button>
                            <button data-tour="agents-api" onClick={() => setShowApiSettings(true)} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all active:scale-[0.98] ${apiKeyConfigured ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                <Key size={18} weight="duotone" />
                                API Settings
                                {apiKeyConfigured ? <Check size={16} weight="bold" /> : null}
                            </button>
                            <div className="col-span-2 sm:col-span-1">
                                <button
                                    onClick={openCreate}
                                    data-tour="agents-create"
                                    disabled={isLimitReached}
                                    title={isLimitReached ? `AI agent limit reached for ${currentPlanName} plan (${agents.length}/${aiAgentLimit}). Upgrade your plan to add more.` : 'Click here to create your first agent'}
                                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] ${isLimitReached ? 'cursor-not-allowed bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                                >
                                    <Plus size={18} weight="bold" />
                                    {hasAgents ? 'Create Agent' : 'Create first agent'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        {setupSteps.map((step, index) => (
                            <div key={step.title} className={`flex items-start gap-3 rounded-lg border p-3 ${step.done ? 'border-green-200 bg-green-50' : 'border-blue-100 bg-blue-50/60'}`}>
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-green-600 text-white' : 'bg-white text-[#0064b7] ring-1 ring-blue-100'}`}>
                                    {step.done ? <Check size={15} weight="bold" /> : index + 1}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-gray-950">{step.title}</span>
                                    <span className="mt-0.5 block text-xs text-gray-600">{step.helper}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {fetchError ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4" />
                        <span>{fetchError}</span>
                    </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                    <StatCard icon={Robot} label="Agents" value={stats.total} helper="Total trained bots" />
                    <StatCard icon={Check} label="Active" value={stats.active} helper="Replying now" />
                    <StatCard icon={ShieldCheck} label="Auto reply ready" value={stats.unknown} helper="New chats covered" />
                    <StatCard icon={Database} label="Trained text" value={stats.trainedChars.toLocaleString()} helper="Knowledge used" />
                </div>

                <div className="grid gap-4 2xl:grid-cols-[1fr_360px]">
                    <section data-tour="agents-list" className="rounded-lg border border-gray-200 bg-white">
                        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
                            <div className="relative flex-1">
                                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search agents, keywords, docs..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20" />
                            </div>
                            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                <Database size={16} weight="duotone" />
                                {knowledgeDocs.length} synced knowledge docs
                            </div>
                        </div>
                        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                            {filteredAgents.length === 0 ? (
                                <EmptyAgentsState hasAgents={hasAgents} query={query} onCreate={openCreate} isLimitReached={isLimitReached} />
                            ) : filteredAgents.map(agent => (
                                <AgentCard key={agent.id} agent={agent} onEdit={openEdit} onToggle={toggleAgentStatus} onDelete={deleteAgent} />
                            ))}
                        </div>
                    </section>

                    <aside className="space-y-4">
                        <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                            <div className="flex gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#0064b7] ring-1 ring-blue-100">
                                    <Target size={20} weight="duotone" />
                                </span>
                                <div>
                                    <h2 className="font-semibold text-gray-950">Quick guide</h2>
                                    <p className="mt-1 text-sm leading-5 text-gray-600">Non-tech flow simple rakho: docs upload, agent create, phir unknown chats ko auto reply.</p>
                                </div>
                            </div>
                            <button onClick={openCreate} disabled={isLimitReached} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0070d1] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#0064b7] disabled:bg-gray-400">
                                Click here to create first agent
                                <ArrowRight size={16} weight="bold" />
                            </button>
                        </section>

                        <section data-tour="agents-knowledge" className="rounded-lg border border-gray-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="font-bold text-gray-950">Knowledge sync</h2>
                                    <p className="mt-1 text-xs text-gray-500">Docs uploaded in Settings are selectable while training agents.</p>
                                </div>
                                <Database size={22} weight="duotone" className="text-gray-400" />
                            </div>
                            <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json" className="hidden" onChange={event => uploadKnowledgeFiles(event.target.files)} />
                            <button onClick={() => fileInputRef.current?.click()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 hover:border-green-300 hover:bg-green-50">
                                {uploadingKb ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadSimple size={18} weight="bold" />}
                                {uploadingKb ? 'Indexing...' : 'Upload and index docs'}
                            </button>
                            <div className="mt-4 space-y-2">
                                {knowledgeDocs.slice(0, 5).map(doc => (
                                    <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                        <FileText size={18} weight="duotone" className="text-gray-400" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold text-gray-800">{doc.name}</div>
                                            <div className="text-xs text-gray-400">{doc.size_label} - {getDocCharCount(doc).toLocaleString()} chars</div>
                                        </div>
                                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">{doc.status || 'INDEXED'}</span>
                                    </div>
                                ))}
                                {knowledgeDocs.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                                        Upload FAQ, pricing, services, or product docs. Agent isi knowledge se answer karega.
                                    </div>
                                ) : null}
                            </div>
                        </section>

                        <section className="rounded-lg border border-green-200 bg-green-50 p-4">
                            <div className="flex gap-3">
                                <Sparkle size={22} weight="duotone" className="mt-0.5 text-green-700" />
                                <div>
                                    <h3 className="font-bold text-green-950">Recommended automation</h3>
                                    <p className="mt-1 text-sm text-green-800">Keep one active agent as default for new chats. Unknown numbers will get an instant knowledge-backed reply without manually opening the chat.</p>
                                </div>
                            </div>
                        </section>
                    </aside>
                </div>
            </div>

            {drawerOpen ? (
                <AgentDrawer
                    draft={draft}
                    setDraft={setDraft}
                    docs={knowledgeDocs}
                    models={MODELS}
                    selectedDocs={selectedDocs}
                    selectedCharacters={selectedCharacters}
                    onClose={() => setDrawerOpen(false)}
                    onSave={saveAgent}
                    isSaving={isSaving}
                />
            ) : null}

            {showApiSettings ? (
                <ApiKeyModal apiKey={apiKey} setApiKey={setApiKey} configured={apiKeyConfigured} isSaving={isSaving} onClose={() => setShowApiSettings(false)} onSave={saveApiKey} />
            ) : null}

            <AppleVercelConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmLabel={confirmModal.confirmLabel}
                cancelLabel={confirmModal.cancelLabel}
                tone={confirmModal.tone}
                onConfirm={confirmModal.onConfirm}
            />
        </div>
    )
}

function AgentCard({ agent, onEdit, onToggle, onDelete }) {
    const automationLabel = agent.automation.default_for_new_chats
        ? 'Default for new chats'
        : agent.automation.auto_reply_unknown
            ? 'Unknown chats ready'
            : 'Keyword only'

    return (
        <div className="group rounded-lg border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/20">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${agent.isActive ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-50 text-gray-400 ring-gray-200'}`}>
                        <Robot size={24} weight="duotone" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="truncate font-bold text-gray-950">{agent.name}</h3>
                        <p className="text-xs text-gray-500">{agent.model} - Temp {agent.temperature}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button onClick={() => onToggle(agent)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${agent.isActive ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'}`} title={agent.isActive ? 'Pause agent' : 'Activate agent'}>
                        <span className={`h-2 w-2 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {agent.isActive ? 'Active' : 'Paused'}
                    </button>
                    <button onClick={() => onDelete(agent)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete">
                        <Trash size={17} weight="duotone" />
                    </button>
                </div>
            </div>
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <ChatCircleText size={16} weight="duotone" className="text-[#0064b7]" />
                    {automationLabel}
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500">Customer message aane par ye bot selected rules ke hisaab se reply karega.</p>
            </div>
            <p className="mt-4 line-clamp-3 min-h-[60px] text-sm leading-5 text-gray-600">{agent.description || 'No description yet.'}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <MiniMetric label="Docs" value={agent.documentCount || 0} />
                <MiniMetric label="Chars" value={Number(agent.characterCount || 0).toLocaleString()} />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
                {(agent.triggerKeywords || []).slice(0, 4).map(keyword => <span key={keyword} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{keyword}</span>)}
                {agent.automation.auto_reply_unknown ? <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">unknown auto</span> : null}
                {agent.automation.default_for_new_chats ? <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700">default</span> : null}
            </div>
            <button onClick={() => onEdit(agent)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#0064b7]">
                <GearSix size={18} weight="duotone" />
                Configure agent
            </button>
        </div>
    )
}

function EmptyAgentsState({ hasAgents, query, onCreate, isLimitReached }) {
    return (
        <div className="col-span-full rounded-lg border border-dashed border-blue-200 bg-blue-50/60 p-6 text-center sm:p-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[#0064b7] ring-1 ring-blue-100">
                <Robot size={26} weight="duotone" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-950">{hasAgents ? 'No matching agents found' : 'Create your first WhatsApp agent'}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-600">
                {hasAgents
                    ? `No agent matches "${query}". Try a different name, keyword, or document search.`
                    : 'Start simple: create one support agent, attach your docs, and enable auto replies for new chats.'}
            </p>
            {!hasAgents ? (
                <button onClick={onCreate} disabled={isLimitReached} className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0070d1] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0064b7] disabled:bg-gray-400">
                    <Plus size={18} weight="bold" />
                    Click here to create first agent
                </button>
            ) : null}
        </div>
    )
}

function AgentDrawer({ draft, setDraft, docs, models, selectedDocs, selectedCharacters, onClose, onSave, isSaving }) {
    const toggleDoc = (id) => {
        setDraft(prev => ({
            ...prev,
            selectedKnowledgeIds: prev.selectedKnowledgeIds.includes(id)
                ? prev.selectedKnowledgeIds.filter(item => item !== id)
                : [...prev.selectedKnowledgeIds, id],
        }))
    }

    const updateAutomation = (key, value) => setDraft(prev => ({ ...prev, automation: { ...prev.automation, [key]: value } }))
    const selectAllDocs = () => setDraft(prev => ({ ...prev, selectedKnowledgeIds: docs.map(doc => doc.id) }))
    const clearDocs = () => setDraft(prev => ({ ...prev, selectedKnowledgeIds: [] }))

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-gray-950/30 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute inset-y-0 right-0 flex w-full max-w-4xl flex-col bg-white shadow-2xl">
                <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-green-700">{draft.id ? 'Configure agent' : 'Create bot agent'}</div>
                            <h2 className="mt-1 text-xl font-bold text-gray-950 sm:text-2xl">{draft.id ? draft.name : 'Train a new WhatsApp bot'}</h2>
                            <p className="mt-1 text-sm text-gray-500">Attach saved knowledge, choose trigger rules, and control automatic replies.</p>
                        </div>
                        <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
                            <X size={20} weight="bold" />
                        </button>
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="text-[10px] font-bold uppercase text-gray-400">Status</div>
                            <div className="mt-1 text-sm font-bold text-gray-900">{draft.isActive ? 'Active' : 'Paused'}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="text-[10px] font-bold uppercase text-gray-400">Knowledge</div>
                            <div className="mt-1 text-sm font-bold text-gray-900">{selectedDocs.length} docs</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="text-[10px] font-bold uppercase text-gray-400">Automation</div>
                            <div className="mt-1 text-sm font-bold text-gray-900">{draft.automation.auto_reply_unknown || draft.automation.default_for_new_chats ? 'Auto-ready' : 'Keyword only'}</div>
                        </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                        <div className="flex flex-col gap-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                            <span className="font-semibold text-gray-950">Setup guide</span>
                            <span>1. Profile</span>
                            <span>2. Auto replies</span>
                            <span>3. Knowledge</span>
                            <span>4. Save and train</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-5">
                    <div className="space-y-4">
                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                            <SectionTitle title="Profile" subtitle="Simple naam aur role likho. Customer ko ye ek helpful team member jaisa lagega." />
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Agent name"><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className="field-input" placeholder="Customer Support Bot" /></Field>
                                <Field label="Model"><CustomSelect value={draft.model} onChange={value => setDraft({ ...draft, model: value })} options={models} /></Field>
                            </div>
                            <Field label="Description" className="mt-4"><textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} rows={5} className="field-input min-h-28 resize-y leading-6" placeholder="Example: Answers pricing, services, timings, and booking questions politely." /></Field>
                            <Field label={`Temperature (${draft.temperature})`} className="mt-4">
                                <input type="range" min="0" max="2" step="0.1" value={draft.temperature} onChange={event => setDraft({ ...draft, temperature: parseFloat(event.target.value) })} className="w-full accent-green-600" />
                                <div className="mt-1 flex justify-between text-xs text-gray-500"><span>Precise</span><span>Creative</span></div>
                            </Field>
                        </section>

                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <SectionTitle title="Automation policy" subtitle="Yahan decide hota hai bot kab reply karega. Start ke liye unknown chats on rakhna best hai." />
                                <Toggle checked={draft.isActive} onChange={value => setDraft({ ...draft, isActive: value })} label={draft.isActive ? 'Active' : 'Inactive'} />
                            </div>
                            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                                <PolicyToggle title="Reply on trigger keywords" description="Use keywords like help, price, support." checked={draft.automation.reply_on_keywords} onChange={value => updateAutomation('reply_on_keywords', value)} />
                                <PolicyToggle title="Auto reply unknown numbers" description="Reply when a new number messages first." checked={draft.automation.auto_reply_unknown} onChange={value => updateAutomation('auto_reply_unknown', value)} />
                                <PolicyToggle title="Default for new chats" description="Use this bot if no keyword matches." checked={draft.automation.default_for_new_chats} onChange={value => updateAutomation('default_for_new_chats', value)} />
                                <PolicyToggle title="Pause after human reply" description="Keep human handoff clean." checked={draft.automation.handoff_on_human_reply} onChange={value => updateAutomation('handoff_on_human_reply', value)} />
                            </div>
                            <Field label="Trigger keywords" className="mt-4"><input value={draft.triggerKeywords} onChange={event => setDraft({ ...draft, triggerKeywords: event.target.value })} className="field-input" placeholder="help, support, price, booking, demo" /></Field>
                        </section>

                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <SectionTitle title="Knowledge Base training" subtitle="Select indexed documents. Saving trains this agent with selected content." />
                                <div className="rounded-lg bg-green-50 px-3 py-2 text-right">
                                    <div className="text-xs font-medium text-green-700">Selected</div>
                                    <div className="text-sm font-bold text-green-950">{selectedDocs.length} docs - {selectedCharacters.toLocaleString()} chars</div>
                                </div>
                            </div>
                            <div className="mb-3 flex gap-2">
                                <button type="button" onClick={selectAllDocs} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">Select all</button>
                                <button type="button" onClick={clearDocs} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">Clear</button>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                                {docs.length === 0 ? (
                                    <div className="col-span-full rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No saved knowledge documents yet. Upload from Settings or the sync panel.</div>
                                ) : docs.map(doc => {
                                    const checked = draft.selectedKnowledgeIds.includes(doc.id)
                                    return (
                                        <button key={doc.id} type="button" onClick={() => toggleDoc(doc.id)} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${checked ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${checked ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                {checked ? <Check size={17} weight="bold" /> : <FileText size={18} weight="duotone" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-bold text-gray-900">{doc.name}</div>
                                                <div className="text-xs text-gray-500">{doc.size_label} - {getDocCharCount(doc).toLocaleString()} chars</div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </section>

                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                            <SectionTitle title="System prompt" subtitle="Core behavior rules. Keep this human, specific, and aligned with your business." />
                            <textarea value={draft.systemPrompt} onChange={event => setDraft({ ...draft, systemPrompt: event.target.value })} rows={9} className="field-input mt-4 min-h-56 resize-y font-mono leading-6" placeholder="You are a helpful WhatsApp assistant. Use the knowledge base and answer naturally..." />
                        </section>
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                    <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button onClick={onSave} disabled={!draft.name.trim() || isSaving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain size={18} weight="duotone" />}
                        {isSaving ? 'Training...' : 'Save and train'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ApiKeyModal({ apiKey, setApiKey, configured, isSaving, onClose, onSave }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-gray-200 p-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-950">OpenAI API Settings</h2>
                        <p className="mt-1 text-sm text-gray-500">Required for trained agents to generate replies.</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={20} weight="bold" /></button>
                </div>
                <div className="space-y-4 p-6">
                    {configured ? <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">API key is configured. Add a new one only if you want to replace it.</div> : null}
                    <Field label="OpenAI API key"><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} className="field-input font-mono" placeholder="sk-..." /></Field>
                </div>
                <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
                    <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button onClick={onSave} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={18} weight="bold" />}
                        Save key
                    </button>
                </div>
            </div>
        </div>
    )
}

function StatCard({ icon, label, value, helper }) {
    const IconComponent = icon
    return (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-500">{label}</div>
                <IconComponent size={18} weight="duotone" className="text-gray-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-950">{value}</div>
            {helper ? <div className="mt-1 text-xs text-gray-500">{helper}</div> : null}
        </div>
    )
}

function MiniMetric({ label, value }) {
    return <div className="rounded-lg bg-gray-50 px-3 py-2"><div className="text-[10px] font-bold uppercase text-gray-400">{label}</div><div className="font-bold text-gray-900">{value}</div></div>
}

function Field({ label, children, className = '' }) {
    return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>{children}</label>
}

function SectionTitle({ title, subtitle }) {
    return (
        <div>
            <h3 className="font-bold text-gray-950">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs leading-5 text-gray-500">{subtitle}</p> : null}
        </div>
    )
}

function Toggle({ checked, onChange, label }) {
    return (
        <button type="button" onClick={() => onChange(!checked)} className={`inline-flex h-7 items-center gap-2 rounded-full border px-1.5 pr-2.5 text-xs font-bold transition ${checked ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
            <span className={`relative inline-flex h-[18px] w-8 items-center rounded-full transition ${checked ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            <span>{label}</span>
        </button>
    )
}

function PolicyToggle({ title, description, checked, onChange }) {
    return (
        <div className={`flex flex-col gap-3 px-4 py-3 transition sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${checked ? 'bg-green-50/70' : 'bg-white'}`}>
            <div className="min-w-0">
                <div className="font-bold text-gray-950">{title}</div>
                <p className="mt-1 text-sm text-gray-500">{description}</p>
            </div>
            <Toggle checked={checked} onChange={onChange} label={checked ? 'On' : 'Off'} />
        </div>
    )
}

function CustomSelect({ value, onChange, options }) {
    const [open, setOpen] = useState(false)
    const selected = options.find(option => option.value === value) || options[0]
    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                className="w-full apple-select-trigger"
                style={{ height: '42px' }}
            >
                <span className="min-w-0 text-left">
                    <span className="block truncate text-[#1d1d1f]">{selected?.label}</span>
                    {selected?.helper ? <span className="block truncate text-[9.5px] font-medium text-gray-400 leading-tight">{selected.helper}</span> : null}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-505 transition ${open ? 'rotate-180 text-gray-800' : ''}`} />
            </button>
            {open ? (
                <div className="absolute z-[80] mt-1 max-h-72 w-full overflow-y-auto apple-select-dropdown wa-chat-scroll">
                    {options.map(option => {
                        const active = option.value === value
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => { onChange(option.value); setOpen(false) }}
                                className={`apple-select-option ${active ? 'apple-select-option-selected' : ''}`}
                            >
                                <span className="min-w-0 text-left">
                                    <span className="block truncate">{option.label}</span>
                                    {option.helper ? <span className="block truncate text-[10px] text-gray-405 leading-tight mt-0.5">{option.helper}</span> : null}
                                </span>
                                {active ? <Check size={16} weight="bold" className="shrink-0 text-black ml-2" /> : null}
                            </button>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

function AppleVercelConfirmModal({ isOpen, onClose, title, message, confirmLabel, cancelLabel, tone = 'info', onConfirm }) {
    return (
        <HeadlessTransition show={isOpen} as={Fragment}>
            <HeadlessDialog as="div" className="relative z-[100]" onClose={onClose}>
                <HeadlessTransition.Child
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-[6px]" />
                </HeadlessTransition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <HeadlessTransition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <HeadlessDialog.Panel className="w-full max-w-[360px] transform overflow-hidden rounded-2xl border border-neutral-100/90 bg-white p-6 text-center shadow-[0_24px_50px_-12px_rgba(0,0,0,0.15)] transition-all">
                                <HeadlessDialog.Title as="h3" className="text-lg font-semibold text-neutral-900 tracking-tight leading-6">
                                    {title}
                                </HeadlessDialog.Title>
                                <p className="mt-2 text-sm text-neutral-500 leading-relaxed font-normal">
                                    {message}
                                </p>

                                <div className="mt-6 flex items-center gap-2.5">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-neutral-600 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 hover:text-neutral-900 active:bg-neutral-100 transition-colors duration-150 outline-none"
                                    >
                                        {cancelLabel || 'Cancel'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onConfirm}
                                        className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white border border-transparent rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all duration-150 outline-none ${tone === 'danger'
                                            ? 'bg-red-600 hover:bg-red-500 active:bg-red-700'
                                            : 'bg-black hover:bg-neutral-900 active:bg-neutral-800'
                                            }`}
                                    >
                                        {confirmLabel || 'Confirm'}
                                    </button>
                                </div>
                            </HeadlessDialog.Panel>
                        </HeadlessTransition.Child>
                    </div>
                </div>
            </HeadlessDialog>
        </HeadlessTransition>
    )
}
