import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit2, Trash2, Play, Copy, Pause, TrendingUp, Zap, Activity, X, LayoutTemplate, Star, Search, Sparkles, Clock, Layers, CheckCircle2, Smartphone, ShieldCheck, QrCode, Info, ChevronRight, MessageSquare, LifeBuoy, Send, MoreHorizontal, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import FlowEditor from '../components/flow-builder/FlowEditor';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { notify } from '../services/notificationService';
import { FLOW_TEMPLATE_CATEGORIES, FLOW_TEMPLATES, buildFlowFromTemplate } from '../components/flow-builder/flowTemplates';
import TourButton from '../onboarding/TourButton';

function FlowBuilderLoading() {
    return (
        <div className="space-y-5 p-3 sm:p-5 lg:p-6" role="status" aria-label="Loading flows">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
                    <div className="h-4 w-72 max-w-[70vw] animate-pulse rounded bg-gray-100" />
                </div>
                <div className="h-10 w-32 animate-pulse rounded-xl bg-gray-200" />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
                <div className="h-36 animate-pulse rounded-2xl bg-blue-50" />
                <div className="h-36 animate-pulse rounded-2xl bg-gray-100" />
            </div>
            <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-52 animate-pulse rounded-2xl bg-gray-100" />)}
            </div>
            <span className="sr-only">Loading flow builder</span>
        </div>
    );
}

export default function FlowBuilder() {
    const { session } = useAuth();
    const { alertDialog, confirmDialog } = useDialog();
    const [flows, setFlows] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingFlow, setEditingFlow] = useState(null);
    const [newFlowName, setNewFlowName] = useState('');
    const [newFlowDescription, setNewFlowDescription] = useState('');
    const [newFlowAccountScope, setNewFlowAccountScope] = useState('all');
    const [newFlowAccountIds, setNewFlowAccountIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [flowsError, setFlowsError] = useState('');
    const [runsModalFlow, setRunsModalFlow] = useState(null);
    const [flowRuns, setFlowRuns] = useState([]);
    const [runsLoading, setRunsLoading] = useState(false);
    const [showTemplatesModal, setShowTemplatesModal] = useState(false);
    const [templateQuery, setTemplateQuery] = useState('');
    const [templateCategory, setTemplateCategory] = useState('All');
    const [selectedTemplate, setSelectedTemplate] = useState(FLOW_TEMPLATES[0]);
    const [templateDraft, setTemplateDraft] = useState(() => getDefaultTemplateDraft(FLOW_TEMPLATES[0]));
    const [templateStarStats, setTemplateStarStats] = useState({});
    const [waAccounts, setWaAccounts] = useState([]);
    const [waAccountsLoading, setWaAccountsLoading] = useState(true);
    const [selectedWaAccount, setSelectedWaAccount] = useState(() => localStorage.getItem('selected_wa_account_id') || 'All');

    const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

    const filteredTemplates = useMemo(() => {
        const query = templateQuery.trim().toLowerCase();
        return FLOW_TEMPLATES
            .filter(template => templateCategory === 'All' || template.category === templateCategory)
            .filter(template => {
                if (!query) return true;
                return [template.name, template.description, template.bestFor, template.category].some(value =>
                    String(value || '').toLowerCase().includes(query)
                );
            })
            .sort((a, b) => getTemplateStars(b, templateStarStats) - getTemplateStars(a, templateStarStats));
    }, [templateStarStats, templateCategory, templateQuery]);

    const handleSelectTemplate = (template) => {
        setSelectedTemplate(template);
        setTemplateDraft(getDefaultTemplateDraft(template));
    };

    const fetchTemplateStars = async () => {
        if (!session?.access_token) return;
        try {
            const res = await axios.get(`${API_URL}/api/flow-template-stars`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            setTemplateStarStats(res.data || {});
        } catch (error) {
            console.error('Failed to fetch template stars:', error);
        }
    };

    const toggleTemplateStar = async (templateId) => {
        const previous = templateStarStats;
        const current = previous[templateId] || { stars: 0, starred: false };
        const optimistic = {
            ...previous,
            [templateId]: {
                stars: Math.max(0, current.stars + (current.starred ? -1 : 1)),
                starred: !current.starred,
            }
        };
        setTemplateStarStats(optimistic);

        try {
            const res = await axios.post(`${API_URL}/api/flow-template-stars/${templateId}`, {}, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (res.data?.disabled) {
                setTemplateStarStats(previous);
                return;
            }
            setTemplateStarStats(prev => ({
                ...prev,
                [templateId]: { stars: res.data?.stars || 0, starred: res.data?.starred === true }
            }));
        } catch (error) {
            console.error('Failed to update template star:', error);
            setTemplateStarStats(previous);
        }
    };

    useEffect(() => {
        if (session?.access_token) {
            fetchFlows();
            fetchTemplateStars();
            fetchWaAccounts();
        }
    }, [session]);

    useEffect(() => {
        const handleAccountChange = (event) => {
            setSelectedWaAccount(event?.detail?.accountId || localStorage.getItem('selected_wa_account_id') || 'All');
        };
        window.addEventListener('selected-wa-account-change', handleAccountChange);
        return () => window.removeEventListener('selected-wa-account-change', handleAccountChange);
    }, []);

    const fetchFlows = async () => {
        try {
            setLoading(true);
            setFlowsError('');
            const res = await axios.get(`${API_URL}/api/flows`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows(res.data);
        } catch (error) {
            console.error('Failed to fetch flows:', error);
            setFlowsError(error?.response?.data?.error || 'Could not load flows.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFlow = async () => {
        if (!newFlowName.trim()) return;

        const newFlow = {
            name: newFlowName,
            description: newFlowDescription,
            status: 'draft',
            triggers: [],
            wa_account_scope: newFlowAccountScope,
            wa_account_ids: newFlowAccountScope === 'selected' ? newFlowAccountIds : [],
            nodes: [],
            edges: [],
        };

        try {
            const res = await axios.post(`${API_URL}/api/flows`, newFlow, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows([res.data, ...flows]);
            setShowCreateModal(false);
            setNewFlowName('');
            setNewFlowDescription('');
            setNewFlowAccountScope('all');
            setNewFlowAccountIds([]);
            setEditingFlow(res.data);
        } catch (error) {
            console.error('Failed to create flow', error);
            alertDialog('Error creating flow', { title: 'Create flow failed', tone: 'danger' });
        }
    };

    const handleDeleteFlow = async (id) => {
        const confirmed = await confirmDialog('Are you sure you want to delete this flow? This cannot be undone.', {
            title: 'Delete flow',
            tone: 'danger',
            confirmLabel: 'Delete flow',
        });
        if (!confirmed) return;

        try {
            await axios.delete(`${API_URL}/api/flows/${id}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows(flows.filter(f => f.id !== id));
            notify.success('Flow deleted successfully');
        } catch (error) {
            console.error('Failed to delete flow', error);
            notify.error(error?.response?.data?.error || 'Failed to delete flow');
        }
    };

    const handleDuplicateFlow = async (flow) => {
        const duplicate = {
            name: `${flow.name} (Copy)`,
            description: flow.description,
            status: 'draft',
            triggers: flow.triggers,
            wa_account_scope: flow.wa_account_scope || 'all',
            wa_account_ids: Array.isArray(flow.wa_account_ids) ? flow.wa_account_ids : [],
            nodes: flow.nodes,
            edges: flow.edges,
        };
        try {
            const res = await axios.post(`${API_URL}/api/flows`, duplicate, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows([res.data, ...flows]);
        } catch (error) {
            console.error('Failed to duplicate flow', error);
        }
    };

    const toggleFlowStatus = async (flow) => {
        try {
            if (flow.status === 'active') {
                const res = await axios.put(`${API_URL}/api/flows/${flow.id}`, { status: 'paused' }, {
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                });
                setFlows(flows.map(f => f.id === flow.id ? res.data : f));
            } else {
                const res = await axios.post(`${API_URL}/api/flows/${flow.id}/publish`, {}, {
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                });
                setFlows(flows.map(f => f.id === flow.id ? res.data.flow : f));
            }
        } catch (error) {
            const details = error?.response?.data?.validation?.errors || [error?.response?.data?.error || 'Failed to update status'];
            alertDialog(details.join('\n'), { title: 'Could not update flow', tone: 'danger' });
        }
    };

    const fetchWaAccounts = async () => {
        setWaAccountsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/whatsapp/accounts`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setWaAccounts(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch WhatsApp accounts:', error);
            setWaAccounts([]);
        } finally {
            setWaAccountsLoading(false);
        }
    };

    const getAccountSwitchKey = (account) => account?.display_phone_number || account?.phone_number_id || account?.id || 'All';
    const selectedAccount = selectedWaAccount === 'All'
        ? null
        : waAccounts.find(account => String(getAccountSwitchKey(account)) === String(selectedWaAccount));
    const metaAccounts = waAccounts.filter(account => account.whatsapp_business_account_id);
    const qrAccounts = waAccounts.filter(account => !account.whatsapp_business_account_id);

    const handleCreateFromTemplate = async () => {
        if (!selectedTemplate) return;
        const newFlow = buildFlowFromTemplate(selectedTemplate, templateDraft);

        try {
            const res = await axios.post(`${API_URL}/api/flows`, newFlow, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows([res.data, ...flows]);
            setShowTemplatesModal(false);
            setEditingFlow(res.data);
        } catch (error) {
            console.error('Failed to create flow from template', error);
            alertDialog('Error creating template flow', { title: 'Template flow failed', tone: 'danger' });
        }
    };

    const openRunsModal = async (flow) => {
        setRunsModalFlow(flow);
        setRunsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/flows/${flow.id}/runs`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlowRuns(res.data || []);
        } catch (error) {
            console.error('Failed to load flow runs:', error);
            setFlowRuns([]);
        } finally {
            setRunsLoading(false);
        }
    };

    const formatRelativeTime = (dateString) => {
        if (!dateString) return 'Just now';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    };

    const getFlowCardTheme = (flowName) => {
        const name = (flowName || '').toLowerCase();
        if (name.includes('support') || name.includes('triage') || name.includes('help') || name.includes('issue')) {
            return {
                icon: LifeBuoy,
                bgColor: 'bg-purple-50 border-purple-100 text-purple-600',
                iconColor: 'text-purple-600'
            };
        }
        if (name.includes('welcome') || name.includes('lead') || name.includes('capture') || name.includes('greet')) {
            return {
                icon: MessageSquare,
                bgColor: 'bg-green-50 border-green-100 text-green-600',
                iconColor: 'text-green-600'
            };
        }
        return {
            icon: Layers,
            bgColor: 'bg-blue-50 border-blue-100 text-blue-600',
            iconColor: 'text-blue-600'
        };
    };

    if (editingFlow) {
        return <FlowEditor flow={editingFlow} waAccounts={waAccounts} onClose={() => { setEditingFlow(null); fetchFlows(); }} />;
    }

    if (loading || waAccountsLoading) {
        return <FlowBuilderLoading />;
    }

    if (flowsError) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center p-6">
                <div className="max-w-sm rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
                    <h2 className="text-base font-bold text-gray-950">Couldn&apos;t load flows</h2>
                    <p className="mt-2 text-sm text-gray-500">{flowsError}</p>
                    <button type="button" onClick={fetchFlows} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3.5 sm:space-y-5 p-3 sm:p-5 lg:p-6">
            {/* Header */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Flow Builder</h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
                        Create automated message flows for your WhatsApp automation
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-3">
                    <TourButton className="hidden sm:block" />
                    <button
                        onClick={() => setShowTemplatesModal(true)}
                        data-tour="flows-templates"
                        className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-all active:scale-[0.98] w-full"
                    >
                        <LayoutTemplate className="h-4 w-4" />
                        Flow Templates
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        data-tour="flows-create"
                        className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-blue-750 transition-all active:scale-[0.98] w-full"
                    >
                        <Plus className="h-4 w-4" />
                        Create Flow
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
                {/* Which number will this flow run on Card */}
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 sm:p-6 flex flex-col justify-between md:flex-row md:items-center gap-3 sm:gap-6">
                    <div className="flex-1">
                        <div className="flex items-start gap-2.5 sm:gap-3">
                            <div className="mt-0.5 flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-blue-600 text-white shadow-sm">
                                <Info className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                            </div>
                            <div>
                                <h2 className="text-sm sm:text-base font-bold text-blue-950">Which number will this flow run on?</h2>
                                <p className="mt-1 text-xs sm:text-sm leading-relaxed text-blue-900/90">
                                    Har flow ko all connected numbers ya selected WhatsApp numbers par run kar sakte hain. Customer jis number par message bhejta hai, reply usi receiving number se jayega.
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 text-[10px] sm:text-xs">
                            <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-blue-800 ring-1 ring-blue-100/50 shadow-sm">
                                Current switch: {selectedAccount ? (selectedAccount.display_phone_number || selectedAccount.phone_number_id || selectedAccount.name) : 'All connected accounts'}
                            </span>
                            <span className="rounded-md bg-white px-2 py-0.5 text-blue-700 ring-1 ring-blue-100/50 shadow-sm">
                                {waAccounts.length} connected number(s)
                            </span>
                            <span className="rounded-md bg-white px-2 py-0.5 text-blue-700 ring-1 ring-blue-100/50 shadow-sm">
                                Duplicate trigger protection active
                            </span>
                        </div>
                    </div>
                    {/* Visual Graphic Mockup */}
                    <div className="hidden md:block shrink-0 select-none pointer-events-none">
                        <svg width="180" height="110" viewBox="0 0 180 110" fill="none">
                            <circle cx="130" cy="55" r="45" fill="#E0F2FE" opacity="0.6" />
                            <circle cx="50" cy="65" r="25" fill="#F0FDFA" opacity="0.6" />
                            
                            {/* Card 1 */}
                            <g filter="drop-shadow(0px 2px 4px rgba(59,130,246,0.06))">
                                <rect x="30" y="15" width="80" height="32" rx="6" fill="white" />
                                <rect x="38" y="22" width="40" height="4" rx="2" fill="#E2E8F0" />
                                <rect x="38" y="30" width="25" height="3" rx="1.5" fill="#F1F5F9" />
                                <circle cx="98" cy="31" r="5" fill="#3B82F6" opacity="0.8" />
                            </g>
                            
                            {/* Card 2 (WhatsApp Card) */}
                            <g filter="drop-shadow(0px 4px 10px rgba(0,0,0,0.06))">
                                <rect x="65" y="45" width="95" height="45" rx="8" fill="white" />
                                <rect x="75" y="56" width="50" height="5" rx="2.5" fill="#cbd5e1" />
                                <rect x="75" y="66" width="35" height="4" rx="2" fill="#e2e8f0" />
                                
                                <circle cx="138" cy="67" r="11" fill="#25D366" />
                                {/* WhatsApp phone path inside circle */}
                                <path d="M135.5 66.5a2 2 0 0 0 2 2m-2-3.5a3.5 3.5 0 0 1 3.5 3.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
                                <path d="M134.7 64.7a0.8 0 0 0-.8.8v1.2a3.2 3.2 0 0 0 3.2 3.2h1.2a0.8 0 0 0 .8-.8v-.6a0.4 0 0 0-.2-.4l-1-.4a0.4 0 0 0-.5.2l-.2.2a2 2 0 0 1-1-1l.2-.2a0.4 0 0 0 .2-.5l-.4-1a0.4 0 0 0-.4-.2h-.6Z" fill="white" />
                            </g>
                            
                            {/* Connection line */}
                            <path d="M70 31c0 8-10 8-10 14" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3 3" />
                            <circle cx="60" cy="45" r="2" fill="#3B82F6" />
                        </svg>
                    </div>
                </div>

                {/* Connected access types Card */}
                <div className="rounded-2xl border border-gray-200 bg-white p-3.5 sm:p-6 flex flex-col justify-between shadow-sm">
                    <div className="mb-3 sm:mb-4 flex items-center justify-between">
                        <h2 className="text-xs sm:text-sm font-bold text-gray-900">Connected access types</h2>
                        <Smartphone className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <div className="flex flex-col gap-2 sm:gap-3">
                        {/* Meta API Row */}
                        <div className="flex items-center justify-between border border-gray-100 rounded-xl p-2 sm:p-3 bg-white hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center bg-green-50 text-green-600 shrink-0">
                                    <ShieldCheck className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900">Meta API</h3>
                                    <p className="text-[10px] sm:text-[11px] leading-tight text-gray-500 truncate max-w-[200px] xl:max-w-[170px]">
                                        Templates, broadcasts, profile sync...
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 pl-2">
                                <span className="text-base sm:text-xl font-bold text-gray-900">{metaAccounts.length}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            </div>
                        </div>

                        {/* QR Session Row */}
                        <div className="flex items-center justify-between border border-gray-100 rounded-xl p-2 sm:p-3 bg-white hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 shrink-0">
                                    <QrCode className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900">QR Session</h3>
                                    <p className="text-[10px] sm:text-[11px] leading-tight text-gray-500 truncate max-w-[200px] xl:max-w-[170px]">
                                        Chats and flow replies only...
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 pl-2">
                                <span className="text-base sm:text-xl font-bold text-gray-900">{qrAccounts.length}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 pb-1 sm:pb-0">
                {/* Total Flows */}
                <div className="bg-white p-2.5 sm:p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1.5 sm:gap-4 hover:shadow-md transition-shadow w-full min-w-0 flex-1">
                    <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                        <TrendingUp className="h-4.5 w-4.5 sm:h-6 sm:w-6 text-white" />
                    </div>
                    <div className="min-w-0 w-full">
                        <p className="text-[9px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider leading-none sm:leading-normal">Total Flows</p>
                        <p className="text-sm sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate">{flows.length}</p>
                    </div>
                </div>

                {/* Active Flows */}
                <div className="bg-white p-2.5 sm:p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1.5 sm:gap-4 hover:shadow-md transition-shadow w-full min-w-0 flex-1">
                    <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-gradient-to-tr from-emerald-600 to-green-400 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                        <Play className="h-4.5 w-4.5 sm:h-5 sm:w-5 fill-current text-white" />
                    </div>
                    <div className="min-w-0 w-full">
                        <p className="text-[9px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider leading-none sm:leading-normal">Active Flows</p>
                        <p className="text-sm sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate">
                            {flows.filter(f => f.status === 'active').length}
                        </p>
                    </div>
                </div>

                {/* Messages Sent */}
                <div className="bg-white p-2.5 sm:p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1.5 sm:gap-4 hover:shadow-md transition-shadow w-full min-w-0 flex-1">
                    <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-gradient-to-tr from-purple-600 to-fuchsia-400 text-white flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
                        <Send className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-white fill-white/20" />
                    </div>
                    <div className="min-w-0 w-full">
                        <p className="text-[9px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider leading-none sm:leading-normal">Messages Sent</p>
                        <p className="text-sm sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate">
                            {flows.reduce((sum, f) => sum + (f.messagesSent || 0), 0).toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Flows List */}
            <div data-tour="flows-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {flows.map(flow => {
                    const theme = getFlowCardTheme(flow.name);
                    const IconComp = theme.icon;

                    return (
                        <div key={flow.id} className="flex flex-col bg-white rounded-2xl border border-gray-200 hover:shadow-lg transition-shadow p-3.5 sm:p-5">
                            <div className="flex-1 flex flex-col justify-between gap-4">
                                <div className="flex items-start justify-between gap-2.5 sm:gap-4">
                                    <div className="flex items-start flex-1 min-w-0">
                                        <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border ${theme.bgColor}`}>
                                            <IconComp className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                        </div>
                                        <div className="ml-2.5 sm:ml-3 min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <h3 className="font-bold text-gray-900 truncate text-xs sm:text-base" title={flow.name}>
                                                    {flow.name}
                                                </h3>
                                                <span className={`px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border uppercase tracking-wider shrink-0 ${
                                                    flow.status === 'active'
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : flow.status === 'paused'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-gray-50 text-gray-600 border-gray-200'
                                                }`}>
                                                    {flow.status}
                                                </span>
                                            </div>
                                            {flow.description && (
                                                <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 line-clamp-2 leading-relaxed">
                                                    {flow.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => toggleFlowStatus(flow)}
                                            className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
                                                flow.status === 'active'
                                                    ? 'text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100'
                                                    : 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100'
                                            }`}
                                            title={flow.status === 'active' ? 'Pause Flow' : 'Activate Flow'}
                                        >
                                            {flow.status === 'active' ? <Pause className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-current" />}
                                        </button>
                                        <button
                                            onClick={() => handleDuplicateFlow(flow)}
                                            className="p-1 sm:p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg flex items-center justify-center transition-all"
                                            title="Duplicate"
                                        >
                                            <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteFlow(flow.id)}
                                            className="p-1 sm:p-1.5 text-gray-400 hover:text-red-600 border border-gray-200 hover:bg-red-50 rounded-lg flex items-center justify-center transition-all"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <div className="bg-gray-50/50 rounded-xl p-2.5 sm:p-3 border border-gray-100 grid grid-cols-3 gap-2 text-center text-xs">
                                        <div>
                                            <span className="block text-[8.5px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nodes</span>
                                            <span className="block text-xs sm:text-sm font-bold text-gray-900 mt-0.5">{Array.isArray(flow.nodes) ? flow.nodes.length : 0}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[8.5px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Messages Sent</span>
                                            <span className="block text-xs sm:text-sm font-bold text-gray-900 mt-0.5">{(flow.messagesSent || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <span className="block text-[8.5px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Runs on</span>
                                            <span className="block text-[8.5px] sm:text-[10px] font-bold text-blue-700 mt-1 truncate bg-blue-50/60 rounded px-1.5 py-0.5 border border-blue-100/30">
                                                {flow.wa_account_scope === 'all' ? 'All numbers' : `${flow.wa_account_ids?.length || 0} selected`}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-start justify-between gap-4 mt-3.5 sm:mt-4">
                                        <div className="flex-1 min-w-0">
                                            <span className="block text-[8.5px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Triggers</span>
                                            <TriggersContainer triggers={flow.triggers} />
                                        </div>
                                        <div className="text-right shrink-0 self-start">
                                            <span className="text-[8.5px] sm:text-[10px] font-semibold text-gray-400 block uppercase tracking-wider">Last edited</span>
                                            <span className="text-[10px] sm:text-xs font-semibold text-gray-600 block mt-0.5">
                                                {formatRelativeTime(flow.updated_at || flow.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3.5 sm:mt-5 pt-3 sm:pt-4 border-t border-gray-100 flex gap-2">
                                <button
                                    onClick={() => setEditingFlow(flow)}
                                    className="flex-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                                >
                                    <Edit2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500" />
                                    Edit Flow
                                </button>
                                <button
                                    onClick={() => openRunsModal(flow)}
                                    className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center justify-center shadow-sm transition-colors"
                                    title="Run logs"
                                >
                                    <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500" />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Create your next flow Card */}
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-gray-300 rounded-2xl bg-white hover:bg-gray-50/50 p-4 sm:p-6 text-center min-h-[180px] sm:min-h-[280px] transition-all group shadow-sm hover:shadow-md cursor-pointer"
                >
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-400 group-hover:text-gray-600 transition-colors shadow-sm">
                        <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-gray-900 mt-3 sm:mt-4">Create your next flow</h3>
                    <p className="text-[11px] sm:text-xs text-gray-500 mt-1 sm:mt-1.5 max-w-[200px]">
                        Start building another automation for your business.
                    </p>
                </button>
            </div>

            {showTemplatesModal && (
                <TemplateGalleryModal
                    templates={filteredTemplates}
                    categories={FLOW_TEMPLATE_CATEGORIES}
                    selectedTemplate={selectedTemplate}
                    templateDraft={templateDraft}
                    templateStarStats={templateStarStats}
                    query={templateQuery}
                    category={templateCategory}
                    onQueryChange={setTemplateQuery}
                    onCategoryChange={setTemplateCategory}
                    onSelectTemplate={handleSelectTemplate}
                    onDraftChange={setTemplateDraft}
                    onToggleStar={toggleTemplateStar}
                    onClose={() => setShowTemplatesModal(false)}
                    onUseTemplate={handleCreateFromTemplate}
                />
            )}

            {runsModalFlow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Flow Runs</h2>
                                <p className="text-sm text-gray-500">{runsModalFlow.name}</p>
                            </div>
                            <button
                                onClick={() => { setRunsModalFlow(null); setFlowRuns([]); }}
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-5">
                            {runsLoading ? (
                                <div className="py-10 text-center text-sm text-gray-500">Loading runs...</div>
                            ) : flowRuns.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                                    No runs yet. Send a matching WhatsApp keyword to trigger this flow.
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-lg border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">Started</th>
                                                <th className="px-4 py-3 text-left font-semibold">Status</th>
                                                <th className="px-4 py-3 text-left font-semibold">Conversation</th>
                                                <th className="px-4 py-3 text-left font-semibold">Error</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {flowRuns.map(run => (
                                                <tr key={run.id}>
                                                    <td className="px-4 py-3 text-gray-700">{run.started_at ? new Date(run.started_at).toLocaleString() : '-'}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                                            run.status === 'completed' ? 'bg-green-50 text-green-700' :
                                                            run.status === 'failed' ? 'bg-red-50 text-red-700' :
                                                            'bg-blue-50 text-blue-700'
                                                        }`}>
                                                            {run.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{run.conversation_id}</td>
                                                    <td className="px-4 py-3 text-red-600">{run.error_message || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Flow Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-lg w-full">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-xl font-bold text-gray-900">Create New Flow</h2>
                            <p className="text-sm text-gray-500 mt-1">Set up a new automation flow for your WhatsApp</p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Flow Name</label>
                                <input
                                    type="text"
                                    value={newFlowName}
                                    onChange={(e) => setNewFlowName(e.target.value)}
                                    placeholder="e.g., Welcome Flow"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                                <textarea
                                    value={newFlowDescription}
                                    onChange={(e) => setNewFlowDescription(e.target.value)}
                                    placeholder="What does this flow do?"
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>

                            <FlowAccountSelector
                                accounts={waAccounts}
                                scope={newFlowAccountScope}
                                selectedIds={newFlowAccountIds}
                                onScopeChange={setNewFlowAccountScope}
                                onSelectedIdsChange={setNewFlowAccountIds}
                            />
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setNewFlowName('');
                                    setNewFlowDescription('');
                                    setNewFlowAccountScope('all');
                                    setNewFlowAccountIds([]);
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateFlow}
                                disabled={!newFlowName.trim() || (newFlowAccountScope === 'selected' && newFlowAccountIds.length === 0)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                Create Flow
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function FlowAccountSelector({ accounts, scope, selectedIds, onScopeChange, onSelectedIdsChange }) {
    const selectedSet = new Set(selectedIds || []);

    const toggleAccount = (id) => {
        onSelectedIdsChange(
            selectedSet.has(id)
                ? selectedIds.filter((item) => item !== id)
                : [...selectedIds, id]
        );
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="block text-sm font-semibold text-gray-800">Run this flow on</label>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => onScopeChange('all')}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${scope === 'all' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    All numbers
                    <span className="mt-1 block text-xs font-normal text-gray-500">Any connected number can trigger it.</span>
                </button>
                <button
                    type="button"
                    onClick={() => onScopeChange('selected')}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${scope === 'selected' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    Selected numbers
                    <span className="mt-1 block text-xs font-normal text-gray-500">Only chosen accounts can trigger it.</span>
                </button>
            </div>

            {scope === 'selected' && (
                <div className="mt-3 space-y-2">
                    {accounts.length === 0 ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Connect a WhatsApp account first, or switch to all numbers.
                        </div>
                    ) : accounts.map((account) => {
                        const isMeta = Boolean(account.whatsapp_business_account_id);
                        return (
                            <label key={account.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50">
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-gray-900">{getAccountLabel(account)}</span>
                                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${isMeta ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                        {isMeta ? <ShieldCheck className="h-3 w-3" /> : <QrCode className="h-3 w-3" />}
                                        {isMeta ? 'Meta API' : 'QR Session'}
                                    </span>
                                </span>
                                <input
                                    type="checkbox"
                                    checked={selectedSet.has(account.id)}
                                    onChange={() => toggleAccount(account.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function getAccountLabel(account) {
    return account?.display_phone_number || account?.phone_number_id || account?.name || 'WhatsApp account';
}

function getFlowAccountBadges(flow, accounts) {
    const scope = flow?.wa_account_scope || 'all';
    if (scope !== 'selected') {
        return [{ key: 'all', label: 'All connected numbers', className: 'bg-blue-50 text-blue-700' }];
    }

    const ids = Array.isArray(flow?.wa_account_ids) ? flow.wa_account_ids : [];
    if (ids.length === 0) {
        return [{ key: 'none', label: 'No number selected', className: 'bg-red-50 text-red-700' }];
    }

    return ids.map((id) => {
        const account = accounts.find((item) => item.id === id);
        const isMeta = Boolean(account?.whatsapp_business_account_id);
        return {
            key: id,
            label: account ? `${getAccountLabel(account)} ${isMeta ? 'Meta' : 'QR'}` : `Account ${id.slice(0, 6)}`,
            className: isMeta ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
        };
    });
}

function TemplateGalleryModal({
    templates,
    categories,
    selectedTemplate,
    templateDraft,
    templateStarStats,
    query,
    category,
    onQueryChange,
    onCategoryChange,
    onSelectTemplate,
    onDraftChange,
    onToggleStar,
    onClose,
    onUseTemplate,
}) {
    const preview = selectedTemplate?.preview || { nodes: [], edges: [] };

    // Mobile specific layout states
    const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
    const [isMoreCategoriesOpen, setIsMoreCategoriesOpen] = useState(false);
    const [isFillDetailsOpen, setIsFillDetailsOpen] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
            {/* Mobile View (< md) */}
            <div className="md:hidden flex h-full w-full flex-col overflow-hidden bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-col gap-2.5 shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        {isMobileSearchExpanded ? (
                            <div className="flex items-center gap-2 flex-grow">
                                <button onClick={() => { setIsMobileSearchExpanded(false); onQueryChange(''); }} className="p-1 text-gray-500 hover:text-black">
                                    <ArrowLeft className="h-4.5 w-4.5" />
                                </button>
                                <input
                                    value={query}
                                    onChange={(e) => onQueryChange(e.target.value)}
                                    placeholder="Search templates..."
                                    autoFocus
                                    className="flex-grow bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500 h-8"
                                />
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5 text-sm font-semibold text-[#128C7E]">
                                    <Sparkles className="h-4 w-4" />
                                    <span>Flow Templates</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setIsAboutOpen(prev => !prev)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                                        <Info className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => setIsMobileSearchExpanded(true)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                                        <Search className="h-4 w-4" />
                                    </button>
                                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg ml-0.5">
                                        <X className="h-4.5 w-4.5" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {isAboutOpen && !isMobileSearchExpanded && (
                        <div className="rounded-lg bg-blue-50/70 p-2.5 text-[10.5px] text-blue-900 leading-normal flex justify-between gap-2.5 items-start">
                            <p>Choose a workflow template, customize placeholders (like Business Name), and generate a draft flow instantly.</p>
                            <button onClick={() => setIsAboutOpen(false)} className="text-blue-500 font-semibold shrink-0">Hide</button>
                        </div>
                    )}

                    {/* Categories Horizontal list */}
                    {!isMobileSearchExpanded && (
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
                            {categories.slice(0, 4).map(item => (
                                <button
                                    key={item}
                                    onClick={() => onCategoryChange(item)}
                                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                                        category === item ? 'bg-black text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {item}
                                </button>
                            ))}
                            {categories.length > 4 && (
                                <button
                                    onClick={() => setIsMoreCategoriesOpen(true)}
                                    className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold border border-gray-200 bg-white text-gray-500 flex items-center gap-1"
                                >
                                    + More
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Templates Scrollable List */}
                <div className="flex-1 overflow-y-auto bg-[#f5f7fa] p-3 space-y-2.5">
                    {templates.map(template => {
                        const selected = selectedTemplate?.id === template.id;
                        const starred = Boolean(templateStarStats[template.id]?.starred);

                        return (
                            <div
                                key={template.id}
                                className={`rounded-xl border bg-white overflow-hidden transition-all duration-200 ${
                                    selected ? 'border-[#25D366] ring-2 ring-[#25D366]/10' : 'border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {/* Collapsed Header */}
                                <div
                                    onClick={() => onSelectTemplate(template)}
                                    className="p-3 flex items-start justify-between gap-3 cursor-pointer"
                                >
                                    <div className="min-w-0 flex-grow">
                                        <div className="flex items-center gap-1.5">
                                            <h3 className="text-xs font-bold text-gray-900 truncate">{template.name}</h3>
                                            <span className="rounded bg-gray-100 px-1.5 py-0.2 text-[8.5px] font-semibold text-gray-500 uppercase tracking-wider shrink-0">{template.category}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-1 line-clamp-1">{template.bestFor || template.description}</p>
                                        <div className="flex items-center gap-2 text-[9px] text-gray-400 mt-1">
                                            <span className="flex items-center gap-0.5"><Layers className="h-3 w-3" /> {template.preview.nodes.length} nodes</span>
                                            <span>•</span>
                                            <span>{template.difficulty}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 gap-1">
                                        <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.2 text-[9px] font-bold ${starred ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                                            <Star className={`h-2.5 w-2.5 ${starred ? 'fill-current text-amber-500' : ''}`} />
                                            {getTemplateStars(template, templateStarStats)}
                                        </span>
                                    </div>
                                </div>

                                {/* Selected / Expanded details */}
                                {selected && (
                                    <div className="border-t border-gray-150 bg-gray-50/50 p-3 space-y-3">
                                        <p className="text-xs text-gray-600 leading-relaxed">{template.description}</p>
                                        
                                        <div className="flex items-center justify-between gap-2.5 pt-2">
                                            <button
                                                onClick={() => onToggleStar(template.id)}
                                                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${starred ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-600'}`}
                                            >
                                                <Star className={`h-3 w-3 ${starred ? 'fill-current' : ''}`} />
                                                Star
                                            </button>
                                            
                                            <button
                                                onClick={() => setIsFillDetailsOpen(true)}
                                                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1fb85a] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                                            >
                                                <LayoutTemplate className="h-3.5 w-3.5" />
                                                Use & Customize
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* More Categories Bottom Sheet */}
                {isMoreCategoriesOpen && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setIsMoreCategoriesOpen(false)}>
                        <div className="w-full bg-white rounded-t-2xl p-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Select Category</h4>
                                <button onClick={() => setIsMoreCategoriesOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4.5 w-4.5" /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pb-4">
                                {categories.map((item) => (
                                    <button
                                        key={item}
                                        onClick={() => { onCategoryChange(item); setIsMoreCategoriesOpen(false); }}
                                        className={`p-2.5 rounded-xl text-center text-xs font-medium border ${category === item ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Fill Details Bottom Sheet */}
                {isFillDetailsOpen && selectedTemplate && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setIsFillDetailsOpen(false)}>
                        <div className="w-full bg-white rounded-t-2xl p-4 animate-slide-up shadow-2xl" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2.5">
                                <div>
                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customize Flow Settings</h4>
                                    <h3 className="text-xs font-bold text-gray-900 mt-0.5">{selectedTemplate.name}</h3>
                                </div>
                                <button onClick={() => setIsFillDetailsOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4.5 w-4.5" /></button>
                            </div>
                            <div className="space-y-3.5 max-h-[300px] overflow-y-auto">
                                {selectedTemplate.fields.map(field => (
                                    <label key={field.key} className="block">
                                        <span className="mb-1 block text-xs font-semibold text-gray-700">{field.label}</span>
                                        <input
                                            value={templateDraft[field.key] || ''}
                                            onChange={(event) => onDraftChange(prev => ({ ...prev, [field.key]: event.target.value }))}
                                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500 h-9"
                                        />
                                    </label>
                                ))}
                                <div className="rounded-lg border border-gray-200 bg-[#f8faf9] p-3 text-[11px] leading-relaxed text-gray-600">
                                    <strong>What happens next:</strong> Created as a draft flow. You can customize layout nodes, test messages, then activate.
                                </div>
                            </div>
                            <div className="pt-4 border-t border-gray-100 mt-3 flex gap-2">
                                <button
                                    onClick={() => setIsFillDetailsOpen(false)}
                                    className="flex-1 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { onUseTemplate(); setIsFillDetailsOpen(false); }}
                                    className="flex-1 py-2 bg-[#25D366] hover:bg-[#1fb85a] rounded-xl text-xs font-semibold text-white shadow-sm flex items-center justify-center gap-1.5"
                                >
                                    <LayoutTemplate className="h-3.5 w-3.5" />
                                    Create Flow
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop View (>= md) */}
            <div className="hidden md:flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-none border border-gray-200 bg-white sm:h-[88vh] sm:rounded-lg lg:flex-row">
                <div className="flex h-[46vh] w-full flex-col border-b border-gray-200 bg-white lg:h-auto lg:w-[420px] lg:border-b-0 lg:border-r">
                    <div className="border-b border-gray-200 bg-white p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-[#128C7E]">
                                    <Sparkles className="h-4 w-4" />
                                    Flow Templates
                                </div>
                                <h2 className="mt-1 text-xl font-light text-black sm:text-2xl">Start from a proven flow</h2>
                                <p className="mt-1 text-sm leading-5 text-gray-500">Choose a workflow, fill details, and generate a ready-to-edit draft.</p>
                            </div>
                            <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-black">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="relative mt-4">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={query}
                                onChange={(event) => onQueryChange(event.target.value)}
                                placeholder="Search sales, support, booking..."
                                className="fp-input h-10 pl-9"
                            />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {categories.map(item => (
                                <button
                                    key={item}
                                    onClick={() => onCategoryChange(item)}
                                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                                        category === item ? 'bg-black text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[#f5f7fa] p-3">
                        <div className="space-y-2">
                            {templates.map(template => {
                                const selected = selectedTemplate?.id === template.id;
                                const starred = Boolean(templateStarStats[template.id]?.starred);

                                return (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => onSelectTemplate(template)}
                                        className={`w-full rounded-lg border bg-white p-4 text-left transition-colors ${
                                            selected ? 'border-[#25D366] ring-2 ring-[#25D366]/10' : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="truncate text-sm font-semibold text-gray-950">{template.name}</h3>
                                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{template.category}</span>
                                                </div>
                                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{template.description}</p>
                                            </div>
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${starred ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                                                <Star className={`h-3.5 w-3.5 ${starred ? 'fill-current' : ''}`} />
                                                {getTemplateStars(template, templateStarStats)}
                                            </span>
                                        </div>
                                        <div className="mt-3 flex items-center gap-3 text-[11px] text-gray-500">
                                            <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {template.preview.nodes.length} nodes</span>
                                            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {template.minutes} min</span>
                                            <span>{template.difficulty}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="border-b border-gray-200 px-4 py-4 sm:px-6 sm:py-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-semibold text-black">{selectedTemplate.name}</h2>
                                    <span className="rounded-full bg-[#25D366]/10 px-2 py-1 text-xs font-semibold text-[#128C7E]">{selectedTemplate.category}</span>
                                </div>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">{selectedTemplate.bestFor}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="hidden rounded-lg border border-gray-200 bg-[#f8faf9] px-3 py-2 text-xs text-gray-600 lg:block">
                                    <div className="font-semibold text-gray-900">{selectedTemplate.preview.nodes.length} nodes</div>
                                    Ready-to-edit draft
                                </div>
                                <button
                                    onClick={() => onToggleStar(selectedTemplate.id)}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                                        templateStarStats[selectedTemplate.id]?.starred
                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <Star className={`h-4 w-4 ${templateStarStats[selectedTemplate.id]?.starred ? 'fill-current' : ''}`} />
                                    Star · {getTemplateStars(selectedTemplate, templateStarStats)}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-1 bg-white xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="overflow-y-auto bg-white p-4 sm:p-6">
                            <div className="rounded-lg border border-gray-200 bg-white">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <h3 className="text-sm font-semibold text-gray-900">Template Preview</h3>
                                    <p className="text-xs text-gray-500">This draft will be generated in the editor.</p>
                                </div>
                                <div className="h-[300px] overflow-hidden bg-[#f6f7f8] sm:h-[430px]">
                                    <TemplatePreviewCanvas preview={preview} />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 bg-[#f8faf9] p-4 sm:p-5 xl:border-l xl:border-t-0">
                            <h3 className="text-sm font-semibold text-gray-900">Fill Details</h3>
                            <p className="mt-1 text-xs leading-5 text-gray-500">These values replace placeholders inside messages and node settings.</p>

                            <div className="mt-4 space-y-4">
                                {selectedTemplate.fields.map(field => (
                                    <label key={field.key} className="block">
                                        <span className="mb-1.5 block text-xs font-semibold text-gray-700">{field.label}</span>
                                        <input
                                            value={templateDraft[field.key] || ''}
                                            onChange={(event) => onDraftChange(prev => ({ ...prev, [field.key]: event.target.value }))}
                                            className="fp-input h-10"
                                        />
                                    </label>
                                ))}
                            </div>

                            <div className="mt-5 rounded-lg border border-gray-200 bg-white p-3 text-xs leading-5 text-gray-600">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
                                    <CheckCircle2 className="h-4 w-4 text-[#128C7E]" />
                                    What happens next
                                </div>
                                Created as a draft. You can edit every node, test it, then publish when ready.
                            </div>

                            <button
                                onClick={onUseTemplate}
                                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white hover:bg-[#1fb85a]"
                            >
                                <LayoutTemplate className="h-4 w-4" />
                                Use Template
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function getDefaultTemplateDraft(template) {
    return Object.fromEntries((template?.fields || []).map(field => [field.key, field.defaultValue || '']));
}

function getTemplateStars(template, templateStarStats) {
    const realStats = templateStarStats[template.id];
    const fakeBase = template.fakeStars || 50;
    return fakeBase + (realStats?.starred ? 1 : 0);
}

function TemplatePreviewCanvas({ preview }) {
    const nodes = preview?.nodes || [];
    const edges = preview?.edges || [];
    const nodeWidth = 220;
    const nodeHeight = 72;
    const padding = 130;

    if (nodes.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No preview available
            </div>
        );
    }

    const byId = Object.fromEntries(nodes.map(item => [item.id, item]));
    const minX = Math.min(...nodes.map(item => item.position.x)) - padding;
    const minY = Math.min(...nodes.map(item => item.position.y)) - padding;
    const maxX = Math.max(...nodes.map(item => item.position.x + nodeWidth)) + padding;
    const maxY = Math.max(...nodes.map(item => item.position.y + nodeHeight)) + padding;
    const width = Math.max(maxX - minX, 640);
    const height = Math.max(maxY - minY, 420);

    return (
        <svg className="h-full w-full" viewBox={`${minX} ${minY} ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
            <defs>
                <marker id="template-preview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#9aa4b2" />
                </marker>
                <filter id="template-preview-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#121314" floodOpacity="0.10" />
                </filter>
            </defs>

            <rect x={minX} y={minY} width={width} height={height} fill="#f6f7f8" />
            <g opacity="0.55">
                {Array.from({ length: Math.ceil(width / 80) + 1 }).map((_, index) => (
                    <line key={`v-${index}`} x1={minX + index * 80} y1={minY} x2={minX + index * 80} y2={minY + height} stroke="#e8edf3" strokeWidth="1" />
                ))}
                {Array.from({ length: Math.ceil(height / 80) + 1 }).map((_, index) => (
                    <line key={`h-${index}`} x1={minX} y1={minY + index * 80} x2={minX + width} y2={minY + index * 80} stroke="#e8edf3" strokeWidth="1" />
                ))}
            </g>

            <g>
                {edges.map(item => {
                    const source = byId[item.source];
                    const target = byId[item.target];
                    if (!source || !target) return null;

                    const startX = source.position.x + nodeWidth / 2;
                    const startY = source.position.y + nodeHeight;
                    const endX = target.position.x + nodeWidth / 2;
                    const endY = target.position.y;
                    const midY = startY + Math.max(36, (endY - startY) / 2);

                    return (
                        <path
                            key={item.id}
                            d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                            fill="none"
                            stroke="#9aa4b2"
                            strokeWidth="2"
                            strokeDasharray="6 6"
                            markerEnd="url(#template-preview-arrow)"
                        />
                    );
                })}
            </g>

            <g>
                {nodes.map(item => {
                    const x = item.position.x;
                    const y = item.position.y;
                    const label = truncateText(getNodeLabel(item), 22);
                    const summary = truncateText(getNodeSummary(item), 34);

                    return (
                        <g key={item.id} filter="url(#template-preview-shadow)">
                            <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx="8" fill="#ffffff" stroke="#dfe6ee" />
                            <rect x={x} y={y} width={nodeWidth} height="28" rx="8" fill="#128C7E" />
                            <path d={`M ${x} ${y + 20} H ${x + nodeWidth} V ${y + 28} H ${x} Z`} fill="#128C7E" />
                            <text x={x + 12} y={y + 19} fill="#ffffff" fontSize="13" fontWeight="700">{label}</text>
                            <text x={x + 12} y={y + 52} fill="#4b5563" fontSize="12">{summary}</text>
                        </g>
                    );
                })}
            </g>

            <g>
                <rect x={minX + 24} y={minY + 24} width="118" height="30" rx="15" fill="#ffffff" stroke="#d8dee8" />
                <text x={minX + 42} y={minY + 44} fill="#6b7280" fontSize="12" fontWeight="600">Preview layout</text>
            </g>
        </svg>
    );
}

function truncateText(value, maxLength) {
    const text = String(value || '');
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function getNodeLabel(node) {
    const labels = {
        startBotFlow: 'Trigger',
        textMessage: 'Text',
        button: 'Buttons',
        userInput: 'Input',
        handoff: 'Handoff',
        end: 'End',
        ai: 'AI',
    };
    return labels[node.type] || node.type;
}

function getNodeSummary(node) {
    const config = node.data?.config || {};
    return config.message || config.headerText || config.question || config.reason || config.keywords || config.title || 'Configured block';
}

function TriggersContainer({ triggers }) {
    const containerRef = useRef(null);
    const [showTopFade, setShowTopFade] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);

    const checkScroll = () => {
        const container = containerRef.current;
        if (!container) return;
        const { scrollTop, scrollHeight, clientHeight } = container;
        setShowTopFade(scrollTop > 2);
        setShowBottomFade(scrollTop + clientHeight < scrollHeight - 2);
    };

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        
        checkScroll();
        
        const handleScroll = () => checkScroll();
        container.addEventListener('scroll', handleScroll);
        
        let resizeObserver;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => checkScroll());
            resizeObserver.observe(container);
        }

        return () => {
            container.removeEventListener('scroll', handleScroll);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, [triggers]);

    return (
        <div className="relative">
            {/* Top Fade Indicator */}
            <div 
                className={`absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white to-transparent pointer-events-none z-10 transition-opacity duration-200 ${
                    showTopFade ? 'opacity-100' : 'opacity-0'
                }`} 
            />
            
            <div 
                ref={containerRef}
                className="h-[72px] overflow-y-auto no-scrollbar scroll-smooth pr-1"
            >
                <div className="flex flex-wrap gap-1.5 pb-2">
                    {triggers && triggers.length > 0 ? (
                        triggers.map((trigger, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-semibold rounded border border-blue-100/50 hover:bg-blue-100/30 transition-colors">
                                {trigger}
                            </span>
                        ))
                    ) : (
                        <span className="text-[10px] sm:text-xs text-gray-400 italic">No triggers</span>
                    )}
                </div>
            </div>

            {/* Bottom Fade Indicator */}
            <div 
                className={`absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none z-10 transition-opacity duration-200 ${
                    showBottomFade ? 'opacity-100' : 'opacity-0'
                }`} 
            />
        </div>
    );
}

