/**
 * Meeting Time Validator & Room Access Guard
 * Enforces room security: prevents joining before meeting time (like Zoom, Google Meet & Calendly).
 * Default policy: Rooms unlock 10 minutes before the scheduled start time and remain open until the meeting duration ends.
 */

export function parseMeetingDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null

    try {
        const cleanDate = String(dateStr).trim().slice(0, 10)
        const [year, month, day] = cleanDate.split('-').map(Number)
        if (!year || !month || !day) return null

        let hours = 0
        let minutes = 0
        const rawTime = String(timeStr).trim().toLowerCase()

        if (rawTime.includes('am') || rawTime.includes('pm')) {
            const isPM = rawTime.includes('pm')
            const clean = rawTime.replace(/(am|pm)/g, '').trim()
            const parts = clean.split(':').map((x) => parseInt(x, 10))
            const rawH = parts[0] || 0
            hours = (rawH % 12) + (isPM ? 12 : 0)
            minutes = parts[1] || 0
        } else {
            const parts = rawTime.split(':').map((x) => parseInt(x, 10))
            hours = parts[0] || 0
            minutes = parts[1] || 0
        }

        const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
        return isNaN(date.getTime()) ? null : date
    } catch {
        return null
    }
}

export function getMeetingTimeStatus(dateStr, timeStr, durationMinutes = 30, earlyJoinMinutes = 10) {
    const meetingStart = parseMeetingDateTime(dateStr, timeStr)
    if (!meetingStart) {
        return {
            isJoinable: false,
            status: 'unknown',
            countdown: 'Time Unavailable',
            message: 'Meeting date or time is invalid.',
        }
    }

    const now = new Date()
    const earliestJoin = new Date(meetingStart.getTime() - earlyJoinMinutes * 60 * 1000)
    const meetingEnd = new Date(meetingStart.getTime() + durationMinutes * 60 * 1000)

    // Case 1: Way before meeting start (Room Locked)
    if (now < earliestJoin) {
        const diffMs = earliestJoin.getTime() - now.getTime()
        const totalMins = Math.ceil(diffMs / (60 * 1000))
        const totalHours = Math.floor(totalMins / 60)
        const totalDays = Math.floor(totalHours / 24)

        let countdown = ''
        if (totalDays > 0) {
            countdown = `In ${totalDays}d ${totalHours % 24}h`
        } else if (totalHours > 0) {
            countdown = `In ${totalHours}h ${totalMins % 60}m`
        } else {
            countdown = `In ${totalMins}m`
        }

        const timeDisplay = meetingStart.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        })
        const dateDisplay = meetingStart.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        })

        const diffSeconds = Math.max(0, Math.floor((earliestJoin.getTime() - now.getTime()) / 1000))
        return {
            isJoinable: false,
            status: 'upcoming',
            countdown,
            diffSeconds,
            meetingStart,
            meetingEnd,
            earliestJoin,
            message: `Room locked. Access opens ${earlyJoinMinutes} mins before start (${dateDisplay} at ${timeDisplay}).`,
        }
    }

    // Case 2: Meeting already ended
    if (now > meetingEnd) {
        return {
            isJoinable: false,
            status: 'ended',
            countdown: 'Session Ended',
            diffSeconds: 0,
            meetingStart,
            meetingEnd,
            earliestJoin,
            message: 'This scheduled session has already ended.',
        }
    }

    // Case 3: Within the active meeting window (Start - 10m to End)
    return {
        isJoinable: true,
        status: 'live',
        countdown: 'Ready to Join',
        diffSeconds: 0,
        meetingStart,
        meetingEnd,
        earliestJoin,
        message: 'Meeting room is now open.',
    }
}

/**
 * Builds a protected waiting-room meeting link that prevents joining before time.
 */
export function getProtectedMeetingUrl(rawUrl, date, time, serviceName, clientName) {
    if (!rawUrl) return ''
    try {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const params = new URLSearchParams()
        params.set('link', rawUrl)
        if (date) params.set('date', String(date).slice(0, 10))
        if (time) params.set('time', String(time))
        if (serviceName) params.set('service', String(serviceName))
        if (clientName) params.set('name', String(clientName))
        return `${origin}/join-meeting?${params.toString()}`
    } catch {
        return rawUrl
    }
}
