import { useState, useEffect, useMemo } from 'react'
import {
    Calendar as CalendarIcon,
    Clock,
    Video,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    User,
    Mail,
    Phone,
    ExternalLink,
    Sparkles,
    ShieldCheck,
    Send,
    Download,
    CalendarCheck,
    RotateCcw,
    Copy,
    Check,
} from 'lucide-react'
import { notify } from '../../services/notificationService'
import { BACKEND_URL as baseUrl } from '../../config/api'

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function timeToMinutes(timeStr) {
    if (!timeStr) return 9 * 60
    const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10))
    return (h || 0) * 60 + (m || 0)
}

function minutesToDisplayTime(totalMinutes) {
    const h24 = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const ampm = h24 >= 12 ? 'PM' : 'AM'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDateKey(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export function getCalendarSyncLinks(booking) {
    const rawDate = booking.date || booking.appointment_date || new Date().toISOString().slice(0, 10)
    const rawTime = booking.time || booking.appointment_time || '10:00'
    const cleanTime = rawTime.includes(':') ? rawTime.slice(0, 5) : '10:00'
    const startDate = new Date(`${rawDate}T${cleanTime}:00`)
    const endDate = new Date(startDate.getTime() + (booking.duration || 30) * 60 * 1000)

    const formatIsoForCalendar = (d) =>
        d.toISOString().replace(/-|:|\.\d+/g, '')

    const startTimeStr = formatIsoForCalendar(startDate)
    const endTimeStr = formatIsoForCalendar(endDate)

    const title = encodeURIComponent(`${booking.serviceName || 'Consultation'} with ${booking.hostName || 'GetAiPilot'}`)
    const description = encodeURIComponent(
        `Scheduled via GetAiPilot WhatsApp Meeting Studio.\n\n` +
        `👤 Client: ${booking.contactName || 'Guest'}\n` +
        `📞 Phone: ${booking.contactPhone || 'N/A'}\n` +
        `📹 Video Call Link: ${booking.meetLink}\n\n` +
        (booking.notes ? `📝 Agenda: ${booking.notes}\n\n` : '') +
        `Powered by GetAiPilot.`
    )
    const location = encodeURIComponent(booking.meetLink)

    const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTimeStr}/${endTimeStr}&details=${description}&location=${location}`
    const outlook = `https://outlook.live.com/calendar/0/action/compose?allday=false&subject=${title}&body=${description}&location=${location}&startdt=${startDate.toISOString()}&enddt=${endDate.toISOString()}`

    return { google, outlook, startDate, endDate }
}

export default function InteractiveBookingWidget({
    config = {},
    organizationId = '',
    onBookingSuccess,
}) {
    const hostConfig = {
        title: config.title || '30-min WhatsApp Consultation & Demo',
        hostName: config.hostName || 'Product Specialist',
        hostEmail: config.hostEmail || '',
        slug: config.slug || 'meet',
        duration: config.duration || 30,
        buffer: config.buffer || 10,
        workingHours: config.workingHours || { start: '09:30', end: '18:30' },
        workingDays: config.workingDays || [1, 2, 3, 4, 5, 6],
    }

    const [step, setStep] = useState('calendar') // 'calendar' | 'details' | 'confirmed'
    const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date())
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        return d
    })
    const [selectedSlot, setSelectedSlot] = useState(null)

    // Form inputs
    const [guestName, setGuestName] = useState('')
    const [guestPhone, setGuestPhone] = useState('')
    const [guestEmail, setGuestEmail] = useState('')
    const [guestNotes, setGuestNotes] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [confirmedRecord, setConfirmedRecord] = useState(null)
    const [copiedMeet, setCopiedMeet] = useState(false)

    // Generate month calendar days
    const calendarDays = useMemo(() => {
        const year = currentMonthDate.getFullYear()
        const month = currentMonthDate.getMonth()
        const firstDayIndex = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        const days = []
        for (let i = 0; i < firstDayIndex; i++) {
            days.push({ dayNumber: null, isCurrentMonth: false })
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month, d)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const isPast = dateObj < today
            const isWorking = hostConfig.workingDays.includes(dateObj.getDay())
            days.push({
                dayNumber: d,
                date: dateObj,
                isCurrentMonth: true,
                isAvailable: !isPast && isWorking,
                isSelected: selectedDate ? formatDateKey(selectedDate) === formatDateKey(dateObj) : false,
            })
        }
        return days
    }, [currentMonthDate, selectedDate, hostConfig.workingDays])

    // Generate slots for selectedDate
    const availableSlots = useMemo(() => {
        if (!selectedDate) return []
        const dayOfWeek = selectedDate.getDay()
        if (!hostConfig.workingDays.includes(dayOfWeek)) return []

        const startMin = timeToMinutes(hostConfig.workingHours.start)
        const endMin = timeToMinutes(hostConfig.workingHours.end)
        const duration = hostConfig.duration || 30
        const step = duration + (hostConfig.buffer || 10)

        const now = new Date()
        const isToday = formatDateKey(now) === formatDateKey(selectedDate)
        const currentMin = now.getHours() * 60 + now.getMinutes()

        const slots = []
        for (let m = startMin; m + duration <= endMin; m += step) {
            if (isToday && m <= currentMin + 30) continue
            slots.push({
                display: minutesToDisplayTime(m),
                raw: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
            })
        }
        return slots
    }, [selectedDate, hostConfig])

    const handleConfirmBooking = async (e) => {
        e.preventDefault()
        if (!selectedDate || !selectedSlot) {
            notify.error('Please pick a date and time slot')
            return
        }

        setIsSubmitting(true)
        try {
            const cleanTitle = (hostConfig.title || 'Consultation').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
            const shortId = Math.random().toString(36).slice(2, 8)
            const generatedMeet = `https://meet.jit.si/GetAiPilot-${cleanTitle}-${shortId}`

            const payload = {
                organization_id: organizationId,
                contact_name: guestName.trim() || undefined,
                contact_phone: guestPhone.trim() || undefined,
                contact_email: guestEmail.trim() || undefined,
                appointment_date: formatDateKey(selectedDate),
                appointment_time: selectedSlot.raw,
                service_name: hostConfig.title,
                meet_link: generatedMeet,
                notes: guestNotes.trim() || undefined,
            }

            const res = await fetch(`${baseUrl}/api/appointments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                },
                body: JSON.stringify(payload),
            })

            const resData = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(resData.error || 'Failed to book appointment')
            }

            const record = {
                id: resData?.data?.id || `meet_${Date.now()}`,
                date: formatDateKey(selectedDate),
                time: selectedSlot.display,
                serviceName: hostConfig.title,
                hostName: hostConfig.hostName,
                contactName: guestName,
                contactPhone: guestPhone,
                contactEmail: guestEmail,
                meetLink: generatedMeet,
                notes: guestNotes,
                duration: hostConfig.duration,
            }

            setConfirmedRecord(record)
            setStep('confirmed')
            notify.success('Appointment booked successfully!')
            if (onBookingSuccess) onBookingSuccess(record)
        } catch (err) {
            console.error('Booking failed:', err)
            notify.error(err.message || 'Booking failed. Please try another slot.')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Calendar sync links
    const syncLinks = useMemo(() => {
        if (!confirmedRecord) return null
        return getCalendarSyncLinks(confirmedRecord)
    }, [confirmedRecord])

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header Banner */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-50/80 via-white to-purple-50/80 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                            <Video className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                                {hostConfig.title}
                            </h2>
                            <p className="text-xs text-gray-500">
                                With {hostConfig.hostName || 'Our Team'} • {hostConfig.duration} mins • Video Call
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 w-fit">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Live Calendar Sync
                    </div>
                </div>
            </div>

            {/* STEP 1: CALENDAR & SLOTS */}
            {step === 'calendar' && (
                <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Date Picker Grid */}
                    <div className="lg:col-span-7 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-gray-900">
                                {MONTH_NAMES[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() =>
                                        setCurrentMonthDate(
                                            new Date(
                                                currentMonthDate.getFullYear(),
                                                currentMonthDate.getMonth() - 1,
                                                1
                                            )
                                        )
                                    }
                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() =>
                                        setCurrentMonthDate(
                                            new Date(
                                                currentMonthDate.getFullYear(),
                                                currentMonthDate.getMonth() + 1,
                                                1
                                            )
                                        )
                                    }
                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-400">
                            {WEEKDAY_NAMES.map((w) => (
                                <div key={w} className="py-1">
                                    {w}
                                </div>
                            ))}
                        </div>

                        {/* Calendar cells */}
                        <div className="grid grid-cols-7 gap-1.5 text-center">
                            {calendarDays.map((cell, idx) => {
                                if (!cell.isCurrentMonth) {
                                    return <div key={idx} className="h-9" />
                                }
                                return (
                                    <button
                                        key={idx}
                                        disabled={!cell.isAvailable}
                                        onClick={() => {
                                            setSelectedDate(cell.date)
                                            setSelectedSlot(null)
                                        }}
                                        className={`h-9 rounded-lg text-xs font-semibold transition-all ${
                                            cell.isSelected
                                                ? 'bg-blue-600 text-white font-bold shadow-xs'
                                                : cell.isAvailable
                                                ? 'hover:bg-blue-50 text-gray-800 hover:text-blue-600'
                                                : 'text-gray-300 cursor-not-allowed'
                                        }`}
                                    >
                                        {cell.dayNumber}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Available Time Slots */}
                    <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-gray-200 lg:pl-6 pt-4 lg:pt-0 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                Available Slots ({availableSlots.length})
                            </span>
                            <span className="text-xs text-blue-600 font-semibold">
                                {selectedDate
                                    ? selectedDate.toLocaleDateString('en-US', {
                                          weekday: 'short',
                                          month: 'short',
                                          day: 'numeric',
                                      })
                                    : 'Select Date'}
                            </span>
                        </div>

                        <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                            {availableSlots.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-6 text-center">
                                    No available slots for this date.
                                </p>
                            ) : (
                                availableSlots.map((slot) => {
                                    const isChosen = selectedSlot?.raw === slot.raw
                                    return (
                                        <button
                                            key={slot.raw}
                                            onClick={() => setSelectedSlot(slot)}
                                            className={`w-full py-2 px-3.5 text-xs font-semibold rounded-lg border text-left flex items-center justify-between transition-all ${
                                                isChosen
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Clock className="w-3.5 h-3.5" />
                                                {slot.display}
                                            </span>
                                            {isChosen && <Check className="w-3.5 h-3.5" />}
                                        </button>
                                    )
                                })
                            )}
                        </div>

                        {selectedSlot && (
                            <button
                                onClick={() => setStep('details')}
                                className="w-full mt-3 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                            >
                                Next: Enter Details
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* STEP 2: DETAILS FORM */}
            {step === 'details' && (
                <form onSubmit={handleConfirmBooking} className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep('calendar')}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to calendar
                        </button>
                        <span className="text-xs font-semibold text-blue-600">
                            {selectedDate?.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                            })}{' '}
                            at {selectedSlot?.display}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                Your Name *
                            </label>
                            <div className="relative">
                                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    required
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    placeholder="John Doe"
                                    className="w-full pl-9 pr-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                WhatsApp Phone *
                            </label>
                            <div className="relative">
                                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="tel"
                                    required
                                    value={guestPhone}
                                    onChange={(e) => setGuestPhone(e.target.value)}
                                    placeholder="+91 98765 43210"
                                    className="w-full pl-9 pr-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                            Email Address (Optional)
                        </label>
                        <div className="relative">
                            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="email"
                                value={guestEmail}
                                onChange={(e) => setGuestEmail(e.target.value)}
                                placeholder="name@company.com"
                                className="w-full pl-9 pr-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                            Meeting Agenda / Topic
                        </label>
                        <textarea
                            rows={2}
                            value={guestNotes}
                            onChange={(e) => setGuestNotes(e.target.value)}
                            placeholder="What would you like to discuss?"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep('calendar')}
                            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                        >
                            <CalendarCheck className="w-4 h-4" />
                            {isSubmitting ? 'Booking...' : 'Confirm Appointment'}
                        </button>
                    </div>
                </form>
            )}

            {/* STEP 3: CONFIRMED */}
            {step === 'confirmed' && confirmedRecord && (
                <div className="p-6 text-center space-y-5">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Your Appointment is Confirmed!</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            {confirmedRecord.serviceName} on <span className="font-semibold text-gray-700">{confirmedRecord.date}</span> at{' '}
                            <span className="font-semibold text-gray-700">{confirmedRecord.time}</span>.
                        </p>
                    </div>

                    {/* Room link */}
                    <div className="max-w-md mx-auto p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-left">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Direct Video Call Room
                        </span>
                        <div className="flex items-center justify-between gap-2 font-mono text-xs text-gray-800 break-all select-all">
                            <span>{confirmedRecord.meetLink}</span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(confirmedRecord.meetLink)
                                    setCopiedMeet(true)
                                    notify.success('Meeting link copied!')
                                    setTimeout(() => setCopiedMeet(false), 2000)
                                }}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            >
                                {copiedMeet ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Calendar Sync Links */}
                    {syncLinks && (
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                            <a
                                href={syncLinks.google}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-2xs"
                            >
                                <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                                Add to Google Calendar
                            </a>
                            <a
                                href={syncLinks.outlook}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-2xs"
                            >
                                <CalendarIcon className="w-3.5 h-3.5 text-blue-500" />
                                Add to Outlook
                            </a>
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-3 pt-3">
                        <a
                            href={confirmedRecord.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                        >
                            <Video className="w-4 h-4" />
                            Join Video Call
                        </a>
                        <button
                            onClick={() => {
                                setStep('calendar')
                                setSelectedSlot(null)
                                setConfirmedRecord(null)
                            }}
                            className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                        >
                            Book Another
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
