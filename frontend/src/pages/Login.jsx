import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2, Mail, Lock, MessageSquare, ShieldCheck, Sparkles, ArrowRight, CheckCircle2, Users, Zap, Eye, EyeOff } from 'lucide-react'

import { notify, scrollToFirstError } from '../services/notificationService'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { signIn } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!email || !password) {
            scrollToFirstError(e.target)
            return
        }
        setLoading(true)
        setError('')
        try {
            const { error } = await signIn({ email, password }, 'owner')
            if (error) throw error
            notify.success('Logged in successfully!')
            navigate('/dashboard', { replace: true })
        } catch (err) {
            setError(err.message)
            notify.error(err.message || 'Login failed')
            scrollToFirstError(e.target)
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="min-h-screen w-full bg-[#f5f7fa] text-gray-950">
            <div className="grid min-h-screen lg:grid-cols-[minmax(500px,0.9fr)_minmax(520px,1.1fr)]">
                <section className="relative hidden min-h-screen overflow-hidden bg-black lg:block">
                    <img
                        src="/login.jpg"
                        alt="GAP FlowPilot workspace"
                        className="absolute inset-0 h-full w-full scale-105 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/72" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(37,211,102,0.24),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.82))]" />

                    <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur-md">
                                <img src="/logo.png" alt="GAP FlowPilot" className="h-7 w-7 object-contain" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-white">GAP FlowPilot</p>
                                <p className="text-xs text-white/60">WhatsApp automation workspace</p>
                            </div>
                        </div>

                        <div className="max-w-xl">
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-md">
                                <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                                GetAiPilot connected workspace
                            </div>
                            <h1 className="text-[52px] font-light leading-[1.05] tracking-normal text-white xl:text-[60px]">
                                WhatsApp automation that feels under control.
                            </h1>
                            <p className="mt-5 max-w-lg text-base leading-7 text-white/80">
                                Build flows, manage conversations, route leads, and keep your team aligned from one focused workspace.
                            </p>

                            <div className="mt-9 grid max-w-xl grid-cols-3 gap-3">
                                <MetricTile value="24/7" label="Flow automation" />
                                <MetricTile value="1" label="Shared workspace" />
                                <MetricTile value="Fast" label="Customer handoff" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <FeatureTile icon={MessageSquare} title="Conversation-ready" text="Inbox, notes, summaries, and replies stay together." />
                            <FeatureTile icon={ShieldCheck} title="Team-safe access" text="A secure workspace for your connected services." />
                        </div>
                    </div>
                </section>

                <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-16">
                    <div className="w-full max-w-[460px]">
                        <div className="mb-10 flex items-center gap-3 lg:hidden">
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white">
                                <img src="/logo.png" alt="GAP FlowPilot" className="h-6 w-6 object-contain" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-gray-950">GAP FlowPilot</p>
                                <p className="text-xs text-gray-500">WhatsApp automation workspace</p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8">
                            <div>
                                <div className="mb-7 hidden items-center gap-3 lg:flex">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white">
                                        <img src="/logo.png" alt="GAP FlowPilot" className="h-6 w-6 object-contain" />
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-950">GAP FlowPilot</p>
                                        <p className="text-xs text-gray-500">Owner workspace</p>
                                    </div>
                                </div>

                                <p className="text-sm font-semibold text-[#128C7E]">Welcome back</p>
                                <h2 className="mt-2 text-[38px] font-light leading-tight tracking-normal text-black">Sign in</h2>
                                <p className="mt-3 text-sm leading-6 text-gray-600">
                                    Use your GetAiPilot account to open your WhatsApp automation dashboard.
                                </p>
                            </div>

                            <div className="mt-7">
                                {error && (
                                    <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <form className="space-y-5" onSubmit={handleSubmit}>
                                    <label className="block">
                                        <span className="mb-2 block text-sm font-semibold text-gray-800">Email address</span>
                                        <span className="relative block">
                                            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                            <input
                                                id="email"
                                                name="email"
                                                type="email"
                                                autoComplete="email"
                                                required
                                                className="h-12 w-full rounded border border-gray-300 bg-white py-3 pl-12 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#128C7E] focus:ring-2 focus:ring-[#25D366]/15"
                                                placeholder="you@example.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                            />
                                        </span>
                                    </label>

                                    <label className="block">
                                        <span className="mb-2 block text-sm font-semibold text-gray-800">Password</span>
                                        <span className="relative block">
                                            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                            <input
                                                id="password"
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="current-password"
                                                required
                                                className="h-12 w-full rounded border border-gray-300 bg-white py-3 pl-12 pr-12 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#128C7E] focus:ring-2 focus:ring-[#25D366]/15"
                                                placeholder="Enter password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-5 w-5" />
                                                ) : (
                                                    <Eye className="h-5 w-5" />
                                                )}
                                            </button>
                                        </span>
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#128C7E] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0f7a6f] focus:outline-none focus:ring-4 focus:ring-[#25D366]/20 disabled:opacity-50"
                                    >
                                        {loading ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <>
                                                Log in to workspace
                                                <ArrowRight className="h-4 w-4" />
                                            </>
                                        )}
                                    </button>
                                </form>

                                <div className="mt-6 grid grid-cols-2 gap-3">
                                    <a
                                        href="https://wb.getaipilot.in/agent-login"
                                        className="flex h-11 items-center gap-2 rounded-lg border border-[#128C7E]/30 bg-[#128C7E]/5 px-3 text-sm font-semibold text-[#128C7E] transition-colors hover:bg-[#128C7E]/10 hover:border-[#128C7E]/50"
                                    >
                                        <Users className="h-4 w-4" />
                                        Team member?
                                    </a>
                                    <TrustItem icon={Zap} label="Dashboard first" />
                                </div>

                                <div className="mt-5 rounded-lg border border-gray-200 bg-[#f8fafc] p-4">
                                    <div className="flex gap-3">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#128C7E]" />
                                        <p className="text-sm leading-6 text-gray-600">
                                            Your session opens the dashboard first. Refreshing keeps you on the current page.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    )
}

function MetricTile({ value, label }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white backdrop-blur-md">
            <p className="text-xl font-semibold leading-none">{value}</p>
            <p className="mt-2 text-xs leading-4 text-white/62">{label}</p>
        </div>
    )
}

function FeatureTile({ icon: Icon, title, text }) {
    return (
        <div className="rounded-lg bg-white/10 p-4 text-white ring-1 ring-white/15 backdrop-blur-md">
            <Icon className="mb-3 h-5 w-5 text-emerald-300" />
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-5 text-white/68">{text}</p>
        </div>
    )
}

function TrustItem({ icon: Icon, label }) {
    return (
        <div className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700">
            <Icon className="h-4 w-4 text-[#128C7E]" />
            {label}
        </div>
    )
}
