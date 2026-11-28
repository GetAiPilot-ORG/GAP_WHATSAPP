import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'

import {
    UserPlus,
    Search,
    Filter,
    Users,
    User,
    Globe,
    Clock,
    Send,
    Trash2,
    Loader2,
    X,
    ChevronDown,
    Check,
    Activity,
    Calendar,
    Shield,
    Volume2,
    Info,
    ArrowRight,
    SearchCode
} from 'lucide-react'
import { BACKEND_URL as BACKEND_BASE } from '../config/api'

export default function TeamMembers() {
    const { session, userRole, apiCall, user, updateMyOnlineStatus } = useAuth()
    const { alertDialog, confirmDialog } = useDialog()
    const isAdmin = userRole === 'admin' || userRole === 'owner'

    const [members, setMembers] = useState([])
    const [isLoadingMembers, setIsLoadingMembers] = useState(true)
    const [membersError, setMembersError] = useState('')
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', password: '', role: 'agent' })
    const [isInviting, setIsInviting] = useState(false)
    const [resendingMemberId, setResendingMemberId] = useState(null)
    const [selectedMember, setSelectedMember] = useState(null)

    // Filters and URL Search Params Sync
    const [searchParams, setSearchParams] = useSearchParams()
    const searchQuery = searchParams.get('search') || ''
    const roleFilter = searchParams.get('role') || 'all'
    const statusFilter = searchParams.get('status') || 'all'

    const fetchMembers = async () => {
        if (!session?.access_token) return
        setIsLoadingMembers(true)
        setMembersError('')
        try {
            const res = await apiCall(`${BACKEND_BASE}/api/team/members`)
            if (!res.ok) throw new Error('Could not load team members. Please try again.')
            if (res.ok) {
                const data = await res.json()
                setMembers(data)

                // If a drawer is open, update its active info
                if (selectedMember) {
                    const freshData = data.find(m => m.id === selectedMember.id)
                    if (freshData) setSelectedMember(freshData)
                }
            }
        } catch (e) {
            console.error("Failed to fetch members", e)
            setMembersError(e.message || 'Could not load team members.')
        } finally {
            setIsLoadingMembers(false)
        }
    }

    useEffect(() => {
        if (session?.access_token) {
            fetchMembers()
        }
    }, [session])

    useEffect(() => {
        if (!isInviteOpen && !selectedMember) return
        const closeOnEscape = event => {
            if (event.key === 'Escape') { setIsInviteOpen(false); setSelectedMember(null) }
        }
        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    }, [isInviteOpen, selectedMember])

    const handleInvite = async (e) => {
        e.preventDefault()
        if (!inviteForm.email || !inviteForm.name || !inviteForm.password) return
        setIsInviting(true)
        try {
            const res = await apiCall(`${BACKEND_BASE}/api/team/invite`, {
                method: 'POST',
                body: JSON.stringify(inviteForm)
            })
            if (res.ok) {
                setIsInviteOpen(false)
                setInviteForm({ name: '', email: '', password: '', role: 'agent' })
                fetchMembers()
            } else {
                const err = await res.json()
                alertDialog(err.error || "Invite failed", { title: 'Invite failed', tone: 'danger' })
            }
        } catch (e) {
            console.error("Invite failed", e)
        } finally {
            setIsInviting(false)
        }
    }

    const resendInvite = async (e, member) => {
        e.stopPropagation() // Prevent opening drawer
        if (!member?.id) return
        setResendingMemberId(member.id)
        try {
            const res = await apiCall(`${BACKEND_BASE}/api/team/members/${member.id}/resend-invite`, {
                method: 'POST'
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to resend invitation')
            fetchMembers()
        } catch (e) {
            alertDialog(e.message || 'Failed to resend invitation', { title: 'Invite failed', tone: 'danger' })
        } finally {
            setResendingMemberId(null)
        }
    }

    const updateRole = async (memberId, role) => {
        try {
            const res = await apiCall(`${BACKEND_BASE}/api/team/members/${memberId}`, {
                method: 'PATCH',
                body: JSON.stringify({ role })
            })
            if (res.ok) {
                fetchMembers()
            }
        } catch (e) {
            console.error("Update failed", e)
        }
    }

    const removeMember = async (memberId) => {
        const confirmed = await confirmDialog('Are you sure you want to remove this member? This action is permanent and will delete their agent account.', {
            title: 'Remove team member',
            tone: 'danger',
            confirmLabel: 'Remove member',
        })
        if (!confirmed) return
        try {
            const res = await apiCall(`${BACKEND_BASE}/api/team/members/${memberId}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                setSelectedMember(null)
                fetchMembers()
            }
        } catch (e) {
            console.error("Remove failed", e)
        }
    }

    const toggleOnlineStatus = async (currentStatus) => {
        try {
            await updateMyOnlineStatus(!currentStatus)
            fetchMembers()
        } catch (e) {
            console.error("Failed to toggle online status", e)
        }
    }

    const getInviteStatus = (member) => {
        if (member.invite_status) return member.invite_status
        if (member.is_active) return 'active'
        const expiresAt = member.invite_expires_at ? new Date(member.invite_expires_at) : null
        if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) return 'expired'
        return 'pending'
    }


    const formatDate = (dateString) => {
        if (!dateString) return 'Never'
        try {
            const date = new Date(dateString)
            if (Number.isNaN(date.getTime())) return 'Never'
            return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        } catch {
            return 'Never'
        }
    }

    const formatOnlineTime = (seconds) => {
        if (!seconds || seconds <= 0) return '0m'
        const hrs = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        if (hrs > 0) {
            return `${hrs}h ${mins}m`
        }
        return `${mins}m`
    }

    // Update Filter Helpers
    const setFilterParam = (key, value) => {
        const params = new URLSearchParams(searchParams)
        if (value && value !== 'all') {
            params.set(key, value)
        } else {
            params.delete(key)
        }
        setSearchParams(params)
    }

    // Top Summary Card Counts (uses full, unfiltered list)
    const stats = useMemo(() => {
        const total = members.length
        const onlineAgents = members.filter(m => m.role === 'agent' && m.is_online).length
        const offlineAgents = members.filter(m => m.role === 'agent' && !m.is_online).length
        const totalAssignedChats = members.reduce((sum, m) => sum + (m.active_chats_count || 0), 0)

        return { total, onlineAgents, offlineAgents, totalAssignedChats }
    }, [members])

    const ownerMember = useMemo(() => {
        return members.find(m => m.role === 'owner')
    }, [members])

    const hasFilters = Boolean(searchQuery.trim() || roleFilter !== 'all' || statusFilter !== 'all')
    const memberMatchesFilters = (member) => {
        const query = searchQuery.trim().toLowerCase()
        const matchesSearch = !query || member.name?.toLowerCase().includes(query) || member.email?.toLowerCase().includes(query)
        const matchesRole = roleFilter === 'all' || member.role === roleFilter
        const online = member.role === 'owner' || (['agent', 'admin'].includes(member.role) && member.is_online === true)
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'online' ? online : ['agent', 'admin'].includes(member.role) && !member.is_online)
        return matchesSearch && matchesRole && matchesStatus
    }
    const filteredMembers = members.filter(member => member.role !== 'owner' && memberMatchesFilters(member))
    const showOwner = ownerMember && memberMatchesFilters(ownerMember)
    const clearFilters = () => {
        const params = new URLSearchParams(searchParams)
        for (const key of ['search', 'role', 'status']) params.delete(key)
        setSearchParams(params)
    }

    return (
        <div className="space-y-5 px-4 pb-8 text-gray-900 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-950">Team Members</h1>
                    <p className="mt-1 text-[13px] text-slate-500">Manage your agents, availability, assignments and access</p>
                </div>
                {isAdmin && <button type="button" onClick={() => setIsInviteOpen(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#0b74c9] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#0867b4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"><UserPlus size={16} />Invite member</button>}
            </div>

            {/* Stats Cards Section */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4">
                <SummaryCard icon={Users} title="Total Members" value={stats.total} helper="Registered workspace users" />
                <SummaryCard icon={Activity} title="Online Agents" value={stats.onlineAgents} helper="Ready to accept chats" />
                <SummaryCard icon={Clock} title="Offline Agents" value={stats.offlineAgents} helper="Away or inactive" />
                <SummaryCard icon={Send} title="Assigned Chats" value={stats.totalAssignedChats} helper="Active customer conversations" />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center" aria-label="Team member filters">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input type="search" aria-label="Search team members" value={searchQuery} onChange={event => setFilterParam('search', event.target.value)} placeholder="Search name or email" className="h-9 w-full rounded-md border border-gray-300 bg-white pl-9 pr-8 text-xs outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]" />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                    <select aria-label="Filter by role" value={roleFilter} onChange={event => setFilterParam('role', event.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="agent">Agent</option></select>
                    <select aria-label="Filter by availability" value={statusFilter} onChange={event => setFilterParam('status', event.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"><option value="all">All statuses</option><option value="online">Online</option><option value="offline">Offline</option></select>
                </div>
                {hasFilters && <button type="button" onClick={clearFilters} className="rounded-md px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2">Clear filters</button>}
            </div>

            {/* Owner Section (Always Available) */}
            {!isLoadingMembers && !membersError && showOwner && (
                <div
                    role="button" tabIndex={0} aria-label={`View ${ownerMember?.name || 'owner'} details`}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedMember(ownerMember) } }}
                    onClick={() => setSelectedMember(ownerMember)}
                    className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-zinc-50/40 hover:border-blue-300 transition-all group"
                >




                    <div className="flex items-center relative z-10">
                        <div className="relative flex-shrink-0">
                            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden"
                                style={ownerMember.avatar_color?.startsWith('/images/avatars/') ? {} : { backgroundColor: ownerMember.avatar_color || '#6366f1' }}>
                                {ownerMember.avatar_color?.startsWith('/images/avatars/') ? (
                                    <img src={ownerMember.avatar_color} className="h-full w-full object-cover" alt={ownerMember.name} />
                                ) : (
                                    ownerMember.name?.charAt(0)?.toUpperCase()
                                )}
                            </div>
                            <span className="absolute bottom-0 right-0 block h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full ring-1.5 sm:ring-2 ring-white bg-green-500 shadow-sm" />
                        </div>
                        <div className="ml-2.5 min-w-0 sm:ml-4">
                            <div className="flex items-center gap-1.5">
                                <span className="font-bold text-gray-900 text-xs sm:text-sm">{ownerMember.name}</span>
                                <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.2 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/10 uppercase tracking-wide">
                                    Owner
                                </span>
                            </div>
                            <div className="break-all text-xs text-gray-500 mt-0.5">{ownerMember.email}</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-2.5 sm:border-t-0 sm:pt-0 sm:flex sm:flex-row sm:items-center sm:gap-6 text-xs">
                        <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-500">Active Chats</span>
                            <span className="font-bold text-gray-900 mt-0.5 text-[11px] sm:text-xs">{ownerMember.active_chats_count || 0} open</span>
                        </div>
                        <div className="h-8 border-l border-gray-150 hidden sm:block" />
                        <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-500">Last Active</span>
                            <span className="font-semibold text-gray-700 mt-0.5 text-[11px] sm:text-xs">{formatDate(ownerMember.last_active_at)}</span>
                        </div>
                        <div className="h-8 border-l border-gray-150 hidden sm:block" />
                        <div className="flex flex-col col-span-1 sm:col-span-1">
                            <span className="text-xs font-medium text-gray-500">Availability</span>
                            <span className="inline-flex items-center text-emerald-700 font-semibold mt-0.5 text-[11px] sm:text-xs">
                                <span className="h-1.5 w-1.5 rounded-full mr-1 bg-emerald-500" />
                                Always Available
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Members table list */}
            {isLoadingMembers ? (
                <div className="rounded-xl border border-gray-200 bg-white p-8">
                    <TableSkeleton />
                </div>
            ) : membersError ? (
                <div role="alert" className="rounded-lg border border-red-200 bg-white p-5"><p className="text-sm text-red-700">{membersError}</p><button type="button" onClick={fetchMembers} className="mt-3 text-sm font-medium text-blue-700 hover:underline">Try again</button></div>
            ) : filteredMembers.length === 0 && showOwner && hasFilters ? null : filteredMembers.length === 0 ? (
                <TeamEmptyState filtered={hasFilters} isAdmin={isAdmin} onInvite={() => setIsInviteOpen(true)} onClear={clearFilters} />
            ) : (
                <>
                    {/* Desktop Table View */}
                    <div className="hidden sm:block overflow-hidden border border-zinc-200 rounded-lg bg-white shadow-sm relative group">




                        <div className="overflow-x-auto relative z-10">
                                <table className="min-w-full divide-y divide-dashed divide-zinc-200">
                                    <thead className="bg-zinc-50/50">
                                        <tr>
                                            <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500">Member</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500">Email</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500">Role</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500">Availability</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500">Active Chats</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500">Last Active</th>
                                            <th className="px-6 py-3.5 text-right text-xs font-medium text-gray-500">Active Time Today</th>
                                            {isAdmin && <th className="px-6 py-3.5 text-right text-xs font-medium text-gray-500">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-dashed divide-zinc-200">
                                        {filteredMembers.map((member) => {
                                            const inviteStatus = getInviteStatus(member)
                                            return (
                                                <tr
                                                    key={member.id}
                                                    onClick={() => setSelectedMember(member)}
                                                    className="hover:bg-gray-50/60 cursor-pointer transition-colors group"
                                                >
                                                    <td className="px-6 py-4 whitespace-nowrap relative">

                                                        <div className={`absolute left-0 top-0 bottom-0 w-[3.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${member.is_online ? 'bg-green-500' : 'bg-zinc-400'}`} />
                                                        <div className="flex items-center">
                                                            <div className="relative flex-shrink-0">
                                                                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden"
                                                                    style={member.avatar_color?.startsWith('/images/avatars/') ? {} : { backgroundColor: member.avatar_color || '#6366f1' }}>
                                                                    {member.avatar_color?.startsWith('/images/avatars/') ? (
                                                                        <img src={member.avatar_color} className="h-full w-full object-cover" alt={member.name} />
                                                                    ) : (
                                                                        member.name?.charAt(0)?.toUpperCase()
                                                                    )}
                                                                </div>
                                                                {['agent', 'admin', 'owner'].includes(member.role) && (
                                                                    <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white ${member.is_online ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                                )}
                                                            </div>
                                                            <div className="ml-4">
                                                                <div className="text-sm font-medium text-gray-900">{member.name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {member.email}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/10">
                                                            {member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : 'Agent'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        {['agent', 'admin', 'owner'].includes(member.role) ? (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${member.is_online ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                                                                <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${member.is_online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                                                                {member.is_online ? 'Online' : 'Offline'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-zinc-400 text-xs">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                                                        {member.active_chats_count || 0}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {formatDate(member.last_active_at)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                            {inviteStatus !== 'active' && member.role !== 'owner' && isAdmin ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(ev) => resendInvite(ev, member)}
                                                                    disabled={resendingMemberId === member.id}
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:border-blue-300 hover:bg-zinc-50 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                                                                >
                                                                    {resendingMemberId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-zinc-400" />}
                                                                    Resend
                                                                </button>
                                                            ) : ['agent', 'admin', 'owner'].includes(member.role) ? (
                                                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50/50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-100/50">
                                                                    <Clock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                                                    {formatOnlineTime(member.online_time_today)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-zinc-400 text-xs">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {isAdmin && (
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                                {member.role !== 'owner' && member.user_id !== user?.id ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeMember(member.id)}
                                                                        className="inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50 border border-zinc-200 hover:border-red-200 transition-all cursor-pointer shadow-sm"
                                                                        title="Remove Member"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-zinc-400 text-xs">-</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="block sm:hidden space-y-3">
                        {filteredMembers.map((member) => {
                                const inviteStatus = getInviteStatus(member)
                                return (
                                    <div
                                        key={member.id}
                                        onClick={() => setSelectedMember(member)}
                                        className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white p-3 shadow-sm flex flex-col gap-2.5 cursor-pointer hover:bg-zinc-50/40 hover:border-blue-300 transition-all group"
                                    >

                                        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-300 opacity-80 group-hover:opacity-100 transition-opacity duration-300 z-10" />



                                        <div className="flex items-center justify-between relative z-10">
                                            <div className="flex items-center min-w-0">
                                                <div className="relative flex-shrink-0">
                                                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold overflow-hidden"
                                                        style={member.avatar_color?.startsWith('/images/avatars/') ? {} : { backgroundColor: member.avatar_color || '#6366f1' }}>
                                                        {member.avatar_color?.startsWith('/images/avatars/') ? (
                                                            <img src={member.avatar_color} className="h-full w-full object-cover" alt={member.name} />
                                                        ) : (
                                                            member.name?.charAt(0)?.toUpperCase()
                                                        )}
                                                    </div>
                                                    {['agent', 'admin', 'owner'].includes(member.role) && (
                                                        <span className={`absolute bottom-0 right-0 block h-2 w-2 rounded-full ring-1.5 ring-white ${member.is_online ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                    )}
                                                </div>
                                                <div className="ml-2.5 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-semibold text-gray-900 truncate">{member.name}</span>
                                                        <span className="inline-flex items-center rounded-lg bg-indigo-50 px-1.5 py-0.2 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/10 shrink-0">
                                                            {member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : 'Agent'}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">{member.email}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 border-dashed border-zinc-200 pt-2.5 text-xs relative z-10">
                                            <div>
                                                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Availability</span>
                                                {['agent', 'admin', 'owner'].includes(member.role) ? (
                                                    <span className={`inline-flex items-center mt-0.5 font-semibold text-[11px] ${member.is_online ? 'text-green-700' : 'text-gray-500'}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full mr-1 ${member.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        {member.is_online ? 'Online' : 'Offline'}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-400 text-[11px]">-</span>
                                                )}
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Active Chats</span>
                                                <span className="font-bold text-gray-900 mt-0.5 text-[11px] block">{member.active_chats_count || 0} open</span>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-0.5">Active Time</span>
                                                <div className="flex items-center justify-between gap-1.5">
                                                    {inviteStatus !== 'active' && member.role !== 'owner' && isAdmin ? (
                                                        <button
                                                            type="button"
                                                            onClick={(ev) => { ev.stopPropagation(); resendInvite(ev, member); }}
                                                            disabled={resendingMemberId === member.id}
                                                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                                                        >
                                                            {resendingMemberId === member.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
                                                            Resend
                                                        </button>
                                                    ) : ['agent', 'admin', 'owner'].includes(member.role) ? (
                                                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-100/50">
                                                            <Clock className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                                                            {formatOnlineTime(member.online_time_today)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-400 text-[11px]">-</span>
                                                    )}

                                                    {isAdmin && member.role !== 'owner' && member.user_id !== user?.id && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); removeMember(member.id); }}
                                                            className="inline-flex items-center justify-center p-1 text-rose-600 hover:text-white rounded-md hover:bg-rose-50 border border-rose-200 hover:border-rose-300 transition-colors"
                                                            title="Remove Member"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                    </div>
                </>
            )}

            {/* Member Details Drawer */}
            {selectedMember && (
                <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                        onClick={() => setSelectedMember(null)}
                    />

                    {/* Panel */}
                    <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900">Member Details</h3>
                            <button type="button" aria-label="Close member details" onClick={() => setSelectedMember(null)} className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Drawer Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Member Meta */}
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-sm overflow-hidden"
                                        style={selectedMember.avatar_color?.startsWith('/images/avatars/') ? {} : { backgroundColor: selectedMember.avatar_color || '#6366f1' }}>
                                        {selectedMember.avatar_color?.startsWith('/images/avatars/') ? (
                                            <img src={selectedMember.avatar_color} className="h-full w-full object-cover" alt={selectedMember.name} />
                                        ) : (
                                            selectedMember.name?.charAt(0)?.toUpperCase()
                                        )}
                                    </div>
                                    {selectedMember.role === 'agent' && (
                                        <span className={`absolute bottom-0 right-0 block h-4 w-4 rounded-full ring-2 ring-white ${selectedMember.is_online ? 'bg-green-500' : 'bg-gray-300'}`} />
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-gray-900">{selectedMember.name}</h4>
                                    <p className="text-sm text-gray-500">{selectedMember.email}</p>
                                </div>
                            </div>

                            {/* Stats/Properties List */}
                            <div className=" border-gray-100 pt-6 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 font-medium">Role</span>
                                    {isAdmin && selectedMember.role !== 'owner' ? (
                                        <select
                                            value={selectedMember.role}
                                            onChange={(e) => updateRole(selectedMember.id, e.target.value)}
                                            className="text-sm border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-1"
                                        >
                                            <option value="admin">Admin</option>
                                            <option value="agent">Agent</option>
                                        </select>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 ring-1 ring-inset ring-indigo-600/10">
                                            {selectedMember.role ? selectedMember.role.charAt(0).toUpperCase() + selectedMember.role.slice(1) : 'Agent'}
                                        </span>
                                    )}
                                </div>

                                {selectedMember.role === 'agent' && (
                                    <>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500 font-medium">Availability</span>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedMember.is_online ? 'bg-green-100 text-green-800' : 'bg-gray-105 bg-gray-100 text-gray-800'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${selectedMember.is_online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                                                {selectedMember.is_online ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500 font-medium">Online Today</span>
                                            <span className="text-sm font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100/50 flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                                {formatOnlineTime(selectedMember.online_time_today)}
                                            </span>
                                        </div>
                                    </>
                                )}

                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 font-medium">Active Chats</span>
                                    <span className="text-sm font-semibold text-gray-900 bg-gray-50 px-2.5 py-0.5 rounded border border-gray-100">
                                        {selectedMember.active_chats_count || 0} chats
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 font-medium">Last Active</span>
                                    <span className="text-sm text-gray-900 font-semibold flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                                        {formatDate(selectedMember.last_active_at)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 font-medium">Joined Date</span>
                                    <span className="text-sm text-gray-900 font-semibold flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                        {formatDate(selectedMember.created_at)}
                                    </span>
                                </div>
                            </div>

                            {/* Drawer Action Panel */}
                            <div className="border-t border-gray-100 pt-6 space-y-3">
                                {user?.id === selectedMember.user_id && selectedMember.role === 'agent' && (
                                    <button
                                        type="button"
                                        onClick={() => toggleOnlineStatus(selectedMember.is_online)}
                                        className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors ${selectedMember.is_online
                                            ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                                            }`}
                                    >
                                        <Activity className="h-4 w-4" />
                                        {selectedMember.is_online ? 'Go Offline' : 'Go Online'}
                                    </button>
                                )}

                                {isAdmin && selectedMember.role !== 'owner' && (
                                    <button
                                        type="button"
                                        onClick={() => removeMember(selectedMember.id)}
                                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-sm font-semibold text-red-600 px-4 py-2.5 transition-colors"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Remove Member
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {isInviteOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div role="dialog" aria-modal="true" aria-labelledby="team-invite-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 id="team-invite-title" className="text-base font-semibold text-gray-900">Invite New Member</h3>
                            <button type="button" aria-label="Close invitation" onClick={() => setIsInviteOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <form onSubmit={handleInvite} className="p-6 space-y-4">
                            <div>
                                <label htmlFor="team-invite-name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    id="team-invite-name"
                                    value={inviteForm.name}
                                    onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                                    placeholder="John Doe"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"
                                />
                            </div>
                            <div>
                                <label htmlFor="team-invite-email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    id="team-invite-email"
                                    value={inviteForm.email}
                                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                                    placeholder="john@example.com"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"
                                />
                            </div>
                            <div>
                                <label htmlFor="team-invite-password" className="block text-sm font-medium text-gray-700 mb-1">Login Password</label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    id="team-invite-password"
                                    value={inviteForm.password || ''}
                                    onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                                    placeholder="Set a password for the agent"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"
                                />
                            </div>
                            <div>
                                <label htmlFor="team-invite-role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <select
                                    id="team-invite-role"
                                    value={inviteForm.role}
                                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"
                                >
                                    <option value="admin">Admin (Can manage settings)</option>
                                    <option value="agent">Agent (Can manage chats)</option>
                                </select>
                            </div>
                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={isInviting}
                                    className="w-full rounded-md bg-[#0b74c9] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0867b4] disabled:opacity-50"
                                >
                                    {isInviting ? 'Sending Invite...' : 'Send Invitation'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function SummaryCard({ icon, title, value, helper }) {
    const IconComponent = icon
    return (
        <div className="stat-card-item bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">{title}</span>
                <IconComponent size={18} className="text-zinc-400" />
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-gray-900 sm:text-2xl">{value}</div>
            {helper ? <div className="mt-1 text-xs text-zinc-500 leading-normal">{helper}</div> : null}
        </div>
    )
}

function TableSkeleton() {
    return (
        <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-7 gap-4 pb-2 border-b border-gray-200">
                <div className="h-4 bg-gray-200 rounded col-span-2"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded col-span-2"></div>
            </div>
            {[1, 2, 3, 4].map(idx => (
                <div key={idx} className="grid grid-cols-7 gap-4 py-3">
                    <div className="h-8 bg-gray-100 rounded col-span-2"></div>
                    <div className="h-8 bg-gray-150 bg-gray-100 rounded"></div>
                    <div className="h-8 bg-gray-100 rounded"></div>
                    <div className="h-8 bg-gray-100 rounded"></div>
                    <div className="h-8 bg-gray-100 rounded col-span-2"></div>
                </div>
            ))}
        </div>
    )
}

function TeamEmptyState({ filtered, isAdmin, onInvite, onClear }) {
    return <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-5 py-10 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-500"><Users size={20} /></div>
        <h2 className="text-sm font-semibold text-gray-900">{filtered ? 'No members match your filters' : 'No teammates yet'}</h2>
        <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">{filtered ? 'Try a different name, role or availability.' : 'Invite teammates to help manage chats and customer enquiries.'}</p>
        {filtered ? <button type="button" onClick={onClear} className="mt-4 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">Clear filters</button> : isAdmin && <button type="button" onClick={onInvite} className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#0b74c9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0867b4]"><UserPlus size={14} />Invite teammate</button>}
    </div>
}
