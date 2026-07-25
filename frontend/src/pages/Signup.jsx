import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2, Mail, Lock, User, ArrowRight, MessageSquare } from 'lucide-react'

import { notify, scrollToFirstError } from '../services/notificationService'

export default function Signup() {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        fullName: ''
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { signUp } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (formData.password !== formData.confirmPassword) {
            notify.error('Passwords do not match')
            scrollToFirstError(e.target)
            return setError('Passwords do not match')
        }

        setLoading(true)
        setError('')

        try {
            const { error } = await signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.fullName
                    }
                }
            })
            if (error) throw error
            notify.success('Account created successfully! Please log in.')
            navigate('/login')
        } catch (err) {
            setError(err.message)
            notify.error(err.message || 'Signup failed')
            scrollToFirstError(e.target)
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="min-h-screen w-full bg-gray-50 p-3 sm:p-4">
            <div className="grid min-h-[calc(100vh-24px)] w-full overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm sm:min-h-[calc(100vh-32px)] lg:grid-cols-[0.95fr_1.05fr]">
                <section className="flex items-center justify-center rounded-[24px] px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
                    <div className="w-full max-w-md rounded-[24px]">
                        <div className="mb-9 flex items-center gap-3 rounded-[24px]">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white">
                                <img src="/logo.png" alt="GAP FlowPilot" className="h-7 w-7 object-contain" />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-gray-950">GAP FlowPilot</p>
                                <p className="text-xs text-gray-500">Create workspace access</p>
                            </div>
                        </div>

                        <div className="rounded-[24px]">
                            <p className="mb-3 text-sm font-semibold text-emerald-600">New account</p>
                            <h1 className="text-4xl font-extrabold tracking-tight text-gray-950">Create your account</h1>
                            <p className="mt-3 text-sm leading-6 text-gray-500">
                                Already have an account?{' '}
                                <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
                                    Sign in
                                </Link>
                            </p>
                        </div>

                        <form className="mt-8 space-y-4 rounded-[24px]" onSubmit={handleSubmit}>
                            {error && (
                                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                                    {error}
                                </div>
                            )}

                            <AuthInput
                                label="Full name"
                                icon={User}
                                id="fullName"
                                type="text"
                                autoComplete="name"
                                placeholder="Your name"
                                value={formData.fullName}
                                onChange={(value) => setFormData({ ...formData, fullName: value })}
                            />
                            <AuthInput
                                label="Email address"
                                icon={Mail}
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={(value) => setFormData({ ...formData, email: value })}
                            />
                            <AuthInput
                                label="Password"
                                icon={Lock}
                                id="password"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Create password"
                                value={formData.password}
                                onChange={(value) => setFormData({ ...formData, password: value })}
                            />
                            <AuthInput
                                label="Confirm password"
                                icon={Lock}
                                id="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Confirm password"
                                value={formData.confirmPassword}
                                onChange={(value) => setFormData({ ...formData, confirmPassword: value })}
                            />

                            <button
                                type="submit"
                                disabled={loading}
                                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create account'}
                                {!loading ? <ArrowRight className="h-4 w-4" /> : null}
                            </button>
                        </form>
                    </div>
                </section>

                <section className="relative m-3 hidden overflow-hidden rounded-[24px] bg-gray-950 lg:block">
                    <img
                        src="/login.jpg"
                        alt="GAP FlowPilot onboarding"
                        className="absolute inset-0 h-full w-full rounded-[24px] object-cover object-center"
                    />
                    <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-emerald-950/75 via-gray-950/45 to-gray-950/80" />
                    <div className="relative z-10 flex h-full flex-col justify-end rounded-[24px] p-10">
                        <div className="max-w-lg rounded-[24px]">
                            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                                <MessageSquare className="h-6 w-6 text-emerald-300" />
                            </div>
                            <h2 className="text-5xl font-extrabold leading-tight tracking-tight text-white">
                                One account for every customer conversation.
                            </h2>
                            <p className="mt-5 max-w-md text-base leading-7 text-white/78">
                                Bring WhatsApp, automation, contact intelligence, and executive summaries into a workspace your team can actually use.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    )
}

function AuthInput({ label, icon: Icon, id, value, onChange, ...props }) {
    return (
        <label className="block rounded-2xl">
            <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
            <span className="relative block rounded-2xl">
                <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                    id={id}
                    name={id}
                    required
                    className="h-[52px] w-full rounded-2xl border border-gray-200 bg-gray-50/70 py-3.5 pl-12 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 hover:bg-white focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    {...props}
                />
            </span>
        </label>
    )
}
