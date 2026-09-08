import { createElement, useState, useMemo } from 'react'
import {
    HelpCircle,
    Search,
    ChevronDown,
    ChevronRight,
    MessageSquare,
    Bot,
    Send,
    Users,
    Workflow,
    FileText,
    Settings,
    Zap,
    BookOpen,
    LifeBuoy,
    Mail,
    ExternalLink,
    CheckCircle,
    AlertTriangle,
    Wifi,
    Play,
    Star,
    RefreshCw,
} from 'lucide-react'
import TourButton from '../onboarding/TourButton'
import { useOnboarding } from '../onboarding/onboardingContext'

// ─── Data ────────────────────────────────────────────────────────────────────

const categories = [
    {
        id: 'getting-started',
        label: 'Getting Started',
        icon: Play,
        color: 'bg-green-50 text-green-700',
        border: 'border-green-200',
    },
    {
        id: 'live-chat',
        label: 'Shared Inbox',
        icon: MessageSquare,
        color: 'bg-blue-50 text-blue-700',
        border: 'border-blue-200',
    },
    {
        id: 'bot-agents',
        label: 'Bot Agents',
        icon: Bot,
        color: 'bg-violet-50 text-violet-700',
        border: 'border-violet-200',
    },
    {
        id: 'broadcast',
        label: 'Broadcasting',
        icon: Send,
        color: 'bg-amber-50 text-amber-700',
        border: 'border-amber-200',
    },
    {
        id: 'contacts',
        label: 'Contacts',
        icon: Users,
        color: 'bg-pink-50 text-pink-700',
        border: 'border-pink-200',
    },
    {
        id: 'flow-builder',
        label: 'Flow Builder',
        icon: Workflow,
        color: 'bg-cyan-50 text-cyan-700',
        border: 'border-cyan-200',
    },
    {
        id: 'templates',
        label: 'Templates',
        icon: FileText,
        color: 'bg-orange-50 text-orange-700',
        border: 'border-orange-200',
    },
    {
        id: 'account',
        label: 'Account & Settings',
        icon: Settings,
        color: 'bg-gray-100 text-gray-700',
        border: 'border-gray-200',
    },
]

const faqs = [
    // Getting Started
    {
        id: 'gs-1',
        category: 'getting-started',
        question: 'How do I connect my WhatsApp number to GAP WhatsApp Pilot?',
        answer:
            'Click "Accounts" in the left sidebar. Use the Meta Embedded Signup flow to connect your WhatsApp Business Account. Once connected, a green status indicator will appear and you will be ready to send and receive messages.',
    },
    {
        id: 'gs-2',
        category: 'getting-started',
        question: 'What kind of WhatsApp account is recommended?',
        answer:
            'An official WhatsApp Business Account (WABA) using the WhatsApp Cloud API works best. Connecting an official account allows high-volume messaging, official templates, broadcasts, and AI automation.',
    },
    {
        id: 'gs-3',
        category: 'getting-started',
        question: 'How do I invite team members and assign roles?',
        answer:
            'Go to Settings → Team Members. Click "Invite Member", enter their email address, and select a role (Owner, Admin, or Agent). Agents can access the Shared Inbox to handle customer chats.',
    },
    {
        id: 'gs-4',
        category: 'getting-started',
        question: 'What metrics are tracked on the Dashboard?',
        answer:
            'The Dashboard displays total messages sent, delivery rate, read rate, failed delivery risk, inbound customer messages, and active conversation counts. Data syncs continuously.',
    },

    // Live Chat
    {
        id: 'lc-1',
        category: 'live-chat',
        question: 'How does the Shared Inbox work?',
        answer:
            'The Shared Inbox centralizes all WhatsApp conversations for your team. Multiple agents can collaborate, assign conversations, track unread messages, update resolution status, and add customer tags.',
    },
    {
        id: 'lc-2',
        category: 'live-chat',
        question: 'How do I transfer a conversation from an AI bot to a human agent?',
        answer:
            'When an AI agent is handling a chat, any human agent can click "Take Over". This immediately pauses the AI agent for that conversation and hands full control to the human agent.',
    },
    {
        id: 'lc-3',
        category: 'live-chat',
        question: 'How do conversation labels and filters work?',
        answer:
            'Use the filters at the top of the chat list to switch between Open, Resolved, Unread, and Assigned views. You can assign custom labels and tags from the contact details panel for easy segmentation.',
    },
    {
        id: 'lc-4',
        category: 'live-chat',
        question: 'How do I customize notification sounds for incoming messages?',
        answer:
            'Go to Settings → Notifications to choose custom notification alert sounds for incoming customer messages, adjust the volume, or toggle sound notifications.',
    },
    {
        id: 'lc-5',
        category: 'live-chat',
        question: 'Why can\'t I send a free-form message to a new contact? (WhatsApp 24-Hour Rule)',
        answer:
            'Under Meta WhatsApp Cloud API rules, businesses cannot initiate conversations with new contacts using free-form text. The first message must always use a Meta-approved Template. Once the customer replies, a 24-hour free-form customer care window opens.',
    },
    {
        id: 'lc-6',
        category: 'live-chat',
        question: 'What is the WhatsApp 24-Hour Customer Care Window?',
        answer:
            'Whenever a customer sends your business a message, Meta opens an active 24-hour session window. During this window, you and your AI bots can send free-form text, media, documents, and quick replies. Each incoming customer message resets the 24-hour timer. After 24 hours without a customer message, subsequent outbound messages must use an approved template.',
    },

    // Bot Agents
    {
        id: 'ba-1',
        category: 'bot-agents',
        question: 'What is a Bot Agent and how do I create one?',
        answer:
            'A Bot Agent is an AI-powered assistant that automatically replies to customer inquiries on WhatsApp. Go to AI Agents, click "Create Agent", define its role and system instructions, and upload knowledge documents (FAQs, product catalogs) to train it.',
    },
    {
        id: 'ba-2',
        category: 'bot-agents',
        question: 'Can I assign Bot Agents to specific contacts or phone numbers?',
        answer:
            'Yes. Under AI Agents, you can configure assignment rules to route incoming chats to specific agents based on keywords, contact tags, or the connected WhatsApp number.',
    },
    {
        id: 'ba-3',
        category: 'bot-agents',
        question: 'How do I improve or correct a Bot Agent\'s answers?',
        answer:
            'Update the agent\'s knowledge base with clearer documentation or product details. You can test prompts and responses in real time using the built-in simulator before publishing updates.',
    },

    // Broadcasting
    {
        id: 'br-1',
        category: 'broadcast',
        question: 'How do I create and send a WhatsApp broadcast?',
        answer:
            'Go to Broadcasts → New Campaign. Select your recipient contacts or tags, choose a Meta-approved template, fill in dynamic variables, review wallet costs, and send immediately or schedule for later.',
    },
    {
        id: 'br-2',
        category: 'broadcast',
        question: 'What is the minimum contact requirement for broadcasts?',
        answer:
            'You can broadcast to any number of contacts, even a single test contact. To maintain high messaging quality and protect your Meta tier, always send to opted-in customers.',
    },
    {
        id: 'br-3',
        category: 'broadcast',
        question: 'How do I schedule a broadcast for a future date and time?',
        answer:
            'When creating a broadcast campaign, select "Schedule for later" on the review step. Pick your desired date and time. You can manage or cancel scheduled campaigns from the History tab.',
    },

    // Contacts
    {
        id: 'ct-1',
        category: 'contacts',
        question: 'How do I bulk import contacts from a CSV file?',
        answer:
            'Go to Contacts and click "Import". Upload a CSV file containing names, international phone numbers (with country code), and optional custom fields. Duplicate contacts are automatically detected and updated.',
    },
    {
        id: 'ct-2',
        category: 'contacts',
        question: 'How do I add custom fields to contacts?',
        answer:
            'When adding or editing a contact, add custom key-value pairs (such as city, plan_tier, order_id). These custom fields can be dynamically mapped into template variables and AI agent prompts.',
    },

    // Flow Builder
    {
        id: 'fb-1',
        category: 'flow-builder',
        question: 'What is the Visual Flow Builder?',
        answer:
            'Flow Builder is a drag-and-drop workflow canvas for creating automated conversation trees, interactive menus, lead qualification forms, and support triage flows on WhatsApp.',
    },
    {
        id: 'fb-2',
        category: 'flow-builder',
        question: 'How do I activate a flow after building it?',
        answer:
            'Save your flow in the visual editor, then click "Publish". Active published flows will automatically trigger when customers send matching trigger keywords or open interactive menus.',
    },

    // Templates
    {
        id: 'tp-1',
        category: 'templates',
        question: 'How do I submit a WhatsApp message template for Meta approval?',
        answer:
            'Go to Templates and click "New Template" or browse the official Meta Template Library. Choose your category (Utility, Marketing, or Authentication), add your message content and sample variables, and submit for Meta review. Approvals typically complete within minutes.',
    },
    {
        id: 'tp-2',
        category: 'templates',
        question: 'Why do template submissions get rejected by Meta?',
        answer:
            'Common rejection reasons include promotional wording in Utility templates, missing sample variable values, invalid CTA link formats, or policy violations. Review the rejection subcode provided by Meta, correct the template, and resubmit.',
    },

    // Account
    {
        id: 'ac-1',
        category: 'account',
        question: 'How do I update my profile or password?',
        answer:
            'Go to Settings → Account. You can update your display name, email address, or change your account password.',
    },
    {
        id: 'ac-2',
        category: 'account',
        question: 'How do I disconnect or switch connected WhatsApp accounts?',
        answer:
            'Go to Accounts (Connect WhatsApp) to manage connected numbers. You can switch between active accounts using the top sidebar switcher or disconnect a number from the account settings menu.',
    },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function CategoryPill({ category, isActive, onClick }) {
    return (
        <button
            type="button"
            id={`help-category-${category.id}`}
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 shrink-0 ${
                isActive
                    ? `${category.color} ${category.border} shadow-sm scale-105`
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900'
            }`}
        >
            {createElement(category.icon, { className: 'h-4 w-4 shrink-0' })}
            {category.label}
        </button>
    )
}

function FaqItem({ faq, isOpen, onToggle }) {
    return (
        <div
            className={`overflow-hidden rounded-xl border transition-all duration-200 ${
                isOpen ? 'border-green-200 bg-green-50/30 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
        >
            <button
                id={`faq-toggle-${faq.id}`}
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
                <span className={`text-sm font-semibold leading-6 ${isOpen ? 'text-green-800' : 'text-gray-950'}`}>
                    {faq.question}
                </span>
                <span className={`shrink-0 rounded-lg p-1 transition-all duration-200 ${isOpen ? 'bg-green-100 text-green-700 rotate-180' : 'bg-gray-100 text-gray-500'}`}>
                    <ChevronDown className="h-4 w-4" />
                </span>
            </button>
            {isOpen && (
                <div className="border-t border-green-100 px-5 pb-5 pt-4">
                    <p className="text-sm leading-7 text-gray-600">{faq.answer}</p>
                </div>
            )}
        </div>
    )
}

function StatCard({ icon, value, label, tone }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-5 shadow-sm text-left sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            <div className={`rounded-xl p-2 sm:p-3 shrink-0 ${tone}`}>
                {createElement(icon, { className: 'h-4 w-4 sm:h-5 sm:w-5' })}
            </div>
            <div className="min-w-0">
                <div className="text-base sm:text-2xl font-bold text-gray-950 leading-tight">{value}</div>
                <div className="text-[11px] sm:text-sm text-gray-500 truncate">{label}</div>
            </div>
        </div>
    )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HelpCenter() {
    const { resetAllTours, startGlobalTour, isRunning } = useOnboarding()
    const [search, setSearch] = useState('')
    const [activeCategory, setActiveCategory] = useState('all')
    const [openFaqId, setOpenFaqId] = useState(null)

    const filteredFaqs = useMemo(() => {
        return faqs.filter((faq) => {
            const matchCat = activeCategory === 'all' || faq.category === activeCategory
            const matchSearch =
                !search.trim() ||
                faq.question.toLowerCase().includes(search.toLowerCase()) ||
                faq.answer.toLowerCase().includes(search.toLowerCase())
            return matchCat && matchSearch
        })
    }, [search, activeCategory])

    function toggleFaq(id) {
        setOpenFaqId((prev) => (prev === id ? null : id))
    }

    function handleCategoryClick(id) {
        setActiveCategory((prev) => (prev === id ? 'all' : id))
        setOpenFaqId(null)
    }

    return (
        <div className="space-y-8">
            {/* ── Header ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                    <HelpCircle className="h-4 w-4" />
                    Support Hub
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-950">Help Center</h1>
                <p className="text-sm text-gray-500">
                    Have questions about GAP WhatsApp Pilot? Find detailed answers and feature guides below.
                </p>
                </div>
                <div className="hidden items-center gap-2 md:flex">
                    <button
                        type="button"
                        disabled={isRunning}
                        onClick={async () => {
                            resetAllTours()
                            await startGlobalTour()
                        }}
                        className="inline-flex h-12 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Restart all guides
                    </button>
                    <TourButton />
                </div>
            </div>

            {/* ── Hero Search ── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 p-6 sm:p-8 text-white shadow-xl">
                {/* Decorative blobs */}
                <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-green-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-green-400/10 blur-3xl" />

                <div className="relative">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                        </span>
                        Live Documentation
                    </div>
                    <h2 className="mt-3 text-2xl font-bold">What are you looking for?</h2>
                    <p className="mt-1 text-sm text-gray-400">
                        {faqs.length}+ common questions and answers are available below.
                    </p>

                    <div data-tour="help-search" className="relative mt-6 max-w-xl">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                            id="help-search"
                            type="text"
                            placeholder="e.g. broadcast, bot agent, contacts import..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-12 pr-4 text-sm font-medium text-white placeholder-gray-400 backdrop-blur-sm outline-none transition-all focus:border-green-400/60 focus:bg-white/15 focus:ring-2 focus:ring-green-400/20"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Quick Stats ── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard icon={BookOpen} value={`${faqs.length}+`} label="Help Articles" tone="bg-blue-50 text-blue-700" />
                <StatCard icon={CheckCircle} value="8" label="Feature Guides" tone="bg-green-50 text-green-700" />
                <StatCard icon={Zap} value="24h" label="Avg. Response" tone="bg-amber-50 text-amber-700" />
                <StatCard icon={Star} value="4.9" label="Support Rating" tone="bg-violet-50 text-violet-700" />
            </div>

            {/* ── Category Filters ── */}
            <section data-tour="help-categories">
                <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-base font-bold text-gray-950">Categories</h2>
                    {activeCategory !== 'all' && (
                        <button
                            type="button"
                            onClick={() => handleCategoryClick('all')}
                            className="text-xs font-semibold text-green-600 hover:underline"
                        >
                            Clear filter
                        </button>
                    )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    {categories.map((cat) => (
                        <CategoryPill
                            key={cat.id}
                            category={cat}
                            isActive={activeCategory === cat.id}
                            onClick={() => handleCategoryClick(cat.id)}
                        />
                    ))}
                </div>
            </section>

            {/* ── FAQ List ── */}
            <section data-tour="help-faqs">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-base font-bold text-gray-950">
                        {search.trim()
                            ? `Results for "${search}" (${filteredFaqs.length})`
                            : activeCategory === 'all'
                                ? `All Articles (${filteredFaqs.length})`
                                : `${categories.find((c) => c.id === activeCategory)?.label} (${filteredFaqs.length})`}
                    </h2>
                    {openFaqId && (
                        <button
                            type="button"
                            onClick={() => setOpenFaqId(null)}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                        >
                            Collapse all
                        </button>
                    )}
                </div>

                {filteredFaqs.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
                        <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
                        <p className="mt-4 text-base font-semibold text-gray-950">No results found</p>
                        <p className="mt-2 text-sm text-gray-500">
                            No articles matched "{search}". Try changing your search term or clearing category filters.
                        </p>
                        <button
                            type="button"
                            onClick={() => { setSearch(''); setActiveCategory('all') }}
                            className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            Reset filters
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredFaqs.map((faq) => (
                            <FaqItem
                                key={faq.id}
                                faq={faq}
                                isOpen={openFaqId === faq.id}
                                onToggle={() => toggleFaq(faq.id)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ── Contact Support ── */}
            <section data-tour="help-support" className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div className="col-span-1 sm:col-span-3">
                    <h2 className="text-base font-bold text-gray-950">Need more help?</h2>
                    <p className="mt-1 text-sm text-gray-500">Our support team is always ready to assist you.</p>
                </div>

                <a
                    href="mailto:support@gapwhatsapppilot.com"
                    id="help-email-support"
                    className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md"
                >
                    <div className="rounded-xl bg-green-50 p-3 text-green-700 transition-colors group-hover:bg-green-100">
                        <Mail className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-950">Email Support</p>
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                        </div>
                        <p className="mt-1 text-sm text-gray-500">Email us at support@gapwhatsapppilot.com. We respond within 24 hours.</p>
                    </div>
                </a>

                <a
                    href="https://wa.me/919999999999"
                    id="help-whatsapp-support"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md"
                >
                    <div className="rounded-xl bg-green-50 p-3 text-green-700 transition-colors group-hover:bg-green-100">
                        <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-950">WhatsApp Support</p>
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                        </div>
                        <p className="mt-1 text-sm text-gray-500">Message us directly on WhatsApp for quick real-time assistance.</p>
                    </div>
                </a>

                <div
                    id="help-status-card"
                    className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                    <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                        <Wifi className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-950">System Status</p>
                            <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                Operational
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">All services are operating normally. No active incidents.</p>
                    </div>
                </div>
            </section>
        </div>
    )
}
