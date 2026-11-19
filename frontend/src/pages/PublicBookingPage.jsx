import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import InteractiveBookingWidget from '../components/booking/InteractiveBookingWidget'
import { ShieldCheck, Sparkles, Video, MessageSquare } from 'lucide-react'

const SETTINGS_STORAGE_KEY = 'gap_whatsapp_meeting_config'

export default function PublicBookingPage() {
    const { slug } = useParams()
    const [config, setConfig] = useState({
        title: '30-min WhatsApp Consultation & Demo',
        hostName: 'GetAiPilot Specialist',
        hostEmail: '',
        slug: slug || 'meet',
        duration: 30,
        buffer: 10,
        workingHours: { start: '09:30', end: '18:30' },
        workingDays: [1, 2, 3, 4, 5, 6],
    })

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw)
                setConfig((prev) => ({ ...prev, ...parsed, slug: slug || parsed.slug || 'meet' }))
            }
        } catch (e) {
            console.warn('Failed to parse config:', e)
        }
    }, [slug])

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-6 sm:py-10 px-3 sm:px-6">
            <div className="w-full max-w-5xl lg:max-w-6xl mx-auto space-y-6">
                {/* Brand Header */}
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shadow-xs">
                            GAP
                        </div>
                        <div>
                            <span className="text-sm font-black tracking-tight text-gray-900 block leading-none">
                                GetAiPilot WhatsApp
                            </span>
                            <span className="text-[10px] font-semibold text-gray-400">
                                1-on-1 Client Scheduling
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-white px-3 py-1 rounded-full border border-gray-200 shadow-2xs">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Instant Confirmation</span>
                    </div>
                </div>

                {/* The Core Interactive Booking Widget */}
                <InteractiveBookingWidget config={config} />

                {/* Footer Brand Banner */}
                <div className="text-center text-xs text-gray-400 space-y-2 pt-4">
                    <p className="flex items-center justify-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                        <span>Powered by <strong className="text-gray-700">GetAiPilot Meeting Studio</strong></span>
                    </p>
                    <p className="text-[11px] text-gray-400">
                        Zero Subscription Fees • Real-time Calendar Sync
                    </p>
                </div>
            </div>
        </div>
    )
}
