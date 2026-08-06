import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, Play, Copy, Pause, TrendingUp, Zap, Activity, X, LayoutTemplate, Star, Search, Sparkles, Clock, Layers, CheckCircle2, Smartphone, ShieldCheck, QrCode, Info, ChevronRight, MessageSquare, LifeBuoy, Send, MoreHorizontal, ArrowLeft } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import axios from 'axios';

gsap.registerPlugin(useGSAP);
import FlowEditor from '../components/flow-builder/FlowEditor';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountContext';
import { notify } from '../services/notificationService';
import { FLOW_TEMPLATE_CATEGORIES, FLOW_TEMPLATES, buildFlowFromTemplate } from '../components/flow-builder/flowTemplates';


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
    const dashboardRef = useRef(null);
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
    const [expandedVideoUrl, setExpandedVideoUrl] = useState(null);
    const [flowRuns, setFlowRuns] = useState([]);
    const [runsLoading, setRunsLoading] = useState(false);
    const [showTemplatesModal, setShowTemplatesModal] = useState(false);
    const [templateQuery, setTemplateQuery] = useState('');
    const [templateCategory, setTemplateCategory] = useState('All');
    const [selectedTemplate, setSelectedTemplate] = useState(FLOW_TEMPLATES[0]);
    const [templateDraft, setTemplateDraft] = useState(() => getDefaultTemplateDraft(FLOW_TEMPLATES[0]));
    const [templateStarStats, setTemplateStarStats] = useState({});
    const { accounts: waAccounts, isLoading: waAccountsLoading } = useWhatsAppAccounts();
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
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    useGSAP(() => {
        if (loading || waAccountsLoading || editingFlow) return;

        // Animate stats cards
        gsap.fromTo('.stat-card-anim',
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' }
        );

        // Animate flow cards
        gsap.fromTo('.flow-card-anim',
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out', delay: 0.15 }
        );
    }, { scope: dashboardRef, dependencies: [loading, waAccountsLoading, editingFlow] });

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
        <div ref={dashboardRef} className="space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto font-sans tracking-tight">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight leading-tight fb-font-cabinet">Flow Builder</h1>
                    <p className="text-xs sm:text-sm text-zinc-500 mt-1 tracking-tight">
                        Create automated message flows for your WhatsApp automation
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full sm:flex sm:w-auto sm:items-center sm:gap-3">
                    <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        onClick={() => setShowTemplatesModal(true)}
                        data-tour="flows-templates"
                        className="fb-btn-outline px-4 py-2 sm:py-2.5 text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                    >
                        <LayoutTemplate className="h-4 w-4 text-zinc-500" />
                        Flow Templates
                    </motion.button>
                    <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        onClick={() => setShowCreateModal(true)}
                        data-tour="flows-create"
                        className="fb-btn-dark px-4 py-2 sm:py-2.5 text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                    >
                        <Plus className="h-4 w-4" />
                        Create Flow
                    </motion.button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
                {/* Which number will this flow run on Card */}
                <GlowCard 
                    className="rounded-none border border-zinc-200 bg-[#f8f9fa] p-5 flex flex-col md:flex-row md:items-stretch gap-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.02)] relative overflow-hidden group"
                    glowColor="rgba(0, 0, 0, 0.03)"
                >
                    <div className="flex-1 flex flex-col justify-between gap-5 relative z-10">
                        <div className="flex items-start gap-3.5">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-white text-zinc-700 border border-zinc-200 shadow-sm">
                                <Info className="h-4.5 w-4.5" />
                            </div>
                            <div>
                                <div className="inline-flex items-center gap-1.5 rounded-none border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] sm:text-xs font-semibold text-zinc-700 tracking-wider uppercase font-mono mb-2 w-fit">
                                    <Sparkles className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                                    Flow Configuration
                                </div>
                                <h2 className="text-base font-bold text-zinc-950 fb-font-outfit tracking-tight">Which number will this flow run on?</h2>
                                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 max-w-[65ch]">
                                    Har flow ko all connected numbers ya selected WhatsApp numbers par run kar sakte hain. Customer jis number par message bhejta hai, reply usi receiving number se jayega.
                                </p>
                            </div>
                        </div>
                        <div className="mt-auto pt-3.5 border-t border-zinc-200/60 flex flex-wrap gap-2 text-[10px] sm:text-xs">
                            <span className="fb-tag fb-tag-zinc shadow-sm rounded-none border border-zinc-200/80 bg-white">
                                Current switch: {selectedAccount ? (selectedAccount.display_phone_number || selectedAccount.phone_number_id || selectedAccount.name) : 'All connected accounts'}
                            </span>
                            <span className="fb-tag fb-tag-zinc shadow-sm rounded-none border border-zinc-200/80 bg-white">
                                {waAccounts.length} connected number(s)
                            </span>
                            <span className="fb-tag fb-tag-zinc shadow-sm rounded-none border border-zinc-200/80 bg-white">
                                Duplicate trigger protection active
                            </span>
                        </div>
                    </div>
                    {/* Premium Infinite Loop Video Frame */}
                    <motion.div
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        onClick={() => setExpandedVideoUrl("/videos/FlowVideo.mp4")}
                        className="group relative w-full md:w-[390px] shrink-0 border border-zinc-200 rounded-none overflow-hidden bg-zinc-950 flex items-center justify-center cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.02)] transition-all duration-300 hover:border-zinc-400 z-10"
                    >
                        <video
                            src="/videos/FlowVideo.mp4"
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                        {/* Hover Play Button Overlay */}
                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-none border border-white/40 bg-black/60 text-white shadow-xl backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </div>
                        </div>
                    </motion.div>
                </GlowCard>

                {/* Connected access types Card */}
                <GlowCard 
                    className="fb-premium-card p-6 flex flex-col justify-between relative overflow-hidden group"
                    glowColor="rgba(0, 112, 209, 0.04)"
                >
                    <div className="relative z-10 w-full">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight fb-font-outfit">Connected access types</h2>
                            <Smartphone className="h-4.5 w-4.5 text-zinc-400" />
                        </div>
                        <div className="flex flex-col gap-3">
                            {/* Meta API Row */}
                            <motion.div 
                                whileTap={{ scale: 0.985 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="flex items-center justify-between border border-zinc-200 rounded-none p-3 bg-zinc-50/30 hover:bg-zinc-50/80 transition-all duration-200 group/row cursor-pointer relative overflow-hidden"
                            >
                                {/* Accent highlight line on hover */}
                                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 scale-y-0 group-hover/row:scale-y-100 transition-transform duration-200 origin-center" />
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-none flex items-center justify-center bg-emerald-50 border border-emerald-100 text-emerald-600 shrink-0 shadow-sm">
                                        <ShieldCheck className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xs sm:text-sm font-semibold text-zinc-900 fb-font-outfit">Meta API</h3>
                                        <p className="text-[10px] sm:text-[11px] leading-tight text-zinc-400 truncate max-w-[200px] xl:max-w-[170px]">
                                            Templates, broadcasts, profile sync...
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 pl-2">
                                    <span className="text-sm sm:text-base font-semibold text-zinc-900 fb-font-cabinet">{metaAccounts.length}</span>
                                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400 animate-in slide-in-from-left-1 duration-150" />
                                </div>
                            </motion.div>

                            {/* QR Session Row */}
                            <motion.div 
                                whileTap={{ scale: 0.985 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="flex items-center justify-between border border-zinc-200 rounded-none p-3 bg-zinc-50/30 hover:bg-zinc-50/80 transition-all duration-200 group/row cursor-pointer relative overflow-hidden"
                            >
                                {/* Accent highlight line on hover */}
                                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-500 scale-y-0 group-hover/row:scale-y-100 transition-transform duration-200 origin-center" />
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-none flex items-center justify-center bg-blue-50 border border-blue-100 text-blue-600 shrink-0 shadow-sm">
                                        <QrCode className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xs sm:text-sm font-semibold text-zinc-900 fb-font-outfit">QR Session</h3>
                                        <p className="text-[10px] sm:text-[11px] leading-tight text-zinc-400 truncate max-w-[200px] xl:max-w-[170px]">
                                            Chats and flow replies only...
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 pl-2">
                                    <span className="text-sm sm:text-base font-semibold text-zinc-900 fb-font-cabinet">{qrAccounts.length}</span>
                                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </GlowCard>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-[1px] bg-zinc-200 border border-zinc-200 shadow-sm">
                {/* Total Flows */}
                <GlowCard 
                    className="stat-card-anim rounded-none bg-white p-5 hover:bg-zinc-50/50 transition-colors flex flex-col justify-between"
                    glowColor="rgba(59, 130, 246, 0.08)"
                >
                    <div className="flex items-center justify-between relative z-10">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Total Flows</span>
                        <LayoutTemplate size={18} className="text-zinc-400" />
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 fb-font-cabinet relative z-10">
                        <AnimatedNumber value={flows.length} />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 leading-normal relative z-10">Created message flows</div>
                </GlowCard>

                {/* Active Flows */}
                <GlowCard 
                    className="stat-card-anim rounded-none bg-white p-5 hover:bg-zinc-50/50 transition-colors flex flex-col justify-between"
                    glowColor="rgba(16, 185, 129, 0.08)"
                >
                    <div className="flex items-center justify-between relative z-10">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Active Flows</span>
                        <CheckCircle2 size={18} className="text-zinc-400" />
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 fb-font-cabinet relative z-10">
                        <AnimatedNumber value={flows.filter(f => f.status === 'active').length} />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 leading-normal relative z-10">Currently running</div>
                </GlowCard>

                {/* Messages Sent */}
                <GlowCard 
                    className="stat-card-anim rounded-none bg-white p-5 hover:bg-zinc-50/50 transition-colors flex flex-col justify-between"
                    glowColor="rgba(139, 92, 246, 0.08)"
                >
                    <div className="flex items-center justify-between relative z-10">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Messages Sent</span>
                        <Send size={18} className="text-zinc-400" />
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 fb-font-cabinet relative z-10">
                        <AnimatedNumber value={flows.reduce((sum, f) => sum + (f.messagesSent || 0), 0)} />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 leading-normal relative z-10">Total sent count</div>
                </GlowCard>
            </div>

            {/* Flows List */}
            <div data-tour="flows-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mt-2">
                {flows.map(flow => {
                    const theme = getFlowCardTheme(flow.name);
                    const IconComp = theme.icon;

                    return (
                        <GlowCard 
                            key={flow.id} 
                            className="flow-card-anim flex flex-col rounded-none border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/20 p-6 hover:-translate-y-0.5 hover:border-zinc-350 hover:shadow-[0_12px_36px_rgba(0,0,0,0.03)] transition-all duration-300 group relative overflow-hidden"
                            glowColor="rgba(0, 0, 0, 0.03)"
                        >
                            {/* Premium Metallic Gray Top Gradient Line (Permanently Visible) */}
                            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-300 opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

                            <div className="flex-1 flex flex-col justify-between gap-5 relative z-10">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start flex-1 min-w-0">
                                        <div className={`h-9 w-9 flex items-center justify-center shrink-0 border border-zinc-200 bg-zinc-50/50 text-zinc-700 rounded-none shadow-sm`}>
                                            <IconComp className="h-4.5 w-4.5" />
                                        </div>
                                        <div className="ml-3.5 min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <h3 className="font-semibold text-zinc-950 truncate text-sm sm:text-base leading-tight fb-font-outfit" title={flow.name}>
                                                    {flow.name}
                                                </h3>
                                            </div>
                                            {flow.description && (
                                                <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed font-normal">
                                                    {flow.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        {/* Always-visible Premium Toggle Switch */}
                                        <button
                                            onClick={() => toggleFlowStatus(flow)}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${flow.status === 'active' ? 'bg-[#10b981]' : 'bg-zinc-200'
                                                }`}
                                            title={flow.status === 'active' ? 'Pause Flow' : 'Activate Flow'}
                                        >
                                            <motion.span
                                                animate={{ x: flow.status === 'active' ? 18 : 2 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm"
                                            />
                                        </button>

                                        {/* Always Visible Actions */}
                                        <div className="flex items-center gap-1">
                                            <motion.button
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => handleDuplicateFlow(flow)}
                                                className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-none transition-all cursor-pointer"
                                                title="Duplicate"
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </motion.button>
                                            <motion.button
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => handleDeleteFlow(flow.id)}
                                                className="p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-650 rounded-none transition-all cursor-pointer"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </motion.button>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    {/* Structure and Volume */}
                                    <div className="border-t border-dashed border-zinc-200 pt-3 flex items-center justify-between text-xs">
                                        <div>
                                            <span className="block text-[8px] font-mono font-bold uppercase tracking-widest text-zinc-400 leading-none">Structure</span>
                                            <span className="block text-xs font-bold text-zinc-950 mt-1.5 fb-font-outfit">{Array.isArray(flow.nodes) ? flow.nodes.length : 0} nodes</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[8px] font-mono font-bold uppercase tracking-widest text-zinc-400 leading-none">Volume</span>
                                            <div className="flex items-center gap-1.5 mt-1.5 justify-end">
                                                <span className="block text-xs font-bold text-zinc-950 fb-font-outfit">{(flow.messagesSent || 0).toLocaleString()} sent</span>
                                                <svg width="24" height="10" viewBox="0 0 24 10" fill="none" className="opacity-80 shrink-0">
                                                    <path d="M2 8 L6 6.5 L10 3.5 L14 5 L22 1" stroke={flow.status === 'active' ? '#10b981' : '#a1a1aa'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Triggers and Scope */}
                                    <div className="border-t border-dashed border-zinc-200 pt-3.5 mt-3.5 flex items-start justify-between text-xs">
                                        <div className="flex-1 pr-3">
                                            <span className="block text-[8px] font-mono font-bold uppercase tracking-widest text-zinc-400 mb-1.5 leading-none">Triggers</span>
                                            <TriggersContainer triggers={flow.triggers} />
                                        </div>
                                        <div className="text-right shrink-0 flex flex-col items-end">
                                            <span className="block text-[8px] font-mono font-bold uppercase tracking-widest text-zinc-400 mb-1.5 leading-none">Scope</span>
                                            <span className="inline-block text-[9px] font-mono font-bold uppercase tracking-wider text-blue-750 bg-blue-50/60 border border-blue-100/30 rounded-none px-1.5 py-0.5 mt-0.5">
                                                {flow.wa_account_scope === 'all' ? 'All numbers' : `${flow.wa_account_ids?.length || 0} selected`}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer & Actions */}
                            <div className="mt-4 pt-3.5 border-t border-dashed border-zinc-200 flex flex-col gap-3">
                                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                                    <span>Last edited {formatRelativeTime(flow.updated_at || flow.created_at)}</span>
                                </div>
                                <div className="flex gap-2.5 w-full">
                                    <motion.button
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setEditingFlow(flow)}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-none border border-zinc-200 bg-white py-2 text-xs font-semibold text-zinc-700 hover:border-zinc-350 hover:bg-zinc-50 hover:text-zinc-950 transition-all cursor-pointer shadow-sm"
                                    >
                                        <Edit2 className="h-3.5 w-3.5 text-zinc-450" />
                                        Edit Flow
                                    </motion.button>
                                    <motion.button
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => openRunsModal(flow)}
                                        className="inline-flex items-center justify-center rounded-none border border-zinc-200 bg-white px-3.5 py-2 text-zinc-500 hover:text-zinc-950 hover:border-zinc-350 transition-all cursor-pointer shadow-sm"
                                        title="Run logs"
                                    >
                                        <Activity className="h-3.5 w-3.5 text-zinc-450" />
                                    </motion.button>
                                </div>
                            </div>
                        </GlowCard>
                    );
                })}

                {/* Create your next flow Card */}
                <GlowCard
                    onClick={() => setShowCreateModal(true)}
                    glowColor="rgba(0, 0, 0, 0.02)"
                    className="flow-card-anim flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 hover:border-zinc-350 rounded-none bg-zinc-50/20 hover:bg-zinc-50 p-6 text-center min-h-[200px] sm:min-h-[240px] transition-all group cursor-pointer hover:shadow-[0_8px_30px_rgba(0,0,0,0.015)]"
                >
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                        <motion.div 
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.95 }}
                            className="h-10 w-10 rounded-full bg-white group-hover:bg-zinc-50 flex items-center justify-center border border-zinc-200 group-hover:border-zinc-300 text-zinc-400 group-hover:text-zinc-650 transition-colors shadow-sm"
                        >
                            <Plus className="h-5 w-5" />
                        </motion.div>
                        <h3 className="text-sm sm:text-base font-semibold text-zinc-850 tracking-tight mt-4 fb-font-outfit group-hover:text-zinc-950">Create your next flow</h3>
                        <p className="text-xs text-zinc-450 mt-1 max-w-[200px] leading-relaxed group-hover:text-zinc-500">
                            Start building another automation for your business.
                        </p>
                    </div>
                </GlowCard>
            </div>

            <AnimatePresence>
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
            </AnimatePresence>

            <AnimatePresence>
                {runsModalFlow && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                        onClick={() => { setRunsModalFlow(null); setFlowRuns([]); }}
                    >
                        <motion.div
                            initial={{ scale: 0.96, y: 15, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.96, y: 15, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 450, damping: 30 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-3xl overflow-hidden rounded-none border border-zinc-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Flow Runs</h2>
                                    <p className="text-sm text-gray-500">{runsModalFlow.name}</p>
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => { setRunsModalFlow(null); setFlowRuns([]); }}
                                    className="rounded-none p-2 text-gray-500 hover:bg-zinc-100 hover:text-gray-805 border border-zinc-200"
                                >
                                    <X className="h-5 w-5" />
                                </motion.button>
                            </div>
                            <div className="max-h-[60vh] overflow-y-auto p-5">
                                {runsLoading ? (
                                    <div className="py-10 text-center text-sm text-gray-500">Loading runs...</div>
                                ) : flowRuns.length === 0 ? (
                                    <div className="rounded-none border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                                        No runs yet. Send a matching WhatsApp keyword to trigger this flow.
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-none border border-zinc-200">
                                        <table className="min-w-full divide-y divide-dashed divide-zinc-200 text-sm">
                                            <thead className="bg-zinc-50 text-xs font-mono text-zinc-500">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-semibold">Started</th>
                                                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                                                    <th className="px-4 py-3 text-left font-semibold">Conversation</th>
                                                    <th className="px-4 py-3 text-left font-semibold">Error</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-dashed divide-zinc-200 bg-white">
                                                {flowRuns.map(run => (
                                                    <tr key={run.id}>
                                                        <td className="px-4 py-3 text-gray-700">{run.started_at ? new Date(run.started_at).toLocaleString() : '-'}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`rounded-none border px-2 py-0.5 text-xs font-semibold ${run.status === 'completed' ? 'border-green-200 bg-green-50/50 text-green-700' :
                                                                    run.status === 'failed' ? 'border-red-200 bg-red-50/50 text-red-700' :
                                                                        'border-blue-200 bg-blue-50/50 text-blue-700'
                                                                }`}>
                                                                {run.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{run.conversation_id}</td>
                                                        <td className="px-4 py-3 text-red-650">{run.error_message || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {expandedVideoUrl && createPortal(
                <div
                    onClick={() => setExpandedVideoUrl(null)}
                    className="fixed inset-0 z-[99999] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-4xl overflow-hidden border border-zinc-200/20 bg-black shadow-2xl rounded-none aspect-video"
                    >
                        <button
                            onClick={() => setExpandedVideoUrl(null)}
                            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-none bg-black/60 text-white/80 hover:bg-black/80 hover:text-white border border-zinc-200/20 transition-all"
                            title="Close preview"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <video
                            src={expandedVideoUrl}
                            autoPlay
                            controls
                            className="h-full w-full object-contain"
                        />
                    </div>
                </div>,
                document.body
            )}

            {/* Create Flow Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => {
                            setShowCreateModal(false);
                            setNewFlowName('');
                            setNewFlowDescription('');
                            setNewFlowAccountScope('all');
                            setNewFlowAccountIds([]);
                        }}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 15, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 15, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 450, damping: 30 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl border border-zinc-150"
                        >
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
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setNewFlowName('');
                                        setNewFlowDescription('');
                                        setNewFlowAccountScope('all');
                                        setNewFlowAccountIds([]);
                                    }}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                                >
                                    Cancel
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleCreateFlow}
                                    disabled={!newFlowName.trim() || (newFlowAccountScope === 'selected' && newFlowAccountIds.length === 0)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                                >
                                    <Plus className="h-4 w-4" />
                                    Create Flow
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
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
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            {/* Mobile View (< md) */}
            <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="md:hidden flex h-full w-full flex-col overflow-hidden bg-gray-50"
            >
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
                                    <motion.button 
                                        whileTap={{ scale: 0.9 }}
                                        onClick={onClose} 
                                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg ml-0.5"
                                    >
                                        <X className="h-4.5 w-4.5" />
                                    </motion.button>
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
                                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${category === item ? 'bg-black text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
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
                                className={`rounded-xl border bg-white overflow-hidden transition-all duration-200 ${selected ? 'border-[#25D366] ring-2 ring-[#25D366]/10' : 'border-gray-200 hover:border-gray-300'
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
            </motion.div>

            {/* Desktop View (>= md) */}
            <motion.div 
                initial={{ scale: 0.95, y: 15, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 15, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={(e) => e.stopPropagation()}
                className="hidden md:flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-none border border-gray-200 bg-white sm:h-[88vh] sm:rounded-lg lg:flex-row"
            >
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
                            <motion.button 
                                whileTap={{ scale: 0.9 }}
                                onClick={onClose} 
                                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-black cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </motion.button>
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
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    key={item}
                                    onClick={() => onCategoryChange(item)}
                                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${category === item ? 'bg-black text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                        } cursor-pointer`}
                                >
                                    {item}
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[#f5f7fa] p-3">
                        <div className="space-y-2">
                            {templates.map(template => {
                                const selected = selectedTemplate?.id === template.id;
                                const starred = Boolean(templateStarStats[template.id]?.starred);

                                return (
                                    <motion.button
                                        whileTap={{ scale: 0.99 }}
                                        key={template.id}
                                        type="button"
                                        onClick={() => onSelectTemplate(template)}
                                        className={`w-full rounded-lg border bg-white p-4 text-left transition-colors ${selected ? 'border-[#25D366] ring-2 ring-[#25D366]/10' : 'border-gray-200 hover:border-gray-300'
                                            } cursor-pointer`}
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
                                    </motion.button>
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
                                <motion.button
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => onToggleStar(selectedTemplate.id)}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${templateStarStats[selectedTemplate.id]?.starred
                                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                        } cursor-pointer`}
                                >
                                    <Star className={`h-4 w-4 ${templateStarStats[selectedTemplate.id]?.starred ? 'fill-current' : ''}`} />
                                    Star · {getTemplateStars(selectedTemplate, templateStarStats)}
                                </motion.button>
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

                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={onUseTemplate}
                                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white hover:bg-[#1fb85a] cursor-pointer"
                            >
                                <LayoutTemplate className="h-4 w-4" />
                                Use Template
                            </motion.button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
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
                className={`absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white to-transparent pointer-events-none z-10 transition-opacity duration-200 ${showTopFade ? 'opacity-100' : 'opacity-0'
                    }`}
            />

            <div
                ref={containerRef}
                className="h-[72px] overflow-y-auto no-scrollbar scroll-smooth pr-1"
            >
                <div className="flex flex-wrap gap-1.5 pb-2">
                    {triggers && triggers.length > 0 ? (
                        triggers.map((trigger, i) => (
                            <span key={i} className="inline-flex items-center rounded-none border border-blue-200 bg-blue-50/40 px-2 py-0.5 text-[9px] font-bold text-blue-700 shadow-sm">
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
                className={`absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none z-10 transition-opacity duration-200 ${showBottomFade ? 'opacity-100' : 'opacity-0'
                    }`}
            />
        </div>
    );
}

// Premium Animation Helper: Spotlight Mouse Tracker Card
function GlowCard({ children, className = '', glowColor = 'rgba(9, 9, 11, 0.04)', ...props }) {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <div
            onMouseMove={handleMouseMove}
            className={`group relative overflow-hidden ${className}`}
            {...props}
        >
            <motion.div
                className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
                style={{
                    background: useTransform(
                        [mouseX, mouseY],
                        ([x, y]) => `radial-gradient(350px circle at ${x}px ${y}px, ${glowColor}, transparent 80%)`
                    ),
                }}
            />
            {children}
        </div>
    );
}

// Premium Animation Helper: GSAP-based dynamic count-up text
function AnimatedNumber({ value }) {
    const [displayVal, setDisplayVal] = useState(0);
    const prevValueRef = useRef(0);

    useEffect(() => {
        const obj = { val: prevValueRef.current };
        gsap.to(obj, {
            val: value,
            duration: 0.8,
            ease: 'power2.out',
            onUpdate: () => {
                setDisplayVal(Math.floor(obj.val));
            }
        });
        prevValueRef.current = value;
    }, [value]);

    return <span>{displayVal.toLocaleString()}</span>;
}


