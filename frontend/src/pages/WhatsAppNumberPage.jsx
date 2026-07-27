import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    AlertCircle,
    CheckCircle2,
    Clock3,
    Loader2,
    ShieldCheck,
    Zap,
    Briefcase,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import TwilioNumberPurchase from '../components/TwilioNumberPurchase'
import TourButton from '../onboarding/TourButton'

const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`

const initialForm = {
    business_name: '',
    country: 'India',
    preferred_region: '',
    use_case: '',
    expected_monthly_messages: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
}

const statusLabels = {
    requested: 'Requested',
    in_review: 'In review',
    number_arranged: 'Number arranged',
    meta_onboarding_pending: 'Meta onboarding pending',
    connected: 'Connected',
    cancelled: 'Cancelled',
}

export default function WhatsAppNumberPage() {
    const { user, apiCall } = useAuth()
    const [activeTab, setActiveTab] = useState('instant')
    const [form, setForm] = useState(() => ({
        ...initialForm,
        business_name: user?.user_metadata?.organization_name || '',
        contact_name: user?.user_metadata?.full_name || '',
        contact_email: user?.email || '',
    }))
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    useEffect(() => {
        loadRequests()
    }, [])

    const loadRequests = async () => {
        setLoading(true)
        try {
            const res = await apiCall(`${API_BASE}/whatsapp/number-requests`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to load requests')
            setRequests(Array.isArray(data.requests) ? data.requests : [])
        } catch (err) {
            setError(err.message || 'Failed to load number requests')
        } finally {
            setLoading(false)
        }
    }

    const updateField = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }))
        setError('')
        setSuccess('')
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        setSubmitting(true)
        setError('')
        setSuccess('')
        try {
            const payload = {
                ...form,
                expected_monthly_messages: form.expected_monthly_messages === '' ? null : Number(form.expected_monthly_messages),
            }
            const res = await apiCall(`${API_BASE}/whatsapp/number-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Could not submit request')
            setRequests(prev => [data.request, ...prev])
            setSuccess('Request submit ho gayi. Team review karke next onboarding step update karegi.')
            setForm(prev => ({
                ...initialForm,
                country: prev.country || 'India',
                contact_name: prev.contact_name,
                contact_email: prev.contact_email,
                contact_phone: prev.contact_phone,
            }))
        } catch (err) {
            setError(err.message || 'Could not submit request')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="mx-auto max-w-5xl space-y-8 pb-20 pt-6 px-4 sm:px-0">
            {/* Global Stepper */}
            <div className="mb-8 mx-auto max-w-3xl">
                <div className="relative flex items-center justify-between">
                    <div className="absolute left-0 top-1/2 -z-10 h-1 w-full -translate-y-1/2 bg-gray-200 rounded-full"></div>
                    <div className="absolute left-0 top-1/2 -z-10 h-1 w-1/4 -translate-y-1/2 bg-green-500 rounded-full"></div>
                    
                    <div className="flex flex-col items-center bg-[#fdfdfd] px-1 sm:px-4">
                        <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-green-600 text-xs sm:text-sm font-bold text-white shadow-md ring-4 ring-[#fdfdfd]">
                            1
                        </div>
                        <span className="mt-1.5 sm:mt-3 text-[9px] sm:text-xs font-bold text-gray-900 uppercase tracking-tight sm:tracking-wider text-center max-w-[70px] sm:max-w-none">Get Number</span>
                    </div>
                    <div className="flex flex-col items-center bg-[#fdfdfd] px-1 sm:px-4">
                        <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white text-xs sm:text-sm text-gray-400 border-2 border-gray-200 ring-4 ring-[#fdfdfd]">
                            2
                        </div>
                        <span className="mt-1.5 sm:mt-3 text-[9px] sm:text-xs font-bold text-gray-400 uppercase tracking-tight sm:tracking-wider text-center max-w-[70px] sm:max-w-none">Meta Verification</span>
                    </div>
                    <div className="flex flex-col items-center bg-[#fdfdfd] px-1 sm:px-4">
                        <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white text-xs sm:text-sm text-gray-400 border-2 border-gray-200 ring-4 ring-[#fdfdfd]">
                            3
                        </div>
                        <span className="mt-1.5 sm:mt-3 text-[9px] sm:text-xs font-bold text-gray-400 uppercase tracking-tight sm:tracking-wider text-center max-w-[70px] sm:max-w-none">Launch</span>
                    </div>
                </div>
            </div>

            <section className="text-center">
                <div className="mb-4 hidden sm:flex justify-center">
                    <TourButton />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-4xl">Set up your WhatsApp number</h1>
                <p className="mx-auto mt-2 sm:mt-4 max-w-2xl text-xs sm:text-base leading-relaxed text-gray-600">
                    Get a fresh virtual number instantly for WhatsApp Cloud API, or request our team's assistance for a guided onboarding experience.
                </p>
                <div className="mt-4 flex items-center justify-center gap-4">
                    <Link to="/whatsapp-connect" className="inline-flex items-center text-xs sm:text-sm font-semibold text-indigo-600 hover:text-indigo-500">
                        Already have a number? Connect it here &rarr;
                    </Link>
                </div>
            </section>

            {/* Tab Selector */}
            <div data-tour="number-tabs" className="flex justify-center mt-6">
                <div className="inline-flex rounded-xl bg-gray-200/60 p-1 sm:p-1.5 shadow-inner">
                    <button
                        onClick={() => setActiveTab('instant')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-bold transition-all ${activeTab === 'instant' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Instant Setup (Twilio)
                    </button>
                    <button
                        onClick={() => setActiveTab('assisted')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-bold transition-all ${activeTab === 'assisted' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Assisted Setup
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="mt-8">
                {activeTab === 'instant' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <TwilioNumberPurchase />
                        
                        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-950">Official setup path</h2>
                            <p className="mt-1 text-sm text-gray-500">What happens after you get a number?</p>
                            
                            <div className="mt-6 grid gap-6 md:grid-cols-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">1</div>
                                    <h3 className="mt-4 font-bold text-gray-900">Verify Number</h3>
                                    <p className="mt-2 text-sm text-gray-500">Use this number to receive SMS OTP during Meta\'s business verification process.</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">2</div>
                                    <h3 className="mt-4 font-bold text-gray-900">Configure Profile</h3>
                                    <p className="mt-2 text-sm text-gray-500">Set up your WhatsApp display name, business description, and logo via our portal.</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">3</div>
                                    <h3 className="mt-4 font-bold text-gray-900">Launch Automations</h3>
                                    <p className="mt-2 text-sm text-gray-500">Connect the number to your AI agents and broadcast campaigns instantly.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'assisted' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                        <div data-tour="number-form" className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-gray-950">Request assisted setup</h2>
                                <p className="mt-2 text-sm leading-6 text-gray-500">Provide accurate details to help our team arrange a dedicated number and fast-track your Meta approval flow.</p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {error && <InlineNotice tone="danger" text={error} />}
                                {success && <InlineNotice tone="success" text={success} />}

                                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                    <Field label="Business name" required>
                                        <input value={form.business_name} onChange={e => updateField('business_name', e.target.value)} className={inputClass} placeholder="Acme Services Pvt Ltd" />
                                    </Field>
                                    <Field label="Country" required>
                                        <input value={form.country} onChange={e => updateField('country', e.target.value)} className={inputClass} placeholder="India" />
                                    </Field>
                                    <Field label="Preferred city/state">
                                        <input value={form.preferred_region} onChange={e => updateField('preferred_region', e.target.value)} className={inputClass} placeholder="Delhi NCR, Maharashtra..." />
                                    </Field>
                                    <Field label="Expected monthly messages">
                                        <input type="number" min="0" value={form.expected_monthly_messages} onChange={e => updateField('expected_monthly_messages', e.target.value)} className={inputClass} placeholder="10000" />
                                    </Field>
                                    <Field label="Contact name">
                                        <input value={form.contact_name} onChange={e => updateField('contact_name', e.target.value)} className={inputClass} placeholder="Owner / admin name" />
                                    </Field>
                                    <Field label="Contact email">
                                        <input type="email" value={form.contact_email} onChange={e => updateField('contact_email', e.target.value)} className={inputClass} placeholder="admin@business.com" />
                                    </Field>
                                    <Field label="Contact phone">
                                        <input value={form.contact_phone} onChange={e => updateField('contact_phone', e.target.value)} className={inputClass} placeholder="+91..." />
                                    </Field>
                                    <div className="hidden sm:block" />
                                    <Field label="Business use case" required className="sm:col-span-2">
                                        <textarea
                                            value={form.use_case}
                                            onChange={e => updateField('use_case', e.target.value)}
                                            rows={4}
                                            className={`${inputClass} resize-y`}
                                            placeholder="Example: customer support, abandoned cart reminders, appointment updates..."
                                        />
                                    </Field>
                                </div>

                                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm leading-6 text-blue-900">
                                    Official Cloud API requires Meta policies compliance, business verification, and display name review. Submitting this request initiates our assisted onboarding process.
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
                                    >
                                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Submit Request
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Recent Requests Section inside Assisted Tab */}
                        <div data-tour="number-requests" className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                            <div className="border-b border-gray-100 p-6">
                                <h2 className="text-lg font-bold text-gray-950">Your active requests</h2>
                                <p className="mt-1 text-sm text-gray-500">Track the status of your assisted number requests.</p>
                            </div>
                            <div className="p-6">
                                {loading ? (
                                    <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Loading requests...
                                    </div>
                                ) : requests.length ? (
                                    <div className="grid gap-4 md:grid-cols-2">
                                        {requests.map(item => <RequestCard key={item.id} request={item} />)}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
                                        <Briefcase className="mx-auto h-8 w-8 text-gray-400" strokeWidth={1.5} />
                                        <h3 className="mt-4 text-sm font-bold text-gray-900">No active requests</h3>
                                        <p className="mt-1 text-sm text-gray-500">Fill the form above to request an assisted setup.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20'

function Field({ label, required, className = '', children }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-2 block text-sm font-bold text-gray-700">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            {children}
        </label>
    )
}

function InlineNotice({ tone, text }) {
    const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
    const classes = tone === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
    return (
        <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm font-medium ${classes}`}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{text}</span>
        </div>
    )
}

function RequestCard({ request }) {
    const isDone = request.status === 'connected'
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-base font-bold text-gray-950">{request.business_name}</p>
                    <p className="mt-1 truncate text-xs font-medium text-gray-500">{request.country}{request.preferred_region ? `, ${request.preferred_region}` : ''}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${isDone ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' : 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20'}`}>
                    {isDone ? <ShieldCheck className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                    {statusLabels[request.status] || request.status}
                </span>
            </div>
            <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-gray-600">{request.use_case}</p>
            {request.admin_notes && (
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 border border-gray-100">
                    <span className="font-semibold block mb-1">Admin Note:</span>
                    {request.admin_notes}
                </div>
            )}
        </div>
    )
}
