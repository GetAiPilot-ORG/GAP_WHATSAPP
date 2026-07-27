import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Zap, MessageCircle } from 'lucide-react'

export default function WhatsAppRedirect() {
    const { data } = useParams()
    const [error, setError] = useState(false)

    useEffect(() => {
        let redirectTimeout;
        try {
            if (!data) throw new Error('No data')
            const decoded = JSON.parse(decodeURIComponent(atob(data)))
            
            if (!decoded.p) throw new Error('No phone')
            
            const waLink = decoded.m 
                ? `https://wa.me/${decoded.p}?text=${encodeURIComponent(decoded.m)}`
                : `https://wa.me/${decoded.p}`

            // Show branding for 1.8 seconds, then redirect
            redirectTimeout = setTimeout(() => {
                window.location.replace(waLink)
            }, 1800)
            
        } catch (e) {
            console.error('Invalid link', e)
            setError(true)
        }

        return () => clearTimeout(redirectTimeout)
    }, [data])

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
                <div className="rounded-2xl bg-white p-8 shadow-xl shadow-gray-200/50 border border-gray-100 max-w-md w-full text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500 mb-6">
                        <Zap className="h-8 w-8" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid or Broken Link</h1>
                    <p className="text-gray-500 mb-8">This WhatsApp link appears to be invalid or corrupted.</p>
                    <button onClick={() => window.location.href = '/wa-link-generator'} className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors">
                        Create Your Own Link
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] px-4 relative overflow-hidden">
            {/* Soft background glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-400/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="text-center animate-in fade-in zoom-in duration-700 delay-150 fill-mode-both relative z-10">
                <div className="relative mx-auto flex h-[100px] w-[100px] items-center justify-center rounded-3xl bg-gradient-to-br from-[#25D366] to-[#128C7E] shadow-2xl shadow-green-500/30 mb-8">
                    <MessageCircle className="h-12 w-12 text-white animate-pulse" />
                    <div className="absolute -bottom-2 -right-2 h-9 w-9 rounded-full border-4 border-[#f8fafc] bg-white flex items-center justify-center shadow-sm">
                        <Zap className="h-4 w-4 text-[#25D366]" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-2xl sm:text-[28px] font-extrabold text-gray-900 tracking-tight">
                        Opening WhatsApp...
                    </h1>
                    <p className="text-gray-500 font-medium text-[15px]">Connecting securely</p>
                    
                    <div className="flex flex-col items-center gap-3 pt-4">
                        <div className="flex gap-2 justify-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#25D366] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2.5 h-2.5 rounded-full bg-[#25D366] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2.5 h-2.5 rounded-full bg-[#25D366] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        
                        <div className="mt-10 rounded-full border border-gray-200 bg-white px-5 py-2.5 inline-flex items-center gap-2.5 shadow-sm">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Powered by</span>
                            <span className="text-sm font-black text-gray-900 tracking-tight flex items-center gap-1">
                                GAP <Zap className="h-3.5 w-3.5 text-blue-600 fill-blue-600" /> Platform
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
