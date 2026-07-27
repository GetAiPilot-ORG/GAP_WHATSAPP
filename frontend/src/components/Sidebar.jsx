import { createElement, useEffect, useMemo, useState } from 'react'
import {
    Blocks,
    Calendar,
    ChevronDown,
    ChevronsUpDown,
    Briefcase,
    CreditCard,
    FileText,
    GitFork,
    Grid2X2,
    HelpCircle,
    LogOut,
    Megaphone,
    MessageCircle,
    Plus,
    Settings,
    MessageSquareText,
    PhoneCall,
    Smartphone,
    UserCircle,
    Users,
    X,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import { useWhatsAppAccounts } from '../context/WhatsAppAccountContext'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Grid2X2 },
    { name: 'Accounts', href: '/whatsapp-connect', icon: Smartphone },
    { name: 'New Number', href: '#', icon: PhoneCall, badge: 'Coming soon' },
    { name: 'Chats', href: '/live-chat', icon: MessageSquareText, badge: 'LIVE' },
    { name: 'Scheduled Meetings', href: '/scheduled-meetings', icon: Calendar },
    { name: 'Contacts', href: '/contacts', icon: Users },
    { name: 'AI Agents', href: '/bot-agents', icon: Briefcase },
    { name: 'Team Members', href: '/team-members', icon: Users },
    { name: 'Flows', href: '/flow-builder', icon: GitFork },
    {
        name: 'Templates',
        href: '/templates',
        icon: FileText,
        subItems: [
            { name: 'My Templates', href: '/templates' },
            { name: 'Explore Templates', href: '/templates/industries' }
        ]
    },
    { name: 'Broadcasts', href: '/broadcast', icon: Megaphone },
    { name: 'WA Link Generator', href: '/wa-link-generator', icon: MessageCircle },
]

const SELECTED_WA_ACCOUNT_KEY = 'selected_wa_account_id'
const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`
const EXPANDED_WIDTH = 'w-[224px]'
const COLLAPSED_WIDTH = 'w-12'

export default function Sidebar({ onRequestLogout, isMobileOpen = false, onMobileClose }) {
    const location = useLocation()
    const navigate = useNavigate()
    const { userRole, memberProfile, user, signOut, apiCall } = useAuth()
    const [isHovered, setIsHovered] = useState(false)
    const [isOrgMenuOpen, setIsOrgMenuOpen] = useState(false)
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
    const { accounts: waAccounts } = useWhatsAppAccounts()
    const [selectedWaAccount, setSelectedWaAccount] = useState(() => localStorage.getItem(SELECTED_WA_ACCOUNT_KEY) || 'All')

    const isOwner = userRole === 'owner'
    const usesCompactSidebar = location.pathname.startsWith('/live-chat')
    const isCollapsed = usesCompactSidebar && !isHovered && !isOrgMenuOpen && !isAccountMenuOpen
    const isExpanded = !isCollapsed
    const displayName = memberProfile?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account'
    const userEmail = memberProfile?.email || user?.email || ''
    const initials = String(displayName || 'A')
        .trim()
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'A'

    const filteredNavigation = navigation.filter(item => {
        if (!isOwner) return item.name === 'Chats'
        return true
    })

    const selectedAccountLabel = useMemo(() => {
        if (selectedWaAccount === 'All') return 'GAP FlowPilot'
        const account = waAccounts.find(item => String(getAccountSwitchKey(item)) === String(selectedWaAccount))
        return account?.name || account?.display_phone_number || account?.phone_number_id || 'Selected account'
    }, [selectedWaAccount, waAccounts])
    const shouldHighlightConnect = isOwner && waAccounts.length === 0

    const isActive = (href) => {
        const [path, search] = href.split('?')
        if (search) {
            return location.pathname === path && location.search.includes(search)
        }
        if (location.search && href === '/settings') {
            return false
        }
        return location.pathname.startsWith(path)
    }

    const handleSignOut = async () => {
        onMobileClose?.()
        if (onRequestLogout) {
            onRequestLogout()
            return
        }
        await signOut()
        navigate('/login')
    }

    const closeMenus = () => {
        setIsOrgMenuOpen(false)
        setIsAccountMenuOpen(false)
    }

    const handleMobileNavigate = () => {
        onMobileClose?.()
        closeMenus()
    }

    const selectWaAccount = (accountId) => {
        const next = accountId || 'All'
        setSelectedWaAccount(next)
        localStorage.setItem(SELECTED_WA_ACCOUNT_KEY, next)
        window.dispatchEvent(new CustomEvent('selected-wa-account-change', { detail: { accountId: next } }))
        setIsOrgMenuOpen(false)
    }

    return (
        <>
            <div className={clsx('relative hidden h-full shrink-0 transition-[width] duration-200 ease-out md:block', usesCompactSidebar ? COLLAPSED_WIDTH : EXPANDED_WIDTH)}>
                <aside
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => {
                        setIsHovered(false)
                        if (usesCompactSidebar) closeMenus()
                    }}
                    className={clsx(
                        'absolute inset-y-0 left-0 z-40 flex flex-col border-r border-gray-200 bg-white transition-[width] duration-200 ease-out',
                        isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH
                    )}
                >
                    <div className="relative flex h-14 shrink-0 items-center border-b border-gray-100 px-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsHovered(true)
                                setIsOrgMenuOpen(prev => !prev)
                            }}
                            data-tour="account-switcher"
                            className={clsx(
                                'flex h-9 min-w-0 items-center rounded-lg text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100',
                                isCollapsed ? 'w-8 justify-center' : 'w-full gap-2 px-2'
                            )}
                            title={selectedAccountLabel}
                        >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-gray-200">
                                <img src="/logo.png" alt="GAP FlowPilot" className="h-[17px] w-[17px] object-contain" />
                            </span>
                            <span className={labelTransition(isExpanded, 'flex min-w-0 flex-1 items-center gap-2')}>
                                <span className="truncate font-medium text-gray-700">{selectedAccountLabel}</span>
                                <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" />
                            </span>
                        </button>

                        {isOrgMenuOpen && !isCollapsed ? (
                            <div className="absolute left-2 top-12 z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/10">
                                <button
                                    type="button"
                                    onClick={() => selectWaAccount('All')}
                                    className={clsx(
                                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-50',
                                        selectedWaAccount === 'All' ? 'bg-[#f5f7fa] font-semibold text-black' : 'text-gray-700'
                                    )}
                                >
                                    <Blocks className="h-4 w-4 text-gray-500" />
                                    All WhatsApp accounts
                                </button>
                                {waAccounts.map(account => (
                                    <button
                                        key={account.id}
                                        type="button"
                                        onClick={() => selectWaAccount(getAccountSwitchKey(account))}
                                        className={clsx(
                                            'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-50',
                                            String(selectedWaAccount) === String(getAccountSwitchKey(account)) ? 'bg-[#f5f7fa] font-semibold text-black' : 'text-gray-700'
                                        )}
                                    >
                                        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                        <span className="min-w-0">
                                            <span className="block truncate">{account.name || account.display_phone_number || 'WhatsApp account'}</span>
                                            <span className="block truncate text-xs font-normal text-gray-500">{account.display_phone_number || account.phone_number_id || ''}</span>
                                        </span>
                                    </button>
                                ))}
                                {isOwner ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsOrgMenuOpen(false)
                                            navigate('/whatsapp-connect')
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <Plus className="h-4 w-4 text-gray-500" />
                                        Connect another account
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <nav data-tour="sidebar-nav" className="flex-1 overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden px-2 py-3">
                        <div className="space-y-1">
                            {filteredNavigation.slice(0, 3).map(item => {
                                if (item.subItems) {
                                    return <ExpandableNavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} onNavigate={closeMenus} />
                                }
                                return <NavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} attention={shouldHighlightConnect && item.href === '/whatsapp-connect'} />
                            })}
                        </div>

                        {isOwner ? (
                            <>
                                <div className="my-2 h-px bg-gray-100" />
                                <div className="space-y-1">
                                    {filteredNavigation.slice(3, 7).map(item => {
                                        if (item.subItems) {
                                            return <ExpandableNavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} onNavigate={closeMenus} />
                                        }
                                        return <NavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} attention={shouldHighlightConnect && item.href === '/whatsapp-connect'} />
                                    })}
                                </div>
                                <div className="my-2 h-px bg-gray-100" />
                                <div className="space-y-1">
                                    {filteredNavigation.slice(7).map(item => {
                                        if (item.subItems) {
                                            return <ExpandableNavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} onNavigate={closeMenus} />
                                        }
                                        return <NavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} attention={shouldHighlightConnect && item.href === '/whatsapp-connect'} />
                                    })}
                                </div>
                            </>
                        ) : null}
                    </nav>

                    <div className="border-t border-gray-100 p-2">
                        {isOwner ? (
                            <>
                                <NavItem
                                    item={{ name: 'Settings', href: '/settings', icon: Settings }}
                                    active={isActive('/settings')}
                                    collapsed={isCollapsed}
                                />
                                <NavItem
                                    item={{ name: 'Help Center', href: '/help', icon: HelpCircle }}
                                    active={isActive('/help')}
                                    collapsed={isCollapsed}
                                />
                            </>
                        ) : null}

                        <div className="relative mt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsHovered(true)
                                    setIsAccountMenuOpen(prev => !prev)
                                }}
                                className={clsx(
                                    'flex h-9 w-full items-center rounded-lg text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100',
                                    isCollapsed ? 'justify-center' : 'gap-2 px-2'
                                )}
                                title={displayName}
                            >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                                    {initials[0]}
                                </span>
                                <span className={labelTransition(isExpanded, 'flex min-w-0 flex-1 items-center gap-2')}>
                                    <span className="flex flex-col min-w-0 flex-1">
                                        <span className="truncate text-sm font-medium text-gray-700 leading-tight">{displayName}</span>
                                        <span className={clsx('truncate text-[10px] leading-tight', user?.plan && user.plan !== 'No active plan' ? 'text-emerald-600 font-medium' : 'text-gray-400')}>
                                            {user?.plan || 'No active plan'}
                                        </span>
                                    </span>
                                    <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" />
                                </span>
                            </button>

                            {isAccountMenuOpen && !isCollapsed ? (
                                <div className="absolute bottom-11 left-0 z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/10">
                                    <div className="flex items-center gap-2 px-2.5 py-2">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-semibold text-gray-800 ring-1 ring-gray-200">
                                            {initials}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-gray-950">{displayName}</div>
                                            <div className="truncate text-xs text-gray-500">{userEmail}</div>
                                            <div className={clsx('truncate text-[10px] font-medium mt-0.5', user?.plan && user.plan !== 'No active plan' ? 'text-emerald-600' : 'text-gray-400')}>
                                                {user?.plan || 'No active plan'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="my-1 h-px bg-gray-100" />
                                    <MenuLink to="/settings" icon={UserCircle} label="Profile" />
                                    <MenuLink to="/billing" icon={CreditCard} label="Billing" />
                                    <button
                                        type="button"
                                        onClick={handleSignOut}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <LogOut className="h-4 w-4 text-gray-500" />
                                        Sign out
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </aside>
            </div>

            {isMobileOpen ? (
                <div className="fixed inset-0 z-[100] md:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-gray-950/40 backdrop-blur-[2px]"
                        aria-label="Close navigation"
                        onClick={onMobileClose}
                    />
                    <aside className="absolute inset-y-0 left-0 flex w-[min(78vw,288px)] max-w-full flex-col border-r border-gray-200 bg-white shadow-2xl">
                        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-3">
                            <button
                                type="button"
                                onClick={() => setIsOrgMenuOpen(prev => !prev)}
                                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                title={selectedAccountLabel}
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200">
                                    <img src="/logo.png" alt="GAP FlowPilot" className="h-5 w-5 object-contain" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">{selectedAccountLabel}</span>
                                    <span className="block truncate text-[11px] font-medium text-emerald-600">{user?.plan || 'No active plan'}</span>
                                </span>
                                <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
                            </button>
                            <button
                                type="button"
                                onClick={onMobileClose}
                                className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                                aria-label="Close navigation"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {isOrgMenuOpen ? (
                            <div className="border-b border-gray-100 bg-gray-50 p-2">
                                <button
                                    type="button"
                                    onClick={() => selectWaAccount('All')}
                                    className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', selectedWaAccount === 'All' ? 'bg-white font-semibold text-black' : 'text-gray-700')}
                                >
                                    <Blocks className="h-4 w-4 text-gray-500" />
                                    All WhatsApp accounts
                                </button>
                                {waAccounts.map(account => (
                                    <button
                                        key={account.id}
                                        type="button"
                                        onClick={() => selectWaAccount(getAccountSwitchKey(account))}
                                        className={clsx('mt-1 flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm', String(selectedWaAccount) === String(getAccountSwitchKey(account)) ? 'bg-white font-semibold text-black' : 'text-gray-700')}
                                    >
                                        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                        <span className="min-w-0">
                                            <span className="block truncate">{account.name || account.display_phone_number || 'WhatsApp account'}</span>
                                            <span className="block truncate text-xs font-normal text-gray-500">{account.display_phone_number || account.phone_number_id || ''}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        <nav className="flex-1 overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden px-3 py-4">
                            <div className="space-y-1">
                                {filteredNavigation.map(item => {
                                    if (item.subItems) {
                                        return <ExpandableNavItem key={item.name} item={item} active={isActive(item.href)} collapsed={false} onNavigate={handleMobileNavigate} />
                                    }
                                    return <NavItem key={item.name} item={item} active={isActive(item.href)} collapsed={false} onNavigate={handleMobileNavigate} attention={shouldHighlightConnect && item.href === '/whatsapp-connect'} />
                                })}
                            </div>
                            {isOwner ? (
                                <div className="mt-4 border-t border-gray-100 pt-4">
                                    <NavItem item={{ name: 'Settings', href: '/settings', icon: Settings }} active={isActive('/settings')} collapsed={false} onNavigate={handleMobileNavigate} />
                                    <NavItem item={{ name: 'Help Center', href: '/help', icon: HelpCircle }} active={isActive('/help')} collapsed={false} onNavigate={handleMobileNavigate} />
                                </div>
                            ) : null}
                        </nav>

                        <div className="border-t border-gray-100 p-3">
                            <div className="mb-2 flex min-w-0 items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                                    {initials}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-gray-800">{displayName}</span>
                                    <span className="block truncate text-xs text-gray-500">{userEmail || user?.plan || 'No active plan'}</span>
                                </span>
                            </div>
                            <div className="mb-2 grid grid-cols-2 gap-2">
                                <Link
                                    to="/settings"
                                    onClick={handleMobileNavigate}
                                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    <UserCircle className="h-4 w-4 text-gray-500" />
                                    Profile
                                </Link>
                                <Link
                                    to="/billing"
                                    onClick={handleMobileNavigate}
                                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    <CreditCard className="h-4 w-4 text-gray-500" />
                                    Billing
                                </Link>
                            </div>
                            <button
                                type="button"
                                onClick={handleSignOut}
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-red-50 text-sm font-semibold text-red-600 hover:bg-red-100"
                            >
                                <LogOut className="h-4 w-4" />
                                Sign out
                            </button>
                        </div>
                    </aside>
                </div>
            ) : null}
        </>
    )
}

function NavItem({ item, active, collapsed, onNavigate, attention }) {
    const Icon = item.icon
    const isExpanded = !collapsed
    return (
        <Link
            to={item.href}
            onClick={onNavigate}
            data-tour={`nav-${item.href.replace('/', '').replaceAll('/', '-') || 'dashboard'}`}
            title={collapsed ? item.name : undefined}
            className={clsx(
                'group flex h-9 items-center rounded-md text-[14px] font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-2 px-2',
                active ? 'bg-[#f5f7fa] text-[#0064b7]' : 'text-gray-600 hover:bg-[#f5f7fa] hover:text-black',
                attention && !active ? 'border border-[#b9dcfb] bg-[#eef7ff] text-[#0064b7] hover:bg-[#e2f2ff]' : ''
            )}
        >
            <Icon className={clsx('h-4 w-4 shrink-0 stroke-[1.9]', active || attention ? 'text-[#0064b7]' : 'text-gray-500 group-hover:text-gray-700')} />
            <span className={labelTransition(isExpanded, 'flex min-w-0 flex-1 items-center')}>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {attention && !item.badge ? (
                    <span className="ml-2 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#0064b7] ring-1 ring-[#cfe5fb]">
                        Start
                    </span>
                ) : null}
                {item.badge ? (
                    <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#0064b7]">
                        {item.badge}
                    </span>
                ) : null}
            </span>
        </Link>
    )
}

function ExpandableNavItem({ item, active, collapsed, onNavigate }) {
    const location = useLocation()
    const Icon = item.icon
    const [isManuallyOpen, setIsManuallyOpen] = useState(false)
    const isExpanded = !collapsed
    const isOpen = active || isManuallyOpen

    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={() => setIsManuallyOpen(prev => !prev)}
                data-tour={`nav-${item.href.replace('/', '').replaceAll('/', '-') || 'dashboard'}`}
                className={clsx(
                    'group flex h-9 w-full items-center rounded-md text-[14px] font-medium transition-colors text-left focus:outline-none',
                    collapsed ? 'justify-center px-0' : 'gap-2 px-2',
                    active ? 'bg-[#f5f7fa] text-[#0064b7]' : 'text-gray-600 hover:bg-[#f5f7fa] hover:text-black'
                )}
                title={collapsed ? item.name : undefined}
            >
                <Icon className={clsx('h-4 w-4 shrink-0 stroke-[1.9]', active ? 'text-[#0064b7]' : 'text-gray-500 group-hover:text-gray-700')} />
                <span className={labelTransition(isExpanded, 'flex min-w-0 flex-1 items-center')}>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ml-1', isOpen ? 'rotate-180 text-gray-600' : '')} />
                </span>
            </button>

            {isOpen && isExpanded && (
                <div className="ml-6 pl-2.5 border-l border-gray-100 space-y-1">
                    {item.subItems.map((sub) => {
                        const isSubActive = location.pathname === sub.href;
                        return (
                            <Link
                                key={sub.name}
                                to={sub.href}
                                onClick={onNavigate}
                                className={clsx(
                                    'block py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors',
                                    isSubActive ? 'text-[#0064b7] bg-blue-50/40 font-bold' : 'text-gray-500 hover:text-black hover:bg-gray-50'
                                )}
                            >
                                {sub.name}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    )
}

function MenuLink({ to, icon, label }) {
    return (
        <Link to={to} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-100">
            {createElement(icon, { className: 'h-4 w-4 text-gray-500' })}
            {label}
        </Link>
    )
}

function getAccountSwitchKey(account) {
    return account?.display_phone_number || account?.phone_number_id || account?.id || 'All'
}

function labelTransition(show, extra = '') {
    return clsx(
        'overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-out',
        show ? 'max-w-[180px] translate-x-0 opacity-100' : 'max-w-0 -translate-x-1.5 opacity-0',
        extra
    )
}
