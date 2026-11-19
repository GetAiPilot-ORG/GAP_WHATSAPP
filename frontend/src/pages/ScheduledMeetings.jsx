import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    Calendar,
    Search,
    RefreshCw,
    MessageSquareText,
    Clock,
    UserCheck,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    CheckCircle2,
    CalendarCheck2,
    Sparkles,
    XCircle,
    Trash2,
    Video,
    Copy,
    Check,
    ExternalLink,
    Share2,
    QrCode,
    Code2,
    Plus,
    Settings2,
    Download,
    X,
    Mail,
    Phone,
    User,
    Send,
    Link2,
    Globe,
    CheckCircle,
    Lock,
    ShieldCheck,
} from 'lucide-react'
import QRCode from 'react-qr-code'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { notify } from '../services/notificationService'
import { BACKEND_URL as baseUrl } from '../config/api'
import InteractiveBookingWidget, { getCalendarSyncLinks } from '../components/booking/InteractiveBookingWidget'
import MeetingPlatformSelector, { PLATFORMS, validateMeetingUrl } from '../components/booking/MeetingPlatformSelector'
import { getMeetingTimeStatus, getProtectedMeetingUrl } from '../utils/meetingTimeValidator'
import { CalendarTimePicker } from '@/components/ui/calendar-time-picker'

// Defensive QR Code resolver supporting both ESM & CJS
const SafeQRCode = (() => {
    if (!QRCode) return null
    const resolved = typeof QRCode === 'object' && QRCode !== null && QRCode.default ? QRCode.default : QRCode
    if (typeof resolved === 'function' || (typeof resolved === 'object' && resolved !== null && (resolved.$$typeof || resolved.render))) {
        return resolved
    }
    return null
})()

const SETTINGS_STORAGE_KEY = 'gap_whatsapp_meeting_config'

const DEFAULT_CONFIG = {
    title: '30-min WhatsApp Consultation & Demo',
    hostName: '',
    hostEmail: '',
    slug: 'meet',
    duration: 30,
    buffer: 10,
    provider: 'jitsi', // 'jitsi' | 'google_meet' | 'zoom' | 'teams' | 'custom'
    customUrl: '',
    workingHours: { start: '09:30', end: '18:30' },
    workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
}

export default function ScheduledMeetings() {
    const navigate = useNavigate()
    const { memberProfile, user } = useAuth()
    const { confirmDialog } = useDialog()
    const organizationId = memberProfile?.organization_id || user?.id || ''

    // Active View Tab: 'meetings' | 'studio'
    const [activeTab, setActiveTab] = useState('meetings')

    // Meetings Data State
    const [appointments, setAppointments] = useState([])
    const [summary, setSummary] = useState({ totalBookings: 0, todayCount: 0, upcomingWeekCount: 0 })
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // Filters & Pagination State
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [dateFilter, setDateFilter] = useState('')
    const [serviceFilter, setServiceFilter] = useState('all')
    const [services, setServices] = useState([])
    const [page, setPage] = useState(1)

    // Interactive Dropdowns & Modals
    const [activeStatusMenuId, setActiveStatusMenuId] = useState(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showQrModal, setShowQrModal] = useState(false)
    const [copiedBookingLink, setCopiedBookingLink] = useState(false)
    const [copiedEmbed, setCopiedEmbed] = useState(false)
    const [copiedMeetingId, setCopiedMeetingId] = useState(null)

    // Host & Meeting Link Configuration (saved in LocalStorage)
    const [meetingConfig, setMeetingConfig] = useState(() => {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
            if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
        } catch (e) {
            console.warn('Failed to parse saved meeting config:', e)
        }
        return {
            ...DEFAULT_CONFIG,
            hostName: memberProfile?.name || user?.user_metadata?.full_name || '',
            hostEmail: user?.email || '',
        }
    })

    // Update config host name/email when user auth is loaded if empty
    useEffect(() => {
        if (!meetingConfig.hostEmail && user?.email) {
            setMeetingConfig((prev) => ({
                ...prev,
                hostEmail: user.email,
                hostName: prev.hostName || memberProfile?.name || user?.user_metadata?.full_name || '',
            }))
        }
    }, [user, memberProfile, meetingConfig.hostEmail])

    // Public Booking URL
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://wb.getaipilot.in'
    const publicBookingUrl = `https://getaipilot.in/book/${meetingConfig.slug || 'meet'}`
    const embedCodeSnippet = `<iframe src="${publicBookingUrl}" width="100%" height="700" style="border:none; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08);" title="Schedule a Meeting"></iframe>`

    // Create Meeting Form State
    const [createForm, setCreateForm] = useState({
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        date: new Date().toISOString().slice(0, 10),
        time: '11:00',
        serviceName: '30-min WhatsApp Consultation & Demo',
        provider: 'jitsi',
        customUrl: '',
        notes: '',
    })
    const [isCreateLinkVerified, setIsCreateLinkVerified] = useState(false)
    const [isStudioLinkVerified, setIsStudioLinkVerified] = useState(true)
    const [isSubmittingMeeting, setIsSubmittingMeeting] = useState(false)
    const [createdMeetingResult, setCreatedMeetingResult] = useState(null)

    // Schedule date/time validation & collision checks
    const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
    const isModalDatePast = Boolean(createForm.date && createForm.date < todayStr)
    const isModalTimePast = useMemo(() => {
        if (!createForm.date || !createForm.time) return false
        if (createForm.date !== todayStr) return false
        const now = new Date()
        const [h, m] = createForm.time.split(':').map(Number)
        const total = (h || 0) * 60 + (m || 0)
        const current = now.getHours() * 60 + now.getMinutes()
        return total <= current + 5
    }, [createForm.date, createForm.time, todayStr])

    const modalClash = useMemo(() => {
        if (!createForm.date || !createForm.time || !appointments?.length) return null
        const formRaw = createForm.time.trim().slice(0, 5)
        return appointments.find((app) => {
            if (app.status === 'cancelled') return false
            const aDate = app.appointment_date || app.date
            if (aDate !== createForm.date) return false
            const aTime = (app.appointment_time || app.time || '').trim().slice(0, 5)
            const aDisp = (app.display_time || '').trim().toLowerCase()
            return aTime === formRaw || aDisp === createForm.time.toLowerCase()
        })
    }, [createForm.date, createForm.time, appointments])

    // Generate 30-minute business slots for CalendarTimePicker
    const modalAvailableSlots = useMemo(() => {
        const slots = []
        const startHour = 9
        const endHour = 18
        const now = new Date()
        const currentTotalMin = now.getHours() * 60 + now.getMinutes()

        for (let h = startHour; h < endHour; h++) {
            for (const m of [0, 30]) {
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                const period = h >= 12 ? 'PM' : 'AM'
                const hour12 = h % 12 === 0 ? 12 : h % 12
                const display = `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`

                const slotTotalMin = h * 60 + m
                const isPastToday = createForm.date === todayStr && slotTotalMin <= currentTotalMin + 5

                const isTaken = (appointments || []).some((app) => {
                    if (app.status === 'cancelled') return false
                    const aDate = (app.appointment_date || app.date || '').slice(0, 10)
                    if (aDate !== createForm.date) return false
                    const aTime = (app.appointment_time || app.time || '').trim().slice(0, 5)
                    return aTime === timeStr
                })

                slots.push({
                    time: timeStr,
                    display,
                    isTaken,
                    isPast: isPastToday,
                    disabled: isPastToday || isTaken,
                })
            }
        }
        return slots
    }, [createForm.date, todayStr, appointments])

    // 300ms Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search)
            setPage(1)
        }, 300)
        return () => clearTimeout(handler)
    }, [search])

    // Fetch Appointments from API
    const fetchAppointments = useCallback(async () => {
        if (!organizationId) {
            setLoading(false)
            return
        }

        try {
            setLoading(true)
            setError(null)

            const query = new URLSearchParams({
                organization_id: organizationId,
                page: String(page),
                limit: '10',
                search: debouncedSearch,
                status: statusFilter,
                ...(serviceFilter !== 'all' ? { flow_id: serviceFilter } : {}),
                ...(dateFilter ? { date: dateFilter } : {}),
            })

            const res = await fetch(`${baseUrl}/api/appointments?${query.toString()}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                },
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || `Failed to fetch appointments (${res.status})`)
            }

            const data = await res.json()
            setAppointments(data.data || [])
            setServices(data.services || [])
            setSummary(data.summary || { totalBookings: 0, todayCount: 0, upcomingWeekCount: 0 })
            setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 })
        } catch (err) {
            console.error('[SCHEDULED_MEETINGS] fetch error:', err)
            setError(err.message || 'Unable to load scheduled meetings. Please check connection.')
        } finally {
            setLoading(false)
        }
    }, [organizationId, page, debouncedSearch, statusFilter, dateFilter, serviceFilter])

    useEffect(() => {
        fetchAppointments()
    }, [fetchAppointments])

    // Save Settings
    const handleSaveConfig = (e) => {
        e.preventDefault()
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(meetingConfig))
            notify.success('Meeting link and availability settings saved successfully!')
        } catch (err) {
            console.error('Failed to save meeting config:', err)
            notify.error('Could not save preferences to local storage.')
        }
    }

    // Toggle working days
    const handleToggleWorkingDay = (dayIdx) => {
        setMeetingConfig((prev) => {
            const current = Array.isArray(prev.workingDays) ? prev.workingDays : []
            const updated = current.includes(dayIdx)
                ? current.filter((d) => d !== dayIdx)
                : [...current, dayIdx].sort()
            return { ...prev, workingDays: updated }
        })
    }

    // Update Status
    const handleUpdateStatus = async (item, newStatus) => {
        setActiveStatusMenuId(null)
        if (item.status === newStatus) return

        const prevStatus = item.status
        setAppointments((prev) =>
            prev.map((app) => (app.id === item.id ? { ...app, status: newStatus } : app))
        )

        try {
            const res = await fetch(`${baseUrl}/api/appointments/${encodeURIComponent(item.id)}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                },
                body: JSON.stringify({
                    status: newStatus,
                    organization_id: organizationId,
                    appointment_date: item.appointment_date,
                    appointment_time: item.appointment_time,
                }),
            })

            if (!res.ok) {
                throw new Error('Failed to update status')
            }
            notify.success(`Status updated to ${newStatus}`)
        } catch (err) {
            console.error('Error updating status:', err)
            setAppointments((prev) =>
                prev.map((app) => (app.id === item.id ? { ...app, status: prevStatus } : app))
            )
            notify.error(err.message || 'Failed to update status')
        }
    }

    // Delete Appointment
    const handleDeleteAppointment = async (item) => {
        const confirmed = await confirmDialog(
            `Are you sure you want to delete the appointment for ${item.contact_name || item.contact_phone || 'this client'}? This will also remove it from Google Calendar.`,
            {
                title: 'Delete Appointment',
                confirmLabel: 'Delete',
                tone: 'danger',
            }
        )
        if (!confirmed) return

        setAppointments((prev) => prev.filter((app) => app.id !== item.id))

        try {
            const gEvtId = item.google_event_id || (item.source === 'Google Calendar' ? item.id : '')
            const queryParams = new URLSearchParams({
                organization_id: organizationId,
                ...(gEvtId ? { google_event_id: gEvtId } : {}),
            })

            const res = await fetch(
                `${baseUrl}/api/appointments/${encodeURIComponent(item.id)}?${queryParams.toString()}`,
                {
                    method: 'DELETE',
                    headers: {
                        'ngrok-skip-browser-warning': 'true',
                    },
                }
            )

            if (!res.ok) {
                throw new Error('Failed to delete appointment')
            }
            notify.success('Appointment deleted successfully')
        } catch (err) {
            console.error('Error deleting appointment:', err)
            notify.error('Failed to delete appointment')
            fetchAppointments()
        }
    }

    // Open Live Chat
    const handleOpenChat = (item) => {
        if (item.conversation_id) {
            navigate(`/live-chat?conversationId=${item.conversation_id}`)
        } else if (item.contact_phone) {
            navigate(`/live-chat?phone=${encodeURIComponent(item.contact_phone)}`)
        } else {
            navigate('/live-chat')
        }
    }

    // Copy public booking link
    const handleCopyPublicLink = () => {
        navigator.clipboard.writeText(publicBookingUrl)
        setCopiedBookingLink(true)
        notify.success('Shareable meeting booking link copied to clipboard!')
        setTimeout(() => setCopiedBookingLink(false), 2200)
    }

    // Copy embed code
    const handleCopyEmbed = () => {
        navigator.clipboard.writeText(embedCodeSnippet)
        setCopiedEmbed(true)
        notify.success('Website embed code snippet copied to clipboard!')
        setTimeout(() => setCopiedEmbed(false), 2200)
    }

    // Copy individual meeting link (protected gateway link)
    const handleCopyMeetingLink = (item) => {
        const rawLink =
            item.meet_link ||
            item.html_link ||
            `https://meet.jit.si/GetAiPilot-${(item.flow_name || 'Meeting').replace(/[^a-zA-Z0-9]/g, '')}-${(item.id || '').slice(0, 8)}`
        const protectedLink = getProtectedMeetingUrl(
            rawLink,
            item.appointment_date,
            item.display_time || item.appointment_time,
            item.flow_name || 'Meeting',
            item.contact_name
        )
        navigator.clipboard.writeText(protectedLink)
        setCopiedMeetingId(item.id)
        notify.success('Protected meeting link copied! (Guards against early entry)')
        setTimeout(() => setCopiedMeetingId(null), 2000)
    }

    // Share meeting on WhatsApp
    const handleShareWhatsAppGeneral = () => {
        const text = `Hi! You can book a 1-on-1 meeting or call with me directly here: ${publicBookingUrl}`
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
    }

    // Send individual appointment meeting link directly to contact on WhatsApp
    const handleSendMeetingOnWhatsApp = (item) => {
        const rawMeetUrl =
            item.meet_link ||
            item.html_link ||
            `https://meet.jit.si/GetAiPilot-${(item.flow_name || 'Meeting').replace(/[^a-zA-Z0-9]/g, '')}-${(item.id || '').slice(0, 8)}`
        const protectedUrl = getProtectedMeetingUrl(
            rawMeetUrl,
            item.appointment_date,
            item.display_time || item.appointment_time,
            item.flow_name || 'Meeting',
            item.contact_name
        )
        const phone = (item.contact_phone || '').replace(/\D/g, '')
        const clientName = item.contact_name || 'there'
        const text = `Hi ${clientName}! Here are our confirmed meeting details:\n📅 Date: ${formatDateDisplay(item.appointment_date)} at ${item.display_time || item.appointment_time}\n📌 Service: ${item.flow_name || 'WhatsApp Meeting'}\n🔗 Join Meeting: ${protectedUrl}\n\n🔒 Note: Video room is secured. Access link is disabled until 10 minutes before the scheduled time.\n\nLooking forward to speaking with you!`
        const waUrl = phone
            ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`
            : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
        window.open(waUrl, '_blank')
    }

    // Share via Email
    const handleShareEmail = () => {
        const subject = `Schedule a Meeting with ${meetingConfig.hostName || 'Me'}`
        const body = `Hi,\n\nPlease choose a convenient time for our meeting using my booking link:\n\n${publicBookingUrl}\n\nLooking forward to our conversation!\n\nBest regards,\n${meetingConfig.hostName || ''}`
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
    }

    // Download QR Code PNG
    const handleDownloadQR = () => {
        const svg = document.getElementById('meeting-qr-svg')
        if (!svg) {
            notify.error('QR element not found.')
            return
        }
        try {
            const svgData = new XMLSerializer().serializeToString(svg)
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            const img = new Image()
            img.onload = () => {
                canvas.width = 600
                canvas.height = 600
                if (ctx) {
                    ctx.fillStyle = '#ffffff'
                    ctx.fillRect(0, 0, 600, 600)
                    ctx.drawImage(img, 40, 40, 520, 520)
                    const pngFile = canvas.toDataURL('image/png')
                    const downloadLink = document.createElement('a')
                    downloadLink.download = `meeting-link-qr-${meetingConfig.slug || 'booking'}.png`
                    downloadLink.href = pngFile
                    downloadLink.click()
                    notify.success('High-resolution QR code downloaded!')
                }
            }
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData)
        } catch (err) {
            console.error('Failed to download QR code:', err)
            notify.error('Failed to generate PNG download.')
        }
    }

    // Create New Meeting Submit Handler
    const handleCreateMeetingSubmit = async (e) => {
        e.preventDefault()
        if (!createForm.date || !createForm.time) {
            notify.error('Please select both a date and time slot.')
            return
        }

        if (isModalDatePast) {
            notify.error('Meeting date cannot be in the past. Please select today or a future date.')
            return
        }

        if (isModalTimePast) {
            notify.error('Meeting time has already passed for today. Please select an upcoming time slot.')
            return
        }

        if (modalClash) {
            notify.error(`This time slot (${createForm.time} on ${createForm.date}) is already booked for ${modalClash.contact_name || 'an existing client'}. Please select another time.`)
            return
        }

        // Validate platform meeting URL if not auto Jitsi room
        if (createForm.provider !== 'jitsi') {
            const urlVal = validateMeetingUrl(createForm.customUrl)
            if (!urlVal.isValid) {
                notify.error(urlVal.error || 'Please provide a valid meeting link.')
                return
            }
        }

        // Enforce validation to open & test meeting link before scheduling
        if (!isCreateLinkVerified) {
            notify.warning('Validation required: Please click "Open & Test Link" to test and verify your meeting link before scheduling.')
            return
        }

        setIsSubmittingMeeting(true)
        try {
            const cleanTitle = (createForm.serviceName || 'Consultation').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
            const shortId = Math.random().toString(36).slice(2, 8)
            let finalMeetLink = `https://meet.jit.si/GetAiPilot-${cleanTitle}-${shortId}`

            if (createForm.provider !== 'jitsi' && createForm.customUrl?.trim()) {
                const clean = createForm.customUrl.trim()
                finalMeetLink = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`
            }

            const payload = {
                organization_id: organizationId,
                contact_name: createForm.contactName.trim() || undefined,
                contact_phone: createForm.contactPhone.trim() || undefined,
                contact_email: createForm.contactEmail.trim() || undefined,
                appointment_date: createForm.date,
                appointment_time: createForm.time,
                service_name: createForm.serviceName.trim() || 'WhatsApp Meeting',
                meet_link: finalMeetLink,
                notes: createForm.notes.trim() || undefined,
            }

            const res = await fetch(`${baseUrl}/api/appointments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || 'Failed to create meeting link')
            }

            const resData = await res.json()
            notify.success('Meeting scheduled & meeting link created successfully!')

            const newApp = {
                id: resData?.data?.id || `meet_${Date.now()}`,
                google_event_id: resData?.data?.google_event_id || null,
                appointment_date: payload.appointment_date,
                appointment_time: payload.appointment_time,
                display_time: resData?.data?.display_time || payload.appointment_time,
                status: 'confirmed',
                contact_name: payload.contact_name || 'Client',
                contact_phone: payload.contact_phone || '',
                flow_name: payload.service_name || 'Meeting Link Studio',
                meet_link: finalMeetLink,
                source: 'w_flow_sessions',
                created_at: resData?.data?.created_at || new Date().toISOString(),
            }

            // Immediately prepend to appointments list optimistically
            setAppointments((prev) => [newApp, ...prev.filter((a) => a.id !== newApp.id)])
            setSummary((prev) => ({
                ...prev,
                totalBookings: (prev.totalBookings || 0) + 1,
            }))

            // Reset filters to ensure the new meeting is visible on the list
            setSearch('')
            setDateFilter('')
            setStatusFilter('all')
            setServiceFilter('all')
            setPage(1)
            setActiveTab('meetings')

            setCreatedMeetingResult({
                ...payload,
                id: resData?.data?.id || `meet_${Date.now()}`,
                meet_link: finalMeetLink,
            })

            fetchAppointments()
        } catch (err) {
            console.error('Error creating meeting:', err)
            notify.error(err.message || 'Failed to create appointment')
        } finally {
            setIsSubmittingMeeting(false)
        }
    }

    // Export Bookings to CSV
    const handleExportCSV = () => {
        if (!appointments || appointments.length === 0) {
            notify.error('No meetings available to export.')
            return
        }

        const headers = [
            'ID',
            'Service',
            'Date',
            'Time',
            'Status',
            'Contact Name',
            'Contact Phone',
            'Meeting Link',
            'Source',
        ]

        const rows = appointments.map((a) => [
            a.id,
            `"${(a.flow_name || 'Meeting').replace(/"/g, '""')}"`,
            a.appointment_date,
            `"${a.display_time || a.appointment_time || ''}"`,
            a.status,
            `"${(a.contact_name || '').replace(/"/g, '""')}"`,
            `"${a.contact_phone || ''}"`,
            `"${a.meet_link || a.html_link || ''}"`,
            `"${a.source || ''}"`,
        ])

        const csvContent =
            'data:text/csv;charset=utf-8,' +
            [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
        const encodedUri = encodeURI(csvContent)
        const link = document.createElement('a')
        link.setAttribute('href', encodedUri)
        link.setAttribute('download', `gap-meetings-export-${new Date().toISOString().slice(0, 10)}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        notify.success('Meetings CSV exported successfully!')
    }

    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return 'N/A'
        try {
            const date = new Date(dateStr + 'T00:00:00')
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            })
        } catch {
            return dateStr
        }
    }

    const DAYS = [
        { idx: 1, label: 'Mon' },
        { idx: 2, label: 'Tue' },
        { idx: 3, label: 'Wed' },
        { idx: 4, label: 'Thu' },
        { idx: 5, label: 'Fri' },
        { idx: 6, label: 'Sat' },
        { idx: 0, label: 'Sun' },
    ]

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-2xs">
                            <Video className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                                Scheduled Meetings & Meeting Link Studio
                            </h1>
                            <p className="mt-0.5 text-xs sm:text-sm text-gray-500">
                                Create branded video meeting links, share booking slots with clients, and manage WhatsApp appointments.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Create Meeting Link Button */}
                    <button
                        onClick={() => {
                            setCreatedMeetingResult(null)
                            setShowCreateModal(true)
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Create Meeting Link
                    </button>

                    {/* Quick Share Link & QR Button */}
                    <button
                        onClick={() => setShowQrModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-2xs transition-colors"
                        title="View QR Code & Share options"
                    >
                        <QrCode className="w-3.5 h-3.5 text-gray-600" />
                        Share & QR
                    </button>

                    {/* Export CSV */}
                    <button
                        onClick={handleExportCSV}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-2xs transition-colors"
                        title="Export meetings list to CSV"
                    >
                        <Download className="w-3.5 h-3.5 text-gray-600" />
                        Export CSV
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={fetchAppointments}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none disabled:opacity-50 shadow-2xs transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* View Tabs */}
            <div className="flex items-center gap-2 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('meetings')}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors -mb-px ${
                        activeTab === 'meetings'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <Calendar className="w-4 h-4" />
                    Scheduled Meetings
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {summary.totalBookings || appointments.length}
                    </span>
                </button>

                <button
                    onClick={() => setActiveTab('preview')}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors -mb-px ${
                        activeTab === 'preview'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    Live Client Preview
                </button>

                <button
                    onClick={() => setActiveTab('studio')}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors -mb-px ${
                        activeTab === 'studio'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <Settings2 className="w-4 h-4" />
                    Meeting Link Studio & Availability
                </button>
            </div>

            {/* Meeting Link Quick Actions Deck */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Deck Card 1: Your Public Booking Link */}
                <div className="p-4 sm:p-5 bg-white rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                            <Link2 className="w-3.5 h-3.5 text-blue-600" />
                            Your Booking Link
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live & Ready
                        </span>
                    </div>

                    <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 font-mono text-xs text-gray-700 truncate select-all">
                        {publicBookingUrl}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={handleCopyPublicLink}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold rounded-lg border border-blue-200 transition-colors"
                        >
                            {copiedBookingLink ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy Link
                                </>
                            )}
                        </button>
                        <a
                            href={publicBookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 transition-colors"
                            title="Open booking link in new tab"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                </div>

                {/* Deck Card 2: 1-Click Client Sharing */}
                <div className="p-4 sm:p-5 bg-white rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                            Share With Clients
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">WhatsApp • Email • Web</span>
                    </div>

                    <p className="text-xs text-gray-500">
                        Share your personalized booking invite on WhatsApp or embed directly on your landing page.
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={handleShareWhatsAppGeneral}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors"
                        >
                            <Send className="w-3.5 h-3.5" />
                            WhatsApp
                        </button>
                        <button
                            onClick={handleShareEmail}
                            className="inline-flex items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors text-xs font-medium"
                            title="Share via Email"
                        >
                            <Mail className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setShowQrModal(true)}
                            className="inline-flex items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors text-xs font-medium"
                            title="QR Code & Download"
                        >
                            <QrCode className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleCopyEmbed}
                            className="inline-flex items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors text-xs font-medium"
                            title="Copy Website Embed Iframe Code"
                        >
                            {copiedEmbed ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Code2 className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                </div>

                {/* Deck Card 3: Video Call Setup */}
                <div className="p-4 sm:p-5 bg-white rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5 text-purple-600" />
                            Video Provider
                        </span>
                        <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                            Instant Room Active
                        </span>
                    </div>

                    <div className="text-xs text-gray-600 space-y-1">
                        <p className="font-semibold text-gray-900">{meetingConfig.title}</p>
                        <p className="text-[11px] text-gray-500">
                            Duration: <span className="font-medium text-gray-700">{meetingConfig.duration} mins</span> • Working hours: <span className="font-medium text-gray-700">{meetingConfig.workingHours?.start} - {meetingConfig.workingHours?.end}</span>
                        </p>
                    </div>

                    <div className="pt-1">
                        <button
                            onClick={() => setActiveTab('studio')}
                            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-200 transition-colors"
                        >
                            <Settings2 className="w-3.5 h-3.5" />
                            Customize Availability & Slug
                        </button>
                    </div>
                </div>
            </div>

            {/* TAB CONTENT 1: SCHEDULED MEETINGS LIST */}
            {activeTab === 'meetings' && (
                <>
                    {/* Guidance Box */}
                    <section className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="text-sm font-semibold text-gray-900">How meetings work in GAP WhatsApp</h2>
                                <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                                    {[
                                        'Share personal booking link or publish WhatsApp flow',
                                        'Client picks date & time slot',
                                        'Instant video room generated',
                                        'Meeting link sent via WhatsApp / Google Calendar',
                                    ].map((step, index) => (
                                        <li key={step} className="inline-flex items-center gap-2">
                                            <span>{step}</span>
                                            {index < 3 && (
                                                <ChevronRight size={13} className="text-gray-400" aria-hidden="true" />
                                            )}
                                        </li>
                                    ))}
                                </ol>
                                <p className="mt-2 text-xs leading-5 text-gray-500">
                                    You can send meeting links directly to your WhatsApp chats, or create dedicated appointment nodes in Flow Builder.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => {
                                        setCreatedMeetingResult(null)
                                        setShowCreateModal(true)
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Book New Meeting
                                </button>
                                <Link
                                    to="/flow-builder"
                                    className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Flow Builder <ChevronRight size={14} />
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* Metrics Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {loading ? (
                            <>
                                <SkeletonMetricCard />
                                <SkeletonMetricCard />
                                <SkeletonMetricCard />
                            </>
                        ) : (
                            <>
                                <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Total Bookings
                                        </p>
                                        <p className="mt-1 text-2xl font-extrabold text-gray-900">
                                            {summary.totalBookings}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                        <CalendarCheck2 className="w-6 h-6" />
                                    </div>
                                </div>

                                <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Today's Meetings
                                        </p>
                                        <p className="mt-1 text-2xl font-extrabold text-gray-900">
                                            {summary.todayCount}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                                        <Clock className="w-6 h-6" />
                                    </div>
                                </div>

                                <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Upcoming This Week
                                        </p>
                                        <p className="mt-1 text-2xl font-extrabold text-gray-900">
                                            {summary.upcomingWeekCount}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                                        <Sparkles className="w-6 h-6" />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Controls Bar: Search & Filter */}
                    <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md w-full">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                aria-label="Search meetings"
                                placeholder="Search name, phone or service..."
                                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4 w-full xl:w-auto">
                            <div className="flex w-full items-center gap-2 sm:w-auto">
                                <label htmlFor="meeting-service" className="w-16 shrink-0 text-xs font-semibold text-gray-600 sm:w-auto">
                                    Service:
                                </label>
                                <select
                                    id="meeting-service"
                                    value={serviceFilter}
                                    onChange={(event) => {
                                        setServiceFilter(event.target.value)
                                        setPage(1)
                                    }}
                                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 sm:max-w-48"
                                >
                                    <option value="all">All services</option>
                                    {services.map((service) => (
                                        <option key={service.id} value={service.id}>
                                            {service.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Date Filter */}
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider w-16 sm:w-auto shrink-0">
                                    Date:
                                </label>
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => {
                                        setDateFilter(e.target.value)
                                        setPage(1)
                                    }}
                                    className="flex-1 sm:flex-none px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-gray-700 cursor-pointer shadow-2xs min-w-0"
                                />
                                {dateFilter && (
                                    <button
                                        onClick={() => {
                                            setDateFilter('')
                                            setPage(1)
                                        }}
                                        className="px-2.5 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-md font-semibold border border-red-200 transition-colors shrink-0"
                                        title="Clear date filter"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            {/* Status Filter */}
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider w-16 sm:w-auto shrink-0">
                                    Status:
                                </label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value)
                                        setPage(1)
                                    }}
                                    className="flex-1 sm:flex-none px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-gray-700 cursor-pointer shadow-2xs min-w-0"
                                >
                                    <option value="all">All Statuses</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-2xs relative min-h-[420px] pb-16">
                        {error ? (
                            <div className="p-12 text-center space-y-3">
                                <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
                                <h3 className="text-base font-bold text-gray-900">Failed to load meetings</h3>
                                <p className="text-xs text-gray-500 max-w-sm mx-auto">{error}</p>
                                <button
                                    onClick={fetchAppointments}
                                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : loading ? (
                            <div className="divide-y divide-gray-100">
                                {[...Array(5)].map((_, i) => (
                                    <SkeletonTableRow key={i} />
                                ))}
                            </div>
                        ) : appointments.length === 0 ? (
                            <div className="p-12 text-center space-y-3">
                                <div className="flex justify-center">
                                    <video
                                        src="/images/scheduled meetings.webm"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                        className="h-[140px] object-contain drop-shadow-sm"
                                    />
                                </div>
                                <h3 className="text-base font-bold text-gray-900">
                                    {debouncedSearch || dateFilter || serviceFilter !== 'all' || statusFilter !== 'all'
                                        ? 'No matching meetings found'
                                        : 'No scheduled meetings yet'}
                                </h3>
                                <p className="text-xs text-gray-500 max-w-md mx-auto">
                                    {debouncedSearch || dateFilter || serviceFilter !== 'all' || statusFilter !== 'all'
                                        ? 'Try another service, date, status or search term.'
                                        : 'Bookings appear here after a customer books through your meeting link or WhatsApp flow.'}
                                </p>
                                <div className="flex items-center justify-center gap-3 pt-2">
                                    {debouncedSearch || dateFilter || serviceFilter !== 'all' || statusFilter !== 'all' ? (
                                        <button
                                            onClick={() => {
                                                setSearch('')
                                                setDateFilter('')
                                                setStatusFilter('all')
                                                setServiceFilter('all')
                                                setPage(1)
                                            }}
                                            className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                                        >
                                            Clear filters
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setCreatedMeetingResult(null)
                                                setShowCreateModal(true)
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Create First Meeting Link
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Desktop Table View (hidden on mobile, visible on md and up) */}
                                <div className="hidden md:block overflow-x-auto w-full">
                                    <table className="w-full text-left border-collapse min-w-[880px]">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                                <th className="py-3 px-6">Contact / Service</th>
                                                <th className="py-3 px-6">Date & Time</th>
                                                <th className="py-3 px-6">Meeting Link</th>
                                                <th className="py-3 px-6">Status</th>
                                                <th className="py-3 px-6 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-sm">
                                            {appointments.map((item, index) => {
                                                const itemMeetUrl =
                                                    item.meet_link ||
                                                    item.html_link ||
                                                    `https://meet.jit.si/GetAiPilot-${(item.flow_name || 'Meeting').replace(/[^a-zA-Z0-9]/g, '')}-${(item.id || '').slice(0, 8)}`
                                                const itemTimeStatus = getMeetingTimeStatus(
                                                    item.appointment_date,
                                                    item.display_time || item.appointment_time,
                                                    30,
                                                    10
                                                )
                                                const itemProtectedUrl = getProtectedMeetingUrl(
                                                    itemMeetUrl,
                                                    item.appointment_date,
                                                    item.display_time || item.appointment_time,
                                                    item.flow_name || 'Meeting',
                                                    item.contact_name,
                                                    item.id
                                                )

                                                return (
                                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                                        {/* Contact Column */}
                                                        <td className="py-3.5 px-6">
                                                            <div className="flex items-center gap-3">
                                                                {item.avatar_url ? (
                                                                    <img
                                                                        src={item.avatar_url}
                                                                        alt="Avatar"
                                                                        className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0"
                                                                    />
                                                                ) : (
                                                                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200 shrink-0">
                                                                        {(item.contact_name || item.contact_phone || 'W')
                                                                            .charAt(0)
                                                                            .toUpperCase()}
                                                                    </div>
                                                                )}
                                                                <div className="min-w-0 max-w-[240px]">
                                                                    {item.contact_name ? (
                                                                        <>
                                                                            <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                                                                                {item.contact_name}
                                                                            </p>
                                                                            <p className="text-xs text-gray-500 font-mono truncate">
                                                                                {item.contact_phone}
                                                                            </p>
                                                                        </>
                                                                    ) : (
                                                                        <p className="font-mono font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                                                                            {item.contact_phone}
                                                                        </p>
                                                                    )}
                                                                    <p className="mt-1 inline-flex max-w-[220px] items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                                                                        <span className="font-medium shrink-0">Service:</span>{' '}
                                                                        <span className="truncate">
                                                                            {item.flow_name ||
                                                                                (item.flow_id
                                                                                    ? 'Flow Booking'
                                                                                    : item.source === 'Google Calendar'
                                                                                    ? 'Google Calendar'
                                                                                    : 'Meeting Link')}
                                                                        </span>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Date & Time Column */}
                                                        <td className="py-3.5 px-6 whitespace-nowrap">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-800 rounded-md text-xs font-semibold border border-gray-200 w-fit shrink-0 whitespace-nowrap">
                                                                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                                                    {formatDateDisplay(item.appointment_date)}
                                                                </span>
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold border border-blue-100 w-fit shrink-0 whitespace-nowrap">
                                                                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                                                                    {item.display_time || item.appointment_time || '10:00 AM'}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* Meeting Link Column */}
                                                        <td className="py-3.5 px-6">
                                                            <div className="space-y-1.5">
                                                                <div className="flex items-center gap-1.5 flex-nowrap">
                                                                    {itemTimeStatus.isJoinable ? (
                                                                        <a
                                                                            href={itemMeetUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200 transition-colors shadow-2xs whitespace-nowrap shrink-0"
                                                                            title="Join video meeting call"
                                                                        >
                                                                            <Video className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                                                            <span>Join Call</span>
                                                                            <ExternalLink className="w-3 h-3 text-purple-400 shrink-0" />
                                                                        </a>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                notify.info(
                                                                                    itemTimeStatus.status === 'ended'
                                                                                        ? 'This meeting session has already ended.'
                                                                                        : `Room locked before time. Access opens 10 mins before ${item.display_time || item.appointment_time}.`
                                                                                )
                                                                            }
                                                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-md border border-gray-200 cursor-not-allowed whitespace-nowrap shrink-0"
                                                                            title={itemTimeStatus.message}
                                                                        >
                                                                            <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                                                                            <span className="whitespace-nowrap font-medium">
                                                                                {itemTimeStatus.status === 'ended' ? 'Ended' : itemTimeStatus.countdown || 'Locked'}
                                                                            </span>
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        onClick={() => handleCopyMeetingLink(item)}
                                                                        className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors shrink-0"
                                                                        title="Copy direct meeting link"
                                                                    >
                                                                        {copiedMeetingId === item.id ? (
                                                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                                        ) : (
                                                                            <Copy className="w-3.5 h-3.5" />
                                                                        )}
                                                                    </button>

                                                                    <button
                                                                        onClick={() => handleSendMeetingOnWhatsApp(item)}
                                                                        className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors shrink-0"
                                                                        title="Send meeting link directly on WhatsApp"
                                                                    >
                                                                        <Send className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                                <p className="text-[10px] font-mono text-gray-400 truncate max-w-[160px] lg:max-w-[210px]" title={itemProtectedUrl}>
                                                                    {itemProtectedUrl}
                                                                </p>
                                                            </div>
                                                        </td>

                                                        {/* Status Column */}
                                                        <td className="py-3.5 px-6 whitespace-nowrap">
                                                            <div className="relative inline-block text-left">
                                                                <button
                                                                    onClick={() =>
                                                                        setActiveStatusMenuId(
                                                                            activeStatusMenuId === item.id ? null : item.id
                                                                        )
                                                                    }
                                                                    className="cursor-pointer text-xs font-semibold"
                                                                >
                                                                    {item.status === 'confirmed' ? (
                                                                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                                            Confirmed
                                                                            <ChevronDown className="w-3 h-3 text-emerald-500 ml-0.5" />
                                                                        </span>
                                                                    ) : item.status === 'completed' ? (
                                                                        <span className="inline-flex items-center gap-1 text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                                                                            <UserCheck className="w-3.5 h-3.5 text-gray-500" />
                                                                            Completed
                                                                            <ChevronDown className="w-3 h-3 text-gray-500 ml-0.5" />
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                                                                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                                                                            Cancelled
                                                                            <ChevronDown className="w-3 h-3 text-red-500 ml-0.5" />
                                                                        </span>
                                                                    )}
                                                                </button>

                                                                {/* Popup Dropdown */}
                                                                {activeStatusMenuId === item.id && (
                                                                    <>
                                                                        <div
                                                                            className="fixed inset-0 z-40"
                                                                            onClick={() => setActiveStatusMenuId(null)}
                                                                        />
                                                                        <div
                                                                            className={`absolute left-0 w-36 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 text-xs font-semibold space-y-0.5 animate-in fade-in zoom-in-95 duration-100 ${
                                                                                index >= appointments.length - 2 &&
                                                                                appointments.length > 2
                                                                                    ? 'bottom-full mb-1.5'
                                                                                    : 'top-full mt-1.5'
                                                                            }`}
                                                                        >
                                                                            <button
                                                                                onClick={() => handleUpdateStatus(item, 'confirmed')}
                                                                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-emerald-50 hover:text-emerald-700 transition-colors ${
                                                                                    item.status === 'confirmed'
                                                                                        ? 'bg-emerald-50 text-emerald-700 font-bold'
                                                                                        : 'text-gray-700'
                                                                                }`}
                                                                            >
                                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                                                Confirmed
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleUpdateStatus(item, 'completed')}
                                                                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-100 hover:text-gray-900 transition-colors ${
                                                                                    item.status === 'completed'
                                                                                        ? 'bg-gray-100 text-gray-900 font-bold'
                                                                                        : 'text-gray-700'
                                                                                }`}
                                                                            >
                                                                                <UserCheck className="w-3.5 h-3.5 text-gray-500" />
                                                                                Completed
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleUpdateStatus(item, 'cancelled')}
                                                                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-red-50 hover:text-red-700 transition-colors ${
                                                                                    item.status === 'cancelled'
                                                                                        ? 'bg-red-50 text-red-700 font-bold'
                                                                                        : 'text-gray-700'
                                                                                }`}
                                                                            >
                                                                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                                                                                Cancelled
                                                                            </button>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Action Column: Open Chat & Delete */}
                                                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleOpenChat(item)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors shadow-2xs cursor-pointer"
                                                                    title="Open conversation in Live Chat"
                                                                >
                                                                    <MessageSquareText className="w-3.5 h-3.5 text-blue-600" />
                                                                    Chat
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteAppointment(item)}
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-colors shadow-2xs cursor-pointer"
                                                                    title="Delete meeting from app and Google Calendar"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Responsive Card View (visible on small/mobile screens, hidden on md+) */}
                                <div className="md:hidden divide-y divide-gray-100">
                                    {appointments.map((item, index) => {
                                        const itemMeetUrl =
                                            item.meet_link ||
                                            item.html_link ||
                                            `https://meet.jit.si/GetAiPilot-${(item.flow_name || 'Meeting').replace(/[^a-zA-Z0-9]/g, '')}-${(item.id || '').slice(0, 8)}`
                                        const itemTimeStatus = getMeetingTimeStatus(
                                            item.appointment_date,
                                            item.display_time || item.appointment_time,
                                            30,
                                            10
                                        )
                                        const itemProtectedUrl = getProtectedMeetingUrl(
                                            itemMeetUrl,
                                            item.appointment_date,
                                            item.display_time || item.appointment_time,
                                            item.flow_name || 'Meeting',
                                            item.contact_name,
                                            item.id
                                        )

                                        return (
                                            <div key={item.id} className="p-4 space-y-3 hover:bg-blue-50/20 transition-colors">
                                                {/* Card Header: Avatar, Name, Phone & Status */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        {item.avatar_url ? (
                                                            <img
                                                                src={item.avatar_url}
                                                                alt="Avatar"
                                                                className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200 shrink-0">
                                                                {(item.contact_name || item.contact_phone || 'W')
                                                                    .charAt(0)
                                                                    .toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-gray-900 text-sm truncate">
                                                                {item.contact_name || item.contact_phone}
                                                            </p>
                                                            {item.contact_name && (
                                                                <p className="text-xs text-gray-500 font-mono truncate">
                                                                    {item.contact_phone}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Status Badge in mobile */}
                                                    <div className="relative shrink-0">
                                                        <button
                                                            onClick={() =>
                                                                setActiveStatusMenuId(
                                                                    activeStatusMenuId === `m-${item.id}` ? null : `m-${item.id}`
                                                                )
                                                            }
                                                            className="cursor-pointer text-xs font-semibold"
                                                        >
                                                            {item.status === 'confirmed' ? (
                                                                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                                    Confirmed
                                                                </span>
                                                            ) : item.status === 'completed' ? (
                                                                <span className="inline-flex items-center gap-1 text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                                                                    <UserCheck className="w-3.5 h-3.5 text-gray-500" />
                                                                    Completed
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                                                                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                                                                    Cancelled
                                                                </span>
                                                            )}
                                                        </button>

                                                        {activeStatusMenuId === `m-${item.id}` && (
                                                            <>
                                                                <div
                                                                    className="fixed inset-0 z-40"
                                                                    onClick={() => setActiveStatusMenuId(null)}
                                                                />
                                                                <div className="absolute right-0 w-36 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 text-xs font-semibold space-y-0.5 mt-1 animate-in fade-in">
                                                                    <button
                                                                        onClick={() => {
                                                                            handleUpdateStatus(item, 'confirmed')
                                                                            setActiveStatusMenuId(null)
                                                                        }}
                                                                        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-emerald-50 hover:text-emerald-700"
                                                                    >
                                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                                        Confirmed
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            handleUpdateStatus(item, 'completed')
                                                                            setActiveStatusMenuId(null)
                                                                        }}
                                                                        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-100 hover:text-gray-900"
                                                                    >
                                                                        <UserCheck className="w-3.5 h-3.5 text-gray-500" />
                                                                        Completed
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            handleUpdateStatus(item, 'cancelled')
                                                                            setActiveStatusMenuId(null)
                                                                        }}
                                                                        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-red-50 hover:text-red-700"
                                                                    >
                                                                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                                                                        Cancelled
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Service & Date/Time Pills */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-800 rounded-md text-xs font-semibold border border-gray-200 shrink-0 whitespace-nowrap">
                                                        <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                                        {formatDateDisplay(item.appointment_date)}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold border border-blue-100 shrink-0 whitespace-nowrap">
                                                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                                                        {item.display_time || item.appointment_time || '10:00 AM'}
                                                    </span>
                                                    <span className="inline-flex max-w-[200px] items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-700 truncate">
                                                        <span className="font-medium shrink-0">Service:</span>
                                                        <span className="truncate">
                                                            {item.flow_name || (item.flow_id ? 'Flow Booking' : 'Meeting Link')}
                                                        </span>
                                                    </span>
                                                </div>

                                                {/* Meeting Link & Quick Actions */}
                                                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        {itemTimeStatus.isJoinable ? (
                                                            <a
                                                                href={itemMeetUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs whitespace-nowrap"
                                                            >
                                                                <Video className="w-3.5 h-3.5 shrink-0" />
                                                                <span>Join Call</span>
                                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                                            </a>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    notify.info(
                                                                        itemTimeStatus.status === 'ended'
                                                                            ? 'This meeting session has already ended.'
                                                                            : `Room locked before time. Access opens 10 mins before ${item.display_time || item.appointment_time}.`
                                                                    )
                                                                }
                                                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium text-gray-500 bg-gray-200/80 rounded-lg border border-gray-300 cursor-not-allowed whitespace-nowrap"
                                                            >
                                                                <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                <span className="whitespace-nowrap font-medium">{itemTimeStatus.status === 'ended' ? 'Ended' : itemTimeStatus.countdown || 'Locked'}</span>
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => handleCopyMeetingLink(item)}
                                                            className="p-1.5 text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors shrink-0"
                                                            title="Copy meeting link"
                                                        >
                                                            {copiedMeetingId === item.id ? (
                                                                <Check className="w-4 h-4 text-emerald-600" />
                                                            ) : (
                                                                <Copy className="w-4 h-4" />
                                                            )}
                                                        </button>

                                                        <button
                                                            onClick={() => handleSendMeetingOnWhatsApp(item)}
                                                            className="p-1.5 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors shrink-0"
                                                            title="Send on WhatsApp"
                                                        >
                                                            <Send className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <p className="text-[10px] font-mono text-gray-500 truncate" title={itemProtectedUrl}>
                                                        {itemProtectedUrl}
                                                    </p>
                                                </div>

                                                {/* Action Buttons: Chat & Delete */}
                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                    <button
                                                        onClick={() => handleOpenChat(item)}
                                                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                                                    >
                                                        <MessageSquareText className="w-3.5 h-3.5 text-blue-600" />
                                                        Chat
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAppointment(item)}
                                                        className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        )}

                        {/* Pagination Footer */}
                        {!loading && appointments.length > 0 && (
                            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 absolute bottom-0 left-0 right-0">
                                <div>
                                    Showing <span className="font-semibold text-gray-900">{appointments.length}</span> of{' '}
                                    <span className="font-semibold text-gray-900">{pagination.total}</span> bookings
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page <= 1}
                                        className="p-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="font-medium px-2">
                                        Page {pagination.page} of {pagination.totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                                        disabled={page >= pagination.totalPages}
                                        className="p-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* TAB CONTENT: LIVE CLIENT PREVIEW */}
            {activeTab === 'preview' && (
                <div className="space-y-4 w-full">
                    <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-xl flex items-center justify-between text-xs text-purple-900">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-600" />
                            <span>
                                This is the interactive booking widget your clients see at{' '}
                                <strong className="font-mono">{publicBookingUrl}</strong>
                            </span>
                        </div>
                        <a
                            href={publicBookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-purple-700 hover:underline shrink-0"
                        >
                            Open in new tab <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </div>
                    <InteractiveBookingWidget
                        config={meetingConfig}
                        organizationId={organizationId}
                        existingAppointments={appointments}
                        onBookingSuccess={() => {
                            fetchAppointments()
                        }}
                    />
                </div>
            )}

            {/* TAB CONTENT 2: MEETING LINK STUDIO & AVAILABILITY SETTINGS */}
            {activeTab === 'studio' && (
                <div className="space-y-6">
                    <form onSubmit={handleSaveConfig} className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-6">
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Meeting Link & Availability Preferences</h2>
                            <p className="text-xs text-gray-500 mt-1">
                                Configure your public booking URL, session length, and available schedule for clients.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Meeting Title */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                    Meeting Title
                                </label>
                                <input
                                    type="text"
                                    value={meetingConfig.title}
                                    onChange={(e) => setMeetingConfig({ ...meetingConfig, title: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="e.g. 30-min WhatsApp Consultation & Demo"
                                    required
                                />
                            </div>

                            {/* Public Booking Slug */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                    Booking URL Slug
                                </label>
                                <div className="flex items-center">
                                    <span className="px-3 py-2 text-xs bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-500 font-mono">
                                        getaipilot.in/book/
                                    </span>
                                    <input
                                        type="text"
                                        value={meetingConfig.slug}
                                        onChange={(e) =>
                                            setMeetingConfig({
                                                ...meetingConfig,
                                                slug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''),
                                            })
                                        }
                                        className="flex-1 px-3.5 py-2 text-sm border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                        placeholder="meet"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Host Name */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                    Host Display Name
                                </label>
                                <input
                                    type="text"
                                    value={meetingConfig.hostName}
                                    onChange={(e) => setMeetingConfig({ ...meetingConfig, hostName: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="e.g. Rahul Sharma"
                                />
                            </div>

                            {/* Host Email */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                    Host Notification Email
                                </label>
                                <input
                                    type="email"
                                    value={meetingConfig.hostEmail}
                                    onChange={(e) => setMeetingConfig({ ...meetingConfig, hostEmail: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="host@getaipilot.in"
                                />
                            </div>

                            {/* Duration & Buffer */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                        Duration (mins)
                                    </label>
                                    <select
                                        value={meetingConfig.duration}
                                        onChange={(e) => setMeetingConfig({ ...meetingConfig, duration: parseInt(e.target.value, 10) })}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                                    >
                                        <option value={15}>15 Minutes</option>
                                        <option value={30}>30 Minutes</option>
                                        <option value={45}>45 Minutes</option>
                                        <option value={60}>60 Minutes</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                        Buffer Time (mins)
                                    </label>
                                    <select
                                        value={meetingConfig.buffer}
                                        onChange={(e) => setMeetingConfig({ ...meetingConfig, buffer: parseInt(e.target.value, 10) })}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                                    >
                                        <option value={0}>0 Minutes</option>
                                        <option value={5}>5 Minutes</option>
                                        <option value={10}>10 Minutes</option>
                                        <option value={15}>15 Minutes</option>
                                    </select>
                                </div>
                            </div>

                            {/* Working Hours */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                        Start Time
                                    </label>
                                    <input
                                        type="time"
                                        value={meetingConfig.workingHours?.start || '09:30'}
                                        onChange={(e) =>
                                            setMeetingConfig({
                                                ...meetingConfig,
                                                workingHours: { ...meetingConfig.workingHours, start: e.target.value },
                                            })
                                        }
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                        End Time
                                    </label>
                                    <input
                                        type="time"
                                        value={meetingConfig.workingHours?.end || '18:30'}
                                        onChange={(e) =>
                                            setMeetingConfig({
                                                ...meetingConfig,
                                                workingHours: { ...meetingConfig.workingHours, end: e.target.value },
                                            })
                                        }
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Working Days Selector */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                Active Working Days
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {DAYS.map((day) => {
                                    const isSelected = (meetingConfig.workingDays || []).includes(day.idx)
                                    return (
                                        <button
                                            key={day.idx}
                                            type="button"
                                            onClick={() => handleToggleWorkingDay(day.idx)}
                                            className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                                                isSelected
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            {day.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Default Meeting Platform & Room Link */}
                        <div className="pt-2 border-t border-gray-100">
                            <MeetingPlatformSelector
                                provider={meetingConfig.provider || 'jitsi'}
                                customUrl={meetingConfig.customUrl || ''}
                                serviceName={meetingConfig.title || 'Consultation'}
                                onProviderChange={(prov) => setMeetingConfig((prev) => ({ ...prev, provider: prov }))}
                                onUrlChange={(url) => setMeetingConfig((prev) => ({ ...prev, customUrl: url }))}
                                isLinkVerified={isStudioLinkVerified}
                                setIsLinkVerified={setIsStudioLinkVerified}
                                required={false}
                            />
                        </div>

                        {/* Save Button */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                            <button
                                type="submit"
                                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                            >
                                <Check className="w-4 h-4" />
                                Save Availability Preferences
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL 1: CREATE MEETING LINK / INSTANT SCHEDULE */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                    <Video className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">
                                        {createdMeetingResult ? 'Meeting Link Ready 🎉' : 'Create Meeting Link'}
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        {createdMeetingResult
                                            ? 'Share this link directly with your customer on WhatsApp or email'
                                            : 'Generate a video room link and schedule appointment'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowCreateModal(false)
                                    setCreatedMeetingResult(null)
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Success State view */}
                        {createdMeetingResult ? (() => {
                            const maskedMeetingUrl = getProtectedMeetingUrl(
                                createdMeetingResult.meet_link,
                                createdMeetingResult.appointment_date,
                                createdMeetingResult.appointment_time,
                                createdMeetingResult.service_name || 'Consultation',
                                createdMeetingResult.contact_name || createdMeetingResult.contact_phone,
                                createdMeetingResult.id
                            )
                            const createdTimeStatus = getMeetingTimeStatus(
                                createdMeetingResult.appointment_date,
                                createdMeetingResult.appointment_time,
                                30,
                                10
                            )

                            return (
                                <div className="space-y-4 py-2">
                                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                                        <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                                            Meeting Confirmed!
                                        </div>
                                        <p className="text-xs text-emerald-700">
                                            Appointment with <span className="font-semibold">{createdMeetingResult.contact_name || createdMeetingResult.contact_phone || 'Client'}</span> scheduled for{' '}
                                            <span className="font-semibold">{formatDateDisplay(createdMeetingResult.appointment_date)}</span> at{' '}
                                            <span className="font-semibold">{createdMeetingResult.appointment_time}</span>.
                                        </p>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                                Dedicated Video Room Link
                                            </label>
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                Masked Link Active
                                            </span>
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 font-mono text-xs text-gray-800 break-all select-all flex items-center justify-between gap-2 shadow-xs">
                                            <span className="truncate">{maskedMeetingUrl}</span>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(maskedMeetingUrl)
                                                    notify.success('Masked meeting link copied!')
                                                }}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors shrink-0"
                                                title="Copy Masked Link"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1">
                                            Third-party platform room is masked behind this gateway link. Early entry is locked until 10 minutes prior to scheduled time.
                                        </p>
                                    </div>

                                    {/* Room Lock Notice if Scheduled in the Future */}
                                    {!createdTimeStatus.isJoinable && (
                                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                                            <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                                            <span>
                                                <strong>Room Locked Before Time:</strong> To prevent joining before the scheduled meeting, the video room unlocks 10 minutes prior to {formatDateDisplay(createdMeetingResult.appointment_date)} at {createdMeetingResult.appointment_time}.
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                        <button
                                            onClick={() => {
                                                const phone = (createdMeetingResult.contact_phone || '').replace(/\D/g, '')
                                                const name = createdMeetingResult.contact_name || 'there'
                                                const msg = `Hi ${name}! Here are our confirmed meeting details:\n📅 Date: ${formatDateDisplay(createdMeetingResult.appointment_date)} at ${createdMeetingResult.appointment_time}\n📌 Service: ${createdMeetingResult.service_name || 'WhatsApp Meeting'}\n🔗 Join Meeting: ${maskedMeetingUrl}\n\n🔒 Note: Video room is secured. Access link is disabled until 10 minutes before the scheduled time.\n\nLooking forward to speaking with you!`
                                                const wa = phone
                                                    ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`
                                                    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
                                                window.open(wa, '_blank')
                                            }}
                                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                                        >
                                            <Send className="w-4 h-4" />
                                            Send on WhatsApp
                                        </button>

                                        {createdTimeStatus.isJoinable ? (
                                            <a
                                                href={createdMeetingResult.meet_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-semibold rounded-xl transition-colors"
                                            >
                                                <Video className="w-4 h-4 text-purple-600" />
                                                Join Room
                                            </a>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    notify.warning(
                                                        createdTimeStatus.status === 'ended'
                                                            ? 'This meeting has ended.'
                                                            : `Meeting room is locked before time. Access opens 10 minutes before the scheduled start (${formatDateDisplay(createdMeetingResult.appointment_date)} at ${createdMeetingResult.appointment_time}).`
                                                    )
                                                }}
                                                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 bg-gray-100 text-gray-500 border border-gray-200 text-xs font-semibold rounded-xl cursor-not-allowed transition-colors whitespace-nowrap"
                                                title={createdTimeStatus.message}
                                            >
                                                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                                                <span className="whitespace-nowrap font-medium">Join Room ({createdTimeStatus.status === 'ended' ? 'Ended' : createdTimeStatus.countdown || 'Locked'})</span>
                                            </button>
                                        )}

                                        <button
                                            onClick={() => {
                                                setShowCreateModal(false)
                                                setCreatedMeetingResult(null)
                                            }}
                                            className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            )
                        })() : (
                            /* Form view */
                            <form onSubmit={handleCreateMeetingSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Client Name
                                    </label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={createForm.contactName}
                                            onChange={(e) => setCreateForm({ ...createForm, contactName: e.target.value })}
                                            placeholder="Client Name (e.g. John Doe)"
                                            className="w-full pl-9 pr-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                            WhatsApp Phone
                                        </label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="tel"
                                                value={createForm.contactPhone}
                                                onChange={(e) => setCreateForm({ ...createForm, contactPhone: e.target.value })}
                                                placeholder="+91 98765 43210"
                                                className="w-full pl-9 pr-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                            Client Email (Optional)
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="email"
                                                value={createForm.contactEmail}
                                                onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
                                                placeholder="client@example.com"
                                                className="w-full pl-9 pr-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Side-by-Side Calendar & Time Slot Selector */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                            <span>Schedule Date & Time *</span>
                                        </label>
                                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                                            {createForm.date
                                                ? new Date(`${createForm.date}T00:00:00`).toLocaleDateString('en-US', {
                                                      weekday: 'short',
                                                      month: 'short',
                                                      day: 'numeric',
                                                  })
                                                : 'Select Date'}{' '}
                                            • {createForm.time || 'Select Time'}
                                        </span>
                                    </div>

                                    {/* Component Matching the Clean Side-by-Side UI */}
                                    <CalendarTimePicker
                                        selectedDate={createForm.date}
                                        onDateChange={(dateStr) => setCreateForm((prev) => ({ ...prev, date: dateStr }))}
                                        selectedTime={createForm.time}
                                        onTimeChange={(timeStr) => setCreateForm((prev) => ({ ...prev, time: timeStr }))}
                                        availableSlots={modalAvailableSlots}
                                        workingDays={meetingConfig.workingDays || [1, 2, 3, 4, 5]}
                                    />

                                    {/* Inline Date & Time Validation Alerts */}
                                    {isModalDatePast && (
                                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                            <span>Meeting date cannot be in the past. Please choose today or a future date.</span>
                                        </div>
                                    )}
                                    {isModalTimePast && (
                                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                            <span>Selected time has already passed for today. Please pick an upcoming time slot.</span>
                                        </div>
                                    )}
                                    {modalClash && (
                                        <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-800 font-semibold flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                                            <span>This time slot is already booked for "{modalClash.contact_name || 'an appointment'}" ({modalClash.display_time || modalClash.appointment_time}). Please choose another time.</span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Meeting Title / Service
                                    </label>
                                    <input
                                        type="text"
                                        value={createForm.serviceName}
                                        onChange={(e) => setCreateForm({ ...createForm, serviceName: e.target.value })}
                                        placeholder="e.g. 30-min WhatsApp Consultation & Demo"
                                        className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                {/* Platform Selector with Official Logos & Open Link Validation */}
                                <MeetingPlatformSelector
                                    provider={createForm.provider}
                                    customUrl={createForm.customUrl}
                                    serviceName={createForm.serviceName}
                                    onProviderChange={(prov) => setCreateForm((prev) => ({ ...prev, provider: prov }))}
                                    onUrlChange={(url) => setCreateForm((prev) => ({ ...prev, customUrl: url }))}
                                    isLinkVerified={isCreateLinkVerified}
                                    setIsLinkVerified={setIsCreateLinkVerified}
                                    required={true}
                                />

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Notes / Agenda
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={createForm.notes}
                                        onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                        placeholder="Add any agenda or client requirements..."
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none"
                                    />
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-gray-100">
                                    <div className="text-[11px]">
                                        {isModalDatePast ? (
                                            <span className="text-red-600 font-semibold flex items-center gap-1">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                                Date cannot be in the past
                                            </span>
                                        ) : isModalTimePast ? (
                                            <span className="text-red-600 font-semibold flex items-center gap-1">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                                Time has already passed today
                                            </span>
                                        ) : modalClash ? (
                                            <span className="text-amber-700 font-bold flex items-center gap-1">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                                                Time slot is already taken
                                            </span>
                                        ) : !isCreateLinkVerified ? (
                                            <span className="text-amber-600 font-medium flex items-center gap-1">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                Please open & test meeting link before schedule
                                            </span>
                                        ) : (
                                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                                Slot available & link verified
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateModal(false)}
                                            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmittingMeeting || Boolean(isModalDatePast || isModalTimePast || modalClash) || !isCreateLinkVerified}
                                            className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                isCreateLinkVerified && !isModalDatePast && !isModalTimePast && !modalClash
                                                    ? 'bg-blue-600 hover:bg-blue-700'
                                                    : 'bg-blue-400'
                                            }`}
                                        >
                                            {isSubmittingMeeting ? (
                                                <>
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <Video className="w-3.5 h-3.5" />
                                                    Create Meeting Link
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL 2: QR CODE & QUICK SHARING DIALOG */}
            {showQrModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-sm w-full p-6 space-y-5 text-center">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-left">
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Scan to Book Meeting</h3>
                                <p className="text-xs text-gray-500">Scan QR code using camera to open booking studio</p>
                            </div>
                            <button
                                onClick={() => setShowQrModal(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* QR Code Container */}
                        <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-inner flex justify-center items-center">
                            {SafeQRCode ? (
                                <SafeQRCode
                                    id="meeting-qr-svg"
                                    value={publicBookingUrl}
                                    size={200}
                                    style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                                    viewBox="0 0 256 256"
                                />
                            ) : (
                                <div className="w-48 h-48 flex items-center justify-center text-xs text-gray-400">
                                    QR Code Ready
                                </div>
                            )}
                        </div>

                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 font-mono text-[11px] text-gray-600 truncate">
                            {publicBookingUrl}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleDownloadQR}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Download PNG
                            </button>
                            <button
                                onClick={handleCopyPublicLink}
                                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                Copy Link
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function SkeletonMetricCard() {
    return (
        <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between animate-pulse">
            <div className="space-y-2">
                <div className="h-3 w-24 bg-gray-200 rounded"></div>
                <div className="h-7 w-12 bg-gray-300 rounded"></div>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-xl"></div>
        </div>
    )
}

function SkeletonTableRow() {
    return (
        <div className="px-6 py-4 grid grid-cols-12 items-center animate-pulse">
            <div className="col-span-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-200 rounded-full"></div>
                <div className="space-y-1.5">
                    <div className="h-3.5 w-28 bg-gray-200 rounded"></div>
                    <div className="h-3 w-20 bg-gray-100 rounded"></div>
                </div>
            </div>
            <div className="col-span-4 flex items-center gap-2">
                <div className="h-6 w-24 bg-gray-200 rounded"></div>
                <div className="h-6 w-20 bg-gray-200 rounded"></div>
            </div>
            <div className="col-span-2">
                <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
            </div>
            <div className="col-span-2 flex justify-end">
                <div className="h-7 w-24 bg-gray-200 rounded-lg"></div>
            </div>
        </div>
    )
}
