import {
    ArrowUpRight,
    Building2,
    Check,
    ChevronDown,
    Filter,
    LayoutGrid,
    MessageCircle,
    Phone,
    Search,
    ShieldCheck,
    Sparkles,
    X,
} from 'lucide-react'
import { createElement, useState } from 'react'

const categoryLabels = {
    ALL: 'All templates',
    MARKETING: 'Marketing',
    UTILITY: 'Utility',
    AUTHENTICATION: 'Authentication',
}

const useCaseLabels = {
    'All Use Cases': 'All Use Cases',
    ACCOUNT_UPDATES: 'Account updates',
    ORDER_MANAGEMENT: 'Order management',
    EVENT_REMINDER: 'Event reminders',
    OTP: 'OTP / Authentication',
    MARKETING_CAMPAIGNS: 'Marketing campaigns',
    CUSTOMER_CARE: 'Customer care',
}

function SelectField({ label, icon: Icon, value, options, onChange }) {
    const [isOpen, setIsOpen] = useState(false)
    const selectedOption = options.find((option) => option.value === value) || options[0]

    return (
        <div className="relative min-w-0">
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                className={`flex h-11 w-full items-center gap-2.5 rounded-lg border bg-white px-3.5 text-left text-sm font-medium outline-none transition ${
                    isOpen
                        ? 'border-[#0070d1] text-slate-900 ring-2 ring-[#0070d1]/10'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
            >
                {createElement(Icon, { className: `h-4 w-4 shrink-0 ${isOpen ? 'text-[#0070d1]' : 'text-slate-400'}` })}
                <span className="min-w-0 flex-1 truncate">
                    <span className="mr-1 text-xs font-normal text-slate-400">{label}:</span>
                    {selectedOption?.label}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen ? (
                <>
                    <div
                        aria-hidden="true"
                        className="fixed inset-0 z-30 bg-transparent"
                        onMouseDown={() => setIsOpen(false)}
                    />
                    <div className="absolute left-0 z-40 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                        <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div>
                        {options.map((option) => {
                            const isSelected = option.value === value
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value)
                                        setIsOpen(false)
                                    }}
                                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                                        isSelected
                                            ? 'bg-[#eef7ff] font-semibold text-[#0064b7]'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                                >
                                    <span className="truncate">{option.label}</span>
                                    {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                                </button>
                            )
                        })}
                    </div>
                </>
            ) : null}
        </div>
    )
}

function MessagePreview({ template }) {
    const header = template.components?.find((component) => component.type === 'HEADER')?.text || ''
    const body = template.components?.find((component) => component.type === 'BODY')?.text || ''
    const buttons = template.components?.find((component) => component.type === 'BUTTONS')?.buttons || []
    
    // Fallback for Meta template library where components are not returned
    const displayBody = body || `Template: ${template.name.replace(/_/g, ' ')}\n\n(Preview content not provided by Meta. Import to view full content.)`
    const parts = displayBody.split(/(\{\{\d+\}\})/g)

    return (
        <div className="meta-library-chat">
            <div className="relative z-10 max-w-[94%] rounded-[10px_10px_10px_3px] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.12)]">
                {header ? <p className="mb-1.5 text-[12px] font-bold leading-4 text-slate-800">{header}</p> : null}
                <p className="line-clamp-4 text-[12px] font-medium leading-[1.65] text-slate-700 whitespace-pre-wrap">
                    {parts.map((part, index) => /^\{\{\d+\}\}$/.test(part)
                        ? <span key={`${part}-${index}`} className="rounded bg-[#eaf8f1] px-1 py-0.5 font-mono text-[10px] font-semibold text-[#087a55]">{part}</span>
                        : part)}
                </p>
                <div className="mt-1 flex justify-end gap-1 text-[8px] text-slate-400">
                    10:00 AM <span className="font-bold text-sky-500">✓✓</span>
                </div>
            </div>
            {buttons[0] ? (
                <div className="relative z-10 mt-2 flex h-8 max-w-[94%] items-center justify-center gap-1.5 rounded-lg bg-white text-[10px] font-semibold text-[#0070d1] shadow-sm">
                    {buttons[0].type === 'PHONE_NUMBER' ? <Phone className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                    {buttons[0].text}
                </div>
            ) : null}
        </div>
    )
}

export default function MetaTemplateLibrary({
    templates,
    filteredTemplates,
    topic,
    setTopic,
    industry,
    setIndustry,
    useCase,
    setUseCase,
    search,
    setSearch,
    showFilters,
    setShowFilters,
    onUse,
    loading,
    error,
}) {
    const industries = ['All Industries', ...new Set(templates.flatMap((item) => Array.isArray(item.industry) ? item.industry : [item.industry || 'General']))]
    const useCases = ['All Use Cases', ...new Set(templates.map((item) => item.useCase).filter(Boolean))]
    const hasFilters = search || topic !== 'ALL' || industry !== 'All Industries' || useCase !== 'All Use Cases'

    const resetFilters = () => {
        setSearch('')
        setTopic('ALL')
        setIndustry('All Industries')
        setUseCase('All Use Cases')
    }

    return (
        <main className="min-h-full bg-[#f5f7fa] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto max-w-[1680px]">
                <header className="meta-library-header overflow-hidden rounded-2xl text-white shadow-[0_18px_45px_rgba(7,27,46,0.14)]">
                    <div className="relative flex min-h-[260px] flex-col justify-between px-5 py-6 sm:min-h-[300px] sm:px-8 sm:py-8 lg:px-10">
                       
                    </div>
                </header>

                <section className="relative z-20 mx-2 -mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_12px_35px_rgba(15,23,42,0.07)] sm:mx-5 sm:-mt-4 sm:p-4">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {Object.entries(categoryLabels).map(([value, label]) => (
                            <button key={value} onClick={() => setTopic(value)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${topic === value ? 'bg-[#0070d1] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                {topic === value ? <Check className="mr-1.5 inline h-3.5 w-3.5" /> : null}{label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-[minmax(260px,1fr)_220px_240px]">
                        <div className="relative col-span-2 lg:col-span-1">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search message, goal, or industry…" className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-20 text-sm outline-none focus:border-[#0070d1] focus:bg-white focus:ring-2 focus:ring-[#0070d1]/10 lg:pr-10" />
                            {search ? <button onClick={() => setSearch('')} className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-400 lg:right-3"><X className="h-4 w-4" /></button> : null}
                            <button onClick={() => setShowFilters(!showFilters)} className={`absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md lg:hidden ${showFilters ? 'bg-[#eef7ff] text-[#0064b7]' : 'text-slate-500 hover:bg-slate-100'}`}>
                                <Filter className="h-4 w-4" /><span className="sr-only">Filters</span>
                            </button>
                        </div>
                        <div className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
                            <SelectField label="Industry" icon={Building2} value={industry} onChange={setIndustry} options={industries.map((value) => ({ value, label: value }))} />
                        </div>
                        <div className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
                            <SelectField label="Use Case" icon={MessageCircle} value={useCase} onChange={setUseCase} options={useCases.map((value) => ({ value, label: useCaseLabels[value] || value }))} />
                        </div>
                    </div>
                </section>

                <div className="mb-4 mt-7 flex items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><LayoutGrid className="h-4 w-4 text-[#0070d1]" />Template gallery</div>
                        <p className="mt-1 text-xs text-slate-500">{filteredTemplates.length} matching templates</p>
                    </div>
                    {hasFilters ? <button onClick={resetFilters} className="text-xs font-semibold text-[#0064b7] hover:underline">Clear all filters</button> : null}
                </div>

                {loading ? (
                    <section className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Loading official Meta library...</section>
                ) : error ? (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">{error}</section>
                ) : filteredTemplates.length ? (
                    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {filteredTemplates.map((template) => (
                            <article key={template.id} className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#9bcaf3] hover:shadow-[0_12px_28px_rgba(15,23,42,0.09)]">
                                <button onClick={() => onUse(template)} className="block w-full p-3 text-left">
                                    <MessagePreview template={template} />
                                </button>
                                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-3 py-2.5">
                                    <span className="min-w-0 truncate text-[10px] font-medium text-slate-500">{template.name}</span>
                                    <button onClick={() => onUse(template)} className="shrink-0 text-[10px] font-semibold text-[#0070d1] hover:underline">{template.source === 'meta_library' ? 'Import' : 'Customize'}</button>
                                </div>
                            </article>
                        ))}
                    </section>
                ) : (
                    <section className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
                        <Search className="mx-auto h-8 w-8 text-slate-300" />
                        <h2 className="mt-4 text-base font-semibold text-slate-900">No matching templates</h2>
                        <p className="mt-1 text-sm text-slate-500">Try a broader search or clear the active filters.</p>
                        <button onClick={resetFilters} className="mt-5 rounded-full bg-[#0070d1] px-5 py-2.5 text-sm font-semibold text-white">Reset filters</button>
                    </section>
                )}
            </div>
        </main>
    )
}
