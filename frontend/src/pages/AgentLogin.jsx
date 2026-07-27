import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
    ArrowRight,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    MessageSquareText,
    ShieldCheck,
    Sparkles,
    UserCheck,
} from 'lucide-react'

export default function AgentLogin() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showOnlinePrompt, setShowOnlinePrompt] = useState(false)
    const [onlinePromptLoading, setOnlinePromptLoading] = useState(false)
    const { signIn, signOut, apiCall, updateMyOnlineStatus } = useAuth()
    const navigate = useNavigate()
    const autoLoginStarted = useRef(false)

    const loginAgent = async (loginEmail, loginPassword) => {
        setLoading(true)
        setError('')
        try {
            const { data, error } = await signIn({ email: loginEmail.trim(), password: loginPassword }, 'agent')
            if (error) throw error
            const token = data?.session?.access_token
            if (!token) throw new Error('Could not verify this team member session.')

            const profileRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/my-profile`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Auth-Portal': 'agent'
                }
            })
            if (!profileRes.ok) {
                await signOut()
                throw new Error('This page is only for active team agents. Owners should use the main login page.')
            }

            setShowOnlinePrompt(true)
        } catch (err) {
            if (err.message.includes('Invalid login credentials')) {
                setError('Agent ID does not exist or the password is incorrect. Ask your owner for valid credentials.')
            } else {
                setError(err.message)
            }
        } finally {
            setLoading(false)
        }
    }

    const handleGoOnline = async () => {
        setOnlinePromptLoading(true)
        try {
            await updateMyOnlineStatus(true)
        } catch (err) {
            console.error("Failed to update status on login:", err)
        } finally {
            setOnlinePromptLoading(false)
            navigate('/live-chat', { replace: true })
        }
    }

    const handleNotNow = () => {
        navigate('/live-chat', { replace: true })
    }


    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const linkEmail = params.get('email') || ''
        const linkPassword = params.get('password') || ''
        const shouldAutoLogin = params.get('autoLogin') === '1'

        if (!linkEmail && !linkPassword) return

        setEmail(linkEmail)
        setPassword(linkPassword)
        window.history.replaceState({}, document.title, window.location.pathname)

        if (shouldAutoLogin && linkEmail && linkPassword && !autoLoginStarted.current) {
            autoLoginStarted.current = true
            loginAgent(linkEmail, linkPassword)
        }
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        await loginAgent(email, password)
    }

    return (
        <main className="min-h-screen w-full bg-[#f5f7fa] text-gray-950">
            <div className="grid min-h-screen lg:grid-cols-[minmax(500px,0.92fr)_minmax(520px,1.08fr)]">
                <section className="relative hidden min-h-screen overflow-hidden bg-black lg:block">
                    <img
                        src="/login.jpg"
                        alt="Team member workspace"
                        className="absolute inset-0 h-full w-full scale-105 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/74" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(37,211,102,0.24),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.86))]" />

                    <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur-md">
                                <img src="/logo.png" alt="GAP FlowPilot" className="h-7 w-7 object-contain" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-white">GAP FlowPilot</p>
                                <p className="text-xs text-white/60">Team member workspace</p>
                            </div>
                        </div>

                        <div className="max-w-xl">
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-md">
                                <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                                Agent access
                            </div>
                            <h1 className="text-[52px] font-light leading-[1.05] tracking-normal text-white xl:text-[58px]">
                                Handle WhatsApp chats with focus and context.
                            </h1>
                            <p className="mt-5 max-w-lg text-base leading-7 text-white/76">
                                Sign in to reply to assigned conversations, view customer history, and keep handoffs moving without opening admin tools.
                            </p>

                            <div className="mt-9 grid max-w-xl grid-cols-2 gap-3">
                                <InfoTile icon={MessageSquareText} title="Assigned inbox" text="See only the conversations your team routes to you." />
                                <InfoTile icon={ShieldCheck} title="Restricted access" text="Team members stay inside the live chat workspace." />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-medium text-white/58">
                            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                            Secure access for active team agents only
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
                                <p className="text-xs text-gray-500">Team member workspace</p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8">
                            <div className="mb-7 hidden items-center gap-3 lg:flex">
                                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white">
                                    <img src="/logo.png" alt="GAP FlowPilot" className="h-6 w-6 object-contain" />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-gray-950">GAP FlowPilot</p>
                                    <p className="text-xs text-gray-500">Agent portal</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-semibold text-[#128C7E]">Team member access</p>
                                <h2 className="mt-2 text-[38px] font-light leading-tight tracking-normal text-black">Agent sign in</h2>
                                <p className="mt-3 text-sm leading-6 text-gray-600">
                                    Use the email and password shared in your invitation. Owners should use the main login page.
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
                                        <span className="mb-2 block text-sm font-semibold text-gray-800">Agent email</span>
                                        <span className="relative block">
                                            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                            <input
                                                id="email"
                                                name="email"
                                                type="email"
                                                autoComplete="email"
                                                required
                                                className="h-12 w-full rounded border border-gray-300 bg-white py-3 pl-12 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#128C7E] focus:ring-2 focus:ring-[#25D366]/15"
                                                placeholder="agent@example.com"
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
                                                onClick={() => setShowPassword(prev => !prev)}
                                                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                                                Open agent workspace
                                                <ArrowRight className="h-4 w-4" />
                                            </>
                                        )}
                                    </button>
                                </form>

                                <div className="mt-6 rounded-lg border border-gray-200 bg-[#f8fafc] p-4">
                                    <div className="flex gap-3">
                                        <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#128C7E]" />
                                        <p className="text-sm leading-6 text-gray-600">
                                            This portal is limited to active agents. Need admin access?{' '}
                                            <Link to="/login" className="font-semibold text-[#128C7E] hover:text-[#0f7a6f]">
                                                Use owner login
                                            </Link>
                                            .
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            {showOnlinePrompt && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100 p-6 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-[#128C7E] mb-4">
                            <Sparkles className="h-7 w-7" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">Set yourself as Online?</h3>
                        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                            Going online allows the auto-assignment system to route new inbound chats to you immediately.
                        </p>
                        <div className="flex flex-col gap-2.5">
                            <button
                                onClick={handleGoOnline}
                                disabled={onlinePromptLoading}
                                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#128C7E] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0f7a6f] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 disabled:opacity-50"
                            >
                                {onlinePromptLoading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    'Go Online'
                                )}
                            </button>
                            <button
                                onClick={handleNotNow}
                                disabled={onlinePromptLoading}
                                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
                            >
                                Not now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}

function InfoTile({ icon: Icon, title, text }) {
    return (
        <div className="rounded-lg bg-white/10 p-4 text-white ring-1 ring-white/15 backdrop-blur-md">
            <Icon className="mb-3 h-5 w-5 text-emerald-300" />
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-5 text-white/68">{text}</p>
        </div>
    )
}
