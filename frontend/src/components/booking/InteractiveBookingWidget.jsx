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
    Globe,
    Layers,
    LayoutGrid,
    AlertCircle,
    Ban,
    Lock,
} from 'lucide-react'
import { notify } from '../../services/notificationService'
import { BACKEND_URL as baseUrl } from '../../config/api'
import { PLATFORMS } from './MeetingPlatformSelector'
import { getMeetingTimeStatus, getProtectedMeetingUrl } from '../../utils/meetingTimeValidator'
import { CalendarTimePicker } from '@/components/ui/calendar-time-picker'

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

    // Ensure calendar sync always uses the masked protected link
    const maskedMeetingLink = getProtectedMeetingUrl(
        booking.meetLink || booking.meet_link,
        rawDate,
        rawTime,
        booking.serviceName || booking.flow_name,
        booking.contactName || booking.contact_name,
        booking.id
    )

    const title = encodeURIComponent(`${booking.serviceName || 'Consultation'} with ${booking.hostName || 'GetAiPilot'}`)
    const description = encodeURIComponent(
        `Scheduled via GetAiPilot WhatsApp Meeting Studio.\n\n` +
        `👤 Client: ${booking.contactName || 'Guest'}\n` +
        `📞 Phone: ${booking.contactPhone || 'N/A'}\n` +
        `📹 Video Call Link (Secured): ${maskedMeetingLink}\n\n` +
        `🔒 Room Access: Video room is secured. Direct access link is disabled until 10 minutes before the scheduled time.\n\n` +
        (booking.notes ? `📝 Agenda: ${booking.notes}\n\n` : '') +
        `Powered by GetAiPilot.`
    )
    const location = encodeURIComponent(maskedMeetingLink)

    const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTimeStr}/${endTimeStr}&details=${description}&location=${location}`
    const outlook = `https://outlook.live.com/calendar/0/action/compose?allday=false&subject=${title}&body=${description}&location=${location}&startdt=${startDate.toISOString()}&enddt=${endDate.toISOString()}`

    return { google, outlook, startDate, endDate, maskedMeetingLink }
}

export default function InteractiveBookingWidget({
    config = {},
    organizationId = '',
    onBookingSuccess,
    existingAppointments = [],
}) {
    const hostConfig = {
        title: config.title || '30-min WhatsApp Consultation & Demo',
        hostName: config.hostName || 'Product Specialist',
        hostEmail: config.hostEmail || '',
        slug: config.slug || 'meet',
        duration: config.duration || 30,
        buffer: config.buffer || 10,
        provider: config.provider || 'jitsi',
        customUrl: config.customUrl || '',
        workingHours: config.workingHours || { start: '09:30', end: '18:30' },
        workingDays: config.workingDays || [1, 2, 3, 4, 5, 6],
    }

    const platformMeta = PLATFORMS.find((p) => p.id === hostConfig.provider) || PLATFORMS[0]
    const userTimezone = useMemo(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ')
        } catch {
            return 'Local Time'
        }
    }, [])

    const [step, setStep] = useState('calendar') // 'calendar' | 'details' | 'confirmed'
    const [calendarView, setCalendarView] = useState('month') // 'month' | 'strip'
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

    // Remote appointments for conflict detection
    const [fetchedAppointments, setFetchedAppointments] = useState([])

    useEffect(() => {
        if (existingAppointments && existingAppointments.length > 0) {
            setFetchedAppointments(existingAppointments)
            return
        }
        const effectiveOrg = organizationId || config.organization_id || ''
        if (!effectiveOrg) return

        let isCancelled = false
        const loadAppointments = async () => {
            try {
                const res = await fetch(`${baseUrl}/api/appointments?organization_id=${encodeURIComponent(effectiveOrg)}&limit=100`, {
                    headers: { 'ngrok-skip-browser-warning': 'true' },
                })
                if (res.ok && !isCancelled) {
                    const data = await res.json()
                    if (data?.data && Array.isArray(data.data)) {
                        setFetchedAppointments(data.data)
                    }
                }
            } catch (err) {
                console.warn('Failed to load existing bookings for conflict check:', err)
            }
        }
        loadAppointments()
        return () => {
            isCancelled = true
        }
    }, [organizationId, config.organization_id, existingAppointments])

    // Merged active appointments list
    const activeAppointments = existingAppointments?.length > 0 ? existingAppointments : fetchedAppointments

    // Helper: check if a specific time slot is already taken on a given date
    const isSlotTaken = (dateStr, timeRaw, timeDisplay) => {
        if (!activeAppointments || activeAppointments.length === 0) return false
        const cleanRaw = (timeRaw || '').trim().slice(0, 5)
        const cleanDisplay = (timeDisplay || '').trim().toLowerCase()

        return activeAppointments.some((app) => {
            if (app.status === 'cancelled') return false
            const aDate = app.appointment_date || app.date
            if (aDate !== dateStr) return false

            const aTime = (app.appointment_time || app.time || '').trim().slice(0, 5)
            const aDisp = (app.display_time || '').trim().toLowerCase()

            if (aTime && cleanRaw && aTime === cleanRaw) return true
            if (aDisp && cleanDisplay && aDisp === cleanDisplay) return true
            return false
        })
    }

    // Generate upcoming days for the modern Day Strip picker with conflict awareness
    const upcomingDays = useMemo(() => {
        const daysList = []
        const start = new Date()
        const startMin = timeToMinutes(hostConfig.workingHours.start)
        const endMin = timeToMinutes(hostConfig.workingHours.end)
        const duration = hostConfig.duration || 30
        const stepMin = duration + (hostConfig.buffer || 10)

        for (let i = 0; i < 14; i++) {
            const d = new Date(start)
            d.setDate(d.getDate() + i)
            const dayOfWeek = d.getDay()
            const isWorking = hostConfig.workingDays.includes(dayOfWeek)
            const dKey = formatDateKey(d)

            let openCount = 0
            if (isWorking) {
                const isToday = dKey === formatDateKey(start)
                const currentMin = start.getHours() * 60 + start.getMinutes()
                for (let m = startMin; m + duration <= endMin; m += stepMin) {
                    const isPast = isToday && m <= currentMin + 15
                    const raw = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
                    const disp = minutesToDisplayTime(m)
                    const taken = isSlotTaken(dKey, raw, disp)
                    if (!isPast && !taken) {
                        openCount++
                    }
                }
            }

            daysList.push({
                date: d,
                dateKey: dKey,
                dayNum: d.getDate(),
                weekdayShort: d.toLocaleDateString('en-US', { weekday: 'short' }),
                longDay: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                isWorking,
                openCount,
                isSelected: selectedDate ? formatDateKey(selectedDate) === dKey : false,
            })
        }
        return daysList
    }, [hostConfig, selectedDate, activeAppointments])

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

    // Generate slots for selectedDate with taken & past checks
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
        const selDateKey = formatDateKey(selectedDate)

        const slots = []
        for (let m = startMin; m + duration <= endMin; m += step) {
            const rawTime = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
            const displayTime = minutesToDisplayTime(m)
            const isPastSlot = isToday && m <= currentMin + 15
            const isTaken = isSlotTaken(selDateKey, rawTime, displayTime)
            const isAvailable = !isPastSlot && !isTaken

            slots.push({
                display: displayTime,
                raw: rawTime,
                available: isAvailable,
                isPast: isPastSlot,
                isTaken: isTaken,
            })
        }
        return slots
    }, [selectedDate, hostConfig, activeAppointments])

    // Date & Time Validation handlers
    const handleProceedToDetails = () => {
        if (!selectedDate) {
            notify.error('Please select a meeting date.')
            return
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (selectedDate < today) {
            notify.error('Selected date cannot be in the past.')
            return
        }

        if (!hostConfig.workingDays.includes(selectedDate.getDay())) {
            notify.error('The selected day is not an active business day.')
            return
        }

        if (!selectedSlot) {
            notify.error('Please pick an available time slot.')
            return
        }

        if (!selectedSlot.available) {
            if (selectedSlot.isTaken) {
                notify.error('This time slot is already taken. Please pick another time.')
            } else {
                notify.error('This time slot has already passed today. Please pick a future slot.')
            }
            return
        }

        // Advance to details (like Calendly: no join link or share allowed yet)
        setStep('details')
    }

    const handleConfirmBooking = async (e) => {
        e.preventDefault()

        // 1. Validate Date
        if (!selectedDate) {
            notify.error('Please select a date for your meeting')
            setStep('calendar')
            return
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (selectedDate < today) {
            notify.error('Selected date is in the past. Please choose a future date.')
            setStep('calendar')
            return
        }

        // 2. Validate Time Slot
        if (!selectedSlot) {
            notify.error('Please select a time slot')
            setStep('calendar')
            return
        }

        const selDateKey = formatDateKey(selectedDate)
        const now = new Date()
        if (formatDateKey(now) === selDateKey) {
            const currentMin = now.getHours() * 60 + now.getMinutes()
            if (timeToMinutes(selectedSlot.raw) <= currentMin + 15) {
                notify.error('This time slot has already passed today. Please choose an upcoming time.')
                setStep('calendar')
                setSelectedSlot(null)
                return
            }
        }

        // 3. Pre-flight conflict check: ensure slot is not already taken
        if (isSlotTaken(selDateKey, selectedSlot.raw, selectedSlot.display)) {
            notify.error(`This time slot (${selectedSlot.display}) is already booked. Please choose another time.`)
            setStep('calendar')
            setSelectedSlot(null)
            return
        }

        setIsSubmitting(true)
        try {
            const cleanTitle = (hostConfig.title || 'Consultation').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
            const shortId = Math.random().toString(36).slice(2, 8)
            let generatedMeet = `https://meet.jit.si/GetAiPilot-${cleanTitle}-${shortId}`

            if (hostConfig.provider !== 'jitsi' && hostConfig.customUrl?.trim()) {
                const clean = hostConfig.customUrl.trim()
                generatedMeet = clean.startsWith('http') ? clean : `https://${clean}`
            }

            const payload = {
                organization_id: organizationId,
                contact_name: guestName.trim() || undefined,
                contact_phone: guestPhone.trim() || undefined,
                contact_email: guestEmail.trim() || undefined,
                appointment_date: selDateKey,
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
                date: selDateKey,
                time: selectedSlot.display,
                serviceName: hostConfig.title,
                hostName: hostConfig.hostName,
                contactName: guestName,
                contactPhone: guestPhone,
                contactEmail: guestEmail,
                meetLink: generatedMeet,
                notes: guestNotes,
                duration: hostConfig.duration,
                provider: hostConfig.provider,
            }

            setConfirmedRecord(record)
            // ONLY after schedule finishes do we enter confirmed step where join/share are unlocked
            setStep('confirmed')
            notify.success('Appointment booked successfully!')
            if (onBookingSuccess) onBookingSuccess(record)
        } catch (err) {
            console.error('Booking failed:', err)
            notify.error(err.message || 'Booking failed. Please try another slot.')
            // If already taken error from backend, go back to calendar
            if (err.message && err.message.toLowerCase().includes('already taken')) {
                setStep('calendar')
                setSelectedSlot(null)
            }
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
            {/* Header Banner with Platform Logo & Status */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                            {platformMeta.logo}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                                    {hostConfig.title}
                                </h2>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 shadow-2xs">
                                    {platformMeta.name}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                                With {hostConfig.hostName || 'Our Team'} • {hostConfig.duration} mins • Video Conference
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 w-fit">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Live Calendar Sync
                    </div>
                </div>
            </div>

            {/* STEP 1: MODERN CALENDAR & TIME SLOT PICKER */}
            {step === 'calendar' && (
                <div className="p-5 sm:p-6 space-y-6">
                    {/* View Switcher: Day Ribbon Strip vs Monthly View */}
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-1.5">
                            <CalendarIcon className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                                1. Select Date & Available Slot
                            </span>
                        </div>
                        <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-xs">
                            <button
                                type="button"
                                onClick={() => setCalendarView('strip')}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1 ${
                                    calendarView === 'strip'
                                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <Layers className="w-3.5 h-3.5" />
                                Day Strip
                            </button>
                            <button
                                type="button"
                                onClick={() => setCalendarView('month')}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1 ${
                                    calendarView === 'month'
                                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                Month
                            </button>
                        </div>
                    </div>

                    {/* View: Month (Unified Side-by-Side CalendarTimePicker) vs Day Strip Ribbon */}
                    {calendarView === 'month' ? (
                        <div className="space-y-4">
                            <CalendarTimePicker
                                selectedDate={selectedDate ? formatDateKey(selectedDate) : undefined}
                                onDateChange={(dateStr) => {
                                    const [y, m, d] = dateStr.split('-').map(Number)
                                    setSelectedDate(new Date(y, m - 1, d))
                                    setSelectedSlot(null)
                                }}
                                selectedTime={selectedSlot?.raw}
                                onTimeChange={(timeStr) => {
                                    const found = availableSlots.find((s) => s.raw === timeStr)
                                    if (found && found.available) {
                                        setSelectedSlot(found)
                                    }
                                }}
                                availableSlots={availableSlots.map((s) => ({
                                    time: s.raw,
                                    display: s.display,
                                    isTaken: s.isTaken,
                                    isPast: s.isPast,
                                    disabled: !s.available,
                                }))}
                                workingDays={hostConfig.workingDays}
                            />

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
                                <p className="text-[12px] font-medium text-gray-500 flex items-center gap-1.5">
                                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                                    <span>Times shown in {userTimezone}</span>
                                </p>

                                {selectedSlot ? (
                                    <button
                                        type="button"
                                        onClick={handleProceedToDetails}
                                        className="py-2.5 px-5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        <span>Continue with {selectedSlot.display}</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <span className="text-xs text-gray-400">
                                        Select an available time slot to continue
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Day Strip Ribbon View */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>Upcoming 14 Days</span>
                                    <span className="text-[11px] text-blue-600 font-medium">Scroll to explore dates</span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                    {upcomingDays.map((entry) => {
                                        const selected = entry.isSelected
                                        const isClosed = !entry.isWorking || entry.openCount === 0
                                        return (
                                            <button
                                                key={entry.dateKey}
                                                type="button"
                                                disabled={isClosed}
                                                onClick={() => {
                                                    setSelectedDate(entry.date)
                                                    setSelectedSlot(null)
                                                }}
                                                className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl border py-2.5 transition-all ${
                                                    selected
                                                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs font-bold ring-2 ring-neutral-900/20'
                                                        : isClosed
                                                        ? 'border-gray-200 bg-gray-50/70 text-gray-300 cursor-not-allowed'
                                                        : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                                                }`}
                                            >
                                                <span className={`text-[11px] font-bold uppercase tracking-wider ${selected ? 'text-gray-300' : isClosed ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    {entry.weekdayShort}
                                                </span>
                                                <span className="text-[18px] font-extrabold leading-tight tabular-nums">
                                                    {entry.dayNum}
                                                </span>
                                                <span
                                                    className={`size-1.5 rounded-full ${
                                                        isClosed
                                                            ? 'bg-transparent'
                                                            : selected
                                                            ? 'bg-white'
                                                            : 'bg-emerald-500'
                                                    }`}
                                                />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Available Time Slots Section */}
                            <div className="border-t border-gray-100 pt-4 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                    <div>
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                                            Available Times on {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Selected Day'}
                                        </span>
                                        <p className="text-[11px] text-gray-500">
                                            {availableSlots.filter((s) => s.available).length} time slots ready to book
                                        </p>
                                    </div>
                                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 w-fit">
                                        {hostConfig.duration} min duration
                                    </span>
                                </div>

                                {availableSlots.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs font-medium text-gray-400">
                                        No available times left on this day. Please pick another date above.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                        {availableSlots.map((slot) => {
                                            const isChosen = selectedSlot?.raw === slot.raw
                                            const unavailable = !slot.available
                                            return (
                                                <button
                                                    key={slot.raw}
                                                    type="button"
                                                    disabled={unavailable}
                                                    onClick={() => {
                                                        if (slot.available) {
                                                            setSelectedSlot(slot)
                                                        }
                                                    }}
                                                    className={`h-11 rounded-full border text-xs font-medium tabular-nums transition-all flex items-center justify-center gap-1.5 px-2.5 ${
                                                        isChosen
                                                            ? 'border-neutral-900 bg-neutral-900 font-bold text-white shadow-xs'
                                                            : slot.isTaken
                                                            ? 'border-amber-200 bg-amber-50/70 text-amber-700 line-through cursor-not-allowed opacity-75'
                                                            : slot.isPast
                                                            ? 'border-gray-200 bg-gray-100 text-gray-400 line-through cursor-not-allowed'
                                                            : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50 shadow-2xs'
                                                    }`}
                                                >
                                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{slot.display}</span>
                                                    {slot.isTaken && (
                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded-full shrink-0 ml-1">
                                                            Booked
                                                        </span>
                                                    )}
                                                    {isChosen && <Check className="w-3.5 h-3.5 shrink-0" />}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
                                    <p className="text-[12px] font-medium text-gray-500 flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5 text-gray-400" />
                                        <span>Times shown in {userTimezone}</span>
                                    </p>

                                    {selectedSlot && (
                                        <button
                                            type="button"
                                            onClick={handleProceedToDetails}
                                            className="py-2.5 px-5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                            <span>Continue with {selectedSlot.display}</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* STEP 2: GUEST DETAILS (CALENDLY STYLE - NO JOIN OR SHARE ALLOWED BEFORE FINISH) */}
            {step === 'details' && (
                <form onSubmit={handleConfirmBooking} className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep('calendar')}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to calendar
                        </button>
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            {selectedDate?.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                            })}{' '}
                            at {selectedSlot?.display}
                        </span>
                    </div>

                    {/* Platform Session Details Card (Calendly style: strictly informational, no join or share links) */}
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                {platformMeta.logo}
                                <span>Meeting Platform: {platformMeta.name}</span>
                            </span>
                            <span className="text-[11px] text-blue-700 font-semibold bg-blue-100/70 px-2.5 py-0.5 rounded-full">
                                {hostConfig.duration} mins • Video Call
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            🔒 Complete your contact details below to finalize booking. Your secure meeting access link and confirmation pass will be unlocked upon schedule completion.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                Your Full Name *
                            </label>
                            <div className="relative">
                                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    required
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    placeholder="e.g. John Doe"
                                    className="w-full pl-9 pr-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                WhatsApp Phone Number *
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

            {/* STEP 3: CONFIRMED - ONLY HERE ARE JOIN VIDEO CALL & SHARE UNLOCKED (CALENDLY STYLE) */}
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

                    {/* Room link with Platform Logo */}
                    <div className="max-w-md mx-auto p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-left">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                {platformMeta.logo}
                                <span>{platformMeta.name} Dedicated Room</span>
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                Verified
                            </span>
                        </div>
                        {(() => {
                            const protectedUrl = getProtectedMeetingUrl(
                                confirmedRecord.meetLink,
                                confirmedRecord.date,
                                confirmedRecord.time,
                                confirmedRecord.serviceName,
                                confirmedRecord.contactName
                            )
                            return (
                                <div className="flex items-center justify-between gap-2 font-mono text-xs text-gray-800 break-all select-all">
                                    <span>{protectedUrl}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(protectedUrl)
                                            setCopiedMeet(true)
                                            notify.success('Protected meeting link copied!')
                                            setTimeout(() => setCopiedMeet(false), 2000)
                                        }}
                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    >
                                        {copiedMeet ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            )
                        })()}
                    </div>

                    {/* Room Locked Notice if Meeting is in the Future */}
                    {(() => {
                        const confirmedTimeStatus = getMeetingTimeStatus(
                            confirmedRecord.date,
                            confirmedRecord.time,
                            confirmedRecord.duration || 30,
                            10
                        )
                        if (!confirmedTimeStatus.isJoinable) {
                            return (
                                <div className="max-w-md mx-auto p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2 text-left">
                                    <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                                    <span>
                                        <strong>Room Locked Before Time:</strong> Video room access opens 10 minutes prior to {confirmedRecord.date} at {confirmedRecord.time}.
                                    </span>
                                </div>
                            )
                        }
                        return null
                    })()}

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

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                        {(() => {
                            const confirmedTimeStatus = getMeetingTimeStatus(
                                confirmedRecord.date,
                                confirmedRecord.time,
                                confirmedRecord.duration || 30,
                                10
                            )
                            if (confirmedTimeStatus.isJoinable) {
                                return (
                                    <a
                                        href={confirmedRecord.meetLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                                    >
                                        <Video className="w-4 h-4" />
                                        Join Video Call
                                    </a>
                                )
                            }
                            return (
                                <button
                                    type="button"
                                    disabled={true}
                                    aria-disabled="true"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-400 border border-gray-200 text-xs font-semibold rounded-xl cursor-not-allowed pointer-events-none select-none shadow-none"
                                    title={confirmedTimeStatus.message}
                                >
                                    <Lock className="w-4 h-4 text-gray-400" />
                                    <span>Join Call ({confirmedTimeStatus.status === 'ended' ? 'Ended' : confirmedTimeStatus.countdown || 'Locked'})</span>
                                </button>
                            )
                        })()}

                        <button
                            type="button"
                            onClick={() => {
                                const phone = (confirmedRecord.contactPhone || '').replace(/\D/g, '')
                                const protectedUrl = getProtectedMeetingUrl(
                                    confirmedRecord.meetLink,
                                    confirmedRecord.date,
                                    confirmedRecord.time,
                                    confirmedRecord.serviceName,
                                    confirmedRecord.contactName
                                )
                                const msg = `Hi ${confirmedRecord.contactName || 'there'}! Here are our confirmed meeting details:\n📅 Date: ${confirmedRecord.date} at ${confirmedRecord.time}\n📌 Service: ${confirmedRecord.serviceName}\n🔗 Join Meeting: ${protectedUrl}\n\n🔒 Note: Video room is secured. Access link is disabled until 10 minutes before the scheduled time.\n\nLooking forward to speaking with you!`
                                const waUrl = phone
                                    ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`
                                    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
                                window.open(waUrl, '_blank')
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                        >
                            <Send className="w-4 h-4" />
                            Share on WhatsApp
                        </button>

                        <button
                            type="button"
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
