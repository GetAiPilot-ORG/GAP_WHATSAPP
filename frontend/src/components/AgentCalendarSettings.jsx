import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, Database, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE, BACKEND_URL } from '../config/api'

const SETTINGS_TYPE = '__agent_settings'

export default function AgentCalendarSettings({ value, onChange, agentId, onAgentSynced }) {
    const { apiCall } = useAuth()
    const [calendars, setCalendars] = useState([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [preview, setPreview] = useState(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [syncLoading, setSyncLoading] = useState(false)
    const [syncMessage, setSyncMessage] = useState('')
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

    useEffect(() => {
        previewVersion.current++
        setPreview(null)
        setPreviewLoading(false)
        setSyncMessage('')
    }, [value.calendar_id])

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
            const tz = encodeURIComponent(value.timezone || 'Asia/Kolkata')
            const response = await apiCall(`${API_BASE}/agents/calendar/preview?calendar_id=${encodeURIComponent(value.calendar_id)}&timezone=${tz}`)
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Could not load sessions')
            if (mounted.current && version === previewVersion.current) setPreview(data)
        } catch (e) { if (mounted.current && version === previewVersion.current) setError(e.message) }
        finally { if (mounted.current && version === previewVersion.current) setPreviewLoading(false) }
    }

    const syncToDatabase = async () => {
        if (!agentId || !value.calendar_id) return
        setSyncLoading(true)
        setError('')
        setSyncMessage('')
        try {
            const response = await apiCall(`${API_BASE}/agents/${agentId}/calendar/sync`, {
                method: 'POST',
                body: JSON.stringify({
                    calendar_id: value.calendar_id,
                    timezone: value.timezone || 'Asia/Kolkata',
                    enabled: true,
                }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Could not sync calendar to agent database')
            const syncedMeta = (data.agent?.knowledge_base_content || []).find(entry => entry?.type === SETTINGS_TYPE)
            const syncedCal = syncedMeta?.calendar || {
                ...value,
                enabled: true,
                last_synced_at: data.last_synced_at,
                sync_error: null,
            }
            if (mounted.current) {
                onChange(syncedCal)
                onAgentSynced?.(data.agent)
                setSyncMessage(`Synced ${data.event_count} upcoming event${data.event_count === 1 ? '' : 's'} into this agent's database.`)
            }
        } catch (e) {
            if (mounted.current) setError(e.message)
        } finally {
            if (mounted.current) setSyncLoading(false)
        }
    }

    const formatStart = event => {
        if (event?.local_date_label) {
            const dayPrefix = event.local_weekday ? `${event.local_weekday}, ` : ''
            if (event.is_all_day) return `${dayPrefix}${event.local_date_label} · All day`
            const timeRange = event.local_end ? `${event.local_start} – ${event.local_end}` : event.local_start
            return `${dayPrefix}${event.local_date_label}${timeRange ? `, ${timeRange}` : ''}`
        }
        return event.start?.date || (event.start?.dateTime ? new Intl.DateTimeFormat('en-IN', { timeZone: value.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.start.dateTime)) : 'Time unavailable')
    }

    const syncedEvents = Array.isArray(value.synced_events) ? value.synced_events : null
    const syncedCount = syncedEvents ? syncedEvents.length : null
    const lastSyncedLabel = value.last_synced_at
        ? new Intl.DateTimeFormat('en-IN', { timeZone: value.timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value.last_synced_at))
        : null

    return (
        <section className="rounded-lg border border-gray-200 bg-white p-5" aria-labelledby="sessions-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 id="sessions-heading" className="flex items-center gap-2 font-bold text-gray-900"><CalendarDays size={18} aria-hidden="true" /> Upcoming sessions &amp; schedule sync</h3>
                    <p className="mt-1 text-sm text-gray-600">Sync your Google Calendar schedule into this agent’s database so customers get exact dates and timings in chat.</p></div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer"><input type="checkbox" checked={Boolean(value.enabled)} onChange={e => onChange({ ...value, enabled: e.target.checked })} className="h-4 w-4 accent-blue-600" /> Enable calendar answers</label>
            </div>
            <p className="mt-4 text-sm text-gray-600">Google connection is shared with this workspace’s appointment features. Reconnecting changes the connected account for those features too. Choose a dedicated calendar containing sessions you want customers to see. Event titles, descriptions, times, locations and meeting links are saved in the agent database and verified live when customers ask. Private events are excluded.</p>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={connect} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{calendars.length ? 'Reconnect Google' : 'Connect Google'}</button>
                <button type="button" disabled={loading} onClick={load} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{loading ? 'Loading calendars…' : 'Refresh calendars'}</button>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            {syncMessage && <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{syncMessage}</p>}
            <label className="mt-4 block text-sm font-semibold text-gray-800">Sessions calendar
                <select
                    value={value.calendar_id || ''}
                    onChange={e => {
                        const nextId = e.target.value
                        const selected = calendars.find(c => c.id === nextId)
                        onChange({
                            ...value,
                            calendar_id: nextId,
                            timezone: selected?.timezone || value.timezone || 'Asia/Kolkata',
                            enabled: nextId ? true : false,
                        })
                    }}
                    className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                    <option value="">Select a calendar</option>
                    {value.calendar_id && !calendars.some(c => c.id === value.calendar_id) && <option value={value.calendar_id}>Saved calendar — refresh to verify access</option>}
                    {calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.primary ? ' (primary)' : ''}</option>)}
                </select>
            </label>
            <p className="mt-2 text-xs text-gray-600">Timezone: {value.timezone || 'Asia/Kolkata'}. Add fees, trainer and registration links in each event description. Auto-syncs every 5 minutes and checks live Google Calendar on chat.</p>

            {value.enabled && value.calendar_id && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold">
                            {syncedEvents !== null ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" /> : <Database size={15} className="text-emerald-600 shrink-0" />}
                            <span>
                                {syncedEvents !== null
                                    ? `Saved in agent database: ${syncedCount} upcoming event${syncedCount === 1 ? '' : 's'} (next 62 days)`
                                    : 'Will sync upcoming 62 days to agent database on Save & Train'}
                            </span>
                        </div>
                        {lastSyncedLabel && <span className="text-[11px] text-emerald-700">Synced {lastSyncedLabel}</span>}
                    </div>
                    {value.sync_error && (
                        <p className="mt-1.5 text-[11px] text-amber-800">Last auto-sync note: {value.sync_error}</p>
                    )}
                    {syncedEvents && syncedEvents.length > 0 && !preview && (
                        <ul className="mt-2 space-y-1 border-t border-emerald-200/70 pt-2">
                            {syncedEvents.slice(0, 3).map(event => (
                                <li key={`${event.id}-${event.local_date || event.start?.dateTime || ''}`} className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                                    <span className="font-semibold text-gray-900">{event.title}</span>
                                    <span className="text-gray-600">{formatStart(event)}</span>
                                </li>
                            ))}
                            {syncedEvents.length > 3 && <li className="text-[11px] text-emerald-700">+{syncedEvents.length - 3} more saved in database</li>}
                        </ul>
                    )}
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={!value.calendar_id || previewLoading} onClick={showPreview} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">{previewLoading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Preview next 14 days</button>
                {agentId && (
                    <button type="button" disabled={!value.calendar_id || syncLoading} onClick={syncToDatabase} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
                        {syncLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                        Sync schedule to database
                    </button>
                )}
            </div>
            <div aria-live="polite">
                {preview && <div className="mt-4 border-t border-gray-200 pt-3"><p className="text-sm font-semibold text-gray-800">{preview.events.length} upcoming sessions{preview.truncated ? ' (more available — ask for a shorter range)' : ''}</p>
                    {!preview.events.length && <p className="mt-2 text-sm text-gray-600">No public sessions found in the next 14 days.</p>}
                    <ul className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto">{preview.events.map(event => <li key={event.id} className="py-3"><p className="break-words text-sm font-semibold text-gray-900">{event.title}</p><p className="mt-1 text-xs text-gray-600">{formatStart(event)}</p>{event.location && <p className="mt-1 break-words text-xs text-gray-600">{event.location}</p>}</li>)}</ul>
                </div>}
            </div>
        </section>
    )
}
