import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Filter, MoreHorizontal, FileText, CheckCircle, Clock, XCircle, Image as ImageIcon, Video, Trash2, Link as LinkIcon, Phone, AlertCircle, RefreshCw, UploadCloud, Type, MessageSquareText, MousePointerClick, ChevronDown, Loader2, Check, CheckCheck, MessageSquare, Image, ExternalLink, ArrowRight, ShieldCheck, HelpCircle, Tag, Building2, Target, Sparkles, LockKeyhole, CalendarDays } from 'lucide-react'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { notify } from '../services/notificationService'
import { META_TEMPLATES_LIBRARY } from '../data/metaTemplates'
import MetaTemplateLibrary from '../components/MetaTemplateLibrary'
import { getPendingReviewInfo } from '../utils/templateReview'
import { placeholderCopy, suggestTemplateCategory } from '../utils/templateApproval'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const formatDateToIST = (dateStr) => {
    if (!dateStr) return 'recently';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const formatter = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        });
        return formatter.format(date) + ' IST';
    } catch {
        return dateStr;
    }
};

const formatTimeToIST = (dateStr) => {
    if (!dateStr) return '12:00 PM';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '12:00 PM';

        const formatter = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        });
        return formatter.format(date);
    } catch {
        return '12:00 PM';
    }
};

const formatTemplateLanguage = (language) => ({
    en: 'English',
    en_US: 'English (US)',
    hi: 'Hindi',
    es_ES: 'Spanish',
    pt_BR: 'Portuguese (BR)',
}[language] || language || 'Unknown');

const extractTemplateVariables = (text) => {
    const matches = String(text || '').match(/\{\{(\d+)\}\}/g);
    return matches ? Array.from(new Set(matches)) : [];
};
const USE_CASE_LABELS = {
    'All Use Cases': 'All Use Cases',
    'ACCOUNT_UPDATES': 'Account Updates',
    'ORDER_MANAGEMENT': 'Order Management',
    'EVENT_REMINDER': 'Event Reminder',
    'OTP': 'OTP / Authentication',
    'MARKETING_CAMPAIGNS': 'Marketing Campaigns',
    'CUSTOMER_CARE': 'Customer Care'
};

const TOPIC_LABELS = {
    'ALL': 'All Topics',
    'MARKETING': 'Marketing',
    'UTILITY': 'Utility',
    'AUTHENTICATION': 'Authentication'
};

export default function Templates({ defaultView = 'MY_TEMPLATES' }) {
    const navigate = useNavigate();
    const { session, apiCall } = useAuth();
    const { alertDialog, confirmDialog } = useDialog();
    const [viewMode, setViewMode] = useState(defaultView);
    const [iscreateOpen, setIsCreateOpen] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState(null)
    const [activeTab, setActiveTab] = useState('ALL') // ALL, MARKETING, UTILITY, AUTHENTICATION
    const [activeStatus, setActiveStatus] = useState('APPROVED') // APPROVED, PENDING, DRAFT
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
    const [templateSearch, setTemplateSearch] = useState('')

    const { data: templates = [], isLoading: loading, isFetching, error: queryError, refetch } = useQuery({
        queryKey: ['whatsapp-templates'],
        queryFn: async () => {
            const res = await apiCall(`${API_URL}/api/whatsapp/templates`)
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || 'Could not load templates from Meta.')
            }
            return res.json()
        },
        enabled: !!session?.access_token,
        refetchInterval: query => query.state.data?.some(template => template.status === 'PENDING') ? 30000 : false,
    })
    const { data: officialLibrary = [], isLoading: libraryLoading, error: libraryError } = useQuery({
        queryKey: ['meta-template-library', 'v2'],
        queryFn: async () => {
            const res = await apiCall(`${API_URL}/api/whatsapp/templates/library?language=en_US&limit=250`)
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || 'Could not load the Meta template library.')
            return (json.data || []).map(item => {
                let components = Array.isArray(item.components) ? [...item.components] : []
                if (components.length === 0) {
                    if (item.header) components.push({ type: 'HEADER', format: 'TEXT', text: item.header, example: item.header_params?.length ? { header_text: item.header_params } : undefined })
                    if (item.body) components.push({ type: 'BODY', text: item.body, example: item.body_params?.length ? { body_text: [item.body_params] } : undefined })
                    if (item.buttons?.length) components.push({ type: 'BUTTONS', buttons: item.buttons })
                }
                return {
                    ...item,
                    id: `meta-${item.id || `${item.name}-${item.language}`}`,
                    source: 'meta_library',
                    displayName: item.name.replaceAll('_', ' '),
                    industry: (item.industry || ['General']).map(value => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())),
                    useCase: item.usecase || item.topic || 'ACCOUNT_UPDATES',
                    components,
                }
            })
        },
        enabled: !!session?.access_token && viewMode === 'INDUSTRIES',
        staleTime: 5 * 60 * 1000,
    })
    const fetchError = queryError?.message || ''
    const libraryTemplates = useMemo(() => [
        ...officialLibrary,
        ...META_TEMPLATES_LIBRARY
            .filter(item => item.category !== 'UTILITY')
            .map(item => ({ ...item, source: 'curated_draft' })),
    ], [officialLibrary])

    // Prefill state
    const [prefilledTemplate, setPrefilledTemplate] = useState(null);

    // Meta pre-approved library filter states
    const [libraryTopic, setLibraryTopic] = useState('ALL') // ALL, MARKETING, UTILITY, AUTHENTICATION
    const [activeIndustry, setActiveIndustry] = useState('All Industries')
    const [libraryUseCase, setLibraryUseCase] = useState('All Use Cases')
    const [searchQuery, setSearchQuery] = useState('')
    const [showMobileFilters, setShowMobileFilters] = useState(false)

    useEffect(() => {
        setViewMode(defaultView);
    }, [defaultView]);

    // Compute unified templates list
    const allTemplatesList = useMemo(() => {
        return templates;
    }, [templates]);

    // Compute status counts for indicators
    const approvedCount = useMemo(() => {
        return allTemplatesList.filter(t => t.status === 'APPROVED').length;
    }, [allTemplatesList]);

    const pendingCount = useMemo(() => {
        return allTemplatesList.filter(t => t.status === 'PENDING').length;
    }, [allTemplatesList]);

    const draftCount = useMemo(() => {
        return allTemplatesList.filter(t => t.status === 'DRAFT' || t.status === 'REJECTED').length;
    }, [allTemplatesList]);

    // Compute filtered list based on dropdown and status tabs
    const filteredTemplates = useMemo(() => {
        return allTemplatesList.filter(t => {
            const matchCategory = activeTab === 'ALL' || t.category === activeTab;
            const body = t.components?.find(component => component.type === 'BODY')?.text || ''
            const matchSearch = !templateSearch.trim() || `${t.name} ${body}`.toLowerCase().includes(templateSearch.trim().toLowerCase())

            let matchStatus = false;
            if (activeStatus === 'APPROVED') {
                matchStatus = t.status === 'APPROVED';
            } else if (activeStatus === 'PENDING') {
                matchStatus = t.status === 'PENDING';
            } else if (activeStatus === 'DRAFT') {
                // Draft view includes DRAFT or REJECTED templates
                matchStatus = t.status === 'DRAFT' || t.status === 'REJECTED';
            }

            return matchCategory && matchStatus && matchSearch;
        });
    }, [allTemplatesList, activeTab, activeStatus, templateSearch]);

    const fetchData = async () => {
        refetch()
    }

    const handleCreateSuccess = () => {
        fetchData();
        setViewMode('MY_TEMPLATES');
        setActiveStatus('PENDING');
    };

    // When user clicks "+ Add to My Templates" on any industry library template:
    // → Always open the CreateTemplateModal pre-filled with the template data
    // → User reviews, customizes, uploads their own media if needed
    // → User clicks "Submit for Review" to send to Meta for approval
    // This way the user is always in control — nothing gets submitted without their explicit action.
    const handleAddToMyTemplates = (item) => {
        setSelectedTemplate(null); // close preview modal if open
        setPrefilledTemplate(item);
        setIsCreateOpen(true);
    };




    const handleDelete = async (name) => {
        const confirmed = await confirmDialog(`Are you sure you want to delete template "${name}"?`, {
            title: 'Delete template',
            tone: 'danger',
            confirmLabel: 'Delete template',
        });
        if (!confirmed) return;
        try {
            const res = await apiCall(`${API_URL}/api/whatsapp/templates/${name}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                notify.success(`Template "${name}" deleted successfully`)
                fetchData();
            } else {
                const data = await res.json();
                notify.error(data.error || 'Failed to delete template')
                alertDialog(data.error || 'Failed to delete template', { title: 'Delete failed', tone: 'danger' });
            }
        } catch (error) {
            console.error(error);
        }
    }

    const filteredLibrary = useMemo(() => {
        return libraryTemplates.filter(t => {
            const matchesSearch = t.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.components?.find(c => c.type === 'BODY')?.text?.toLowerCase()?.includes(searchQuery.toLowerCase());

            const tInd = Array.isArray(t.industry) ? t.industry[0] : (t.industry || 'General');
            const matchesIndustry = activeIndustry === 'All Industries' || tInd === activeIndustry;
            const matchesTopic = libraryTopic === 'ALL' || t.category === libraryTopic;
            const matchesUseCase = libraryUseCase === 'All Use Cases' || t.useCase === libraryUseCase;

            return matchesSearch && matchesIndustry && matchesTopic && matchesUseCase;
        });
    }, [libraryTemplates, searchQuery, activeIndustry, libraryTopic, libraryUseCase]);

    if (viewMode === 'INDUSTRIES') {
        return (
            <>
                <MetaTemplateLibrary
                    templates={libraryTemplates}
                    filteredTemplates={filteredLibrary}
                    loading={libraryLoading}
                    error={libraryError?.message}
                    topic={libraryTopic}
                    setTopic={setLibraryTopic}
                    industry={activeIndustry}
                    setIndustry={setActiveIndustry}
                    useCase={libraryUseCase}
                    setUseCase={setLibraryUseCase}
                    search={searchQuery}
                    setSearch={setSearchQuery}
                    showFilters={showMobileFilters}
                    setShowFilters={setShowMobileFilters}
                    onOpen={setSelectedTemplate}
                    onUse={handleAddToMyTemplates}
                />
                <CreateTemplateModal
                    isOpen={iscreateOpen}
                    onClose={() => {
                        setIsCreateOpen(false)
                        setPrefilledTemplate(null)
                    }}
                    onSuccess={handleCreateSuccess}
                    apiCall={apiCall}
                    initialData={prefilledTemplate}
                />
                <ViewTemplateModal
                    template={selectedTemplate}
                    onClose={() => setSelectedTemplate(null)}
                    onAddToMyTemplates={handleAddToMyTemplates}
                />
            </>
        )
    }

    if (viewMode === 'INDUSTRIES_LEGACY') {
        const industryMeta = {
            'General': { color: 'neutral' },
            'Real Estate': { color: 'amber' },
            'E-commerce': { color: 'blue' },
            'Healthcare': { color: 'green' },
            'Education': { color: 'indigo' },
            'Finance': { color: 'purple' },
        };

        const categoryColors = {
            MARKETING: 'bg-blue-50 text-blue-700 border-blue-100',
            UTILITY: 'bg-emerald-50 text-emerald-700 border-emerald-100',
            AUTHENTICATION: 'bg-violet-50 text-violet-750 border-violet-100',
        };

        const topicOptions = [
            { label: 'All Topics', value: 'ALL', count: META_TEMPLATES_LIBRARY.length },
            { label: 'Marketing', value: 'MARKETING', count: META_TEMPLATES_LIBRARY.filter(t => t.category === 'MARKETING').length },
            { label: 'Utility', value: 'UTILITY', count: META_TEMPLATES_LIBRARY.filter(t => t.category === 'UTILITY').length },
            { label: 'Authentication', value: 'AUTHENTICATION', count: META_TEMPLATES_LIBRARY.filter(t => t.category === 'AUTHENTICATION').length },
        ];

        const industryOptions = [
            { label: 'All Industries', value: 'All Industries' },
            ...Object.keys(industryMeta).map(ind => ({
                label: ind,
                value: ind
            }))
        ];

        const useCaseOptions = [
            { label: 'All Use Cases', value: 'All Use Cases' },
            ...Object.keys(USE_CASE_LABELS).filter(key => key !== 'All Use Cases').map(key => ({
                label: USE_CASE_LABELS[key],
                value: key
            }))
        ];

        return (
            <div className="min-h-full bg-[#f5f7fa] px-3 py-4 sm:px-6 sm:py-5 lg:px-8">
                {/* ═══════════════════════════════════════════════════════════════
                    PREMIUM GLOWING HERO HEADER & FILTERS
                ═══════════════════════════════════════════════════════════════ */}
                <div className="sticky top-0 z-20 mx-auto max-w-[1680px] rounded-xl border border-[#e8edf3] bg-white/95 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] backdrop-blur-md sm:p-5">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-[#0064b7]">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Ready-to-use message library
                                </div>
                                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-light tracking-tight text-black sm:text-[30px]">
                                    Explore Meta templates
                                    <span className="rounded-full border border-[#cfe5fb] bg-[#eef7ff] px-2.5 py-1 text-[11px] font-semibold text-[#0064b7]">
                                        {META_TEMPLATES_LIBRARY.length} items
                                    </span>
                                </h1>
                                <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">Launch trusted WhatsApp conversations faster with templates already reviewed by Meta.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf8f1] px-3 py-1.5 text-xs font-semibold text-[#087a55] ring-1 ring-inset ring-[#c9eddd]">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Meta Pre-Approved
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-6 sm:flex sm:flex-row flex-wrap gap-3 sm:gap-4 items-end">
                            <div className="col-span-5 sm:w-72">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Search templates</label>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    <input
                                        data-tour="templates-library-search"
                                        type="text"
                                        placeholder="Search by name or content..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-10 w-full rounded-xl border border-gray-250 bg-white pl-9 pr-8 text-sm font-medium text-gray-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 placeholder:text-gray-400"
                                        style={{ borderRadius: '10px' }}
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <XCircle className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            <div className="col-span-1 sm:hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                                    className={`h-10 w-full flex items-center justify-center rounded-xl border transition-all ${
                                        showMobileFilters 
                                            ? 'bg-blue-50 border-blue-500 text-blue-600' 
                                            : 'bg-white border-gray-300 text-gray-500'
                                    }`}
                                    style={{ borderRadius: '10px' }}
                                    title="Toggle Filters"
                                >
                                    <Filter className="h-4 w-4" />
                                </button>
                            </div>

                            <div className={`${showMobileFilters ? 'grid grid-cols-2 gap-3 col-span-6 w-full' : 'hidden'} sm:contents`}>
                                <div className="col-span-1 sm:w-48">
                                    <CustomSelectDropdown
                                        value={libraryTopic}
                                        onChange={setLibraryTopic}
                                        options={topicOptions}
                                        label="Topic Category"
                                        icon={Tag}
                                    />
                                </div>
                                <div className="col-span-1 sm:w-48">
                                    <CustomSelectDropdown
                                        value={activeIndustry}
                                        onChange={setActiveIndustry}
                                        options={industryOptions}
                                        label="Industry Filter"
                                        icon={Building2}
                                    />
                                </div>
                                <div className="col-span-2 sm:w-52">
                                    <CustomSelectDropdown
                                        value={libraryUseCase}
                                        onChange={setLibraryUseCase}
                                        options={useCaseOptions}
                                        label="Use Case Objective"
                                        icon={Target}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                    CARDS GRID
                ═══════════════════════════════════════════════════════════════ */}
                <div className="mx-auto min-w-0 max-w-[1680px] flex-1 py-5 sm:py-6">
                    {filteredLibrary.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white py-24 text-center max-w-md mx-auto my-12 shadow-sm" style={{ borderRadius: '16px' }}>
                            <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 border border-gray-100" style={{ borderRadius: '50%' }}>
                                <Search className="h-7 w-7 text-gray-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">No matching templates</h3>
                            <p className="text-xs text-gray-400 mt-2 max-w-[280px] leading-relaxed">We couldn't find any pre-approved templates matching those filters. Try clearing filters or changing your search criteria.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {filteredLibrary.map((item) => {
                                const bodyComp = item.components?.find(c => c.type === 'BODY');
                                const buttonsComp = item.components?.find(c => c.type === 'BUTTONS');
                                const headerComp = item.components?.find(c => c.type === 'HEADER');
                                const footerComp = item.components?.find(c => c.type === 'FOOTER');
                                const catStyle = categoryColors[item.category] || 'bg-gray-50 text-gray-600 border-gray-200';

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedTemplate(item)}
                                        className="group meta-template-card relative flex flex-col justify-between overflow-hidden cursor-pointer"
                                    >
                                        <div className="flex flex-1 flex-col p-4 sm:p-5">
                                            {/* Category & Badge Row */}
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${catStyle}`} style={{ borderRadius: '10px' }}>
                                                    {item.category}
                                                </span>
                                                <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5" style={{ borderRadius: '6px' }}>
                                                    {USE_CASE_LABELS[item.useCase] || item.useCase}
                                                </span>
                                            </div>

                                            {/* Title */}
                                            <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors duration-200 truncate">{item.displayName}</h3>
                                            <p className="text-[10px] font-semibold text-gray-400 mt-0.5 mb-3 tracking-wide uppercase">
                                                {item.industry} Industry
                                            </p>

                                            {/* WhatsApp Mock Chat Bubble Preview */}
                                            <div className="wa-template-canvas relative mb-1 flex min-h-[178px] flex-1 flex-col justify-between overflow-hidden border border-[#e4ded5] p-3">

                                                <div className="bg-white p-2.5 pb-1.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[95%] self-start relative z-10" style={{ borderRadius: '8px 8px 8px 0px' }}>
                                                    {headerComp?.format === 'TEXT' && (
                                                        <p className="text-[10px] font-extrabold text-gray-900 mb-1 leading-tight border-b border-gray-100 pb-0.5">{headerComp.text}</p>
                                                    )}
                                                    {headerComp?.format === 'IMAGE' && (
                                                        <div className="mb-1.5 h-16 w-full rounded bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100" style={{ borderRadius: '4px' }}>
                                                            <ImageIcon className="h-4 w-4 text-gray-450" />
                                                        </div>
                                                    )}
                                                    {headerComp?.format === 'VIDEO' && (
                                                        <div className="mb-1.5 h-16 w-full rounded bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100" style={{ borderRadius: '4px' }}>
                                                            <Video className="h-4 w-4 text-gray-450" />
                                                        </div>
                                                    )}

                                                    <p className="text-[11px] leading-relaxed text-gray-800 whitespace-pre-line font-medium">
                                                        {renderTemplateText(bodyComp?.text || '')}
                                                    </p>

                                                    {footerComp?.text && (
                                                        <p className="text-[8px] text-gray-400 mt-1 font-semibold leading-none">{footerComp.text}</p>
                                                    )}

                                                    <div className="flex items-center justify-end mt-1 gap-0.5 leading-none">
                                                        <span className="text-[7.5px] text-gray-450 font-medium">12:00 PM</span>
                                                        <span className="text-[#34b7f1] text-[8px] font-bold">✓✓</span>
                                                    </div>
                                                </div>

                                                {/* Chat Buttons Mock */}
                                                {buttonsComp?.buttons?.length > 0 && (
                                                    <div className="mt-2 space-y-1 w-[95%] self-start relative z-10">
                                                        {buttonsComp.buttons.slice(0, 2).map((btn, i) => (
                                                            <div key={i} className="flex items-center justify-center gap-1 bg-white hover:bg-gray-50 text-[9.5px] font-bold text-blue-600 rounded-lg py-1.5 border border-gray-200/80 shadow-sm transition-all" style={{ borderRadius: '8px' }}>
                                                                {btn.type === 'URL' ? <ExternalLink className="h-3 w-3 shrink-0" /> : btn.type === 'PHONE_NUMBER' ? <Phone className="h-3 w-3 shrink-0" /> : <MessageSquare className="h-3 w-3 shrink-0" />}
                                                                <span className="truncate">{btn.text}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card Footer action bar */}
                                        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-[#fbfcfd] px-4 py-3">
                                            <span className="text-[9.5px] text-gray-400 font-bold flex items-center gap-1">
                                                <ShieldCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                Meta Pre-Approved
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddToMyTemplates(item);
                                                }}
                                                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[#0070d1] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0064b7] active:scale-[0.98]"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Use Layout
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Modals */}
                <CreateTemplateModal
                    isOpen={iscreateOpen}
                    onClose={() => {
                        setIsCreateOpen(false);
                        setPrefilledTemplate(null);
                    }}
                    onSuccess={handleCreateSuccess}
                    apiCall={apiCall}
                    initialData={prefilledTemplate}
                />
                <ViewTemplateModal
                    template={selectedTemplate}
                    onClose={() => setSelectedTemplate(null)}
                    onAddToMyTemplates={(tpl) => {
                        setSelectedTemplate(null);
                        handleAddToMyTemplates(tpl);
                    }}
                />
            </div>
        )
    }


    return (
        <div className="space-y-5 px-4 pb-8 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-950">Message Templates</h1>
                    <p className="mt-1 text-[13px] text-slate-500">Manage your WhatsApp message templates</p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                    <button
                        onClick={() => navigate('/templates/new')}
                        data-tour="templates-create"
                        className="inline-flex h-9 w-full flex-1 items-center justify-center gap-2 rounded-md bg-[#0b74c9] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#0867b4] md:w-auto md:flex-initial"
                    >
                        <Plus className="h-4 w-4" />
                        New Template
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div data-tour="templates-filters" className="rounded-md border border-[#d8dee6] bg-white p-2.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={templateSearch}
                            onChange={event => setTemplateSearch(event.target.value)}
                            placeholder="Search template name or message..."
                            className="h-9 w-full rounded-md border border-[#ccd4de] bg-white pl-9 pr-3 text-[12px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"
                        />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {/* Category Dropdown */}
                    <div className="relative w-full md:w-auto">
                        <button
                            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                            className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[#ccd4de] bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#0b74c9] md:w-auto md:justify-start"
                        >
                            <span className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-gray-400" />
                                {activeTab === 'ALL' ? 'All Templates' : activeTab.charAt(0) + activeTab.slice(1).toLowerCase()}
                            </span>
                            <ChevronDown className="h-4 w-4 text-gray-400 ml-1" />
                        </button>

                        {showCategoryDropdown && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                                <div className="absolute left-0 mt-1.5 w-full md:w-48 rounded-xl border border-gray-200 bg-white shadow-lg z-20 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100">
                                    {[
                                        { val: 'ALL', label: 'All Templates' },
                                        { val: 'MARKETING', label: 'Marketing' },
                                        { val: 'UTILITY', label: 'Utility' },
                                        { val: 'AUTHENTICATION', label: 'Authentication' }
                                    ].map((opt) => (
                                        <button
                                            key={opt.val}
                                            onClick={() => {
                                                setActiveTab(opt.val);
                                                setShowCategoryDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeTab === opt.val
                                                ? 'bg-green-50 text-green-700 font-semibold'
                                                : 'text-gray-700 hover:bg-gray-50'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="hidden md:block h-6 w-px bg-gray-200" />

                    {/* Status Tabs */}
                    <div className="flex h-9 w-full rounded-md border border-[#d8dee6] bg-[#f5f6f8] p-0.5 md:w-auto">
                        {[
                            { status: 'APPROVED', label: 'Approved', count: approvedCount, icon: CheckCircle, activeColor: 'text-emerald-500', dotColor: 'bg-emerald-500' },
                            { status: 'PENDING', label: 'Pending', count: pendingCount, icon: Clock, activeColor: 'text-amber-500', dotColor: 'bg-amber-500' },
                            { status: 'DRAFT', label: 'Draft', count: draftCount, icon: FileText, activeColor: 'text-gray-500', dotColor: 'bg-gray-400' }
                        ].map((btn) => {
                            const isSelected = activeStatus === btn.status;
                            const Icon = btn.icon;
                            return (
                                <button
                                    key={btn.status}
                                    onClick={() => setActiveStatus(btn.status)}
                                    className={`flex flex-1 items-center justify-center gap-1 rounded px-2.5 text-[10px] font-semibold transition-all whitespace-nowrap md:flex-initial md:px-3 ${isSelected
                                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-[#d8dee6]'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon className={`h-3.5 w-3.5 ${isSelected ? btn.activeColor : 'text-gray-400'}`} />
                                    <span className="hidden xs:inline">{btn.label}</span>
                                    <span className={`px-1 py-0.2 rounded-md text-[9px] font-bold ${isSelected ? 'bg-gray-100 text-gray-700' : 'bg-gray-200/60 text-gray-400'
                                        }`}>
                                        {btn.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={fetchData}
                        disabled={isFetching}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#ccd4de] bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#0b74c9] disabled:opacity-50 md:w-auto"
                    >
                        <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                        Sync Status
                    </button>
                    </div>
                </div>
            </div>

            {fetchError && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="font-medium">Templates could not be refreshed</div>
                        <div className="mt-0.5">{fetchError}</div>
                    </div>
                    <button onClick={fetchData} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                    </button>
                </div>
            )}

            {activeStatus === 'PENDING' && (
                <details className="group rounded-md border border-amber-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-[12px] text-gray-800 [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-center gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                                <HelpCircle className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                                <strong className="block font-semibold">Template approval taking longer?</strong>
                                <span className="block truncate text-[10px] font-normal text-gray-500">Check content, category, account health and Meta review steps.</span>
                            </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                            <span className="hidden rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 sm:inline">8 checks</span>
                            <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
                        </span>
                    </summary>
                    <div className="border-t border-gray-100 bg-amber-50/40 px-4 py-4 text-xs leading-5 text-gray-700 sm:px-5">
                        <p className="mb-3 rounded-lg border border-amber-100 bg-white px-3 py-2 text-amber-900">Approval Meta control karta hai; pending state mein Meta exact reason provide nahi karta.</p>
                        <ol className="grid gap-2 pl-4 list-decimal md:grid-cols-2 md:gap-x-8">
                            <li><strong>Content clear rakhein:</strong> test, dummy, ignore, vague ya misleading copy avoid karein.</li>
                            <li><strong>Correct category:</strong> offers, donations, promotions aur lead generation ko Marketing mein rakhein.</li>
                            <li><strong>Claims verify karein:</strong> loan, returns, discount, government scheme aur urgency claims factual hon.</li>
                            <li><strong>Media check karein:</strong> image/video readable, relevant aur policy-compliant ho.</li>
                            <li><strong>Samples realistic hon:</strong> variables ke sample values actual context explain karein, “info” ya “Sample 1” nahi.</li>
                            <li><strong>Account health:</strong> WhatsApp Manager mein Business Verification, Account Quality aur policy restrictions check karein.</li>
                            <li><strong>24+ hours:</strong> pehle Sync Status karein; phir WhatsApp Manager mein same template kholkar Meta Support case raise karein.</li>
                            <li><strong>Duplicate submit na karein:</strong> repeated copies queue ko fast nahi karti aur management confusing banati hain.</li>
                        </ol>
                    </div>
                </details>
            )}

            {!loading && (
                <section className="hidden overflow-hidden rounded-md border border-[#d8dee6] bg-white md:block">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] border-collapse text-left">
                            <thead>
                                <tr className="h-11 border-b border-[#d8dee6] bg-white text-[10.5px] font-semibold text-slate-800">
                                    <th className="w-[27%] px-4 py-2.5">Template name ↕</th>
                                    <th className="w-[13%] px-4 py-2.5">Category ↕</th>
                                    <th className="w-[30%] px-4 py-2.5">Language ↕</th>
                                    <th className="w-[14%] px-4 py-2.5">Status ↕</th>
                                    <th className="w-[12%] px-4 py-2.5">Last edited ↓</th>
                                    <th className="px-4 py-2.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTemplates.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-16 text-center">
                                            <FileText className="mx-auto h-7 w-7 text-slate-300" />
                                            <p className="mt-3 text-sm font-semibold text-slate-800">No matching templates</p>
                                            <p className="mt-1 text-xs text-slate-500">Change the search, category, or status filter.</p>
                                        </td>
                                    </tr>
                                )}
                                {filteredTemplates.map(template => {
                                    const body = template.components?.find(component => component.type === 'BODY')?.text || 'No message preview'
                                    const pendingInfo = template.status === 'PENDING' ? getPendingReviewInfo(template) : null
                                    const updatedAt = template.approved_at || template.rejected_at || template.submitted_at || template.last_updated
                                    return (
                                        <tr key={template.id || `${template.name}-${template.language}`} onClick={() => setSelectedTemplate(template)} className="h-[58px] cursor-pointer border-b border-[#d8dee6] text-[11px] transition last:border-0 hover:bg-[#f4f5f6]">
                                            <td className="px-4 py-2.5 align-middle">
                                                <p className="truncate font-medium text-slate-900">{template.name}</p>
                                            </td>
                                            <td className="px-4 py-2.5 align-middle">
                                                <span className="capitalize text-slate-800">{String(template.category || '').toLowerCase()}</span>
                                            </td>
                                            <td className="px-4 py-2.5 align-middle">
                                                <p className="font-medium text-slate-800">{formatTemplateLanguage(template.language)}</p>
                                                <p className="mt-0.5 max-w-md truncate text-[9.5px] text-slate-500">{body}</p>
                                            </td>
                                            <td className="px-4 py-2.5 align-middle">
                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium ${template.status === 'APPROVED' ? 'border-[#a7dfba] bg-[#eaf8ef] text-[#087a3e]' : template.status === 'PENDING' ? 'border-[#c8d0da] bg-[#f3f5f7] text-slate-800' : template.status === 'REJECTED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                                    {template.status === 'APPROVED' ? <CheckCircle className="h-3 w-3" /> : template.status === 'PENDING' ? <Clock className="h-3 w-3" /> : template.status === 'REJECTED' ? <XCircle className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                                    {template.status === 'PENDING' ? 'IN REVIEW' : template.status}
                                                </span>
                                                {pendingInfo && <p className="mt-1 text-[8.5px] text-slate-500">{pendingInfo.hours}h in review</p>}
                                            </td>
                                            <td className="px-4 py-2.5 align-middle text-[10px] text-slate-600">{formatDateToIST(updatedAt)}</td>
                                            <td className="px-4 py-2.5 align-middle">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={event => { event.stopPropagation(); setSelectedTemplate(template) }} className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="View template"><ExternalLink className="h-3.5 w-3.5" /></button>
                                                    <button onClick={event => { event.stopPropagation(); handleDelete(template.name) }} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete template"><Trash2 className="h-3.5 w-3.5" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex h-9 items-center justify-between border-t border-[#d8dee6] bg-white px-4 text-[9px] text-slate-600">
                        <span>{filteredTemplates.length} template{filteredTemplates.length === 1 ? '' : 's'} shown · {allTemplatesList.length} total synced</span>
                        <span>Live from Meta</span>
                    </div>
                </section>
            )}

            {loading && (
                <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
                    {[0, 1, 2, 3].map(row => <div key={row} className="flex h-20 animate-pulse items-center gap-6 border-b border-slate-100 px-5 last:border-0"><span className="h-9 w-9 rounded-lg bg-slate-100" /><span className="h-3 w-40 rounded bg-slate-100" /><span className="h-3 w-24 rounded bg-slate-100" /><span className="h-3 flex-1 rounded bg-slate-100" /></div>)}
                </div>
            )}

            {loading && (
                <div data-tour="templates-list" className="grid grid-cols-1 gap-4 md:hidden">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-[340px] animate-pulse rounded-xl border border-gray-200 bg-white p-5">
                            <div className="h-10 w-10 rounded-lg bg-gray-100" />
                            <div className="mt-5 h-4 w-36 rounded bg-gray-100" />
                            <div className="mt-3 h-16 rounded bg-gray-100" />
                            <div className="mt-5 h-3 w-full rounded bg-gray-100" />
                        </div>
                    ))}
                </div>
            )}

            {/* Grid */}
            {!loading && (
                <div className="grid grid-cols-1 gap-4 md:hidden">
                    {filteredTemplates.length === 0 ? (
                        <div className="col-span-full py-16 px-6 flex flex-col items-center justify-center text-center bg-white border border-dashed border-neutral-250 rounded-3xl max-w-md mx-auto w-full shadow-[0_8px_30px_rgb(0,0,0,0.015)] my-6">
                            <div className="h-12 w-12 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 mb-4 text-neutral-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                                <FileText className="h-5 w-5 stroke-[1.5]" />
                            </div>
                            <h3 className="text-sm font-semibold text-neutral-950 tracking-tight">No templates found</h3>
                            <p className="text-[13px] text-neutral-500 mt-2 max-w-[280px] leading-relaxed font-normal">
                                {activeStatus === 'APPROVED' && "Templates approved by Meta for marketing, utility, or authentication will appear here."}
                                {activeStatus === 'PENDING' && "Newly created message templates currently undergoing Meta verification will appear here."}
                                {activeStatus === 'DRAFT' && "Locally saved drafts and templates rejected by Meta will appear here."}
                            </p>
                            <button
                                onClick={() => navigate('/templates/new')}
                                className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Create template
                            </button>
                        </div>
                    ) : (
                        filteredTemplates.map((template) => {
                            const bodyComp = template.components?.find(c => c.type === 'BODY');
                            const buttonsComp = template.components?.find(c => c.type === 'BUTTONS');
                            const headerComp = template.components?.find(c => c.type === 'HEADER');
                            const footerComp = template.components?.find(c => c.type === 'FOOTER');
                            const pendingInfo = template.status === 'PENDING' ? getPendingReviewInfo(template) : null;

                            return (
                                <div
                                    key={template.id || template.name}
                                    onClick={() => setSelectedTemplate(template)}
                                    className="group meta-template-card relative flex cursor-pointer flex-col justify-between overflow-hidden"
                                >
                                    <div className="flex flex-1 flex-col p-4 sm:p-5">
                                        {/* Header row: icon + name + status + delete */}
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                                                    <MessageSquareText className="h-5 w-5" strokeWidth={1.8} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="max-w-[150px] truncate text-sm font-semibold leading-tight text-slate-900 transition-colors group-hover:text-blue-600">{template.name}</h3>
                                                    <p className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                                                        <span>{template.language}</span>
                                                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                                                        <span className="capitalize">{String(template.category || '').toLowerCase()}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[9px] font-semibold uppercase tracking-wide ${template.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    template.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        template.status === 'DRAFT' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                                                            'bg-rose-50 text-rose-700 border-rose-100'
                                                    }`}>
                                                    {template.status === 'APPROVED' && <CheckCircle className="h-3 w-3 shrink-0 text-emerald-600" />}
                                                    {template.status === 'PENDING' && (
                                                        <Clock className="h-3 w-3" />
                                                    )}
                                                    {template.status === 'DRAFT' && <FileText className="h-3 w-3 shrink-0" />}
                                                    {template.status === 'REJECTED' && <XCircle className="h-3 w-3 shrink-0 text-rose-600" />}
                                                    <span>{template.status}</span>
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(template.name); }}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                                                    title="Delete template"
                                                    aria-label={`Delete ${template.name}`}
                                                >
                                                    <Trash2 className="h-4 w-4 shrink-0" />
                                                </button>
                                            </div>
                                        </div>

                                        {pendingInfo && (
                                            <div
                                                title={pendingInfo.hint}
                                                className={`mb-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[10px] ${pendingInfo.overdue ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}
                                            >
                                                <span className="flex min-w-0 items-center gap-2 font-medium">
                                                    <span className="relative flex h-2 w-2 shrink-0">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                                                    </span>
                                                    <span className="truncate">{pendingInfo.overdue ? 'Review delayed' : 'Meta review in progress'}</span>
                                                </span>
                                                <span className="shrink-0 font-semibold">{pendingInfo.hours}h</span>
                                            </div>
                                        )}

                                        {/* WhatsApp Mock Chat Bubble Preview */}
                                        <div className="wa-template-canvas relative mb-0 flex min-h-[190px] flex-1 flex-col justify-between overflow-hidden rounded-xl border border-[#ded8cf] p-3 shadow-inner">
                                            <div className="absolute inset-0 opacity-[0.08] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] pointer-events-none" />

                                            <div className="relative z-10 max-w-[94%] self-start rounded-[8px_8px_8px_2px] bg-white p-3 pb-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.12)]">
                                                {headerComp?.format === 'TEXT' && (
                                                    <p className="text-[10px] font-extrabold text-gray-900 mb-1 leading-tight border-b border-gray-100 pb-0.5">{headerComp.text}</p>
                                                )}
                                                {headerComp?.format === 'IMAGE' && (
                                                    <div className="mb-1.5 h-16 w-full rounded bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100" style={{ borderRadius: '4px' }}>
                                                        <ImageIcon className="h-4 w-4 text-gray-455" />
                                                    </div>
                                                )}
                                                {headerComp?.format === 'VIDEO' && (
                                                    <div className="mb-1.5 h-16 w-full rounded bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100" style={{ borderRadius: '4px' }}>
                                                        <Video className="h-4 w-4 text-gray-455" />
                                                    </div>
                                                )}

                                                <p className="whitespace-pre-line text-[11px] font-medium leading-[1.55] text-slate-800">
                                                    {renderTemplateText(bodyComp?.text || 'No preview available')}
                                                </p>

                                                {footerComp?.text && (
                                                    <p className="mt-1.5 text-[8px] font-medium text-slate-400">{footerComp.text}</p>
                                                )}

                                                <div className="flex items-center justify-end mt-1 gap-0.5 leading-none">
                                                    <span className="text-[7.5px] text-gray-450 font-medium">
                                                        {formatTimeToIST(template.approved_at || template.submitted_at || template.last_updated)}
                                                    </span>
                                                    <CheckCheck className={`h-3 w-3 ${template.status === 'APPROVED' ? 'text-sky-500' : 'text-slate-400'}`} />
                                                </div>
                                            </div>

                                            {/* Chat Buttons Mock */}
                                            {buttonsComp?.buttons?.length > 0 && (
                                                <div className="mt-2 space-y-1 w-[95%] self-start relative z-10">
                                                    {buttonsComp.buttons.slice(0, 2).map((btn, i) => (
                                                        <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-100 bg-white py-1.5 text-[9px] font-semibold text-blue-600 shadow-sm">
                                                            {btn.type === 'URL' ? <ExternalLink className="h-3 w-3 shrink-0" /> : btn.type === 'PHONE_NUMBER' ? <Phone className="h-3 w-3 shrink-0" /> : <MessageSquare className="h-3 w-3 shrink-0" />}
                                                            <span className="truncate">{btn.text}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer — always at bottom */}
                                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[10px] sm:px-5">
                                        <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
                                            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">
                                            {template.status === 'APPROVED' 
                                                ? `Approved ${formatDateToIST(template.approved_at || template.last_updated)}` 
                                                : template.status === 'PENDING' 
                                                ? `Sent ${formatDateToIST(template.submitted_at || template.last_updated)}`
                                                : template.status === 'REJECTED'
                                                ? `Rejected ${formatDateToIST(template.rejected_at || template.last_updated)}`
                                                : `Updated ${formatDateToIST(template.last_updated)}`
                                            }
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-1 font-semibold text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                                            View <ArrowRight className="h-3.5 w-3.5" />
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            <CreateTemplateModal
                isOpen={iscreateOpen}
                onClose={() => {
                    setIsCreateOpen(false);
                    setPrefilledTemplate(null);
                }}
                onSuccess={handleCreateSuccess}
                apiCall={apiCall}
                initialData={prefilledTemplate}
            />
            <ViewTemplateModal
                template={selectedTemplate}
                onClose={() => setSelectedTemplate(null)}
                onAddToMyTemplates={(tpl) => {
                    setSelectedTemplate(null);
                    handleAddToMyTemplates(tpl);
                }}
            />
        </div>
    )
}

function CustomSelectDropdown({ value, onChange, options, label, icon: Icon, disabled = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(opt => opt.value === value) || options[0];

    return (
        <div className="relative">
            <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-1">{label}</label>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full apple-select-trigger ${disabled ? 'opacity-65 cursor-not-allowed bg-gray-50' : ''}`}
            >
                <span className="flex items-center gap-2 truncate">
                    {Icon && <Icon className="h-3.5 w-3.5 text-gray-450 shrink-0" strokeWidth={1.8} />}
                    <span className="truncate">{selectedOption ? selectedOption.label : 'Select...'}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-180 text-gray-800' : ''}`} strokeWidth={1.8} />
            </button>

            {isOpen && !disabled && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 mt-1 w-full apple-select-dropdown max-h-60 overflow-y-auto wa-chat-scroll">
                        {options.map((opt) => {
                            const isSelected = value === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={`apple-select-option ${isSelected ? 'apple-select-option-selected' : ''}`}
                                >
                                    <span className="truncate flex items-center gap-2">
                                        <span className="truncate">{opt.label}</span>
                                        {opt.count !== undefined && (
                                            <span className="text-[9.5px] bg-black/5 text-gray-500 rounded px-1.5 py-0.2 font-semibold">
                                                {opt.count}
                                            </span>
                                        )}
                                    </span>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-black shrink-0 ml-2" strokeWidth={2} />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

function CustomSelect({ value, onChange, options, className = "", disabled = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(opt => opt.value === value) || options[0];

    return (
        <div className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full apple-select-trigger ${disabled ? 'opacity-65 cursor-not-allowed bg-gray-50' : ''} ${className}`}
            >
                <span className="truncate">{selectedOption ? selectedOption.label : 'Select...'}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-180 text-gray-850' : ''}`} strokeWidth={1.8} />
            </button>

            {isOpen && !disabled && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 mt-1.5 w-full apple-select-dropdown max-h-60 overflow-y-auto wa-chat-scroll">
                        {options.map((opt) => {
                            const isSelected = value === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={`apple-select-option ${isSelected ? 'apple-select-option-selected' : ''}`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-black shrink-0 ml-2" strokeWidth={2} />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

function renderTemplateText(text) {
    return String(text || '').split(/(\{\{\d+\}\})/g).map((part, index) => (
        /\{\{\d+\}\}/.test(part)
            ? <span key={`${part}-${index}`} className="meta-variable-badge">{part}</span>
            : part
    ));
}

function ViewTemplateModal({ template, onClose, onAddToMyTemplates }) {
    if (!template) return null;

    const headerComp = template.components?.find(c => c.type === 'HEADER');
    const bodyComp = template.components?.find(c => c.type === 'BODY');
    const footerComp = template.components?.find(c => c.type === 'FOOTER');
    const buttonsComp = template.components?.find(c => c.type === 'BUTTONS');
    const headerExample = headerComp?.example || {};
    const headerMediaUrl =
        headerComp?.media_url ||
        headerComp?.url ||
        headerComp?.link ||
        headerExample?.header_url?.[0] ||
        headerExample?.header_handle?.find?.((value) => String(value).startsWith('http'));

    return (
        <Modal isOpen={!!template} onClose={onClose} title={`View Template: ${template.name}`} maxWidth="max-w-md">
            <div className="bg-gray-100 rounded-2xl p-4 flex flex-col items-center">
                <div className="w-full h-full bg-[#E5DDD5] rounded-xl overflow-hidden shadow-inner flex flex-col p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
                    <div className="bg-white rounded-lg p-3 pb-6 pr-12 shadow-sm rounded-tr-none max-w-[90%] self-start relative">
                        {headerComp?.format === 'TEXT' && <p className="font-bold text-gray-800 text-sm mb-2">{headerComp.text}</p>}
                        {headerComp?.format === 'IMAGE' && (
                            headerMediaUrl ? (
                                <img src={headerMediaUrl} alt="Template header" className="w-full h-32 object-cover rounded mb-2 bg-gray-100" />
                            ) : (
                                <img
                                    src="/images/Image-Placeholder.jpg"
                                    alt="Template image placeholder"
                                    className="mb-2 h-32 w-full rounded bg-gray-100 object-cover"
                                />
                            )
                        )}
                        {headerComp?.format === 'VIDEO' && (
                            <div className="h-32 bg-gray-200 rounded mb-2 flex flex-col items-center justify-center text-gray-400">
                                <Video className="h-8 w-8" />
                                <span className="text-[10px] mt-1 tracking-wider uppercase">Video Attachment</span>
                            </div>
                        )}

                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {bodyComp?.text || ''}
                        </p>

                        {footerComp?.text && <p className="text-[10px] text-gray-400 mt-1">{footerComp.text}</p>}
                        <span className="text-[10px] text-gray-400 absolute bottom-1 right-2">10:00 AM</span>
                    </div>

                    {buttonsComp?.buttons?.length > 0 && (
                        <div className="mt-2 space-y-1 w-[90%] self-start">
                            {buttonsComp.buttons.map((btn, i) => (
                                <div key={i} className="bg-white rounded text-center py-2 text-cyan-600 text-sm font-medium shadow-sm truncate px-2">
                                    {btn.type === 'URL' && <LinkIcon className="inline w-3 h-3 mr-1" />}
                                    {btn.type === 'PHONE_NUMBER' && <Phone className="inline w-3 h-3 mr-1" />}
                                    {btn.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-4 pt-4 flex justify-between items-center border-t border-gray-100">
                {template.industry ? (
                    <button
                        onClick={() => onAddToMyTemplates(template)}
                        className="px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                    >
                        <Plus className="h-4 w-4" /> Add to My Templates
                    </button>
                ) : <div />}
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                    Close View
                </button>
            </div>
        </Modal>
    )
}

function CreateTemplateModal({ isOpen, onClose, onSuccess, apiCall, initialData }) {
    const isPreApproved = initialData?.source === 'meta_library';
    const isOfficialLibrary = initialData?.source === 'meta_library'
    const [data, setData] = useState({
        name: '',
        category: 'MARKETING',
        language: 'en_US',
        headerType: 'NONE', // NONE, IMAGE, TEXT, VIDEO
        headerText: '',
        bodyText: '',
        footerText: '',
        buttons: [] // URL buttons also carry urlType and urlExample for Meta's dynamic URL format.
    })
    const [file, setFile] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState('')
    const [bodySamples, setBodySamples] = useState({})
    const [headerSample, setHeaderSample] = useState('')
    const [libraryButtonInputs, setLibraryButtonInputs] = useState([])

    const fieldClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20 placeholder:text-gray-400'
    const normalizedName = data.name.trim()
    const bodyLength = data.bodyText.length
    const bodyVariables = extractTemplateVariables(data.bodyText).map(token => Number(token.replace(/\D/g, '')))
    const headerVariables = extractTemplateVariables(data.headerText).map(token => Number(token.replace(/\D/g, '')))
    const suggestedCategory = suggestTemplateCategory(data.bodyText)
    const hasPlaceholderCopy = placeholderCopy.test(data.bodyText)
    const previewFileUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
    const samplesComplete = bodyVariables.every(variable => String(bodySamples[variable] || '').trim()) && (!headerVariables.length || headerSample.trim())
    const buttonsComplete = data.buttons.every(button => {
        if (!String(button.text || '').trim()) return false
        if (button.type === 'URL') {
            return /^https?:\/\/.+/i.test(button.url)
                && (button.urlType !== 'DYNAMIC' || Boolean(button.urlExample?.trim()))
        }
        return button.type !== 'PHONE_NUMBER' || /^\+[1-9]\d{7,14}$/.test(button.phone_number)
    })
    const libraryInputsComplete = libraryButtonInputs.every(input => input.type !== 'URL' || /^https?:\/\/.+/i.test(input.url?.base_url || ''))
    const canSubmit = normalizedName && /^[a-z0-9_]+$/.test(normalizedName) && (isOfficialLibrary ? libraryInputsComplete : (data.bodyText.trim() && !hasPlaceholderCopy && bodyLength <= 1024 && samplesComplete && buttonsComplete && !(data.headerType === 'TEXT' && !data.headerText.trim()) && !((data.headerType === 'IMAGE' || data.headerType === 'VIDEO') && !file)))

    useEffect(() => {
        if (initialData && isOpen) {
            const headerComp = initialData.components?.find(c => c.type === 'HEADER');
            const bodyComp = initialData.components?.find(c => c.type === 'BODY');
            const footerComp = initialData.components?.find(c => c.type === 'FOOTER');
            const buttonsComp = initialData.components?.find(c => c.type === 'BUTTONS');

            setData({
                name: initialData.name || '',
                category: initialData.category || 'MARKETING',
                language: initialData.language || 'en_US',
                headerType: headerComp?.format || 'NONE',
                headerText: headerComp?.text || '',
                bodyText: bodyComp?.text || '',
                footerText: footerComp?.text || '',
                buttons: buttonsComp?.buttons?.map(b => ({
                    type: b.type,
                    text: b.text,
                    url: (b.url || '').replace(/\{\{\s*1\s*\}\}\s*$/, ''),
                    urlType: /\{\{\s*1\s*\}\}\s*$/.test(b.url || '') ? 'DYNAMIC' : 'STATIC',
                    urlExample: b.example?.[0]?.replace((b.url || '').replace(/\{\{\s*1\s*\}\}\s*$/, ''), '') || '',
                    phone_number: b.phone_number || ''
                })) || []
            });
            setBodySamples(Object.fromEntries((bodyComp?.example?.body_text?.[0] || []).map((value, index) => [index + 1, value])))
            setHeaderSample(headerComp?.example?.header_text?.[0] || '')
            setLibraryButtonInputs((buttonsComp?.buttons || []).map(button => button.type === 'URL'
                ? { type: 'URL', url: { base_url: button.url || '' } }
                : button.type === 'PHONE_NUMBER'
                    ? { type: 'PHONE_NUMBER', phone_number: button.phone_number || '' }
                    : { type: button.type }))
        } else if (isOpen) {
            setData({
                name: '',
                category: 'MARKETING',
                language: 'en_US',
                headerType: 'NONE',
                headerText: '',
                bodyText: '',
                footerText: '',
                buttons: []
            });
            setBodySamples({})
            setHeaderSample('')
            setLibraryButtonInputs([])
        }
    }, [initialData, isOpen]);

    useEffect(() => {
        return () => {
            if (previewFileUrl) URL.revokeObjectURL(previewFileUrl)
        }
    }, [previewFileUrl])

    const closeModal = () => {
        if (isSubmitting) return
        setSubmitError('')
        onClose()
    }

    const updateButton = (index, patch) => {
        setData(prev => {
            const buttons = [...prev.buttons]
            buttons[index] = { ...buttons[index], ...patch }
            return { ...prev, buttons }
        })
    }

    const addVariable = () => {
        const matches = data.bodyText.match(/\{\{(\d+)\}\}/g)
        const nextNum = matches ? Math.max(...matches.map(m => Number(m.replace(/[^0-9]/g, '')))) + 1 : 1
        setData(prev => ({ ...prev, bodyText: `${prev.bodyText}${prev.bodyText ? ' ' : ''}{{${nextNum}}}` }))
    }

    const addButton = () => {
        setData(prev => ({
            ...prev,
            buttons: [...prev.buttons, { type: 'QUICK_REPLY', text: `Button ${prev.buttons.length + 1}`, url: '', urlType: 'STATIC', urlExample: '', phone_number: '' }]
        }))
    }

    // Submit handler
    const handleSubmit = async () => {
        setSubmitError('')
        if (!canSubmit) {
            setSubmitError('Complete the required fields before submitting for review.')
            return
        }

        setIsSubmitting(true)
        try {
            const formData = new FormData();
            formData.append('name', normalizedName);
            formData.append('category', data.category);
            formData.append('language', data.language);
            if (isOfficialLibrary) formData.append('library_template_name', initialData.name)
            if (isOfficialLibrary && libraryButtonInputs.length) {
                formData.append('library_template_button_inputs', JSON.stringify(libraryButtonInputs))
            }

            const components = [];

            if (data.headerType !== 'NONE') {
                const headerComp = { type: 'HEADER', format: data.headerType };
                if (data.headerType === 'TEXT') {
                    headerComp.text = data.headerText;
                    const matches = data.headerText.match(/\{\{(\d+)\}\}/g);
                    if (matches) {
                        const varIndices = matches.map(m => parseInt(m.replace(/[^0-9]/g, ''), 10));
                        const maxVar = Math.max(...varIndices);
                        if (maxVar > 0) {
                            headerComp.example = { header_text: Array.from({ length: maxVar }, () => headerSample.trim()) };
                        }
                    }
                } else if (isPreApproved && initialData) {
                    const origHeader = initialData.components?.find(c => c.type === 'HEADER');
                    if (origHeader?.example) {
                        headerComp.example = origHeader.example;
                    }
                }
                components.push(headerComp);
            }

            if (data.bodyText) {
                const bodyComp = { type: 'BODY', text: data.bodyText };
                const matches = data.bodyText.match(/\{\{(\d+)\}\}/g);
                if (matches) {
                    const varIndices = matches.map(m => parseInt(m.replace(/[^0-9]/g, ''), 10));
                    const maxVar = Math.max(...varIndices);
                    if (maxVar > 0) {
                        bodyComp.example = {
                            body_text: [
                                Array.from({ length: maxVar }, (_, i) => String(bodySamples[i + 1] || '').trim())
                            ]
                        };
                    }
                }
                components.push(bodyComp);
            }

            if (data.footerText) {
                components.push({ type: 'FOOTER', text: data.footerText });
            }

            if (data.buttons.length > 0) {
                components.push({
                    type: 'BUTTONS',
                    buttons: data.buttons.map(b => {
                        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
                        if (b.type === 'URL') {
                            if (b.urlType === 'DYNAMIC') {
                                return { type: 'URL', text: b.text, url: `${b.url}{{1}}`, example: [`${b.url}${b.urlExample.trim()}`] };
                            }
                            return { type: 'URL', text: b.text, url: b.url };
                        }
                        return { type: 'QUICK_REPLY', text: b.text };
                    })
                });
            }

            formData.append('components', JSON.stringify(components));
            if (file && (data.headerType === 'IMAGE' || data.headerType === 'VIDEO')) {
                formData.append('file', file);
            }

            const res = await apiCall(`${API_URL}/api/whatsapp/templates`, {
                method: 'POST',
                body: formData
            });

            const json = await res.json();
            if (res.ok) {
                if (onSuccess) onSuccess();
                closeModal();
            } else {
                const issue = json.validation?.issues?.find(item => item.severity === 'error')
                setSubmitError(issue?.message || json.error || 'Failed to create template');
            }
        } catch (e) {
            console.error(e);
            setSubmitError('Error creating template');
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    if (isOfficialLibrary) {
        const header = initialData.components?.find(component => component.type === 'HEADER')
        const body = initialData.components?.find(component => component.type === 'BODY')
        const buttons = initialData.components?.find(component => component.type === 'BUTTONS')?.buttons || []
        return (
            <Modal isOpen={isOpen} onClose={closeModal} title={initialData.name} maxWidth="max-w-3xl">
                <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="p-5 sm:p-6">
                        <p className="text-xs text-slate-500">{initialData.category} · {initialData.useCase?.replaceAll('_', ' ')}</p>
                        <h3 className="mt-4 text-sm font-semibold text-slate-900">Enter template details</h3>
                        <p className="mt-1 text-xs text-slate-500">Fixed Meta content stays unchanged to preserve instant library import.</p>
                        <label className="mt-4 block text-xs font-semibold text-slate-700">
                            Name your template
                            <input className={`${fieldClass} mt-1.5`} value={data.name} maxLength={512} onChange={e => setData(current => ({ ...current, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') }))} />
                        </label>
                        {buttons.map((button, index) => button.type === 'URL' ? (
                            <label key={index} className="mt-4 block rounded-lg bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                                {button.text || 'Website button'} URL
                                <input
                                    className={`${fieldClass} mt-1.5 bg-white`}
                                    value={libraryButtonInputs[index]?.url?.base_url || ''}
                                    placeholder="https://yourbusiness.com"
                                    onChange={e => setLibraryButtonInputs(current => current.map((input, inputIndex) => inputIndex === index ? { ...input, url: { base_url: e.target.value } } : input))}
                                />
                            </label>
                        ) : null)}
                        {submitError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{submitError}</p>}
                    </div>
                    <div className="wa-template-canvas border-l border-slate-200 p-4">
                        <div className="rounded-lg bg-white p-3 shadow-sm">
                            {header?.text && <p className="text-xs font-bold text-slate-900">{header.text}</p>}
                            <p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-slate-700">{renderTemplateText(body?.text || `Template: ${initialData.name?.replace(/_/g, ' ')}\n\n(Preview content not provided by Meta. Import to view full content.)`)}</p>
                            {buttons.map((button, index) => <div key={index} className="mt-2 border-t border-slate-100 pt-2 text-center text-[10px] font-semibold text-blue-600">{button.text}</div>)}
                        </div>
                    </div>
                </div>
                <div className="mt-5 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Official Meta library template</p>
                    <div className="flex gap-2">
                        <button onClick={closeModal} className="h-10 rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700">Cancel</button>
                        <button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0070d1] px-5 text-sm font-semibold text-white disabled:opacity-50">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Import template
                        </button>
                    </div>
                </div>
            </Modal>
        )
    }

    return (
        <Modal isOpen={isOpen} onClose={closeModal} title={isPreApproved ? "Use Meta template" : "Create message template"} maxWidth="max-w-[1240px]" panelClassName="template-editor-modal">
            <div className="grid min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 lg:grid-cols-[minmax(0,1fr)_400px]">
                <div className="wa-chat-scroll max-h-[calc(100dvh-210px)] overflow-y-auto p-4 sm:p-6 lg:max-h-[calc(100dvh-200px)]">
                    {submitError ? (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{submitError}</span>
                        </div>
                    ) : null}

                    {isPreApproved && (
                        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#cfe5fb] bg-[#eef7ff] p-4 text-xs text-[#005cae] animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#0070d1] shadow-sm"><LockKeyhole className="h-4 w-4" /></div>
                            <div>
                                <span className="flex items-center gap-1 text-sm font-semibold text-[#003f78]">
                                    Content protected by Meta
                                </span>
                                <p className="mt-1 leading-relaxed text-[#35698f]">
                                    Message content and settings stay locked to preserve pre-approval. Choose a unique template name, review the preview, and submit.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-800">Template name</label>
                                <input
                                    type="text"
                                    className={`${fieldClass} ${normalizedName && !/^[a-z0-9_]+$/.test(normalizedName) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                                    placeholder="welcome_offer_v2"
                                    value={data.name}
                                    onChange={e => setData({ ...data, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                                />
                                <p className="mt-1.5 text-xs text-gray-550">Use lowercase letters, numbers, and underscores only. This will be the name registered in your Meta account.</p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-sm font-semibold text-gray-800">Category</label>
                                    <CustomSelect
                                        value={data.category}
                                        onChange={val => !isPreApproved && setData({ ...data, category: val })}
                                        options={[
                                            { value: 'MARKETING', label: 'Marketing' },
                                            { value: 'UTILITY', label: 'Utility' },
                                            { value: 'AUTHENTICATION', label: 'Authentication' }
                                        ]}
                                        disabled={isPreApproved}
                                    />
                                    {!isPreApproved && suggestedCategory && suggestedCategory !== data.category && (
                                        <button type="button" onClick={() => setData(current => ({ ...current, category: suggestedCategory }))} className="mt-1.5 text-left text-[10px] font-semibold text-amber-700 hover:underline">
                                            Content looks like {suggestedCategory.toLowerCase()}. Use recommended category.
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-semibold text-gray-800">Language</label>
                                    <CustomSelect
                                        value={data.language}
                                        onChange={val => !isPreApproved && setData({ ...data, language: val })}
                                        options={[
                                            { value: 'en_US', label: 'English (US)' },
                                            { value: 'es_ES', label: 'Spanish' },
                                            { value: 'pt_BR', label: 'Portuguese' }
                                        ]}
                                        disabled={isPreApproved}
                                    />
                                </div>
                            </div>
                        </section>

                        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                            <div className="mb-3 flex items-center gap-2">
                                <Type className="h-4 w-4 text-gray-500" />
                                <h4 className="text-sm font-semibold text-gray-900">Header</h4>
                                <span className="text-xs text-gray-400">Optional</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {['NONE', 'TEXT', 'IMAGE', 'VIDEO'].map(t => {
                                    const Icon = t === 'IMAGE' ? ImageIcon : t === 'VIDEO' ? Video : Type
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            disabled={isPreApproved}
                                            onClick={() => {
                                                setFile(null)
                                                setData({ ...data, headerType: t })
                                            }}
                                            className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition ${data.headerType === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'} ${isPreApproved ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {t === 'NONE' ? null : <Icon className="h-4 w-4" />}
                                            {t.charAt(0) + t.slice(1).toLowerCase()}
                                        </button>
                                    )
                                })}
                            </div>

                            {data.headerType === 'TEXT' ? (
                                <>
                                    <input
                                        type="text"
                                        disabled={isPreApproved}
                                        className={`${fieldClass} mt-3 ${isPreApproved ? 'opacity-60 bg-gray-50' : ''}`}
                                        placeholder="Short headline for the message"
                                        value={data.headerText}
                                        onChange={e => setData({ ...data, headerText: e.target.value })}
                                    />
                                    {headerVariables.length > 0 && (
                                        <input className={`${fieldClass} mt-2`} placeholder="Real header sample, e.g. Order 10834" value={headerSample} onChange={e => setHeaderSample(e.target.value)} />
                                    )}
                                </>
                            ) : null}

                            {(data.headerType === 'IMAGE' || data.headerType === 'VIDEO') ? (
                                <div className="relative mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center transition hover:border-green-400 hover:bg-green-50/50">
                                    {file ? (
                                        <div className="flex items-center justify-between gap-3 text-left">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
                                                    <CheckCircle className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold text-gray-900">{file.name}</div>
                                                    <div className="text-xs text-gray-500">{Math.ceil(file.size / 1024)} KB selected</div>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => setFile(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
                                        </div>
                                    ) : (
                                        <>
                                            <UploadCloud className="mx-auto h-7 w-7 text-gray-400" />
                                            <div className="mt-2 text-sm font-semibold text-gray-800">Upload {data.headerType.toLowerCase()} sample</div>
                                            <div className="mt-1 text-xs text-gray-500">Required by Meta for media header approval.</div>
                                            <input type="file" accept={data.headerType === 'IMAGE' ? 'image/*' : 'video/mp4'} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={e => setFile(e.target.files?.[0] || null)} />
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </section>

                        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                    <MessageSquareText className="h-4 w-4 text-gray-500" />
                                    Body text
                                </label>
                                <span className={`text-xs ${bodyLength > 1024 ? 'text-red-600' : 'text-gray-400'}`}>{bodyLength}/1024</span>
                            </div>
                            <textarea
                                disabled={isPreApproved}
                                className={`${fieldClass} min-h-32 resize-y font-mono leading-6 ${isPreApproved ? 'opacity-70 bg-gray-50 select-all' : ''}`}
                                rows={5}
                                placeholder="Hello {{1}}, your order is ready!"
                                value={data.bodyText}
                                maxLength={1100}
                                onChange={e => setData({ ...data, bodyText: e.target.value })}
                            />
                            {hasPlaceholderCopy && (
                                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">Testing, dummy, sample, or “ignore” copy cannot be submitted to Meta.</p>
                            )}
                            <div className="mt-2 flex items-center justify-between">
                                <button type="button" disabled={isPreApproved} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed" onClick={addVariable}>
                                    <Plus className="h-3.5 w-3.5" />
                                    Add variable
                                </button>
                                {!data.bodyText.trim() ? <span className="text-xs text-gray-500">Body is required.</span> : null}
                            </div>
                            {bodyVariables.length > 0 && (
                                <div className="mt-3 grid gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-2">
                                    {bodyVariables.map(variable => (
                                        <label key={variable} className="text-xs font-semibold text-gray-700">
                                            Sample for {`{{${variable}}}`}
                                            <input
                                                className={`${fieldClass} mt-1 bg-white`}
                                                placeholder={variable === 1 ? 'e.g. Priya' : 'Enter a real example'}
                                                value={bodySamples[variable] || ''}
                                                onChange={e => setBodySamples(current => ({ ...current, [variable]: e.target.value }))}
                                            />
                                        </label>
                                    ))}
                                    <p className="col-span-full text-[10px] text-blue-800">Meta uses these examples only for review. Real customer values are supplied when sending.</p>
                                </div>
                            )}
                        </section>

                        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-800">Footer <span className="font-normal text-gray-400">Optional</span></label>
                                <input disabled={isPreApproved} className={`${fieldClass} ${isPreApproved ? 'opacity-60 bg-gray-50' : ''}`} placeholder="Reply STOP to unsubscribe" value={data.footerText} onChange={e => setData({ ...data, footerText: e.target.value })} />
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <MousePointerClick className="h-4 w-4 text-gray-500" />
                                        Buttons <span className="font-normal text-gray-400">Optional</span>
                                    </label>
                                    <span className="text-xs text-gray-400">{data.buttons.length}/3</span>
                                </div>
                                <div className="space-y-2">
                                    {data.buttons.map((btn, i) => (
                                        <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                            <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                                                <CustomSelect
                                                    value={btn.type}
                                                    onChange={val => !isPreApproved && updateButton(i, { type: val, url: '', urlType: 'STATIC', urlExample: '', phone_number: '' })}
                                                    options={[
                                                        { value: 'QUICK_REPLY', label: 'Quick reply' },
                                                        { value: 'URL', label: 'Website' },
                                                        { value: 'PHONE_NUMBER', label: 'Phone' }
                                                    ]}
                                                    className="py-2"
                                                    disabled={isPreApproved}
                                                />
                                                <input disabled={isPreApproved} className={`${fieldClass} py-2 ${isPreApproved ? 'opacity-60 bg-gray-50' : ''}`} placeholder="Button text" value={btn.text} onChange={e => updateButton(i, { text: e.target.value })} />
                                                <button type="button" disabled={isPreApproved} onClick={() => setData(prev => ({ ...prev, buttons: prev.buttons.filter((_, idx) => idx !== i) }))} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                            {btn.type === 'URL' ? (
                                                <div className="mt-2 space-y-2">
                                                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Website URL type">
                                                        {['STATIC', 'DYNAMIC'].map(urlType => (
                                                            <button
                                                                key={urlType}
                                                                type="button"
                                                                disabled={isPreApproved}
                                                                aria-pressed={(btn.urlType || 'STATIC') === urlType}
                                                                onClick={() => updateButton(i, { urlType, urlExample: '' })}
                                                                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${(btn.urlType || 'STATIC') === urlType ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
                                                            >
                                                                {urlType === 'STATIC' ? 'Static URL' : 'Dynamic URL'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <input
                                                        disabled={isPreApproved}
                                                        className={`${fieldClass} py-2 ${isPreApproved ? 'opacity-60 bg-gray-50' : ''}`}
                                                        placeholder={(btn.urlType || 'STATIC') === 'DYNAMIC' ? 'https://example.com/order/' : 'https://example.com'}
                                                        value={btn.url || ''}
                                                        onChange={e => updateButton(i, { url: e.target.value.replace(/\{\{\s*1\s*\}\}\s*$/, '') })}
                                                    />
                                                    {(btn.urlType || 'STATIC') === 'DYNAMIC' ? (
                                                        <div>
                                                            <input
                                                                disabled={isPreApproved}
                                                                className={`${fieldClass} py-2 ${isPreApproved ? 'opacity-60 bg-gray-50' : ''}`}
                                                                placeholder="Sample value, e.g. ORD-10834"
                                                                value={btn.urlExample || ''}
                                                                onChange={e => updateButton(i, { urlExample: e.target.value })}
                                                            />
                                                            <p className="mt-1 text-[10px] text-gray-500">Customer-specific value URL ke end mein add hoga. Meta review ke liye ek sample required hai.</p>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                            {btn.type === 'PHONE_NUMBER' ? (
                                                <input disabled={isPreApproved} className={`${fieldClass} mt-2 py-2 ${isPreApproved ? 'opacity-60 bg-gray-50' : ''}`} placeholder="+919999999999" value={btn.phone_number || ''} onChange={e => updateButton(i, { phone_number: `+${e.target.value.replace(/[^0-9]/g, '')}` })} />
                                            ) : null}
                                        </div>
                                    ))}
                                    {data.buttons.length < 3 && !isPreApproved ? (
                                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50" onClick={addButton}>
                                            <Plus className="h-4 w-4" />
                                            Add button
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <aside className="min-h-0 border-t border-gray-200 bg-white p-4 sm:p-6 lg:sticky lg:top-0 lg:border-l lg:border-t-0">
                    <div className="mx-auto w-full max-w-[330px]">
                        <div className="mb-3 flex items-center justify-between px-1">
                            <div>
                                <p className="text-sm font-semibold text-gray-950">Mobile preview</p>
                                <p className="text-[11px] text-gray-500">Live WhatsApp rendering</p>
                            </div>
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
                        </div>

                        <div className="relative mx-auto h-[620px] w-[300px] rounded-[48px] bg-gradient-to-b from-[#4b4b4d] via-[#111113] to-[#3a3a3c] p-[4px] shadow-[0_28px_60px_rgba(15,23,42,0.28)]">
                            <span className="absolute -left-[3px] top-28 h-12 w-[3px] rounded-l bg-[#242426]" />
                            <span className="absolute -left-[3px] top-44 h-20 w-[3px] rounded-l bg-[#242426]" />
                            <span className="absolute -right-[3px] top-40 h-24 w-[3px] rounded-r bg-[#242426]" />

                            <div className="relative h-full overflow-hidden rounded-[44px] border-[5px] border-black bg-[#efeae2]">
                                <div className="absolute left-1/2 top-3 z-40 h-7 w-24 -translate-x-1/2 rounded-full bg-black shadow-sm">
                                    <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#101b2c] ring-1 ring-[#293956]" />
                                </div>

                                <div className="flex h-12 items-end justify-between bg-[#f7f8fa] px-5 pb-2 text-[10px] font-semibold text-slate-900">
                                    <span>10:00</span>
                                    <span className="tracking-widest">●●● ▰</span>
                                </div>
                                <div className="flex h-14 items-center gap-2 border-b border-black/5 bg-[#f7f8fa] px-3">
                                    <span className="text-lg text-[#54656f]">‹</span>
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d9fdd3] text-[11px] font-bold text-[#128c7e]">B</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[12px] font-semibold text-[#111b21]">Business name</p>
                                        <p className="text-[9px] text-[#667781]">Official business account</p>
                                    </div>
                                    <Phone className="h-4 w-4 text-[#54656f]" />
                                    <MoreHorizontal className="h-4 w-4 text-[#54656f]" />
                                </div>

                                <div className="wa-template-canvas h-[calc(100%-104px)] overflow-y-auto px-3 py-4">
                                    <div className="mb-3 text-center">
                                        <span className="rounded-md bg-white/90 px-2 py-1 text-[9px] font-medium uppercase tracking-wide text-[#667781] shadow-sm">Today</span>
                                    </div>

                                    <div className="overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(11,20,26,0.18)]">
                                        {data.headerType === 'TEXT' && data.headerText ? (
                                            <p className="px-3 pt-3 text-[12px] font-semibold leading-5 text-[#111b21]">{data.headerText}</p>
                                        ) : null}
                                        {data.headerType === 'IMAGE' ? (
                                            previewFileUrl ? (
                                                <img src={previewFileUrl} alt="Template header preview" className="aspect-[1.91/1] w-full bg-gray-100 object-cover" />
                                            ) : (
                                                <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-gray-100 text-gray-400">
                                                    <ImageIcon className="h-7 w-7" />
                                                </div>
                                            )
                                        ) : null}
                                        {data.headerType === 'VIDEO' ? (
                                            previewFileUrl ? (
                                                <video src={previewFileUrl} className="aspect-video w-full bg-gray-100 object-cover" controls muted />
                                            ) : (
                                                <div className="flex aspect-video w-full items-center justify-center bg-gray-100 text-gray-400">
                                                    <Video className="h-7 w-7" />
                                                </div>
                                            )
                                        ) : null}

                                        <div className="px-3 pb-2 pt-2.5">
                                            <p className="whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-[#111b21]">
                                                {data.bodyText ? renderTemplateText(data.bodyText) : <span className="italic text-gray-400">Your message will appear here...</span>}
                                            </p>
                                            {data.footerText ? <p className="mt-2 text-[9px] leading-4 text-[#667781]">{data.footerText}</p> : null}
                                            <div className="mt-1 flex items-center justify-end gap-1">
                                                <span className="text-[8px] text-[#667781]">10:00 AM</span>
                                                <span className="text-[9px] font-bold text-[#53bdeb]">✓✓</span>
                                            </div>
                                        </div>

                                        {data.buttons.length > 0 ? (
                                            <div className="border-t border-gray-100">
                                                {data.buttons.map((btn, i) => (
                                                    <div key={i} className="flex items-center justify-center gap-1.5 border-b border-gray-100 py-2 text-[10px] font-medium text-[#00a5f4] last:border-0">
                                                        {btn.type === 'URL' ? <ExternalLink className="h-3 w-3" /> : btn.type === 'PHONE_NUMBER' ? <Phone className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                                                        <span className="truncate">{btn.text || 'Button text'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>

            <div className="sticky bottom-0 z-10 -mx-1 flex flex-col-reverse gap-3 bg-white/95 px-1 pt-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <p className="hidden text-xs text-gray-500 sm:block">Meta usually reviews submitted templates within 24 hours.</p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                    onClick={closeModal}
                    disabled={isSubmitting}
                    className="h-10 rounded-full border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    disabled={isSubmitting || !canSubmit}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#0070d1] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#0064b7] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleSubmit}
                >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isSubmitting ? 'Submitting...' : 'Submit for review'}
                </button>
                </div>
            </div>
        </Modal>
    )
}
