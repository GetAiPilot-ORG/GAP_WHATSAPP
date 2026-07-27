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
} from 'lucide-react'
import TourButton from '../onboarding/TourButton'

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
        question: 'GAP FlowPilot kaise connect karein apne WhatsApp number se?',
        answer:
            'Left sidebar mein "Connect Account" par click karein. Wahan QR code scan karein WhatsApp mobile app se. Ek baar connected hone ke baad, green status indicator dikhega aur aap messages receive karne ke liye ready ho jaayenge.',
    },
    {
        id: 'gs-2',
        category: 'getting-started',
        question: 'Mera account kis tarah ka hona chahiye — personal ya business?',
        answer:
            'GAP FlowPilot ke saath WhatsApp Business account sabse accha kaam karta hai. WhatsApp Business API use karne ke liye aapko ek approved Business Manager account chahiye. Personal numbers bhi kaam karte hain lekin kuch features (jaise broadcasts) limited ho sakte hain.',
    },
    {
        id: 'gs-3',
        category: 'getting-started',
        question: 'Team members ko kaise invite karein?',
        answer:
            'Settings → Team Members section mein jaayein. "Invite Member" button se email address daalen aur role select karein (Owner, Admin, ya Agent). Invited member ko email milegi accept karne ke liye. Agents sirf Shared Inbox access kar sakte hain.',
    },
    {
        id: 'gs-4',
        category: 'getting-started',
        question: 'Dashboard pe kaunse metrics dikhte hain?',
        answer:
            'Dashboard pe aapko milega: Total messages sent, Delivery rate, Read rate, Failed messages percentage, Active contacts count, aur real-time system health. Data har 10 seconds pe automatically refresh hota hai.',
    },

    // Live Chat
    {
        id: 'lc-1',
        category: 'live-chat',
        question: 'Shared Inbox kaise kaam karta hai?',
        answer:
            'Shared Inbox ek centralized jagah hai jahan saari WhatsApp conversations aati hain. Multiple agents ek hi inbox dekhte hain. Aap conversations assign kar sakte hain specific agents ko, status change kar sakte hain (open/resolved), aur notes add kar sakte hain.',
    },
    {
        id: 'lc-2',
        category: 'live-chat',
        question: 'Bot se human agent ko conversation kaise transfer karein?',
        answer:
            'Jab bot kisi conversation ko handle kar raha ho, agent "Take Over" button click kar sakta hai. Isse bot automatically pause ho jaata hai us conversation ke liye aur human agent control le leta hai. Bot handoff summary bhi automatically generate hoti hai.',
    },
    {
        id: 'lc-3',
        category: 'live-chat',
        question: 'Conversation labels aur filters kaise use karein?',
        answer:
            'Chat list ke upar filter options hain — All, Open, Resolved, Assigned to me. Labels assign karne ke liye conversation open karein aur right panel mein "Add Label" click karein. Isse categorization aur tracking easy ho jaata hai.',
    },
    {
        id: 'lc-4',
        category: 'live-chat',
        question: 'Notification sound customize kaise karein?',
        answer:
            'Settings → Notifications section mein jaayein jahan aap incoming message ke liye different notification sounds select kar sakte hain. Aap sound ko enable/disable bhi kar sakte hain aur volume adjust kar sakte hain.',
    },

    // Bot Agents
    {
        id: 'ba-1',
        category: 'bot-agents',
        question: 'Bot Agent kya hota hai aur kaise create karein?',
        answer:
            'Bot Agent ek AI-powered assistant hai jo automatically WhatsApp messages ka reply karta hai. Bot Agents page pe jaayein, "Create Agent" click karein, name aur purpose define karein, phir knowledge base add karein (FAQs, product info, etc.).',
    },
    {
        id: 'ba-2',
        category: 'bot-agents',
        question: 'Bot ko specific contacts ya numbers ke liye assign karein?',
        answer:
            'Bot Agents section mein, aap rules set kar sakte hain ki kaunse incoming numbers ya contact groups ke liye konsa bot respond kare. "Assignment Rules" tab mein jaayein aur conditions set karein.',
    },
    {
        id: 'ba-3',
        category: 'bot-agents',
        question: 'Bot agar galat jawab de toh kya karein?',
        answer:
            'Bot ke knowledge base ko update karein — jis topic pe galti ho rahi hai woh information add karein ya existing info ko correct karein. Bot Agent edit mode mein "Test Bot" feature se verify kar sakte hain ki responses correct hain.',
    },

    // Broadcasting
    {
        id: 'br-1',
        category: 'broadcast',
        question: 'Broadcast kaise send karein?',
        answer:
            'Broadcasting page pe jaayein → "New Broadcast" click karein → Recipients select karein (contacts ya groups) → Approved template choose karein → Schedule ya immediately send karein. Note: Sirf WhatsApp-approved templates broadcast ke liye use ho sakte hain.',
    },
    {
        id: 'br-2',
        category: 'broadcast',
        question: 'Broadcast ke liye minimum contacts kitne chahiye?',
        answer:
            'Technically ek contact se bhi broadcast send ho sakti hai. Lekin WhatsApp ke spam detection se bachne ke liye, initially chhoti list se start karein aur gradually scale karein. High-quality, opted-in contacts use karein.',
    },
    {
        id: 'br-3',
        category: 'broadcast',
        question: 'Broadcast schedule kaise karein future date/time ke liye?',
        answer:
            'New Broadcast create karte waqt "Schedule for later" option select karein. Date aur time picker se future slot choose karein. Scheduled broadcasts Broadcast page pe "Scheduled" tab mein dikh jaate hain, jahan aap edit ya cancel bhi kar sakte hain.',
    },

    // Contacts
    {
        id: 'ct-1',
        category: 'contacts',
        question: 'Contacts bulk import kaise karein CSV se?',
        answer:
            'Contacts page pe "Import" button click karein. CSV file upload karein jisme columns hon: name, phone, email (optional), aur custom fields. Sample CSV template download kar sakte hain. Import ke baad duplicates automatically detect hote hain.',
    },
    {
        id: 'ct-2',
        category: 'contacts',
        question: 'Contact ke liye custom fields kaise add karein?',
        answer:
            'Contact edit karte waqt ya Contact Modal mein "Custom Fields" section hota hai. Aap key-value pairs add kar sakte hain jaise "city", "plan_type", "order_id" etc. Yeh fields templates mein bhi use ho sakti hain personalization ke liye.',
    },

    // Flow Builder
    {
        id: 'fb-1',
        category: 'flow-builder',
        question: 'Flow Builder kya hai aur kab use karein?',
        answer:
            'Flow Builder visual drag-and-drop tool hai automation workflows banane ke liye. Jaise: jab koi "Hi" likhe toh welcome message bhejo, phir options do. Use karein repetitive conversations automate karne ke liye — ordering, appointments, FAQs etc.',
    },
    {
        id: 'fb-2',
        category: 'flow-builder',
        question: 'Flow publish karne ke baad active kaise karein?',
        answer:
            'Flow Builder mein flow complete karne ke baad "Save" karein. Phir top-right mein "Publish" button click karein. Published flows Bot Agents ya direct WhatsApp triggers ke saath link kar sakte hain.',
    },

    // Templates
    {
        id: 'tp-1',
        category: 'templates',
        question: 'WhatsApp template submit kaise karein approval ke liye?',
        answer:
            'Templates page pe "New Template" click karein. Category choose karein (Marketing, Utility, Authentication), content likhein with variables like {{1}}, {{2}}, aur Submit karein. Meta approval mein usually 24-48 hours lagte hain.',
    },
    {
        id: 'tp-2',
        category: 'templates',
        question: 'Template reject kyun hoti hai?',
        answer:
            'Common reasons: Promotional language in Utility templates, vague call-to-action, phone numbers ya external links improperly formatted, ya WhatsApp policy violation. Rejection reason dekh kar template update karein aur re-submit karein.',
    },

    // Account
    {
        id: 'ac-1',
        category: 'account',
        question: 'Password ya email kaise change karein?',
        answer:
            'Settings → Account section mein jaayein. Wahan "Change Password" aur "Update Email" options milenge. Email change ke baad verification link aayegi naye email pe.',
    },
    {
        id: 'ac-2',
        category: 'account',
        question: 'WhatsApp number disconnect ya switch kaise karein?',
        answer:
            'Connect Account page pe current connection dekh sakte hain. "Disconnect" button se existing connection hatao. Phir nayi device ya number se fresh QR scan karo. Disconnect karne se saara chat history preserved rehta hai.',
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
                    GAP FlowPilot ke baare mein sawal? Yahan answers milenge. Har feature ka detailed guide available hai.
                </p>
                </div>
                <div className="hidden md:block">
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
                    <h2 className="mt-3 text-2xl font-bold">Kya dhundh rahe hain aap?</h2>
                    <p className="mt-1 text-sm text-gray-400">
                        {faqs.length}+ common questions ke answers neeche available hain.
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
                            ? `"${search}" ke results (${filteredFaqs.length})`
                            : activeCategory === 'all'
                                ? `Sabhi Articles (${filteredFaqs.length})`
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
                        <p className="mt-4 text-base font-semibold text-gray-950">Koi result nahi mila</p>
                        <p className="mt-2 text-sm text-gray-500">
                            "{search}" ke liye koi article nahi hai. Search term change karein ya category filter hataayein.
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
                    <h2 className="text-base font-bold text-gray-950">Aur madad chahiye?</h2>
                    <p className="mt-1 text-sm text-gray-500">Humari team aapki help ke liye always ready hai.</p>
                </div>

                <a
                    href="mailto:support@gapflowpilot.com"
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
                        <p className="mt-1 text-sm text-gray-500">support@gapflowpilot.com pe email karein. 24 hrs mein reply milegi.</p>
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
                        <p className="mt-1 text-sm text-gray-500">Directly WhatsApp par message karein quick support ke liye.</p>
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
                        <p className="mt-1 text-sm text-gray-500">Saari services normally chal rahi hain. No incidents reported.</p>
                    </div>
                </div>
            </section>
        </div>
    )
}
