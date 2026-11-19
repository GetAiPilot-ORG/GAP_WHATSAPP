import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
    Calendar,
    Clock,
    Lock,
    Video,
    ExternalLink,
    AlertCircle,
    CheckCircle2,
    CalendarCheck,
    ArrowLeft,
    Sparkles,
} from 'lucide-react'
import { getMeetingTimeStatus } from '../utils/meetingTimeValidator'

export default function MeetingWaitingRoom() {
    const [searchParams] = useSearchParams()

    // Resolve masked third-party link from token or direct link
    const rawLink = useMemo(() => {
        const directLink = searchParams.get('link')
        if (directLink) return directLink

        const token = searchParams.get('token') || searchParams.get('room')
        if (token) {
            try {
                return decodeURIComponent(escape(atob(token)))
            } catch {
                try {
                    return atob(token)
                } catch {
                    return token
                }
            }
        }
        return ''
    }, [searchParams])

    const date = searchParams.get('date') || ''
    const time = searchParams.get('time') || ''
    const serviceName = searchParams.get('service') || '1-on-1 Consultation'
    const clientName = searchParams.get('name') || ''

    // Ticking state for real-time second-by-second countdown
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date())
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    const timeStatus = useMemo(() => {
        return getMeetingTimeStatus(date, time, 30, 10)
    }, [date, time, now])

    // Format human-friendly scheduled date
    const formattedDate = useMemo(() => {
        if (!date) return 'Upcoming'
        try {
            const [y, m, d] = date.split('-').map(Number)
            return new Date(y, m - 1, d).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            })
        } catch {
            return date
        }
    }, [date])

    // Real-time seconds countdown breakdown
    const countdownDetail = useMemo(() => {
        if (!timeStatus || timeStatus.status !== 'upcoming' || !timeStatus.diffSeconds) {
            return null
        }
        const totalSec = timeStatus.diffSeconds
        const days = Math.floor(totalSec / 86400)
        const hours = Math.floor((totalSec % 86400) / 3600)
        const minutes = Math.floor((totalSec % 3600) / 60)
        const seconds = totalSec % 60

        return { days, hours, minutes, seconds }
    }, [timeStatus])

    // Platform logo detection
    const platform = useMemo(() => {
        const lower = rawLink.toLowerCase()
        if (lower.includes('meet.google.com')) return { name: 'Google Meet', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
        if (lower.includes('zoom.us')) return { name: 'Zoom', color: 'text-blue-700 bg-blue-50 border-blue-200' }
        if (lower.includes('teams.microsoft.com')) return { name: 'MS Teams', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' }
        return { name: 'Dedicated Video Room', color: 'text-purple-700 bg-purple-50 border-purple-200' }
    }, [rawLink])

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 flex flex-col justify-between p-4 sm:p-6 antialiased font-sans">
            {/* Header bar */}
            <header className="max-w-xl w-full mx-auto flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                        G
                    </div>
                    <span className="font-bold text-gray-900 tracking-tight text-sm">
                        GAP WhatsApp Meetings
                    </span>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${platform.color}`}>
                    {platform.name}
                </span>
            </header>

            {/* Main Waiting Card */}
            <main className="max-w-md w-full mx-auto my-auto py-6">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                    {/* Top Status Header */}
                    <div className={`p-6 text-center border-b transition-colors ${
                        timeStatus.isJoinable
                            ? 'bg-emerald-50/70 border-emerald-100'
                            : timeStatus.status === 'ended'
                            ? 'bg-gray-50 border-gray-200'
                            : 'bg-slate-900 text-white border-slate-800'
                    }`}>
                        {timeStatus.isJoinable ? (
                            <div className="space-y-2">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                                    <Video className="w-6 h-6 animate-pulse" />
                                </div>
                                <h1 className="text-xl font-bold text-emerald-950">
                                    Room is Now Open!
                                </h1>
                                <p className="text-xs text-emerald-700">
                                    You can join the video conference call now.
                                </p>
                            </div>
                        ) : timeStatus.status === 'ended' ? (
                            <div className="space-y-2">
                                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto">
                                    <AlertCircle className="w-6 h-6" />
                                </div>
                                <h1 className="text-xl font-bold text-gray-900">
                                    Session Has Ended
                                </h1>
                                <p className="text-xs text-gray-500">
                                    This scheduled meeting has already concluded.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center mx-auto ring-1 ring-white/20">
                                    <Lock className="w-6 h-6 text-amber-400" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-white tracking-tight">
                                        Meeting Room Locked
                                    </h1>
                                    <p className="text-xs text-slate-300 mt-1">
                                        Link click is disabled before the meeting time
                                    </p>
                                </div>

                                {/* Real-time Countdown Box */}
                                {countdownDetail && (
                                    <div className="pt-2">
                                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1.5">
                                            Access Unlocks In
                                        </div>
                                        <div className="flex items-center justify-center gap-2 text-center">
                                            {countdownDetail.days > 0 && (
                                                <div className="bg-white/10 rounded-xl px-2.5 py-1.5 min-w-12 border border-white/10">
                                                    <span className="block text-lg font-black text-white tabular-nums leading-none">
                                                        {countdownDetail.days}
                                                    </span>
                                                    <span className="text-[9px] uppercase tracking-wider text-slate-400">
                                                        days
                                                    </span>
                                                </div>
                                            )}
                                            <div className="bg-white/10 rounded-xl px-2.5 py-1.5 min-w-12 border border-white/10">
                                                <span className="block text-lg font-black text-white tabular-nums leading-none">
                                                    {String(countdownDetail.hours).padStart(2, '0')}
                                                </span>
                                                <span className="text-[9px] uppercase tracking-wider text-slate-400">
                                                    hrs
                                                </span>
                                            </div>
                                            <div className="bg-white/10 rounded-xl px-2.5 py-1.5 min-w-12 border border-white/10">
                                                <span className="block text-lg font-black text-white tabular-nums leading-none">
                                                    {String(countdownDetail.minutes).padStart(2, '0')}
                                                </span>
                                                <span className="text-[9px] uppercase tracking-wider text-slate-400">
                                                    mins
                                                </span>
                                            </div>
                                            <div className="bg-white/10 rounded-xl px-2.5 py-1.5 min-w-12 border border-white/10">
                                                <span className="block text-lg font-black text-amber-400 tabular-nums leading-none">
                                                    {String(countdownDetail.seconds).padStart(2, '0')}
                                                </span>
                                                <span className="text-[9px] uppercase tracking-wider text-slate-400">
                                                    secs
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Meeting Information */}
                    <div className="p-6 space-y-5">
                        <div className="space-y-3">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                                    Service / Topic
                                </span>
                                <h2 className="text-base font-bold text-gray-900 leading-snug">
                                    {serviceName}
                                </h2>
                                {clientName && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Confirmed for: <strong className="text-gray-800">{clientName}</strong>
                                    </p>
                                )}
                            </div>

                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-2 text-xs">
                                <div className="flex items-center gap-2.5 text-gray-800 font-medium">
                                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                                    <span>{formattedDate}</span>
                                </div>
                                <div className="flex items-center gap-2.5 text-gray-800 font-medium">
                                    <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                                    <span>{time || '11:00 AM'} (30 Minutes)</span>
                                </div>
                            </div>
                        </div>

                        {/* Room Access Enforcement Notice */}
                        {!timeStatus.isJoinable && timeStatus.status !== 'ended' && (
                            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                                <div className="flex items-center gap-1.5 font-bold text-amber-950">
                                    <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                    <span>Why is the link disabled?</span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-amber-800/90">
                                    To protect meeting privacy and prevent joining before the host is ready, access unlocks <strong>10 minutes prior</strong> to your scheduled time ({formattedDate} at {time}).
                                </p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="space-y-2 pt-2">
                            {timeStatus.isJoinable ? (
                                <a
                                    href={rawLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
                                >
                                    <Video className="w-4 h-4" />
                                    <span>Join Video Call Now</span>
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            ) : (
                                <button
                                    type="button"
                                    disabled={true}
                                    aria-disabled="true"
                                    className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed pointer-events-none flex items-center justify-center gap-2 select-none shadow-none"
                                >
                                    <Lock className="w-4 h-4 text-gray-400" />
                                    <span>
                                        {timeStatus.status === 'ended'
                                            ? 'Meeting Concluded (Disabled)'
                                            : `Link Disabled (Opens ${timeStatus.countdown || 'Soon'})`}
                                    </span>
                                </button>
                            )}

                            <p className="text-center text-[11px] text-gray-400">
                                {timeStatus.isJoinable
                                    ? 'Click above to enter the video conference.'
                                    : 'This page updates automatically in real time.'}
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="text-center py-3 text-xs text-gray-400">
                <span>Secured by GAP WhatsApp Meetings & Video Gateway</span>
            </footer>
        </div>
    )
}
