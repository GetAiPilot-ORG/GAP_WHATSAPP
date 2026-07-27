import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, UserCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default function AcceptInvite() {
    const [status, setStatus] = useState('loading')
    const [message, setMessage] = useState('Checking your invitation...')
    const started = useRef(false)
    const navigate = useNavigate()
    const { signIn } = useAuth()

    useEffect(() => {
        if (started.current) return
        started.current = true

        const acceptInvite = async () => {
            const token = new URLSearchParams(window.location.search).get('token')
            window.history.replaceState({}, document.title, window.location.pathname)

            if (!token) {
                setStatus('error')
                setMessage('This invitation link is missing a token.')
                return
            }

            try {
                const res = await fetch(`${BACKEND_BASE}/api/team/invite/accept`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data?.error || 'Invitation could not be accepted')

                setStatus('success')
                setMessage('Invitation accepted. Opening your workspace...')

                const { error } = await signIn({ email: data.email, password: data.password }, 'agent')
                if (error) throw error
                navigate('/dashboard', { replace: true })
            } catch (err) {
                setStatus('error')
                setMessage(err.message || 'Invitation could not be accepted')
            }
        }

        acceptInvite()
    }, [navigate, signIn])

    const isError = status === 'error'

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${isError ? 'bg-red-50 text-red-600' : status === 'success' ? 'bg-green-50 text-green-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {status === 'loading' ? <Loader2 className="h-7 w-7 animate-spin" /> : isError ? <AlertCircle className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
                </div>
                <div className="mt-5 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-400">
                    <UserCheck className="h-4 w-4" />
                    GAP FlowPilot invite
                </div>
                <h1 className="mt-3 text-2xl font-bold text-gray-950">
                    {isError ? 'Invitation unavailable' : status === 'success' ? 'Invite accepted' : 'Accepting invitation'}
                </h1>
                <p className="mt-3 text-sm leading-6 text-gray-600">{message}</p>
                {isError && (
                    <a href="/agent-login" className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">
                        Go to agent login
                    </a>
                )}
            </div>
        </div>
    )
}
