import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { notify } from '../services/notificationService'

export default function ScheduledMeetings() {
    const navigate = useNavigate()
    const { memberProfile, user } = useAuth()
    const { confirmDialog } = useDialog()
    const organizationId = memberProfile?.organization_id || user?.id || ''

    const [appointments, setAppointments] = useState([])
    const [summary, setSummary] = useState({ totalBookings: 0, todayCount: 0, upcomingWeekCount: 0 })
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [dateFilter, setDateFilter] = useState('')
    const [page, setPage] = useState(1)

    const [activeStatusMenuId, setActiveStatusMenuId] = useState(null)

    const handleUpdateStatus = async (item, newStatus) => {
        setActiveStatusMenuId(null)
        if (item.status === newStatus) return

        // Optimistic UI Update (<50ms)
        const prevStatus = item.status
        setAppointments((prev) =>
            prev.map((app) => (app.id === item.id ? { ...app, status: newStatus } : app))
        )

        try {
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
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
            // Rollback on error
            setAppointments((prev) =>
                prev.map((app) => (app.id === item.id ? { ...app, status: prevStatus } : app))
            )
            notify.error(err.message || 'Failed to update status')
        }
    }

    const handleDeleteAppointment = async (item) => {
        const confirmed = await confirmDialog(`Are you sure you want to delete the appointment for ${item.contact_name || item.contact_phone || 'this client'}? This will also remove it from Google Calendar.`, {
            title: 'Delete Appointment',
            confirmLabel: 'Delete',
            tone: 'danger'
        })
        if (!confirmed) return

        // Optimistic UI Removal (<50ms)
        setAppointments((prev) => prev.filter((app) => app.id !== item.id))

        try {
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
            const gEvtId = item.google_event_id || (item.source === 'Google Calendar' ? item.id : '')
            const queryParams = new URLSearchParams({
                organization_id: organizationId,
                ...(gEvtId ? { google_event_id: gEvtId } : {}),
            })

            const res = await fetch(`${baseUrl}/api/appointments/${encodeURIComponent(item.id)}?${queryParams.toString()}`, {
                method: 'DELETE',
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                },
            })

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

    // 300ms Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search)
            setPage(1) // Reset to page 1 on new search
        }, 300)
        return () => clearTimeout(handler)
    }, [search])

    const fetchAppointments = useCallback(async () => {
        if (!organizationId) {
            setLoading(false)
            return
        }

        try {
            setLoading(true)
            setError(null)

            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
            const query = new URLSearchParams({
                organization_id: organizationId,
                page: String(page),
                limit: '10',
                search: debouncedSearch,
                status: statusFilter,
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
            setSummary(data.summary || { totalBookings: 0, todayCount: 0, upcomingWeekCount: 0 })
            setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 })
        } catch (err) {
            console.error('[SCHEDULED_MEETINGS] fetch error:', err)
            setError(err.message || 'Unable to load scheduled meetings. Please check connection.')
        } finally {
            setLoading(false)
        }
    }, [organizationId, page, debouncedSearch, statusFilter, dateFilter])

    useEffect(() => {
        fetchAppointments()
    }, [fetchAppointments])

    const handleOpenChat = (item) => {
        if (item.conversation_id) {
            navigate(`/live-chat?conversationId=${item.conversation_id}`)
        } else if (item.contact_phone) {
            navigate(`/live-chat?phone=${encodeURIComponent(item.contact_phone)}`)
        } else {
            navigate('/live-chat')
        }
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
        } catch (e) {
            return dateStr
        }
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                            Scheduled Meetings
                        </h1>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                        View and manage all real-time WhatsApp & Google Calendar bookings for your business.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchAppointments}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 shadow-xs transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

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
            <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by contact name or phone number..."
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

                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Date:</label>
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => {
                                setDateFilter(e.target.value)
                                setPage(1)
                            }}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-gray-700 cursor-pointer shadow-2xs"
                        />
                        {dateFilter && (
                            <button
                                onClick={() => {
                                    setDateFilter('')
                                    setPage(1)
                                }}
                                className="px-2.5 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-md font-semibold border border-red-200 transition-colors"
                                title="Clear date filter"
                            >
                                Clear Date
                            </button>
                        )}
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Status:</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value)
                                setPage(1)
                            }}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-gray-700 cursor-pointer shadow-2xs"
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
                        <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-full">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-bold text-gray-900">Failed to load meetings</h3>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto">{error}</p>
                        <button
                            onClick={fetchAppointments}
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Retry
                        </button>
                    </div>
                ) : loading ? (
                    <div className="divide-y divide-gray-100">
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 grid grid-cols-12 text-xs font-bold uppercase tracking-wider text-gray-500">
                            <div className="col-span-4">Contact</div>
                            <div className="col-span-4">Date & Time</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-2 text-right">Action</div>
                        </div>
                        {[...Array(5)].map((_, i) => (
                            <SkeletonTableRow key={i} />
                        ))}
                    </div>
                ) : appointments.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                        <div className="inline-flex p-4 bg-blue-50 text-blue-600 rounded-full">
                            <Calendar className="w-8 h-8" />
                        </div>
                        <h3 className="text-base font-bold text-gray-900">
                            {debouncedSearch ? 'No matching meetings found' : 'No scheduled meetings yet'}
                        </h3>
                        <p className="text-xs text-gray-500 max-w-md mx-auto">
                            {debouncedSearch
                                ? `No booked appointments match "${debouncedSearch}". Try adjusting your search term.`
                                : 'When customers book appointment slots via your WhatsApp automation flows, they will appear here in real-time.'}
                        </p>
                        {debouncedSearch && (
                            <button
                                onClick={() => setSearch('')}
                                className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                            >
                                Clear Search Filter
                            </button>
                        )}
                    </div>
                ) : (
                    <div>
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                    <th className="py-3 px-6">Contact</th>
                                    <th className="py-3 px-6">Date & Time</th>
                                    <th className="py-3 px-6">Status</th>
                                    <th className="py-3 px-6 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {appointments.map((item, index) => (
                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                        {/* Contact Column */}
                                        <td className="py-3.5 px-6">
                                            <div className="flex items-center gap-3">
                                                {item.avatar_url ? (
                                                    <img
                                                        src={item.avatar_url}
                                                        alt="Avatar"
                                                        className="w-9 h-9 rounded-full object-cover border border-gray-200"
                                                    />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200">
                                                        {(item.contact_name || item.contact_phone || 'W')
                                                            .charAt(0)
                                                            .toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    {item.contact_name ? (
                                                        <>
                                                            <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                                                {item.contact_name}
                                                            </p>
                                                            <p className="text-xs text-gray-500 font-mono">
                                                                {item.contact_phone}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="font-mono font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                                            {item.contact_phone}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Date & Time Column */}
                                        <td className="py-3.5 px-6">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-800 rounded-md text-xs font-semibold border border-gray-200">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                                    {formatDateDisplay(item.appointment_date)}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold border border-blue-100">
                                                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                                                    {item.display_time || item.appointment_time}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Status Column with Interactive Dropdown Popup */}
                                        <td className="py-3.5 px-6 relative">
                                            <div className="relative inline-block text-left">
                                                <button
                                                    onClick={() => setActiveStatusMenuId(activeStatusMenuId === item.id ? null : item.id)}
                                                    className="inline-flex items-center gap-1 text-xs font-semibold rounded-full transition-all shadow-2xs hover:scale-105 cursor-pointer"
                                                    title="Click to edit status"
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
                                                        <div className={`absolute left-0 w-36 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 text-xs font-semibold space-y-0.5 animate-in fade-in zoom-in-95 duration-100 ${
                                                            index >= appointments.length - 2 && appointments.length > 2
                                                                ? 'bottom-full mb-1.5'
                                                                : 'top-full mt-1.5'
                                                        }`}>
                                                            <button
                                                                onClick={() => handleUpdateStatus(item, 'confirmed')}
                                                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-emerald-50 hover:text-emerald-700 transition-colors ${item.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-gray-700'
                                                                    }`}
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                                Confirmed
                                                            </button>
                                                            <button
                                                                onClick={() => handleUpdateStatus(item, 'completed')}
                                                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-100 hover:text-gray-900 transition-colors ${item.status === 'completed' ? 'bg-gray-100 text-gray-900 font-bold' : 'text-gray-700'
                                                                    }`}
                                                            >
                                                                <UserCheck className="w-3.5 h-3.5 text-gray-500" />
                                                                Completed
                                                            </button>
                                                            <button
                                                                onClick={() => handleUpdateStatus(item, 'cancelled')}
                                                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-red-50 hover:text-red-700 transition-colors ${item.status === 'cancelled' ? 'bg-red-50 text-red-700 font-bold' : 'text-gray-700'
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
                                        <td className="py-3.5 px-6 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleOpenChat(item)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700  hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors shadow-2xs cursor-pointer"
                                                    title="Open conversation in Live Chat"
                                                >
                                                    <MessageSquareText className="w-3.5 h-3.5 text-blue-600" />
                                                    💬 Open Chat
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAppointment(item)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-700  hover:bg-red-50 rounded-lg border border-red-200 transition-colors shadow-2xs cursor-pointer"
                                                    title="Delete meeting from app and Google Calendar"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Footer */}
                {!loading && appointments.length > 0 && (
                    <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
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
