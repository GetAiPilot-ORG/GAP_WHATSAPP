import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE, BACKEND_URL } from '../config/api'

export default function AgentCalendarSettings({ value, onChange }) {
    const { apiCall } = useAuth()
    const [calendars, setCalendars] = useState([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [preview, setPreview] = useState(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const popup = useRef(null)
    const previewVersion = useRef(0)
    const mounted = useRef(true)

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const response = await apiCall(`${API_BASE}/agents/calendar/calendars`)
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Could not load calendars')
            if (mounted.current) setCalendars(data.calendars || [])
        } catch (e) { if (mounted.current) setError(e.message) }
        finally { if (mounted.current) setLoading(false) }
    }, [apiCall])
    useEffect(() => {
        mounted.current = true
        load()
        const receive = event => {
            if (event.origin !== new URL(BACKEND_URL, window.location.origin).origin || event.source !== popup.current || event.data?.type !== 'GOOGLE_AUTH_SUCCESS') return
            load()
        }
        window.addEventListener('message', receive)
        return () => { mounted.current = false; window.removeEventListener('message', receive); popup.current?.close() }
    }, [load])

    useEffect(() => { previewVersion.current++; setPreview(null); setPreviewLoading(false) }, [value.calendar_id])

    const connect = async () => {
        popup.current = window.open('about:blank', 'agent-calendar-connect', 'width=600,height=720')
        if (!popup.current) { setError('Allow popups, then connect Google again.'); return }
        try {
            setError('')
            const response = await apiCall(`${API_BASE}/agents/calendar/auth-url`)
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Could not connect Google')
            popup.current.location.href = data.url
        } catch (e) { popup.current?.close(); setError(e.message) }
    }
    const showPreview = async () => {
        const version = ++previewVersion.current
        setPreviewLoading(true); setError(''); setPreview(null)
        try {
            const response = await apiCall(`${API_BASE}/agents/calendar/preview?calendar_id=${encodeURIComponent(value.calendar_id)}`)
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Could not load sessions')
            if (mounted.current && version === previewVersion.current) setPreview(data)
        } catch (e) { if (mounted.current && version === previewVersion.current) setError(e.message) }
        finally { if (mounted.current && version === previewVersion.current) setPreviewLoading(false) }
    }
    const formatStart = event => event.start?.date || (event.start?.dateTime ? new Intl.DateTimeFormat('en-IN', { timeZone: value.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.start.dateTime)) : 'Time unavailable')
    return (
        <section className="rounded-lg border border-gray-200 bg-white p-5" aria-labelledby="sessions-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 id="sessions-heading" className="flex items-center gap-2 font-bold text-gray-900"><CalendarDays size={18} aria-hidden="true" /> Upcoming sessions</h3>
                    <p className="mt-1 text-sm text-gray-600">Let this agent answer event questions using your Google Calendar.</p></div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={value.enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} className="h-4 w-4 accent-blue-600" /> Enable calendar answers</label>
            </div>
            <p className="mt-4 text-sm text-gray-600">Google connection is shared with this workspace’s appointment features. Reconnecting changes the connected account for those features too. Choose a dedicated calendar containing sessions you want customers to see. Event titles, descriptions, times, locations and meeting links can appear in replies. Private events are excluded.</p>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={connect} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{calendars.length ? 'Reconnect Google' : 'Connect Google'}</button>
                <button type="button" disabled={loading} onClick={load} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{loading ? 'Loading calendars…' : 'Refresh calendars'}</button>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <label className="mt-4 block text-sm font-semibold text-gray-800">Sessions calendar
                <select value={value.calendar_id} onChange={e => { const selected = calendars.find(c => c.id === e.target.value); onChange({ ...value, calendar_id: e.target.value, timezone: selected?.timezone || 'Asia/Kolkata' }) }} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
                    <option value="">Select a calendar</option>
                    {value.calendar_id && !calendars.some(c => c.id === value.calendar_id) && <option value={value.calendar_id}>Saved calendar — refresh to verify access</option>}
                    {calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.primary ? ' (primary)' : ''}</option>)}
                </select>
            </label>
            <p className="mt-2 text-xs text-gray-600">Timezone: {value.timezone}. Add fees, trainer and registration links in each event description. Changes are read when customers ask; no weekly retraining needed.</p>
            <button type="button" disabled={!value.calendar_id || previewLoading} onClick={showPreview} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">{previewLoading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Preview next 14 days</button>
            <div aria-live="polite">
                {preview && <div className="mt-4 border-t border-gray-200 pt-3"><p className="text-sm font-semibold text-gray-800">{preview.events.length} upcoming sessions{preview.truncated ? ' (more available — ask for a shorter range)' : ''}</p>
                    {!preview.events.length && <p className="mt-2 text-sm text-gray-600">No public sessions found in the next 14 days.</p>}
                    <ul className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto">{preview.events.map(event => <li key={event.id} className="py-3"><p className="break-words text-sm font-semibold text-gray-900">{event.title}</p><p className="mt-1 text-xs text-gray-600">{formatStart(event)}{event.start?.date ? ' · All day' : ''}</p>{event.location && <p className="mt-1 break-words text-xs text-gray-600">{event.location}</p>}</li>)}</ul>
                </div>}
            </div>
        </section>
    )
}
