import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
    Copy, ExternalLink, Share2, CheckCircle2,
    ChevronDown, Zap, QrCode, Search, X, Phone, Wifi,
    Battery, Signal, Camera, SmilePlus, ArrowRight,
    Link2, Users, ShoppingBag, Headphones, Instagram,
    Facebook, Twitter, Youtube, Globe, Check, Sparkles,
    ArrowUpRight, Send, HelpCircle
} from 'lucide-react'

// ─── Country Data ─────────────────────────────────────────────────────────────
const COUNTRIES = [
    { code: 'IN', name: 'India', dial: '91', flag: '🇮🇳' },
    { code: 'US', name: 'United States', dial: '1', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', dial: '44', flag: '🇬🇧' },
    { code: 'AE', name: 'UAE', dial: '971', flag: '🇦🇪' },
    { code: 'SA', name: 'Saudi Arabia', dial: '966', flag: '🇸🇦' },
    { code: 'PK', name: 'Pakistan', dial: '92', flag: '🇵🇰' },
    { code: 'BD', name: 'Bangladesh', dial: '880', flag: '🇧🇩' },
    { code: 'SG', name: 'Singapore', dial: '65', flag: '🇸🇬' },
    { code: 'AU', name: 'Australia', dial: '61', flag: '🇦🇺' },
    { code: 'CA', name: 'Canada', dial: '1', flag: '🇨🇦' },
    { code: 'DE', name: 'Germany', dial: '49', flag: '🇩🇪' },
    { code: 'FR', name: 'France', dial: '33', flag: '🇫🇷' },
    { code: 'BR', name: 'Brazil', dial: '55', flag: '🇧🇷' },
    { code: 'ZA', name: 'South Africa', dial: '27', flag: '🇿🇦' },
    { code: 'NG', name: 'Nigeria', dial: '234', flag: '🇳🇬' },
    { code: 'ID', name: 'Indonesia', dial: '62', flag: '🇮🇩' },
    { code: 'MY', name: 'Malaysia', dial: '60', flag: '🇲🇾' },
    { code: 'PH', name: 'Philippines', dial: '63', flag: '🇵🇭' },
    { code: 'TH', name: 'Thailand', dial: '66', flag: '🇹🇭' },
    { code: 'TR', name: 'Turkey', dial: '90', flag: '🇹🇷' },
    { code: 'EG', name: 'Egypt', dial: '20', flag: '🇪🇬' },
    { code: 'KE', name: 'Kenya', dial: '254', flag: '🇰🇪' },
    { code: 'GH', name: 'Ghana', dial: '233', flag: '🇬🇭' },
    { code: 'JP', name: 'Japan', dial: '81', flag: '🇯🇵' },
    { code: 'KR', name: 'South Korea', dial: '82', flag: '🇰🇷' },
    { code: 'MX', name: 'Mexico', dial: '52', flag: '🇲🇽' },
    { code: 'IT', name: 'Italy', dial: '39', flag: '🇮🇹' },
    { code: 'ES', name: 'Spain', dial: '34', flag: '🇪🇸' },
    { code: 'NL', name: 'Netherlands', dial: '31', flag: '🇳🇱' },
    { code: 'RU', name: 'Russia', dial: '7', flag: '🇷🇺' },
]

const QUICK_MESSAGES = [
    { label: 'Hello 👋', text: 'Hello! I want to know more about your services.' },
    { label: 'Pricing 💰', text: 'Hi, can you please share your pricing details?' },
    { label: 'Demo 🎯', text: "I'd like to schedule a demo. When are you available?" },
    { label: 'Support 🛠', text: "Hi, I need help with an issue I'm facing." },
    { label: 'Order 📦', text: "Hi, I'd like to place an order. Can you help?" },
]

const MAX_MESSAGE = 500

// ─── Accordion ────────────────────────────────────────────────────────────────
function Accordion({ title, icon: Icon, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50"
            >
                <div className="flex items-center gap-2.5">
                    {Icon && <Icon className="h-4 w-4 text-gray-500" />}
                    <span className="text-sm font-semibold text-gray-900">{title}</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-600 leading-relaxed bg-gray-50/50">
                    {children}
                </div>
            </div>
        </div>
    )
}

// ─── Country Selector ─────────────────────────────────────────────────────────
function CountrySelector({ value, onChange }) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const ref = useRef(null)
    const selected = COUNTRIES.find(c => c.code === value) || COUNTRIES[0]

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return COUNTRIES.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.dial.includes(q) ||
            c.code.toLowerCase().includes(q)
        )
    }, [search])

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <div ref={ref} className="relative shrink-0">
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setSearch('') }}
                className="flex h-[42px] items-center gap-1.5 rounded-l-lg border-y border-l border-gray-300 bg-gray-50 px-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500/20 whitespace-nowrap"
            >
                <span className="text-base leading-none">{selected.flag}</span>
                <span className="text-gray-600">+{selected.dial}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 top-[46px] z-50 w-64 min-w-[260px] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search country or code..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                            />
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                        {filtered.map(c => (
                            <button
                                key={c.code}
                                type="button"
                                onClick={() => { onChange(c.code); setOpen(false) }}
                                className={`flex w-full items-center gap-3 px-3.5 py-2 text-sm transition-colors hover:bg-gray-50 ${c.code === value ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700'}`}
                            >
                                <span className="text-base leading-none shrink-0">{c.flag}</span>
                                <span className="flex-1 text-left truncate">{c.name}</span>
                                <span className="shrink-0 text-xs font-mono text-gray-400">+{c.dial}</span>
                                {c.code === value && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="px-3 py-6 text-center text-sm text-gray-500">No country found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Premium Phone Preview ────────────────────────────────────────────────────
function PhonePreview({ phoneNumber, message, countryDial }) {
    const [visible, setVisible] = useState(false)
    const prevMsg = useRef('')

    useEffect(() => {
        if (message !== prevMsg.current) {
            setVisible(false)
            const t = setTimeout(() => {
                setVisible(true)
                prevMsg.current = message
            }, 80)
            return () => clearTimeout(t)
        } else {
            setVisible(true)
        }
    }, [message])

    const displayNumber = phoneNumber ? `+${countryDial} ${phoneNumber}` : null
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    const clockStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

    const avatarLetter = phoneNumber ? (phoneNumber[0] || '#') : '?'

    return (
        <div className="flex justify-center select-none py-2">
            <div className="relative w-[280px]">
                {/* Phone shell — minimal thin bezel */}
                <div className="relative rounded-[2rem] bg-gray-100 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-200">
                    {/* Inner screen edge */}
                    <div className="rounded-[1.6rem] overflow-hidden bg-white border border-gray-200 relative">

                        {/* Top Notch Area */}
                        <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-10 pointer-events-none">
                            <div className="w-24 h-5 bg-gray-100 rounded-b-xl border-x border-b border-gray-200" />
                        </div>

                        {/* Slim status bar */}
                        <div className="flex items-center justify-between bg-[#075E54] px-5 pt-1.5 pb-2 text-white">
                            <span className="text-[10px] font-bold tracking-tight">{clockStr}</span>
                            <div className="flex items-center gap-1.5">
                                <Signal className="h-3 w-3" />
                                <Wifi className="h-3 w-3" />
                                <div className="h-2 w-5 rounded-sm border border-white p-px">
                                    <div className="h-full w-3/4 bg-white" />
                                </div>
                            </div>
                        </div>

                        {/* WhatsApp screen */}
                        <div className="bg-[#EFEAE2] flex flex-col h-[460px] relative">
                            
                            {/* Chat background pattern */}
                            <div className="absolute inset-0 opacity-[0.3]"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                                    backgroundSize: '80px 80px'
                                }}
                            />

                            {/* WA App header */}
                            <div className="flex items-center gap-2 bg-[#075E54] px-2 py-2 shadow-sm relative z-10 text-white">
                                <div className="flex items-center cursor-pointer">
                                    <ArrowRight className="h-5 w-5 rotate-180" />
                                </div>
                                <div className="flex flex-1 items-center gap-2.5 min-w-0">
                                    {/* Avatar */}
                                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-300">
                                        <span className="text-sm font-bold text-gray-700 uppercase">{avatarLetter}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-[13px] font-semibold leading-tight">
                                            {displayNumber || 'Enter number'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 pr-1">
                                    <Camera className="h-4 w-4" />
                                    <Phone className="h-4 w-4" />
                                </div>
                            </div>

                            {/* Chat area */}
                            <div className="relative flex flex-col justify-end flex-1 px-3 py-4 gap-2 overflow-hidden z-10">
                                {/* Date chip */}
                                <div className="flex justify-center mb-1">
                                    <span className="rounded-lg bg-[#E1F3FB] px-3 py-1 text-[10px] font-medium text-gray-600 shadow-sm">
                                        Today
                                    </span>
                                </div>

                                {/* Message bubble */}
                                <div className="flex justify-end">
                                    <div
                                        className={`relative max-w-[85%] rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2 shadow-sm transition-all duration-300 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'}`}
                                    >
                                        {/* Tail */}
                                        <svg className="absolute -right-[6px] top-0 h-4 w-4 text-[#DCF8C6]" viewBox="0 0 10 16" fill="currentColor">
                                            <path d="M10 0 L0 0 L0 16 Q10 8 10 0Z" />
                                        </svg>

                                        {message ? (
                                            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-900">
                                                {message}
                                            </p>
                                        ) : (
                                            <p className="text-[12px] italic text-gray-500 leading-relaxed">
                                                Your message...
                                            </p>
                                        )}

                                        {/* Timestamp + ticks */}
                                        <div className="mt-1 flex items-center justify-end gap-1">
                                            <span className="text-[9px] text-gray-500 font-medium">{timeStr}</span>
                                            <svg className="h-3 w-4 text-[#34B7F1]" viewBox="0 0 16 11" fill="currentColor">
                                                <path d="M11.071.653a.55.55 0 0 0-.756.196L6.443 7.272 4.709 5.538a.55.55 0 0 0-.777.777l2.16 2.16a.55.55 0 0 0 .849-.105l4.327-7.06a.55.55 0 0 0-.197-.657zM15.315.653a.55.55 0 0 0-.756.196l-3.87 6.423-1.22-1.22a.55.55 0 0 0-.778.778l1.547 1.547a.55.55 0 0 0 .849-.105L15.51 1.41a.55.55 0 0 0-.196-.756z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Input bar */}
                            <div className="flex items-center gap-1.5 bg-transparent px-2 py-2 relative z-10 pb-4">
                                <div className="flex-1 rounded-full border border-gray-200 bg-white pl-2 pr-3 py-1.5 shadow-sm flex items-center gap-2">
                                    <SmilePlus className="h-5 w-5 text-gray-400 shrink-0" />
                                    <p className="flex-1 text-[13px] text-gray-400 truncate">
                                        Type a message
                                    </p>
                                    <Camera className="h-5 w-5 text-gray-400 shrink-0" />
                                </div>
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00A884] shadow-sm shrink-0">
                                    <Send className="h-4 w-4 text-white -ml-0.5 mt-0.5" />
                                </div>
                            </div>
                        </div>

                        {/* Home indicator */}
                        <div className="flex justify-center bg-white py-1.5 pb-2">
                            <div className="h-1 w-24 rounded-full bg-gray-300" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Plus(props) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}


// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WhatsAppLinkGenerator() {
    const [country, setCountry] = useState('IN')
    const [phone, setPhone] = useState('')
    const [message, setMessage] = useState('')
    const [generatedLink, setGeneratedLink] = useState('')
    const [linkCopied, setLinkCopied] = useState(false)
    const [phoneError, setPhoneError] = useState('')
    const textareaRef = useRef(null)

    const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0]
    const sanitizedPhone = phone.replace(/\D/g, '')
    const fullNumber = sanitizedPhone ? `${selectedCountry.dial}${sanitizedPhone}` : ''

    const waLink = useMemo(() => {
        if (!sanitizedPhone) return ''
        
        try {
            const payload = JSON.stringify({ p: fullNumber, m: message.trim() })
            // Safely encode to handle emojis and special chars
            const encoded = btoa(encodeURIComponent(payload))
            return `${window.location.origin}/wa/${encoded}`
        } catch (e) {
            return ''
        }
    }, [fullNumber, sanitizedPhone, message])

    const validate = () => {
        if (!sanitizedPhone) { setPhoneError('Phone number is required'); return false }
        if (sanitizedPhone.length < 6) { setPhoneError('Too short'); return false }
        if (sanitizedPhone.length > 15) { setPhoneError('Too long'); return false }
        setPhoneError('')
        return true
    }

    const handleGenerate = () => {
        if (!validate()) return
        setGeneratedLink(waLink)
    }

    const handleCopyLink = async () => {
        const link = generatedLink || waLink
        if (!link) return
        await navigator.clipboard.writeText(link)
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
    }

    const handleShare = async () => {
        const link = generatedLink || waLink
        if (!link) return
        if (navigator.share) {
            await navigator.share({ title: 'WhatsApp Link', url: link })
        } else {
            await navigator.clipboard.writeText(link)
        }
    }

    const handlePhoneChange = (e) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 15)
        setPhone(val)
        if (phoneError) setPhoneError('')
    }

    const insertQuickMessage = (text) => {
        setMessage(prev => prev ? `${prev} ${text}` : text)
        textareaRef.current?.focus()
    }

    const liveLink = waLink

    return (
        <div className="min-h-full bg-gray-50/70 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-5xl">

                {/* ── Header ── */}
                <div className="mb-8">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 shadow-sm ring-1 ring-green-100">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652c1.746.943 3.71 1.444 5.71 1.445h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.48-8.448zM12.045 21.785h-.004a9.96 9.96 0 0 1-5.055-1.377l-.36-.214-3.75.977.999-3.648-.235-.374a9.86 9.86 0 0 1-1.516-5.26c.001-5.45 4.436-9.884 9.892-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.892 6.994c-.003 5.45-4.437 9.884-9.891 9.884zm5.43-7.403c-.297-.149-1.758-.867-2.03-.967-.273-.099-.47-.148-.668.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-950">WhatsApp Link Generator</h1>
                            <p className="text-sm text-gray-500 mt-1">Create optimized click-to-chat links with instant preview.</p>
                        </div>
                    </div>
                </div>

                {/* ── MAIN GRID ── */}
                <div className="flex flex-col lg:flex-row gap-6 items-start">

                    {/* ════ LEFT — FORM ════ */}
                    <div className="flex-1 w-full space-y-5">

                        {/* ── Phone Number Card ── */}
                        <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
                            <h2 className="text-sm font-bold text-gray-950 mb-4 flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600 font-semibold">1</span>
                                WhatsApp Number
                            </h2>

                            <div className="flex flex-col sm:flex-row gap-0">
                                <CountrySelector value={country} onChange={setCountry} />
                                <div className="relative flex-1 mt-[-1px] sm:mt-0 sm:ml-[-1px]">
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={phone}
                                        onChange={handlePhoneChange}
                                        placeholder="9876543210"
                                        className={`w-full h-[42px] rounded-b-lg sm:rounded-b-none sm:rounded-r-lg border bg-white px-3.5 pr-9 text-sm text-gray-950 placeholder-gray-400 outline-none transition-colors focus:ring-2 focus:z-10 focus:ring-green-500/20 ${phoneError ? 'border-red-300 focus:border-red-400 focus:ring-red-500/20' : 'border-gray-300 focus:border-green-500 hover:border-gray-400'}`}
                                    />
                                    {phone && (
                                        <button
                                            type="button"
                                            onClick={() => { setPhone(''); setPhoneError('') }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors z-20"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {phoneError && (
                                <p className="mt-2 text-xs font-medium text-red-500 flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {phoneError}
                                </p>
                            )}
                        </div>

                        {/* ── Message Card ── */}
                        <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600 font-semibold">2</span>
                                    Custom Message
                                </h2>
                                <span className={`text-xs font-semibold tabular-nums rounded-md px-2 py-0.5 ${message.length > MAX_MESSAGE * 0.85 ? 'bg-amber-50 text-amber-600' : 'text-gray-400'}`}>
                                    {message.length} / {MAX_MESSAGE}
                                </span>
                            </div>

                            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                {QUICK_MESSAGES.map(q => (
                                    <button
                                        key={q.label}
                                        type="button"
                                        onClick={() => insertQuickMessage(q.text)}
                                        className="flex-shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100 active:scale-95 whitespace-nowrap"
                                    >
                                        {q.label}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                ref={textareaRef}
                                rows={4}
                                value={message}
                                onChange={e => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                                placeholder="Write a pre-filled message that users will send to you..."
                                className="w-full resize-none rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-950 placeholder-gray-400 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-500/20 hover:border-gray-400"
                            />
                        </div>

                        {/* ── Generate Action ── */}
                        {/* ── Generate Action ── */}
                        <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm relative overflow-hidden">
                            {/* Subtle background glow when link is generated */}
                            {generatedLink && (
                                <div className="absolute top-0 right-0 -mt-16 -mr-16 h-48 w-48 rounded-full bg-green-500/10 blur-3xl pointer-events-none" />
                            )}
                            
                            <h2 className="text-sm font-bold text-gray-950 mb-4 flex items-center gap-2 relative z-10">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600 font-semibold">3</span>
                                Generate Link
                            </h2>

                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={!phone}
                                className="relative w-full overflow-hidden rounded-xl bg-green-600 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_14px_0_rgba(34,197,94,0.39)] transition-all hover:bg-green-500 hover:shadow-[0_6px_20px_rgba(34,197,94,0.23)] hover:-translate-y-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none flex items-center justify-center gap-2 z-10"
                            >
                                <Zap className="h-4 w-4" />
                                {generatedLink ? 'Update WhatsApp Link' : 'Generate WhatsApp Link'}
                            </button>

                            {/* Output */}
                            {generatedLink && (
                                <div className="mt-6 space-y-4 relative z-10 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="group relative rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-[#ebfdf2] p-4 shadow-sm transition-all hover:shadow-md hover:border-green-300">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-green-700">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Ready to share
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <p className="break-all font-mono text-[13px] leading-relaxed text-gray-700 selection:bg-green-200">
                                                {decodeURIComponent(generatedLink)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <button
                                            type="button"
                                            onClick={handleCopyLink}
                                            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 transition-all active:scale-95 ${linkCopied ? 'border-green-300 bg-green-50 text-green-700 shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:bg-green-50/50 hover:text-green-700 hover:shadow-sm'}`}
                                        >
                                            {linkCopied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5 text-gray-400 group-hover:text-green-600" />}
                                            <span className="text-[11px] font-semibold">{linkCopied ? 'Copied!' : 'Copy Link'}</span>
                                        </button>
                                        
                                        <button
                                            type="button"
                                            onClick={handleShare}
                                            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-3 text-gray-700 transition-all hover:border-green-300 hover:bg-green-50/50 hover:text-green-700 hover:shadow-sm active:scale-95 group"
                                        >
                                            <Share2 className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                                            <span className="text-[11px] font-semibold">Share</span>
                                        </button>
                                        
                                        <a
                                            href={generatedLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-3 text-gray-700 transition-all hover:border-green-300 hover:bg-green-50/50 hover:text-green-700 hover:shadow-sm active:scale-95 group"
                                        >
                                            <ExternalLink className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                                            <span className="text-[11px] font-semibold">Test Link</span>
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* ════ RIGHT — PREVIEW ════ */}
                    <div className="w-full lg:w-[340px] shrink-0">
                        <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-sm font-bold text-gray-950">Live Preview</h2>
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-1 text-[10px] font-bold tracking-wide text-green-700">
                                    <span className="relative flex h-1.5 w-1.5">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
                                    </span>
                                    LIVE
                                </span>
                            </div>

                            <div className="flex justify-center bg-gray-50 rounded-xl py-4 border border-gray-100">
                                <PhonePreview
                                    phoneNumber={sanitizedPhone}
                                    message={message}
                                    countryDial={selectedCountry.dial}
                                />
                            </div>

                            {liveLink && !generatedLink && (
                                <p className="mt-4 text-center text-xs text-gray-500">
                                    Fill the details and click <strong className="text-gray-700">Generate Link</strong> to share.
                                </p>
                            )}
                        </div>
                    </div>

                </div>

                {/* ── ACCORDION ── */}
                <div className="mt-8 space-y-3">
                    <h3 className="text-base font-bold text-gray-950 mb-4 px-1">Frequently Asked Questions</h3>
                    <Accordion title="How to create a WhatsApp link?" icon={HelpCircle}>
                        <ol className="list-decimal pl-5 space-y-2 mt-1">
                            <li>Select your country code and enter your WhatsApp number.</li>
                            <li>Type a default message that customers will send to you.</li>
                            <li>Click "Generate Link" and copy the resulting URL.</li>
                        </ol>
                    </Accordion>
                    <Accordion title="Why should I use pre-filled messages?" icon={Zap}>
                        <p>Pre-filled messages remove friction for your customers. Instead of thinking about what to write, they just click your link and hit send. It's proven to increase inquiry rates significantly.</p>
                    </Accordion>
                    <Accordion title="Can I use this link on Instagram or Facebook?" icon={Link2}>
                        <p>Yes! Once generated, you can paste this link into your Instagram bio, Facebook posts, Twitter, or link it to a button on your website.</p>
                    </Accordion>
                </div>

            </div>
        </div>
    )
}

function AlertCircle(props) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
    )
}
