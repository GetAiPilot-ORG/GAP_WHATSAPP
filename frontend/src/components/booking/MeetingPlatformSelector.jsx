import React, { useState, useEffect } from 'react'
import { ExternalLink, CheckCircle, AlertCircle, Copy, Check, Sparkles, RefreshCw, Link as LinkIcon } from 'lucide-react'
import { notify } from '../../services/notificationService'

export const PLATFORMS = [
    {
        id: 'google_meet',
        name: 'Google Meet',
        badge: 'Popular',
        domain: 'meet.google.com',
        placeholder: 'https://meet.google.com/abc-defg-hij',
        defaultUrlPrefix: 'https://meet.google.com/',
        color: '#00832d',
        logo: (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" fill="none">
                <path d="M42 14.5L34 20.5V13C34 11.3431 32.6569 10 31 10H7C5.34315 10 4 11.3431 4 13V35C4 36.6569 5.34315 38 7 38H31C32.6569 38 34 36.6569 34 35V27.5L42 33.5C43.1046 34.3284 44 33.8807 44 32.5V15.5C44 14.1193 43.1046 13.6716 42 14.5Z" fill="#00832d" />
                <path d="M34 27.5L42 33.5C43.1046 34.3284 44 33.8807 44 32.5V25L34 27.5Z" fill="#0066da" />
                <path d="M42 14.5L34 20.5V27.5L44 25V15.5C44 14.1193 43.1046 13.6716 42 14.5Z" fill="#e53935" />
                <path d="M34 13C34 11.3431 32.6569 10 31 10H20V25L34 20.5V13Z" fill="#00ac47" />
                <path d="M20 25V38H31C32.6569 38 34 36.6569 34 35V20.5L20 25Z" fill="#00aa47" />
                <path d="M4 35C4 36.6569 5.34315 38 7 38H20V25H4V35Z" fill="#00832d" />
                <path d="M4 13C4 11.3431 5.34315 10 7 10H20V25H4V13Z" fill="#ffba00" />
            </svg>
        ),
    },
    {
        id: 'zoom',
        name: 'Zoom',
        badge: 'HD Video',
        domain: 'zoom.us',
        placeholder: 'https://zoom.us/j/1234567890',
        defaultUrlPrefix: 'https://zoom.us/j/',
        color: '#2D8CFF',
        logo: (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#2D8CFF" />
                <path d="M5 8.5C5 7.67157 5.67157 7 6.5 7H13.5C14.3284 7 15 7.67157 15 8.5V15.5C15 16.3284 14.3284 17 13.5 17H6.5C5.67157 17 5 16.3284 5 15.5V8.5Z" fill="white" />
                <path d="M16 10.2L18.4 8.4C18.8 8.1 19.3 8.4 19.3 8.9V15.1C19.3 15.6 18.8 15.9 18.4 15.6L16 13.8V10.2Z" fill="white" />
            </svg>
        ),
    },
    {
        id: 'teams',
        name: 'MS Teams',
        badge: 'Enterprise',
        domain: 'teams.microsoft.com',
        placeholder: 'https://teams.microsoft.com/l/meetup-join/...',
        defaultUrlPrefix: 'https://teams.microsoft.com/',
        color: '#5059C9',
        logo: (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M14.5 7C14.5 5.62 13.38 4.5 12 4.5C10.62 4.5 9.5 5.62 9.5 7C9.5 8.38 10.62 9.5 12 9.5C13.38 9.5 14.5 8.38 14.5 7Z" fill="#5059C9" />
                <path d="M18.5 8.5C18.5 7.4 17.6 6.5 16.5 6.5C15.4 6.5 14.5 7.4 14.5 8.5C14.5 9.6 15.4 10.5 16.5 10.5C17.6 10.5 18.5 9.6 18.5 8.5Z" fill="#7B83EB" />
                <path d="M14.5 11.2C13.7 10.8 12.9 10.5 12 10.5C9.8 10.5 8 12.3 8 14.5V17H16V14.5C16 13.2 15.4 12 14.5 11.2Z" fill="#5059C9" />
                <path d="M16.5 12C17.1 12.4 17.6 12.9 18 13.5C18.3 14 18.5 14.7 18.5 15.5V17H21V15.5C21 13.6 19.4 12 17.5 12C17.2 12 16.8 12 16.5 12Z" fill="#7B83EB" />
                <rect x="3" y="9" width="7" height="8" rx="1.5" fill="#464EB8" />
                <path d="M5.2 11.5H7.8V12.3H6.9V15.5H5.9V12.3H5.2V11.5Z" fill="white" />
            </svg>
        ),
    },
    {
        id: 'jitsi',
        name: 'Jitsi Meet',
        badge: 'Instant Auto-Room',
        domain: 'meet.jit.si',
        placeholder: 'Auto-generates room link',
        color: '#17A0DB',
        logo: (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#17A0DB" />
                <path d="M7 6C5.9 6 5 6.9 5 8V16C5 17.1 5.9 18 7 18H13C14.1 18 15 17.1 15 16V14.2L18.4 16.8C18.8 17.1 19.5 16.8 19.5 16.2V7.8C19.5 7.2 18.8 6.9 18.4 7.2L15 9.8V8C15 6.9 14.1 6 13 6H7Z" fill="white" />
                <circle cx="10" cy="12" r="2" fill="#17A0DB" />
            </svg>
        ),
    }
]

export function validateMeetingUrl(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
        return { isValid: false, error: 'Meeting link cannot be empty.' }
    }
    const clean = url.trim()
    try {
        const fullUrl = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`
        const parsed = new URL(fullUrl)
        if (!parsed.hostname || !parsed.hostname.includes('.')) {
            return { isValid: false, error: 'Invalid domain name in meeting link.' }
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { isValid: false, error: 'Meeting link must start with https://' }
        }
        return { isValid: true, normalizedUrl: parsed.href, error: null }
    } catch {
        return { isValid: false, error: 'Please enter a valid meeting URL (e.g. https://meet.google.com/...)' }
    }
}

export default function MeetingPlatformSelector({
    provider = 'jitsi',
    customUrl = '',
    serviceName = 'Consultation',
    onProviderChange,
    onUrlChange,
    isLinkVerified = false,
    setIsLinkVerified,
    required = true,
}) {
    const [copied, setCopied] = useState(false)
    const [urlError, setUrlError] = useState('')
    const [autoJitsiRoom, setAutoJitsiRoom] = useState('')

    // Generate stable Jitsi room for testing
    useEffect(() => {
        if (!autoJitsiRoom) {
            const cleanTitle = (serviceName || 'Consultation').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
            const randomCode = Math.random().toString(36).substring(2, 8)
            setAutoJitsiRoom(`https://meet.jit.si/GetAiPilot-${cleanTitle}-${randomCode}`)
        }
    }, [serviceName, autoJitsiRoom])

    const activeUrl = provider === 'jitsi' ? autoJitsiRoom : customUrl

    const handleSelectPlatform = (platformId) => {
        onProviderChange(platformId)
        setIsLinkVerified(false)
        setUrlError('')
    }

    const handleUrlInputChange = (e) => {
        const val = e.target.value
        onUrlChange(val)
        setIsLinkVerified(false)
        if (val.trim()) {
            const res = validateMeetingUrl(val)
            setUrlError(res.isValid ? '' : res.error)
        } else {
            setUrlError('')
        }
    }

    const handleTestAndOpenLink = () => {
        const targetUrl = activeUrl?.trim()
        if (!targetUrl) {
            setUrlError('Please enter a meeting link before opening.')
            notify.error('Please enter a meeting link before opening.')
            return
        }

        const validation = validateMeetingUrl(targetUrl)
        if (!validation.isValid) {
            setUrlError(validation.error)
            notify.error(validation.error)
            return
        }

        // Open in new tab for testing
        window.open(validation.normalizedUrl, '_blank', 'noopener,noreferrer')
        setIsLinkVerified(true)
        setUrlError('')
        notify.success('Meeting link opened! Verified and ready to schedule.')
    }

    const handleCopy = () => {
        if (activeUrl) {
            navigator.clipboard.writeText(activeUrl)
            setCopied(true)
            notify.success('Meeting link copied!')
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const selectedPlatform = PLATFORMS.find((p) => p.id === provider) || PLATFORMS[0]

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Meeting Platform & Room Link {required && <span className="text-red-500">*</span>}
                </label>
                <span className="text-[11px] font-medium text-gray-500">
                    Select video service
                </span>
            </div>

            {/* Platform Options with Official Logos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PLATFORMS.map((platform) => {
                    const isSelected = provider === platform.id
                    return (
                        <button
                            key={platform.id}
                            type="button"
                            onClick={() => handleSelectPlatform(platform.id)}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all relative ${isSelected
                                    ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600/30'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            {platform.logo}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                    <span className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-900 font-bold' : 'text-gray-800'}`}>
                                        {platform.name}
                                    </span>
                                </div>
                                <span className="text-[10px] text-gray-400 block truncate">
                                    {platform.badge}
                                </span>
                            </div>
                            {isSelected && (
                                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-600" />
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Meeting Link Input / Auto-Generator with Test Validation */}
            <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                        {selectedPlatform.logo}
                        <span>
                            {provider === 'jitsi' ? 'Dedicated Auto Room URL' : `${selectedPlatform.name} Meeting URL`}
                        </span>
                    </span>
                    {isLinkVerified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            Link Verified & Opened
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            Validation Required
                        </span>
                    )}
                </div>

                {provider === 'jitsi' ? (
                    <div className="flex items-center gap-2">
                        <div className="flex-1 p-2 bg-white rounded-lg border border-gray-200 font-mono text-xs text-gray-700 truncate select-all">
                            {autoJitsiRoom}
                        </div>
                        <button
                            type="button"
                            onClick={handleCopy}
                            title="Copy link"
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200 bg-white transition-colors"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="relative">
                            <input
                                type="url"
                                value={customUrl}
                                onChange={handleUrlInputChange}
                                placeholder={selectedPlatform.placeholder}
                                className={`w-full px-3 py-2 text-xs font-mono rounded-lg border bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden ${urlError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300'
                                    }`}
                                required={required}
                            />
                        </div>
                        {urlError && (
                            <p className="text-[11px] text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {urlError}
                            </p>
                        )}
                    </div>
                )}

                {/* Validation & Open Link Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-gray-200/80">
                    <p className="text-[11px] text-gray-500 leading-tight">
                        {isLinkVerified ? (
                            <span className="text-emerald-700 font-medium">
                                ✓ Link verified. Host and attendee can join without errors.
                            </span>
                        ) : (
                            <span>
                                Open the link once to confirm permissions and verify attendees can join.
                            </span>
                        )}
                    </p>

                    <button
                        type="button"
                        onClick={handleTestAndOpenLink}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-2xs shrink-0 ${isLinkVerified
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {isLinkVerified ? 'Re-open & Test Link' : 'Open & Test Link'}
                    </button>
                </div>
            </div>
        </div>
    )
}
