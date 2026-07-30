import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, MoreVertical, Paperclip, Send, Smile, Phone, Tag, Check, CheckCheck, Clock, AlertCircle, Info, ChevronLeft, ChevronDown, ArrowDown, FileText, Mic, Pencil, Bot, User, ExternalLink, Reply, Forward, X, Copy, Trash2, Archive, Pin, PinOff, MailOpen, Star, StarOff, Eraser, Inbox, BellOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format, isToday, isYesterday } from 'date-fns'
import { io } from "socket.io-client";
import QRCode from 'react-qr-code'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useWhatsAppAccounts } from '../context/WhatsAppAccountContext'
import ContactProfileDrawer from '../components/ContactProfileDrawer'
import { AudioPlayerProvider } from '../components/AudioPlayerManager'
import AudioMessageBubble from '../components/AudioMessageBubble'
import AudioRecorderOrUploader from '../components/AudioRecorderOrUploader'
import { useNotificationSound } from '../hooks/useNotificationSound'
import TourButton from '../onboarding/TourButton'
import { supabase } from '../supabaseClient'
import { useQuery, useQueryClient } from '@tanstack/react-query'

function DiceBearAvatar({ seed, className }) {
    const colorClass = getAvatarColor(seed);
    const initial = seed ? seed.charAt(0).toUpperCase() : '?';

    // Determine text sizing from classes
    let textSize = 'text-base';
    if (className) {
        if (className.includes('h-8') || className.includes('h-9')) {
            textSize = 'text-xs sm:text-sm';
        } else if (className.includes('h-10') || className.includes('h-11')) {
            textSize = 'text-[17px]';
        } else if (className.includes('h-14')) {
            textSize = 'text-xl';
        } else if (className.includes('h-16')) {
            textSize = 'text-2xl';
        }
    }

    return (
        <div className={`flex items-center justify-center font-bold ${colorClass} ${className} shadow-sm`}>
            <span className={textSize}>{initial}</span>
        </div>
    );
}

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Connect to backend
const socket = io(BACKEND_BASE, {
    autoConnect: false,
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
});
const API_BASE = `${BACKEND_BASE}/api`;
const AGENT_SETTINGS_ITEM_TYPE = '__agent_settings';
const MUTED_UNTIL_LABEL_PREFIX = 'muted_until:';
const ACTIVE_CHAT_SYNC_MS = 30000;
const CHAT_LIST_SYNC_MS = 30000;
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_WINDOW_ERROR_RE = /(24\s*hour|24-hour|customer\s+service\s+window|outside\s+the\s+allowed\s+window|template\s+message|required\s+template)/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BROKEN_PROFILE_PHOTOS_KEY = 'gap_livechat_broken_profile_photos';

const WHATSAPP_EMOJI_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64';
const QUICK_REACTIONS = [
    { emoji: '\u{1F44D}', label: 'Thumbs up' },
    { emoji: '\u2764\uFE0F', label: 'Heart' },
    { emoji: '\u{1F602}', label: 'Laugh' },
    { emoji: '\u{1F62E}', label: 'Wow' },
    { emoji: '\u{1F622}', label: 'Sad' },
    { emoji: '\u{1F64F}', label: 'Prayer' },
];
const EMOJI_PICKER_ITEMS = [
    '\u{1F600}', '\u{1F605}', '\u{1F602}', '\u{1F642}', '\u{1F609}', '\u{1F60D}', '\u{1F64F}', '\u{1F44D}',
    '\u2764\uFE0F', '\u{1F389}', '\u{1F622}', '\u{1F621}', '\u{1F91D}', '\u{1F525}', '\u2705', '\u{1F4CE}',
];

function emojiToAssetName(emoji) {
    return Array.from(String(emoji || ''))
        .map(char => char.codePointAt(0).toString(16))
        .join('-');
}

function EmojiAsset({ emoji, label = 'Emoji', className = 'h-5 w-5' }) {
    const [assetFailed, setAssetFailed] = useState(false);
    const asset = emojiToAssetName(emoji);
    if (!asset) return null;
    if (assetFailed) return <span className={`inline-flex items-center justify-center ${className}`}>{emoji}</span>;

    return (
        <img
            src={`${WHATSAPP_EMOJI_ASSET_BASE}/${asset}.png`}
            alt={label}
            className={`${className} select-none object-contain`}
            draggable="false"
            onError={() => setAssetFailed(true)}
        />
    );
}

function WhatsAppSendIcon({ className = 'h-5 w-5' }) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            className={className}
            fill="currentColor"
        >
            <path d="M3.55 20.98 21.22 12 3.55 3.02v6.98L15.1 12 3.55 14v6.98Z" />
        </svg>
    );
}

function getAvatarColor(name) {
    const colors = [
        'bg-[#e0e7ff] text-[#4f46e5]', // Indigo
        'bg-[#fee2e2] text-[#dc2626]', // Red
        'bg-[#fef3c7] text-[#d97706]', // Amber/Orange
        'bg-[#d1fae5] text-[#059669]', // Emerald
        'bg-[#e0f2fe] text-[#0284c7]', // Sky Blue
        'bg-[#f3e8ff] text-[#9333ea]', // Purple
        'bg-[#fae8ff] text-[#c084fc]', // Fuchsia
    ];
    let hash = 0;
    const str = name || '';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

function ForwardedIndicator() {
    return (
        <div className="mb-0.5 flex items-center gap-1 text-[12px] italic leading-4 text-[#667781]">
            <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
                className="h-3.5 w-3.5 shrink-0 translate-y-px text-[#667781]"
                fill="currentColor"
            >
                <path d="M9.28 2.33a.5.5 0 0 0-.78.41v1.51H7.08c-2.5 0-4.58 2.02-4.58 4.5v2.04a.5.5 0 0 0 .92.28c.87-1.31 2.22-2.06 3.86-2.06H8.5v1.5a.5.5 0 0 0 .78.42l3.98-3.88a.58.58 0 0 0 0-.84L9.28 2.33Zm.22 3.42V4.12l2.68 2.51L9.5 9.14V7.51H7.28c-1.31 0-2.47.37-3.43 1.07.1-1.6 1.5-2.83 3.23-2.83H9.5Z" />
                <path d="M5.28 2.83a.48.48 0 0 0-.67-.02L1.46 5.75a.5.5 0 0 0 0 .74L4.6 9.43a.5.5 0 0 0 .84-.36v-.75H4.7c-.34 0-.68.03-1.01.1L2.54 6.12 5.43 3.4a.48.48 0 0 0-.15-.57Z" opacity=".72" />
            </svg>
            <span>Forwarded</span>
        </div>
    );
}

function LiveChatLoadingSkeleton({ sidebarWidth, isDesktop }) {
    return (
        <div className="flex h-full min-h-0 overflow-hidden bg-white" role="status" aria-label="Loading live chat">
            <div
                className="flex w-full shrink-0 flex-col border-r border-gray-200 bg-white lg:w-auto"
                style={{ width: isDesktop ? `${sidebarWidth}px` : undefined }}
            >
                <div className="border-b border-gray-200 p-3">
                    <div className="mb-3 h-4 w-28 animate-pulse rounded bg-gray-200" />
                    <div className="h-10 animate-pulse rounded-full bg-gray-100" />
                </div>
                <div className="space-y-1 p-3">
                    {Array.from({ length: 7 }, (_, index) => (
                        <div key={index} className="flex items-center gap-3 border-b border-gray-100 py-3">
                            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-gray-200" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200" />
                                <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="hidden flex-1 items-center justify-center bg-[#f5f1eb] lg:flex">
                <div className="space-y-3 text-center">
                    <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-white/80" />
                    <div className="mx-auto h-3 w-44 animate-pulse rounded bg-white/90" />
                </div>
            </div>
            <span className="sr-only">Loading WhatsApp accounts and conversations</span>
        </div>
    )
}

function ChatListLoadingSkeleton() {
    return (
        <div className="space-y-1 p-3" role="status" aria-label="Loading conversations">
            {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 border-b border-gray-100 py-3">
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-gray-200" />
                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100" />
                    </div>
                </div>
            ))}
            <span className="sr-only">Loading conversations</span>
        </div>
    )
}

export default function LiveChat() {
    const navigate = useNavigate()
    const { user, session, loginType, memberProfile, userRole, isProfileLoading } = useAuth()
    const queryClient = useQueryClient()
    const { alertDialog, confirmDialog } = useDialog()
    const isAdmin = userRole === 'admin' || userRole === 'owner'
    const { playNotification } = useNotificationSound()

    const authHeaders = useMemo(() => ({
        'Authorization': `Bearer ${session?.access_token}`,
        'X-Auth-Portal': loginType || 'owner'
    }), [session, loginType]);
    const [chats, setChats] = useState([])
    const [chatsLoadState, setChatsLoadState] = useState('loading')
    const [nextConversationCursor, setNextConversationCursor] = useState(null)
    const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false)
    const chatsRef = useRef([])
    const [chatSearch, setChatSearch] = useState('')
    const [chatFilter, setChatFilter] = useState('all')
    const [isChatFilterMenuOpen, setIsChatFilterMenuOpen] = useState(false)
    const [isAssignMenuOpen, setIsAssignMenuOpen] = useState(false)
    const [timeRemainingStr, setTimeRemainingStr] = useState('')
    const [showTimeTooltip, setShowTimeTooltip] = useState(false)
    const [isUrgentTime, setIsUrgentTime] = useState(false)
    const [selectedChat, setSelectedChat] = useState(null)
    const selectedChatRef = useRef(null)
    const [messageText, setMessageText] = useState('')
    const [isInternalNote, setIsInternalNote] = useState(false)
    const [messages, setMessages] = useState([])
    const messagesRef = useRef([])
    const messagesEndRef = useRef(null)
    const messagesListRef = useRef(null)
    const messageInputRef = useRef(null)
    const profilePhotoFetchRef = useRef(new Set())
    const brokenProfilePhotoUrlsRef = useRef(new Set())
    const sessionRef = useRef(session)
    const userRef = useRef(user)
    const authHeadersRef = useRef(authHeaders)
    const fetchChatsInFlightRef = useRef(false)
    const chatRefreshTimerRef = useRef(null)
    const fetchMessagesInFlightRef = useRef(new Set())
    const lastActiveSyncRef = useRef(0)
    const lastChatListSyncRef = useRef(0)
    const lastSelectedChatIdRef = useRef(null)
    const lastMessageIdRef = useRef(null)
    const isNearBottomRef = useRef(true)
    const chatMessagesCacheRef = useRef({})
    const chatHasMoreCacheRef = useRef({})
    const lastOpenTimeRef = useRef(0)
    const loadedMessagesChatIdRef = useRef(null)

    const [isThreadLoading, setIsThreadLoading] = useState(false)
    const [hasMoreMessages, setHasMoreMessages] = useState(true)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false)
    const [newMessagesPending, setNewMessagesPending] = useState(0)
    const [showJumpToLatest, setShowJumpToLatest] = useState(false)
    const [activeVideoId, setActiveVideoId] = useState(null)

    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const cached = localStorage.getItem('gap_livechat_sidebar_width')
            return cached ? parseInt(cached, 10) : 320
        } catch {
            return 320
        }
    })
    const [isResizing, setIsResizing] = useState(false)
    const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024)

    useEffect(() => {
        const handleResize = () => {
            setIsDesktop(window.innerWidth >= 1024)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const startResizing = (e) => {
        e.preventDefault()
        setIsResizing(true)
    }

    useEffect(() => {
        if (!isResizing) return

        const handleMouseMove = (e) => {
            const container = document.getElementById('chat-list-container')
            if (!container) return
            const rect = container.getBoundingClientRect()
            let newWidth = e.clientX - rect.left

            const minWidth = 280
            const maxWidth = Math.max(minWidth, window.innerWidth / 2) // Pull to half screen at least

            if (newWidth < minWidth) newWidth = minWidth
            if (newWidth > maxWidth) newWidth = maxWidth

            setSidebarWidth(newWidth)
            try {
                localStorage.setItem('gap_livechat_sidebar_width', String(newWidth))
            } catch (err) { }
        }

        const handleMouseUp = () => {
            setIsResizing(false)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isResizing])

    useEffect(() => {
        if (isResizing) {
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
        } else {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        return () => {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
    }, [isResizing])

    // Keep memory cache in sync with messages state changes, verifying loadedMessagesChatIdRef match
    useEffect(() => {
        if (selectedChat?.id && messages.length > 0 && loadedMessagesChatIdRef.current === selectedChat.id) {
            chatMessagesCacheRef.current[selectedChat.id] = messages
        }
    }, [messages, selectedChat?.id])

    const fileInputRef = useRef(null)
    const [selectedFile, setSelectedFile] = useState(null)
    const [pendingAudio, setPendingAudio] = useState(null) // { file: File, durationSeconds: number }
    const [isAudioPanelOpen, setIsAudioPanelOpen] = useState(false)
    const [isEmojiOpen, setIsEmojiOpen] = useState(false)
    const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false)
    const [focusAliasOnOpen, setFocusAliasOnOpen] = useState(false)
    const [replyingTo, setReplyingTo] = useState(null)
    const [activeChatMenuId, setActiveChatMenuId] = useState(null)
    const [activeMessageMenuId, setActiveMessageMenuId] = useState(null)
    const [messageMenuAnchor, setMessageMenuAnchor] = useState(null)
    const [forwardingMessage, setForwardingMessage] = useState(null)
    const [forwardSearch, setForwardSearch] = useState('')
    const [forwardSelectedIds, setForwardSelectedIds] = useState([])
    const [isForwarding, setIsForwarding] = useState(false)
    const [expiredWindowChatIds, setExpiredWindowChatIds] = useState(() => new Set())
    const [hiddenMessageKeys, setHiddenMessageKeys] = useState(() => new Set())

    // Bot state
    const [botEnabled, setBotEnabled] = useState(false)
    const [availableBots, setAvailableBots] = useState([])
    const [selectedBotId, setSelectedBotId] = useState(null)
    const [showBotMenu, setShowBotMenu] = useState(false)

    // Connection state is explicit so an unresolved request is never rendered as disconnected.
    const [connectionState, setConnectionState] = useState('loading');
    const [qrCode, setQrCode] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('Connecting...');

    // Auto Assign State
    const [isAutoAssignMenuOpen, setIsAutoAssignMenuOpen] = useState(false);
    const [isAutoAssignModalOpen, setIsAutoAssignModalOpen] = useState(false);
    const [isAgentStatusModalOpen, setIsAgentStatusModalOpen] = useState(false);
    const [autoAssignSettings, setAutoAssignSettings] = useState({ enabled: false, batch_size: 1, paused_agents: [] });
    const [orgAgents, setOrgAgents] = useState([]);

    // Draft states for modals
    const [draftAutoAssignSettings, setDraftAutoAssignSettings] = useState({ enabled: false, batch_size: 1 });
    const [draftPausedAgents, setDraftPausedAgents] = useState([]);

    // Team members for assignment
    const [teamMembers, setTeamMembers] = useState([])
    const assignableTeamMembers = useMemo(
        () => teamMembers.filter(member => ['agent', 'admin'].includes(String(member?.role || '').toLowerCase()) && member?.is_active !== false),
        [teamMembers]
    )
    const getBotAutomationSettings = (bot) => {
        const entries = Array.isArray(bot?.knowledge_base_content) ? bot.knowledge_base_content : []
        const item = entries.find(entry => entry?.type === AGENT_SETTINGS_ITEM_TYPE)
        const settings = item?.settings && typeof item.settings === 'object' ? item.settings : {}
        return {
            auto_reply_unknown: settings.auto_reply_unknown === true,
            default_for_new_chats: settings.default_for_new_chats === true,
        }
    }
    const workspaceAutoReplyBot = useMemo(() => (
        availableBots.find(bot => {
            const settings = getBotAutomationSettings(bot)
            return settings.default_for_new_chats || settings.auto_reply_unknown
        }) || null
    ), [availableBots])
    const effectiveBotEnabled = botEnabled === true

    useEffect(() => {
        chatsRef.current = chats
    }, [chats])

    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    useEffect(() => {
        selectedChatRef.current = selectedChat
    }, [selectedChat])

    useEffect(() => {
        sessionRef.current = session
        userRef.current = user
        authHeadersRef.current = authHeaders
    }, [session, user, authHeaders])

    useEffect(() => {
        try {
            const cached = JSON.parse(localStorage.getItem(BROKEN_PROFILE_PHOTOS_KEY) || '[]')
            if (Array.isArray(cached)) {
                brokenProfilePhotoUrlsRef.current = new Set(cached.filter(Boolean).slice(-100))
            }
        } catch {
            brokenProfilePhotoUrlsRef.current = new Set()
        }
    }, [])

    // Auto scroll to bottom on new messages
    useEffect(() => {
        if (messages.length === 0) return;

        const currentChatId = selectedChat?.id;
        const isNewChat = lastSelectedChatIdRef.current !== currentChatId;

        const lastMsg = messages[messages.length - 1];
        const lastMsgId = lastMsg?.id || lastMsg?.wa_message_id;
        const isNewMessageAdded = lastMessageIdRef.current !== lastMsgId;

        // Update refs
        lastSelectedChatIdRef.current = currentChatId;
        lastMessageIdRef.current = lastMsgId;

        if (isNewChat) {
            isNearBottomRef.current = true;
            setNewMessagesPending(0);
            // Initial load scroll positioning is handled inside fetchMessages to prevent jumps.
            return;
        }

        if (isNewMessageAdded) {
            const isOutbound = lastMsg?.sender === 'agent';
            if (isOutbound || isNearBottomRef.current) {
                // If the user just opened this chat (within last 2.5s), use instant scroll ('auto')
                // to prevent background updates from causing visible smooth-scroll jumps.
                const behavior = (Date.now() - lastOpenTimeRef.current < 2500) ? 'auto' : 'smooth';
                setTimeout(() => {
                    scrollToBottom(behavior);
                }, 50);
                setTimeout(() => {
                    scrollToBottom(behavior);
                }, 150);
            } else {
                setNewMessagesPending(n => n + 1);
            }
        }
    }, [messages, selectedChat]);

    // Close floating menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (showBotMenu && !e.target.closest('[data-bot-menu]')) {
                setShowBotMenu(false)
            }
            if (isAssignMenuOpen && !e.target.closest('[data-assign-menu]')) {
                setIsAssignMenuOpen(false)
            }
            if (isChatFilterMenuOpen && !e.target.closest('[data-chat-filter-menu]')) {
                setIsChatFilterMenuOpen(false)
            }
            if (isAutoAssignMenuOpen && !e.target.closest('[data-auto-assign-menu]')) {
                setIsAutoAssignMenuOpen(false)
            }
            if (activeMessageMenuId && !e.target.closest('[data-message-menu]')) {
                setActiveMessageMenuId(null)
                setMessageMenuAnchor(null)
            }
            if (activeChatMenuId && !e.target.closest('[data-chat-row-menu]')) {
                setActiveChatMenuId(null)
            }
            if (showTimeTooltip && !e.target.closest('[data-time-tooltip]')) {
                setShowTimeTooltip(false)
            }
        }
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [showBotMenu, isAssignMenuOpen, isChatFilterMenuOpen, isAutoAssignMenuOpen, activeMessageMenuId, activeChatMenuId, showTimeTooltip])

    const isNearBottom = () => {
        const el = messagesListRef.current
        if (!el) return true
        const threshold = 150
        return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold
    }

    const scrollToBottom = (behavior = 'auto') => {
        const el = messagesListRef.current
        if (el) {
            el.scrollTo({
                top: el.scrollHeight,
                behavior
            })
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior })
        }
        setShowJumpToLatest(false)
    }

    useEffect(() => {
        const el = messageInputRef.current
        if (!el) return

        el.style.height = 'auto'
        const nextHeight = Math.min(el.scrollHeight, 168)
        el.style.height = `${nextHeight}px`
        el.style.overflowY = el.scrollHeight > 168 ? 'auto' : 'hidden'
    }, [messageText, isInternalNote])

    // Account Selection
    const [connectedAccounts, setConnectedAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(() => localStorage.getItem('selected_wa_account_id') || 'All');
    const organizationId = memberProfile?.organization_id || null
    const accountsQueryKey = useMemo(
        () => ['whatsapp-accounts', organizationId],
        [organizationId]
    )
    const { accounts: sharedAccounts, isLoading: isAccountsLoading, error: accountsContextError } = useWhatsAppAccounts()

    const {
        data: accountRecords = sharedAccounts,
        error: accountsError = accountsContextError,
        isFetchedAfterMount: areAccountsFetchedAfterMount = true,
        isPending: areAccountsPending = isAccountsLoading,
        isFetching: areAccountsFetching = false,
        refetch: refetchAccounts,
    } = useQuery({
        queryKey: accountsQueryKey,
        enabled: Boolean(session?.access_token && organizationId && !isProfileLoading),
        initialData: sharedAccounts,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        placeholderData: previousData => previousData || sharedAccounts,
        queryFn: async () => sharedAccounts,
    })

    useEffect(() => {
        if (!session?.access_token || isProfileLoading || !organizationId) {
            setConnectionState('loading')
            setConnectedAccounts([])
            return
        }
        if ((areAccountsPending && !accountRecords) ||
            ((accountRecords?.length || 0) === 0 && (!areAccountsFetchedAfterMount || areAccountsFetching))) {
            setConnectionState('loading')
            return
        }
        if (accountsError && (!accountRecords || accountRecords.length === 0)) {
            setConnectionState('error')
            return
        }

        const accountIds = (accountRecords || [])
            .map(account => account.display_phone_number || account.phone_number_id || account.whatsapp_business_account_id)
            .filter(Boolean)
        setConnectedAccounts(accountIds)
        setConnectionState(accountIds.length > 0 ? 'connected' : 'disconnected')
    }, [accountRecords, accountsError, areAccountsFetchedAfterMount, areAccountsFetching, areAccountsPending, isProfileLoading, organizationId, session?.access_token])

    useEffect(() => {
        if (!session?.access_token) {
            queryClient.removeQueries({ queryKey: ['whatsapp-accounts'] })
        }
    }, [queryClient, session?.access_token])

    useEffect(() => {
        const handleSelectedAccountChange = (event) => {
            setSelectedAccount(event?.detail?.accountId || localStorage.getItem('selected_wa_account_id') || 'All')
        }
        window.addEventListener('selected-wa-account-change', handleSelectedAccountChange)
        window.addEventListener('storage', handleSelectedAccountChange)
        return () => {
            window.removeEventListener('selected-wa-account-change', handleSelectedAccountChange)
            window.removeEventListener('storage', handleSelectedAccountChange)
        }
    }, [])

    const normalizeAccountKey = (value) => String(value || '').replace(/[^0-9]/g, '')

    const normalizeId = (value) => {
        if (value == null) return ''
        return String(value)
    }

    const idsEqual = (a, b) => normalizeId(a) !== '' && normalizeId(a) === normalizeId(b)

    const normalizeIndianPhoneKey = (value) => {
        const raw = String(value || '')
        const left = raw.includes('@') ? raw.split('@')[0] : raw
        const digits = left.replace(/[^0-9]/g, '')
        if (digits.length === 10) return `91${digits}`
        if (digits.length === 12 && digits.startsWith('91')) return digits
        return null
    }

    const formatPhoneForDisplay = (value) => {
        const raw = String(value || '')
        if (!raw) return ''

        const [left, right] = raw.includes('@') ? raw.split('@') : [raw, '']

        // Never display internal identifiers (e.g. @lid, @g.us, @newsletter) as "phone".
        // Only allow @s.whatsapp.net or no domain because left side is a phone.
        if (right && right !== 's.whatsapp.net') return ''

        const digits = String(left).replace(/[^0-9]/g, '')
        if (!digits) return ''

        // Indian numbers: 10 digits (local) or 12 digits starting with 91
        if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
        if (digits.length === 12 && digits.startsWith('91')) {
            const local = digits.slice(2)
            return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
        }

        // Other international numbers: show with + prefix, space after country code
        if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
        return ''
    }

    const getDisplayName = (contact) => {
        const custom = String(contact?.custom_name || '').trim()
        if (custom) return custom

        // Prefer saved contact name, but never show raw provider identifiers.
        const rawName = String(contact?.name || '').trim()
        let safeName = rawName && !rawName.includes('@') ? rawName : ''
        // Providers sometimes persist a formatted phone number in the name field.
        if (safeName && /^\+?[\d\s()-]+$/.test(safeName)) safeName = ''

        const raw = safeName || contact?.phone || contact?.wa_id || ''
        if (!raw) return 'Unknown'

        // If it's a JID, prefer the left side as display.
        if (raw.includes('@')) {
            const [left, right] = raw.split('@')
            if (right === 'g.us') return contact?.name || `Group ${left}`
            if (right === 'newsletter') return contact?.name || `Channel ${left}`
            // lid / s.whatsapp.net / other internal ids
            const digits = String(left).replace(/[^0-9]/g, '')
            return safeName || (digits || left)
        }

        if (!safeName) {
            const phone = formatPhoneForDisplay(contact?.phone || contact?.wa_id || '')
            return phone || 'Unknown'
        }

        return raw
    }

    const displayFromWaId = (wa) => {
        const raw = String(wa || '')
        if (!raw) return ''
        const left = raw.includes('@') ? raw.split('@')[0] : raw
        const digits = left.replace(/[^0-9]/g, '')
        return digits || left
    }

    const getAvatarText = (name) => {
        const safe = String(name || '').trim()
        if (!safe) return '?'
        const parts = safe.split(/\s+/).filter(Boolean)
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
        return safe.slice(0, 2).toUpperCase()
    }

    const avatarColorClass = (seed) => {
        const colors = [
            'bg-indigo-500',
            'bg-sky-500',
            'bg-emerald-500',
            'bg-amber-500',
            'bg-rose-500',
            'bg-violet-500',
            'bg-teal-500',
            'bg-orange-500',
        ]
        const s = String(seed || '')
        let h = 0
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
        return colors[h % colors.length]
    }

    const getProfilePhotoUrl = (contact) => {
        const url = (
            contact?.profile_photo_url ||
            contact?.profilePhotoUrl ||
            contact?.photo_url ||
            contact?.avatar_url ||
            contact?.custom_fields?.profile_photo_url ||
            ''
        )
        return url && !brokenProfilePhotoUrlsRef.current.has(url) ? url : ''
    }

    const clearBrokenProfilePhoto = (contactId, photoUrl = '') => {
        if (!contactId) return
        if (photoUrl) {
            brokenProfilePhotoUrlsRef.current.add(photoUrl)
            try {
                localStorage.setItem(
                    BROKEN_PROFILE_PHOTOS_KEY,
                    JSON.stringify(Array.from(brokenProfilePhotoUrlsRef.current).slice(-100))
                )
            } catch { }
        }
        profilePhotoFetchRef.current.delete(contactId)
        setChats(prev => prev.map(chat => {
            if (!idsEqual(chat.contactId, contactId)) return chat
            const nextContact = {
                ...(chat.contact || {}),
                profile_photo_url: '',
                custom_fields: {
                    ...(chat.contact?.custom_fields || {}),
                    profile_photo_url: '',
                },
            }
            return { ...chat, contact: nextContact, profilePhotoUrl: '' }
        }))
        setSelectedChat(prev => {
            if (!prev || !idsEqual(prev.contactId, contactId)) return prev
            const nextContact = {
                ...(prev.contact || {}),
                profile_photo_url: '',
                custom_fields: {
                    ...(prev.contact?.custom_fields || {}),
                    profile_photo_url: '',
                },
            }
            return { ...prev, contact: nextContact, profilePhotoUrl: '' }
        })
    }

    const fetchMissingProfilePhotos = async (chatRows) => {
        if (!session?.access_token) return
        const rows = (Array.isArray(chatRows) ? chatRows : [])
            .filter(chat => chat.contactId && !chat.profilePhotoUrl && !profilePhotoFetchRef.current.has(chat.contactId))
            .slice(0, 12)

        if (rows.length === 0) return

        await Promise.all(rows.map(async (chat) => {
            profilePhotoFetchRef.current.add(chat.contactId)
            try {
                const res = await fetch(`${API_BASE}/contacts/${chat.contactId}/profile-photo`, {
                    headers: authHeaders
                })
                if (!res.ok) return
                const data = await res.json()
                const photoUrl = data?.profile_photo_url
                if (!photoUrl || brokenProfilePhotoUrlsRef.current.has(photoUrl)) return

                setChats(prev => prev.map(item => {
                    if (!idsEqual(item.contactId, chat.contactId)) return item
                    const nextContact = {
                        ...(item.contact || {}),
                        profile_photo_url: photoUrl,
                        custom_fields: {
                            ...(item.contact?.custom_fields || {}),
                            profile_photo_url: photoUrl,
                        }
                    }
                    return { ...item, contact: nextContact, profilePhotoUrl: photoUrl }
                }))

                setSelectedChat(prev => {
                    if (!prev || !idsEqual(prev.contactId, chat.contactId)) return prev
                    const nextContact = {
                        ...(prev.contact || {}),
                        profile_photo_url: photoUrl,
                        custom_fields: {
                            ...(prev.contact?.custom_fields || {}),
                            profile_photo_url: photoUrl,
                        }
                    }
                    return { ...prev, contact: nextContact, profilePhotoUrl: photoUrl }
                })
            } catch (err) {
                console.warn('Failed to fetch profile photo:', err)
            }
        }))
    }

    const formatMessageFromDb = (m) => {
        const createdAt = m.created_at ? new Date(m.created_at) : new Date()

        const rawType = m.content?.rawType || null
        // Never render protocol/system/reaction rows as chat bubbles.
        if (m.type === 'protocol' || m.type === 'system' || rawType === 'protocolMessage') return null
        if (m.type === 'reaction' || rawType === 'reactionMessage') return null
        // Legacy DB rows (pre-fix) stored stickers as text placeholders.
        if (rawType === 'stickerMessage' && m.type !== 'sticker') return null

        const captionOrText = (m.text_body ?? m.content?.caption ?? m.content?.text ?? '')

        const mediaUrl = m.media_url ?? m.content?.media_url ?? null
        const mimeType = m.media_mime ?? m.content?.mime_type ?? null
        const fileName = m.content?.file_name ?? null
        const durationSeconds = m.duration_seconds ?? m.content?.duration_seconds ?? null

        return {
            id: m.id,
            wa_message_id: m.wa_message_id,
            createdAt,
            text: typeof captionOrText === 'string' ? captionOrText : String(captionOrText || ''),
            mediaUrl,
            mimeType,
            fileName,
            durationSeconds: Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null,
            sender: m.direction === 'outbound' ? 'agent' : 'user',
            time: format(createdAt, 'h:mm a'),
            type: m.type === 'note' ? 'note' : (m.type || 'text'),
            messageType: m.type || 'text',
            agentName: m.direction === 'outbound' ? 'You' : null,
            account: null,
            status: m.status,
            senderType: m.sender_type || null,
            automationSource: m.automation_source || null,
            isBotReply: m.is_bot_reply === true,
            botAgentId: m.bot_agent_id || null,
            botAgentName: m.content?.bot_agent_name || m.metadata?.bot_agent_name || null,
            metadata: m.metadata || {},
            reactions: Array.isArray(m.reactions) ? m.reactions : [],
            content: m.content || {},
            quoted: m.content?.quoted || null,
            forwarded: !!m.content?.forwarded,
        }
    }

    const getMessageKey = (msg) => {
        if (!msg) return ''
        return String(
            msg.clientMessageId ||
            msg.client_message_id ||
            msg.content?.client_message_id ||
            msg.metadata?.client_message_id ||
            msg.wa_message_id ||
            msg.id ||
            ''
        )
    }

    const mergeMessages = (current, incoming, { replace = false } = {}) => {
        const list = Array.isArray(incoming) ? incoming.filter(Boolean) : [incoming].filter(Boolean)
        if (replace) {
            const next = []
            const seen = new Set()
            for (const msg of list) {
                const key = getMessageKey(msg)
                if (key && seen.has(key)) continue
                if (key) seen.add(key)
                next.push(msg)
            }
            return next.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))
        }

        const merged = [...current]
        for (const msg of list) {
            const key = getMessageKey(msg)
            const idx = merged.findIndex(item => {
                const itemKey = getMessageKey(item)
                if (key && itemKey && itemKey === key) return true
                const sameClientId = msg.clientMessageId && item.clientMessageId && msg.clientMessageId === item.clientMessageId
                if (sameClientId) return true
                const bothOutboundText = item.sender === 'agent' && msg.sender === 'agent' && item.text && item.text === msg.text
                const timeDelta = Math.abs((item.createdAt?.getTime?.() || 0) - (msg.createdAt?.getTime?.() || 0))
                return bothOutboundText && item.optimistic && timeDelta < 15000
            })
            if (idx >= 0) merged[idx] = { ...merged[idx], ...msg, optimistic: false }
            else merged.push(msg)
        }

        merged.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))
        return merged
    }

    const normalizeSocketMessage = (msg) => {
        const createdAt = msg?.created_at ? new Date(msg.created_at) : new Date()
        return {
            id: msg.message_id || msg.id || msg.wa_message_id || `socket-${createdAt.getTime()}`,
            wa_message_id: msg.wa_message_id || null,
            clientMessageId: msg.client_message_id || msg.content?.client_message_id || msg.metadata?.client_message_id || null,
            createdAt,
            text: msg.text || msg.content?.text || msg.content?.caption || '',
            sender: msg.sender || 'user',
            time: format(createdAt, 'h:mm a'),
            type: msg.type === 'note' ? 'note' : (msg.type || 'text'),
            messageType: msg.type || 'text',
            mediaUrl: msg.media_url || msg.content?.media_url || null,
            mimeType: msg.mime_type || msg.content?.mime_type || null,
            fileName: msg.file_name || msg.content?.file_name || null,
            durationSeconds: Number.isFinite(Number(msg.duration_seconds || msg.content?.duration_seconds)) ? Number(msg.duration_seconds || msg.content?.duration_seconds) : null,
            from: msg.from,
            account: msg.connectedAccount,
            status: msg.status,
            senderType: msg.sender_type || msg.senderType || null,
            automationSource: msg.automation_source || msg.automationSource || null,
            isBotReply: msg.is_bot_reply === true || msg.isBotReply === true,
            botAgentId: msg.bot_agent_id || msg.botAgentId || null,
            botAgentName: msg.bot_agent_name || msg.botAgentId || msg.content?.bot_agent_name || msg.metadata?.bot_agent_name || null,
            metadata: msg.metadata || msg.content?.metadata || {},
            reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
            content: msg.content || {},
            quoted: msg.quoted || msg.content?.quoted || null,
            forwarded: !!(msg.forwarded || msg.content?.forwarded),
            optimistic: false,
        }
    }

    const insertEmoji = (emoji) => {
        setMessageText((prev) => `${prev || ''}${emoji}`)
        setIsEmojiOpen(false)
    }

    const fetchAutoAssignSettings = async () => {
        try {
            const res = await fetch(`${API_BASE}/settings/auto-assign`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setAutoAssignSettings(data);
            }
        } catch (e) { console.error('Error fetching auto assign:', e); }
    };

    const fetchOrgAgents = async () => {
        try {
            const res = await fetch(`${API_BASE}/team/agents`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setOrgAgents(data);
            }
        } catch (e) { console.error('Error fetching org agents:', e); }
    };

    const saveAutoAssignSettings = async (updates) => {
        try {
            const res = await fetch(`${API_BASE}/settings/auto-assign`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (res.ok) {
                const data = await res.json();
                setAutoAssignSettings(data);
            }
        } catch (e) { console.error('Error saving auto assign:', e); }
    };

    const toggleDraftAgentPause = (agentId) => {
        const isPaused = draftPausedAgents.includes(agentId);
        let newPaused = [...draftPausedAgents];
        if (isPaused) {
            newPaused = newPaused.filter(id => id !== agentId);
        } else {
            newPaused.push(agentId);
        }
        setDraftPausedAgents(newPaused);
    };

    const handleSaveAutoAssignRules = async () => {
        await saveAutoAssignSettings({
            enabled: draftAutoAssignSettings.enabled,
            batch_size: draftAutoAssignSettings.batch_size
        });
        setIsAutoAssignModalOpen(false);
    };

    const handleSaveAgentStatus = async () => {
        await saveAutoAssignSettings({
            paused_agents: draftPausedAgents
        });
        setIsAgentStatusModalOpen(false);
    };

    const fetchChats = async ({ cursor = null } = {}) => {
        if (!session?.access_token) return;
        if (fetchChatsInFlightRef.current) return;
        fetchChatsInFlightRef.current = true;
        if (cursor) setIsLoadingMoreChats(true)
        if (!cursor && chatsRef.current.length === 0) setChatsLoadState('loading')
        try {
            // Pass current WA Account filter if selected
            let url = `${API_BASE}/conversations?limit=50`;
            if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
            if (selectedAccount !== 'All') {
                url += `&wa_account_id=${encodeURIComponent(selectedAccount)}`;
            }

            const res = await fetch(url, {
                headers: authHeaders
            });
            if (res.ok) {
                const data = await res.json();
                const conversations = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
                const formatted = conversations.map(conv => ({
                    id: conv.id, // Conversation ID
                    contactId: conv.contact?.id,
                    name: getDisplayName(conv.contact),
                    phone: conv.contact?.phone,
                    waId: conv.contact?.wa_id,
                    contact: conv.contact || null,
                    lastMessage: conv.last_message_preview || 'No messages',
                    lastMessageAt: conv.last_message_at ? new Date(conv.last_message_at) : null,
                    time: conv.last_message_at ? format(new Date(conv.last_message_at), 'h:mm a') : '',
                    // Prefer computed unread (based on message read status) over the legacy global counter.
                    unread: Number.isFinite(Number(conv.unread_for_user)) ? Number(conv.unread_for_user) : (Number(conv.unread_count) || 0),
                    // Derive read state from unread count to keep the badge correct.
                    userHasRead: (Number.isFinite(Number(conv.unread_for_user)) ? Number(conv.unread_for_user) : (Number(conv.unread_count) || 0)) === 0,
                    status: conv.status,
                    tags: conv.labels || [],
                    assigned_to: conv.assigned_to,
                    botEnabled: conv.bot_enabled !== false,
                    assignedBotId: conv.assigned_bot_id || null,
                    profilePhotoUrl: getProfilePhotoUrl(conv.contact),
                    type: 'text'
                }));
                // Sort by time (newest first)
                formatted.sort((a, b) => {
                    const aTime = a.lastMessageAt ? a.lastMessageAt.getTime() : 0;
                    const bTime = b.lastMessageAt ? b.lastMessageAt.getTime() : 0;
                    return bTime - aTime;
                });
                if (cursor) {
                    setChats(previous => {
                        const byId = new Map(previous.map(chat => [chat.id, chat]))
                        formatted.forEach(chat => byId.set(chat.id, chat))
                        return Array.from(byId.values()).sort((a, b) => {
                            const aTime = a.lastMessageAt ? a.lastMessageAt.getTime() : 0
                            const bTime = b.lastMessageAt ? b.lastMessageAt.getTime() : 0
                            return bTime - aTime
                        })
                    })
                } else {
                    setChats(formatted);
                    // Auto-select target conversation if opened from Scheduled Meetings
                    try {
                        const params = new URLSearchParams(window.location.search);
                        const targetConvId = params.get('conversationId');
                        const targetPhone = params.get('phone');
                        if ((targetConvId || targetPhone) && formatted.length > 0) {
                            const found = formatted.find(c =>
                                (targetConvId && idsEqual(c.id, targetConvId)) ||
                                (targetPhone && (c.phone === targetPhone || c.contact?.phone === targetPhone || c.contact?.whatsapp_number === targetPhone))
                            );
                            if (found) {
                                setSelectedChat(found);
                                window.history.replaceState({}, document.title, window.location.pathname);
                            }
                        }
                    } catch (e) {}
                }
                setNextConversationCursor(data?.next_cursor || null)
                setChatsLoadState('success')
                fetchMissingProfilePhotos(formatted);
            } else {
                const body = await res.text().catch(() => '')
                console.error('Failed to fetch chats:', res.status, body)
                if (chatsRef.current.length === 0) setChatsLoadState('error')
            }
        } catch (e) {
            console.error("Failed to fetch chats", e);
            if (chatsRef.current.length === 0) setChatsLoadState('error')
        } finally {
            fetchChatsInFlightRef.current = false;
            setIsLoadingMoreChats(false)
            lastChatListSyncRef.current = Date.now();
        }
    };

    // Fetch available bot agents
    const fetchBots = async () => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/agents`, {
                headers: authHeaders
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableBots(data.filter(bot => bot.is_active));
            }
        } catch (e) {
            console.error("Failed to fetch bots", e);
        }
    };

    // Fetch bot status for current conversation
    const fetchConversationBotStatus = async (conversationId) => {
        const conversation = chatsRef.current.find(chat => chat.id === conversationId)
        if (conversation) {
            setBotEnabled(conversation.botEnabled !== false)
            setSelectedBotId(conversation.assignedBotId || null)
        }
    };

    const scheduleChatRefresh = () => {
        if (chatRefreshTimerRef.current) return
        chatRefreshTimerRef.current = window.setTimeout(() => {
            chatRefreshTimerRef.current = null
            void fetchChats()
        }, 250)
    }

    useEffect(() => () => {
        if (chatRefreshTimerRef.current) window.clearTimeout(chatRefreshTimerRef.current)
    }, [])

    // Toggle bot for current conversation
    const toggleBotForConversation = async (enabled, botId = null) => {
        if (!selectedChat || !session?.access_token) return;

        try {
            const res = await fetch(`${API_BASE}/conversations/${selectedChat.id}/bot`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    bot_enabled: enabled,
                    assigned_bot_id: botId
                })
            });

            if (res.ok) {
                setBotEnabled(enabled);
                setSelectedBotId(botId);
                setShowBotMenu(false);
            }
        } catch (e) {
            console.error("Failed to toggle bot", e);
        }
    };

    const fetchTeamMembers = async () => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/team/members`, {
                headers: authHeaders
            });
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data);
            } else { }
        } catch (err) {
            console.error("Failed to fetch team members:", err);
        }
    };


    const assignAgent = async (conversationId, agentId) => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/conversations/${conversationId}/assign`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify({ agent_id: agentId || null })
            });
            if (res.ok) {
                const normalizedAgentId = agentId || null
                setChats(prev => prev.map(c =>
                    c.id === conversationId ? { ...c, assigned_to: normalizedAgentId } : c
                ));
                if (selectedChat?.id === conversationId) {
                    setSelectedChat(prev => ({ ...prev, assigned_to: normalizedAgentId }));
                }
            } else {
                const body = await res.text().catch(() => '')
                console.error("Failed to assign agent:", res.status, body)
            }
        } catch (err) {
            console.error("Failed to assign agent:", err);
        }
    };

    const getAgentName = (agentId) => {
        if (!agentId) return 'Unassigned';
        const member = teamMembers.find(m => m.user_id === agentId);
        return member ? member.name : 'Unknown Agent';
    };

    const getBotName = (botId) => {
        if (!botId) return 'AI Agent';
        const bot = availableBots.find(b => String(b.id) === String(botId));
        return bot ? bot.name : 'AI Agent';
    };

    useEffect(() => {
        if (session?.access_token) {
            fetchTeamMembers();
        }
    }, [session]);


    const fetchMessages = async (chat, opts = {}) => {
        if (!chat || !session?.access_token) return
        const targetChatId = chat.id
        const requestKey = `${chat.id}:${opts.mode || 'replace'}:${opts.before || 'latest'}`
        if (fetchMessagesInFlightRef.current.has(requestKey)) return
        fetchMessagesInFlightRef.current.add(requestKey)
        try {
            const limit = opts.limit || 40
            const before = opts.before || null
            const url = new URL(`${API_BASE}/messages/${chat.id}`)
            url.searchParams.set('limit', String(limit))
            if (before) url.searchParams.set('before', before)

            const res = await fetch(url.toString(), {
                headers: authHeaders
            })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                console.error('Failed to fetch messages:', res.status, body)
                if (selectedChatRef.current?.id === targetChatId) {
                    setIsThreadLoading(false)
                }
                return
            }

            const data = await res.json().catch(() => [])
            const formatted = (Array.isArray(data) ? data : []).map(formatMessageFromDb).filter(Boolean)

            const hasMore = formatted.length >= limit

            // If the user has switched chats, only update background cache, discard React state updates
            if (selectedChatRef.current?.id !== targetChatId) {
                const currentCache = chatMessagesCacheRef.current[targetChatId] || []
                chatMessagesCacheRef.current[targetChatId] = mergeMessages(currentCache, formatted)
                chatHasMoreCacheRef.current[targetChatId] = hasMore
                return
            }

            setHasMoreMessages(hasMore)
            chatHasMoreCacheRef.current[chat.id] = hasMore

            if (opts.mode === 'prepend') {
                const el = messagesListRef.current
                const prevScrollHeight = el ? el.scrollHeight : 0

                setMessages(prev => {
                    const merged = mergeMessages(prev, formatted)
                    loadedMessagesChatIdRef.current = chat.id
                    chatMessagesCacheRef.current[chat.id] = merged
                    return merged
                })

                requestAnimationFrame(() => {
                    if (!el) return
                    const nextScrollHeight = el.scrollHeight
                    const delta = nextScrollHeight - prevScrollHeight
                    el.scrollTop = el.scrollTop + delta
                })
            } else {
                setMessages(prev => {
                    const merged = mergeMessages(prev, formatted, { replace: !opts.silent })
                    loadedMessagesChatIdRef.current = chat.id
                    chatMessagesCacheRef.current[chat.id] = merged
                    return merged
                })

                if (!opts.silent) {
                    setNewMessagesPending(0)
                    setShowJumpToLatest(false)
                    requestAnimationFrame(() => {
                        const el = messagesListRef.current
                        if (el) {
                            el.scrollTop = el.scrollHeight
                        }
                        setIsThreadLoading(false)
                    })
                } else {
                    setIsThreadLoading(false)
                }
            }
        } catch (e) {
            console.error('Failed to fetch messages', e)
            if (selectedChatRef.current?.id === targetChatId) {
                setIsThreadLoading(false)
            }
        } finally {
            fetchMessagesInFlightRef.current.delete(requestKey)
            if (!opts.mode || opts.mode === 'replace') lastActiveSyncRef.current = Date.now()
        }
    }

    useEffect(() => {
        if (!session?.access_token || !organizationId || isProfileLoading) return

        // Inbox-critical data starts together once authenticated tenant context exists.
        fetchChats();
        // Secondary controls hydrate independently and never block the inbox shell.
        void Promise.allSettled([
            fetchBots(),
            fetchAutoAssignSettings(),
            fetchOrgAgents(),
        ]);
    }, [organizationId, isProfileLoading, session?.access_token, selectedAccount]); // Re-fetch when tenant/account context changes

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const phoneParam = params.get('phone') || params.get('waId') || params.get('wa_id');
        if (phoneParam && chats.length > 0) {
            const cleanPhone = phoneParam.replace(/[^0-9]/g, '');
            const targetChat = chats.find(c => {
                const chatPhone = String(c.phone || c.waId || '').replace(/[^0-9]/g, '');
                return chatPhone === cleanPhone;
            });
            if (targetChat) {
                setSelectedChat(targetChat);
                // Clean the search params from url
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    }, [chats]);

    useEffect(() => {
        if (!selectedChat) {
            setBotEnabled(false);
            setSelectedBotId(null);
            setNewMessagesPending(0);
            setShowJumpToLatest(false);
            setMessages([]);
            loadedMessagesChatIdRef.current = null;
            setHiddenMessageKeys(new Set());
            return;
        }

        lastOpenTimeRef.current = Date.now()
        setHiddenMessageKeys(new Set());
        setNewMessagesPending(0)
        setShowJumpToLatest(false)

        const cached = chatMessagesCacheRef.current[selectedChat.id]
        if (cached && Array.isArray(cached) && cached.length > 0) {
            // Load cached messages instantly
            setMessages(cached)
            loadedMessagesChatIdRef.current = selectedChat.id
            setHasMoreMessages(chatHasMoreCacheRef.current[selectedChat.id] ?? false)
            setIsThreadLoading(false)

            // Instantly position scrollbar to bottom
            requestAnimationFrame(() => {
                const el = messagesListRef.current
                if (el) {
                    el.scrollTop = el.scrollHeight
                }
            })

            // Silent background update to keep cache fresh
            fetchMessages(selectedChat, { limit: 40, silent: true })
        } else {
            // Fetch from scratch
            setIsThreadLoading(true)
            setMessages([])
            loadedMessagesChatIdRef.current = null
            fetchMessages(selectedChat, { limit: 40 })
        }

        fetchConversationBotStatus(selectedChat.id) // Fetch bot status for this conversation

        // Optimistically clear unread badge immediately when opening a chat.
        setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, userHasRead: true, unread: 0 } : c))

        const t = setTimeout(() => {
            if (!session?.access_token) return;
            const payload = user?.id ? { user_id: user.id } : {}
            fetch(`${API_BASE}/conversations/${selectedChat.id}/read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(payload)
            }).catch(() => undefined)
        }, 300)

        return () => clearTimeout(t)
    }, [selectedChat]);

    const loadOlder = async () => {
        if (!selectedChat || isLoadingOlder || !hasMoreMessages) return
        const oldest = messages[0]
        if (!oldest?.createdAt) return

        setIsLoadingOlder(true)
        try {
            await fetchMessages(selectedChat, {
                mode: 'prepend',
                limit: 50,
                before: oldest.createdAt.toISOString(),
            })
        } finally {
            setIsLoadingOlder(false)
        }
    }

    // Supabase Realtime Listener (Replaces long-polling/socket for instant updates)
    useEffect(() => {
        if (!session?.access_token || !memberProfile?.organization_id) return;

        const channel = supabase
            .channel(`public:w_messages_livechat:${memberProfile.organization_id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'w_messages',
                filter: `organization_id=eq.${memberProfile.organization_id}`
            }, (payload) => {
                const newMsg = payload.new;

                // Extract relevant details for notification
                const activeChat = selectedChatRef.current;
                const inbound = newMsg.direction === 'inbound';
                const convId = newMsg.conversation_id;

                // Check if we should play a notification
                const targetChat = chatsRef.current.find(c => idsEqual(c?.id, convId));
                // We play sound if it's inbound, we have a convId, it's NOT the active chat we are looking at
                const shouldPlayNotificationSound = inbound && convId && (!activeChat || !idsEqual(activeChat.id, convId));

                if (shouldPlayNotificationSound) {
                    playNotification({ messageId: String(newMsg.id || newMsg.wa_message_id) });
                }

                // Trigger UI updates instantly
                scheduleChatRefresh();
                if (activeChat && idsEqual(activeChat.id, convId)) {
                    fetchMessages(activeChat, { limit: 50, silent: true });
                }
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'w_conversations',
                filter: `organization_id=eq.${memberProfile.organization_id}`
            }, () => {
                scheduleChatRefresh();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session?.access_token, memberProfile?.organization_id, playNotification]);

    // Socket Listener
    useEffect(() => {
        if (!memberProfile?.organization_id) return

        const handleConnect = () => {
            // Socket transport is separate from WA connection state; keep logs minimal.
            console.log('[socket] connected', socket.id)

            // Re-join org room on reconnect if profile is available
            if (memberProfile?.organization_id) {
                console.log('[socket] joining org room:', memberProfile.organization_id)
                socket.emit('join_org', memberProfile.organization_id, memberProfile.user_id)
                if (user?.id) {
                    socket.emit('agent_connected', { organization_id: memberProfile.organization_id, user_id: user.id })
                }

                // Fetch unread counts when socket reconnects
                fetchChats()
            }
            const active = selectedChatRef.current
            if (active) fetchMessages(active, { limit: 50 })
        }

        const handleConnectError = (err) => {
            console.error('[socket] connect_error', err?.message || err)
        }

        const handleDisconnect = (reason) => {
            console.warn('[socket] disconnected', reason)
        }

        // Join org room immediately if connected and profile just loaded
        if (socket.connected && memberProfile?.organization_id) {
            console.log('[socket] joining org room (manual):', memberProfile.organization_id)
            socket.emit('join_org', memberProfile.organization_id, memberProfile.user_id)
            if (user?.id) {
                socket.emit('agent_connected', { organization_id: memberProfile.organization_id, user_id: user.id })
            }
        }

        const handleNewMessage = (msg) => {
            if (msg?.type === 'reaction' || msg?.type === 'protocol' || msg?.type === 'system') return

            const convId = msg?.conversation_id
            const createdAt = msg?.created_at ? new Date(msg.created_at) : new Date()

            const activeChat = selectedChatRef.current

            const conversationExists = convId ? chatsRef.current.some(c => idsEqual(c?.id, convId)) : true

            const pageFocused = typeof document !== 'undefined'
                ? (!document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true))
                : true
            const inbound = (msg?.sender || 'user') !== 'agent'
            const targetChat = convId ? chatsRef.current.find(c => idsEqual(c?.id, convId)) : null
            const shouldPlayNotificationSound = inbound && convId && !idsEqual(activeChat?.id, convId) && !isChatMuted(targetChat)

            if (shouldPlayNotificationSound) {
                playNotification({
                    messageId: String(msg?.message_id || msg?.wa_message_id || msg?.id || `${convId}-${createdAt.getTime()}`),
                })
            }

            if (convId) {
                setChats(prev => {
                    const copy = [...prev]
                    const idx = copy.findIndex(c => idsEqual(c?.id, convId))
                    if (idx < 0) {
                        const maybeName = typeof msg?.name === 'string' ? msg.name.trim() : ''
                        const usableName = (maybeName && !maybeName.includes('@') && !/^\d+$/.test(maybeName)) ? maybeName : ''
                        const display = usableName || (formatPhoneForDisplay(msg?.phone || msg?.from) || 'Unknown')
                        const createdTime = createdAt
                        const typeLabel = msg?.type ? String(msg.type) : ''
                        const preview = msg?.text || (typeLabel ? `[${typeLabel.charAt(0).toUpperCase()}${typeLabel.slice(1)}]` : 'New message')

                        const placeholder = {
                            id: convId,
                            contactId: msg?.contact_id || null,
                            name: display,
                            phone: msg?.phone || msg?.from || null,
                            waId: msg?.from || null,
                            contact: null,
                            lastMessage: preview,
                            lastMessageAt: createdTime,
                            time: format(createdTime, 'h:mm a'),
                            unread: 1,
                            userHasRead: false,
                            status: 'open',
                            tags: [],
                            assigned_to: msg?.assigned_to || null,
                            type: 'text'
                        }

                        return [placeholder, ...copy]
                    }

                    const current = copy[idx]
                    const typeLabel = msg?.type ? String(msg.type) : ''
                    const preview = msg?.text || (typeLabel ? `[${typeLabel.charAt(0).toUpperCase()}${typeLabel.slice(1)}]` : 'New message')
                    const isViewing = idsEqual(activeChat?.id, convId) && pageFocused

                    // If I'm actively viewing this chat, treat inbound as read immediately.
                    const unreadInc = (inbound && !isViewing) ? 1 : 0
                    const nextUnread = isViewing ? 0 : (unreadInc ? (current.unread || 0) + 1 : (current.unread || 0))

                    const patched = {
                        ...current,
                        lastMessage: preview,
                        lastMessageAt: createdAt,
                        time: format(createdAt, 'h:mm a'),
                        unread: nextUnread,
                        userHasRead: nextUnread === 0,
                    }

                    copy.splice(idx, 1)
                    return [patched, ...copy]
                })

                // If the sidebar doesn't know this conversation yet, refresh from server
                // so we get correct name/contact/tags/unread.
                if (!conversationExists) {
                    scheduleChatRefresh()
                }
            }

            // If this message belongs to currently open chat
            if (activeChat) {
                // Check match. Msg might have conversation_id or phone
                const msgPhoneKey = normalizeAccountKey(msg.phone || msg.from)
                const chatPhoneKey = normalizeAccountKey(activeChat.phone)

                const isMatch = (msg.conversation_id && idsEqual(msg.conversation_id, activeChat.id)) ||
                    (msgPhoneKey && chatPhoneKey && msgPhoneKey === chatPhoneKey) ||
                    (msg.contact_id && idsEqual(activeChat.contactId, msg.contact_id));

                if (isMatch) {
                    setMessages(prev => mergeMessages(prev, normalizeSocketMessage(msg)));

                    const nearBottom = isNearBottom()

                    // Only mark read when the user is actually looking at the latest messages.
                    if (user?.id && nearBottom && pageFocused && session?.access_token) {
                        setTimeout(() => {
                            fetch(`${API_BASE}/conversations/${activeChat.id}/read`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`
                                },
                                body: JSON.stringify({ user_id: user.id })
                            }).catch(() => undefined)
                        }, 250)
                    }


                } else if (msg?.conversation_id && idsEqual(msg.conversation_id, activeChat.id)) {
                    // Fallback: if the server emitted a message for the active conversation but our match logic missed,
                    // re-fetch to keep UI in sync.
                    setTimeout(() => {
                        fetchMessages(activeChat)
                    }, 150)
                }
            }
        };

        const handleContactUpdated = (payload) => {
            const updated = payload?.contact
            if (!updated) return

            setChats(prev => prev.map(c => {
                const sameById = updated?.id && idsEqual(c?.contactId, updated.id)
                const sameByWa = updated?.wa_id && String(c?.waId || '') === String(updated.wa_id)
                if (!sameById && !sameByWa) return c

                const nextContact = { ...(c.contact || {}), ...updated }
                return {
                    ...c,
                    contactId: updated?.id || c.contactId,
                    waId: updated?.wa_id || c.waId,
                    phone: updated?.phone || c.phone,
                    contact: nextContact,
                    name: getDisplayName(nextContact),
                    profilePhotoUrl: getProfilePhotoUrl(nextContact),
                }
            }))

            const active = selectedChatRef.current
            if (active && updated?.id && idsEqual(active?.contactId, updated.id)) {
                setSelectedChat(prev => {
                    if (!prev) return prev
                    const nextContact = { ...(prev.contact || {}), ...updated }
                    return {
                        ...prev,
                        contactId: updated?.id || prev.contactId,
                        waId: updated?.wa_id || prev.waId,
                        phone: updated?.phone || prev.phone,
                        contact: nextContact,
                        name: getDisplayName(nextContact),
                        profilePhotoUrl: getProfilePhotoUrl(nextContact),
                    }
                })
            }
        }

        const handleConversationAssigned = (payload) => {
            const conversationId = payload?.conversation_id
            const assignedTo = payload?.assigned_to || null
            if (!conversationId) return

            setChats(prev => prev.map(c => idsEqual(c.id, conversationId) ? { ...c, assigned_to: assignedTo } : c))
            const active = selectedChatRef.current
            if (active && idsEqual(active.id, conversationId)) {
                setSelectedChat(prev => prev ? { ...prev, assigned_to: assignedTo } : prev)
            }

            if (assignedTo && user?.id && idsEqual(assignedTo, user.id)) {
                playNotification({
                    title: 'Chat Assigned To You',
                    body: 'A handoff chat has been automatically routed to you.'
                })
            }
        }


        socket.on('connect', handleConnect)
        socket.on('connect_error', handleConnectError)
        socket.on('disconnect', handleDisconnect)

        socket.on('new_message', handleNewMessage);
        socket.on('contact_updated', handleContactUpdated)
        socket.on('conversation_assigned', handleConversationAssigned)

        socket.on('agent_online', (data) => {
            console.log("Agent went online:", data);
            setTeamMembers(prev => prev.map(m => m.user_id === data.user_id ? { ...m, is_online: true } : m));
        });

        socket.on('agent_offline', (data) => {
            console.log("Agent went offline:", data);
            setTeamMembers(prev => prev.map(m => m.user_id === data.user_id ? { ...m, is_online: false } : m));
        });

        socket.on('message_updated', (update) => {
            const targetId = update?.message_id || null
            const targetWaId = update?.wa_message_id || null
            const nextReactions = Array.isArray(update?.reactions) ? update.reactions : null
            if (!nextReactions) return

            setMessages(prev => prev.map(m => {
                const match = (targetId && m.id === targetId) || (targetWaId && m.wa_message_id && m.wa_message_id === targetWaId)
                return match ? { ...m, reactions: nextReactions } : m
            }))
        })

        socket.on('message_status_update', (update) => {
            console.log("Status update received:", update);
            setMessages(prev => prev.map(m =>
                (m.wa_message_id && m.wa_message_id === update.wa_message_id)
                    ? { ...m, status: update.status }
                    : m
            ));
        });

        socket.on('connected_account', (account) => {
            console.log("Account connected:", account);
            // REST is the connection source of truth; refresh it instead of deriving
            // disconnected/connected UI from transport lifecycle events.
            void refetchAccounts()
        });

        socket.on('qr', (qr) => {
            console.log("QR Code received");
            setQrCode(qr);
            setConnectionStatus('Scan QR Code');
        });

        socket.on('status', (status) => {
            console.log("Status update:", status);
            setConnectionStatus(status);
            if (status === 'connected') {
                setQrCode('');
                void refetchAccounts()
            }
        });

        socket.on('session_not_found', () => {
            // Do not auto-request QR here. Only request when user clicks "Generate QR Code".
            console.log("Session not found. Waiting for user to request QR.");
            setQrCode('');
            setConnectionStatus('idle');
            // The REST account query remains authoritative; a missing Baileys session must
            // not erase a valid Meta Cloud API account from the inbox.
        });

        // Initialize Session (join once)
        let sessionId = localStorage.getItem('whatsapp_session_id');
        if (!sessionId) {
            sessionId = 'dashboard_session'; // Persistent default session
            localStorage.setItem('whatsapp_session_id', sessionId);
        }
        if (!socket.connected) {
            socket.connect();
        }
        socket.emit('join_session', sessionId, memberProfile.organization_id);

        return () => {
            socket.off('connect', handleConnect)
            socket.off('connect_error', handleConnectError)
            socket.off('disconnect', handleDisconnect)
            socket.off('new_message', handleNewMessage)
            socket.off('contact_updated', handleContactUpdated)
            socket.off('conversation_assigned', handleConversationAssigned)
            socket.off('agent_online')
            socket.off('agent_offline')
            socket.off('message_updated')
            socket.off('message_status_update');
            socket.off('connected_account');
            socket.off('qr');
            socket.off('status');
            socket.off('session_not_found');
        };
    }, [memberProfile?.organization_id, playNotification, refetchAccounts]);

    useEffect(() => {
        if (!session?.access_token) return

        const reconcile = ({ force = false } = {}) => {
            const now = Date.now()
            const visible = typeof document === 'undefined' || !document.hidden
            const active = selectedChatRef.current

            if (force || (visible && now - lastChatListSyncRef.current > CHAT_LIST_SYNC_MS)) {
                fetchChats()
            }

            if (active && (force || (visible && now - lastActiveSyncRef.current > ACTIVE_CHAT_SYNC_MS))) {
                fetchMessages(active, { limit: 50, silent: true })
            }
        }

        const interval = window.setInterval(() => reconcile(), 1000)
        const handleVisibility = () => {
            if (!document.hidden) reconcile({ force: true })
        }
        const handleFocus = () => reconcile({ force: true })
        const handleOnline = () => {
            if (!socket.connected) socket.connect()
            reconcile({ force: true })
        }

        document.addEventListener('visibilitychange', handleVisibility)
        window.addEventListener('focus', handleFocus)
        window.addEventListener('online', handleOnline)
        reconcile({ force: true })

        return () => {
            window.clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibility)
            window.removeEventListener('focus', handleFocus)
            window.removeEventListener('online', handleOnline)
        }
    }, [session?.access_token, selectedAccount])

    const renderReactionsPill = (msg) => {
        const list = Array.isArray(msg?.reactions) ? msg.reactions : []
        if (list.length === 0) return null

        const counts = new Map()
        for (const r of list) {
            const emoji = r?.emoji
            if (!emoji) continue
            counts.set(emoji, (counts.get(emoji) || 0) + 1)
        }
        if (counts.size === 0) return null

        return (
            <div className="pointer-events-none absolute -bottom-3 right-2 z-10">
                <div className="inline-flex min-h-5 items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] leading-none text-gray-800 shadow-sm">
                    {[...counts.entries()].slice(0, 4).map(([emoji, count]) => (
                        <span key={emoji} className="inline-flex items-center leading-none">
                            <EmojiAsset emoji={emoji} className="h-3.5 w-3.5" />
                            {count > 1 ? <span className="ml-0.5 text-[10px] font-semibold text-gray-500">{count}</span> : null}
                        </span>
                    ))}
                </div>
            </div>
        )
    }

    const closeMessageMenu = () => {
        setActiveMessageMenuId(null)
        setMessageMenuAnchor(null)
    }

    const openMessageMenu = (event, msg) => {
        event.stopPropagation()

        if (activeMessageMenuId === msg.id) {
            closeMessageMenu()
            return
        }

        const rect = event.currentTarget.getBoundingClientRect()
        const menuWidth = 224
        const menuHeight = 246
        const gap = 8
        const pagePadding = 12
        const spaceBelow = window.innerHeight - rect.bottom
        const shouldOpenUp = spaceBelow < menuHeight + gap + pagePadding

        const rawTop = shouldOpenUp ? rect.top - menuHeight - gap : rect.bottom + gap
        const top = Math.max(pagePadding, Math.min(rawTop, window.innerHeight - menuHeight - pagePadding))

        const alignRight = msg.sender === 'agent'
        const rawLeft = alignRight ? rect.right - menuWidth : rect.left
        const left = Math.max(pagePadding, Math.min(rawLeft, window.innerWidth - menuWidth - pagePadding))

        setActiveMessageMenuId(msg.id)
        setMessageMenuAnchor({ top, left, placement: shouldOpenUp ? 'top' : 'bottom' })
    }

    const updateMessageReactions = (messageId, waMessageId, reactions) => {
        setMessages(prev => prev.map(m => {
            const match = (messageId && idsEqual(m.id, messageId)) || (waMessageId && m.wa_message_id && m.wa_message_id === waMessageId)
            return match ? { ...m, reactions: Array.isArray(reactions) ? reactions : [] } : m
        }))
    }

    const sendReaction = async (msg, emoji) => {
        if (!msg?.id || !session?.access_token) return

        const from = user?.id || 'me'
        const now = new Date().toISOString()
        const current = Array.isArray(msg.reactions) ? msg.reactions : []
        const alreadySame = current.some(r => r?.from === from && r?.emoji === emoji)
        const optimistic = current.filter(r => r?.from !== from)
        if (!alreadySame) optimistic.push({ emoji, from, at: now })

        closeMessageMenu()
        updateMessageReactions(msg.id, msg.wa_message_id, optimistic)

        try {
            const res = await fetch(`${API_BASE}/messages/${msg.id}/reaction`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji: alreadySame ? null : emoji })
            })

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err?.error || 'Failed to update reaction')
            }

            const data = await res.json()
            updateMessageReactions(msg.id, msg.wa_message_id, data.reactions || [])
        } catch (err) {
            console.error('Reaction failed:', err)
            updateMessageReactions(msg.id, msg.wa_message_id, current)
            alertDialog(err?.message || 'Failed to update reaction', { title: 'Reaction failed', tone: 'danger' })
        }
    }

    const handleTextChange = (e) => {
        setMessageText(e.target.value)
    }

    const handleSendMessage = async (e) => {
        e.preventDefault()

        if (!messageText.trim() && !selectedFile) return

        // Internal notes are UI-only for now
        if (isInternalNote) {
            const newMessage = {
                id: Date.now(),
                text: messageText,
                sender: 'system',
                time: format(new Date(), 'h:mm a'),
                type: 'note',
                agentName: 'You'
            }
            setMessages(prev => [...prev, newMessage])
            setMessageText('')
            setReplyingTo(null)
            return
        }

        if (!selectedChat) return

        if (isCustomerWindowExpired) {
            alertDialog('The 24-hour WhatsApp reply window is closed for this contact. Send an approved template message instead.', {
                title: '24 Hour Limit',
                tone: 'warning',
            })
            return
        }

        const activeChatId = selectedChat.id

        // Audio send
        if (pendingAudio?.file) {
            const optimisticId = Date.now()
            const optimisticMessage = {
                id: optimisticId,
                text: messageText,
                sender: 'agent',
                time: format(new Date(), 'h:mm a'),
                type: 'audio',
                messageType: 'audio',
                mediaUrl: URL.createObjectURL(pendingAudio.file),
                mimeType: pendingAudio.file.type,
                fileName: pendingAudio.file.name,
                durationSeconds: pendingAudio.durationSeconds,
                agentName: 'You',
                status: 'sent'
            }
            setMessages(prev => [...prev, optimisticMessage])

            const captionToSend = messageText
            setMessageText('')
            setReplyingTo(null)
            setPendingAudio(null)
            setIsAudioPanelOpen(false)

            try {
                const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session'
                const form = new FormData()
                form.append('conversation_id', selectedChat.id)
                form.append('file', pendingAudio.file)
                if (captionToSend) form.append('caption', captionToSend)
                form.append('session_id', sessionId)
                if (Number.isFinite(Number(pendingAudio.durationSeconds))) {
                    form.append('duration_seconds', String(Math.round(Number(pendingAudio.durationSeconds))))
                }

                const res = await fetch(`${API_BASE}/messages/audio`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session?.access_token}` },
                    body: form,
                })

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err?.error || 'Failed to send audio')
                }

                await fetchMessages(selectedChat)
                await fetchChats()
            } catch (err) {
                console.error('Send audio failed:', err)
                if (CUSTOMER_WINDOW_ERROR_RE.test(err?.message || '')) markCustomerWindowExpired(activeChatId)
                setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m))
            }
            return
        }

        // Media send
        if (selectedFile) {
            const optimisticId = Date.now()
            const derivedType = selectedFile.type?.startsWith('image/') ? 'image'
                : selectedFile.type?.startsWith('video/') ? 'video'
                    : selectedFile.type?.startsWith('audio/') ? 'audio'
                        : 'document'

            const optimisticMessage = {
                id: optimisticId,
                text: messageText,
                sender: 'agent',
                time: format(new Date(), 'h:mm a'),
                type: derivedType,
                messageType: derivedType,
                mediaUrl: URL.createObjectURL(selectedFile),
                mimeType: selectedFile.type,
                fileName: selectedFile.name,
                agentName: 'You',
                status: 'sent'
            }
            setMessages(prev => [...prev, optimisticMessage])

            const captionToSend = messageText
            setMessageText('')
            setReplyingTo(null)
            setSelectedFile(null)

            try {
                const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session'
                const form = new FormData()
                form.append('file', selectedFile)
                form.append('caption', captionToSend)
                form.append('session_id', sessionId)

                const res = await fetch(`${API_BASE}/conversations/${selectedChat.id}/send-media`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session?.access_token}` },
                    body: form,
                })

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err?.error || 'Failed to send media')
                }

                await fetchMessages(selectedChat)
                await fetchChats()
            } catch (err) {
                console.error('Send media failed:', err)
                if (CUSTOMER_WINDOW_ERROR_RE.test(err?.message || '')) markCustomerWindowExpired(activeChatId)
                setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m))
            }
            return
        }

        // Optimistic UI
        const optimisticId = Date.now()
        const clientMessageId = `client-${optimisticId}-${Math.random().toString(36).slice(2)}`
        const optimisticMessage = {
            id: optimisticId,
            clientMessageId,
            text: messageText,
            sender: 'agent',
            createdAt: new Date(),
            time: format(new Date(), 'h:mm a'),
            type: 'text',
            agentName: 'You',
            status: 'sending',
            optimistic: true,
            quoted: replyingTo ? {
                wa_message_id: replyingTo.wa_message_id,
                text: replyingTo.text,
                type: replyingTo.type,
                direction: replyingTo.sender === 'agent' ? 'outbound' : 'inbound',
                found: true,
            } : null
        }
        setMessages(prev => mergeMessages(prev, optimisticMessage))
        const textToSend = messageText
        const replyToSend = replyingTo
        setMessageText('')
        setReplyingTo(null)

        try {
            const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session'
            const res = await fetch(`${API_BASE}/conversations/${selectedChat.id}/send`, {
                method: 'POST',
                headers: {
                    ...authHeaders,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: textToSend, session_id: sessionId, reply_to_message_id: replyToSend?.wa_message_id || null, client_message_id: clientMessageId })
            })

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err?.error || 'Failed to send')
            }

            const data = await res.json().catch(() => ({}))
            if (data?.message) {
                const storedMessage = formatMessageFromDb({
                    ...data.message,
                    text_body: data.message.content?.text || textToSend,
                    content: {
                        ...(data.message.content || {}),
                        client_message_id: clientMessageId,
                    },
                    direction: data.message.direction || 'outbound',
                    created_at: data.message.created_at || new Date().toISOString(),
                })
                if (storedMessage) {
                    storedMessage.clientMessageId = clientMessageId
                    setMessages(prev => mergeMessages(prev, storedMessage))
                }
            }
            fetchChats()
        } catch (err) {
            console.error('Send failed:', err)
            if (CUSTOMER_WINDOW_ERROR_RE.test(err?.message || '')) markCustomerWindowExpired(activeChatId)
            // Mark as failed
            setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m))
        }
    }

    const renderMessageBody = (msg) => {
        const t = msg.messageType || (msg.sender === 'agent' ? 'text' : 'text')
        const template = msg.content?.template
        const quoted = msg.quoted || msg.content?.quoted || null
        const quotedText = quoted?.text || (quoted?.type && quoted.type !== 'text' ? `[${quoted.type}]` : '')

        if (template) {
            const headerUrl = template.header?.media_url
                ? (String(template.header.media_url).startsWith('http') ? template.header.media_url : `${BACKEND_BASE}${template.header.media_url}`)
                : null
            const headerType = String(template.header?.type || '').toLowerCase()
            const buttons = Array.isArray(template.buttons) ? template.buttons.filter(button => button?.text) : []

            return (
                <div className="flex flex-col w-[300px] sm:w-[320px] max-w-[85vw]">
                    {msg.forwarded && (
                        <div className="px-3 pt-2">
                            <ForwardedIndicator />
                        </div>
                    )}
                    {headerUrl && headerType === 'image' && (
                        <img
                            src={headerUrl}
                            alt={template.name || 'Template header'}
                            className="h-48 w-full object-cover rounded-t-[7.5px]"
                            loading="lazy"
                        />
                    )}
                    {headerUrl && headerType === 'video' && (
                        <video
                            src={headerUrl}
                            controls
                            className="h-48 w-full object-cover rounded-t-[7.5px]"
                        />
                    )}
                    {headerUrl && headerType === 'document' && (
                        <a
                            href={headerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 border-b border-[#e9edef] px-3 py-3 text-sm font-medium text-indigo-700"
                        >
                            <FileText className="h-4 w-4" />
                            View document
                        </a>
                    )}
                    <div className="space-y-1 px-2.5 pt-1.5 pb-2">
                        <p className="whitespace-pre-wrap text-[14.2px] leading-[19px] tracking-normal text-[#111b21]">{template.body || msg.text}</p>
                        {template.footer && (
                            <p className="whitespace-pre-wrap text-[13px] leading-[18px] text-[#667781] mt-1">{template.footer}</p>
                        )}
                        <div className="pt-0.5">
                            {renderMessageMeta(msg, 'mt-0')}
                        </div>
                    </div>
                    {buttons.length > 0 && (
                        <div className="divide-y divide-[#e9edef] border-t border-[#e9edef]">
                            {buttons.map((button, index) => {
                                const type = String(button.type || '').toUpperCase()
                                const href = type === 'URL' ? button.url : type === 'PHONE_NUMBER' ? `tel:${button.phone_number || ''}` : ''
                                const Icon = type === 'PHONE_NUMBER' ? Phone : ExternalLink

                                return href ? (
                                    <a
                                        key={`${button.text}-${index}`}
                                        href={href}
                                        target={type === 'URL' ? '_blank' : undefined}
                                        rel={type === 'URL' ? 'noreferrer' : undefined}
                                        className="flex items-center justify-center gap-2 px-3 py-2.5 text-[14.5px] text-[#00a884] hover:bg-gray-50 transition-colors"
                                    >
                                        <Icon className="h-[18px] w-[18px]" />
                                        {button.text}
                                    </a>
                                ) : (
                                    <div
                                        key={`${button.text}-${index}`}
                                        className="flex items-center justify-center px-3 py-2.5 text-[14.5px] text-[#00a884] hover:bg-gray-50 transition-colors cursor-default"
                                    >
                                        {button.text}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )
        }

        const resolvedUrl = msg.mediaUrl
            ? (String(msg.mediaUrl).startsWith('http') ? msg.mediaUrl : `${BACKEND_BASE}${msg.mediaUrl}`)
            : null

        if (resolvedUrl) {
            if (t === 'sticker') {
                const mime = String(msg.mimeType || '')
                if (mime.startsWith('video/')) {
                    return (
                        <div className="space-y-2">
                            <video
                                src={resolvedUrl}
                                className="h-36 w-36 rounded-lg"
                                muted
                                loop
                                playsInline
                                autoPlay
                            />
                        </div>
                    )
                }

                return (
                    <div className="space-y-2">
                        <img
                            src={resolvedUrl}
                            alt={msg.fileName || 'Sticker'}
                            className="h-36 w-36 object-contain"
                            loading="lazy"
                        />
                    </div>
                )
            }

            if (t === 'image') {
                return (
                    <div className="space-y-2">
                        <img
                            src={resolvedUrl}
                            alt={msg.fileName || 'Image'}
                            className="max-h-64 w-auto rounded-lg border border-gray-200"
                            loading="lazy"
                        />
                        {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                    </div>
                )
            }

            if (t === 'video') {
                return (
                    <div className="space-y-2">
                        <video
                            src={resolvedUrl}
                            controls
                            className="max-h-64 w-auto rounded-lg border border-gray-200"
                        />
                        {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                    </div>
                )
            }

            if (t === 'audio') {
                return (
                    <div className="space-y-2">
                        <AudioMessageBubble
                            id={msg.id}
                            mediaUrl={resolvedUrl}
                            durationSeconds={msg.durationSeconds}
                            isMine={msg.sender === 'agent'}
                            status={msg.status}
                        />
                        {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                    </div>
                )
            }

            // document
            return (
                <div className="space-y-2">
                    <a
                        href={resolvedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-indigo-700 underline break-all"
                    >
                        {msg.fileName || 'Document'}
                    </a>
                    {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                </div>
            )
        }

        const interactive = msg.content?.interactive
        if (interactive?.type === 'button') {
            const numButtons = interactive.buttons?.length || 0;
            return (
                <div className="flex flex-col w-[300px] sm:w-[320px] max-w-[85vw]">
                    <div className="relative px-2.5 pt-1.5 pb-2">
                        <div className="space-y-1">
                            {interactive.header?.text && (
                                <p className="font-bold text-[14.2px] leading-[19px] text-[#111b21]">{interactive.header.text}</p>
                            )}
                            <p className="whitespace-pre-wrap text-[14.2px] leading-[19px] tracking-normal text-[#111b21]">{interactive.body || interactive.body?.text || msg.text}</p>
                            {interactive.footer && (
                                <p className="whitespace-pre-wrap text-[13px] leading-[18px] text-[#667781] mt-1">{interactive.footer?.text || interactive.footer}</p>
                            )}
                        </div>
                        <div className="pt-0.5">
                            {renderMessageMeta(msg, 'mt-0')}
                        </div>
                    </div>
                    {numButtons > 0 && (
                        <div className={`flex bg-white rounded-b-[7.5px] overflow-hidden ${numButtons <= 2 ? 'flex-row' : 'flex-col'}`}>
                            {(interactive.buttons || []).filter(Boolean).map((btn, idx) => (
                                <div
                                    key={btn?.id || idx}
                                    className={`flex-1 px-2 py-[11px] text-[15px] tracking-wide text-[#00a884] flex items-center justify-center cursor-default text-center border-t border-[#e9edef] ${
                                        numButtons <= 2 && idx > 0 ? 'border-l' : ''
                                    }`}
                                >
                                    {btn?.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )
        }

        return (
            <div className={msg.forwarded ? 'space-y-0.5' : 'space-y-1.5'}>
                {msg.forwarded && (
                    <ForwardedIndicator />
                )}
                {quoted && (
                    <div className={`rounded-md border-l-4 px-2.5 py-1.5 text-xs ${msg.sender === 'agent'
                        ? 'border-green-500 bg-green-100/80 text-gray-700'
                        : 'border-indigo-500 bg-gray-50 text-gray-700'
                        }`}>
                        <div className="mb-0.5 font-semibold text-indigo-600">
                            {quoted.direction === 'outbound' ? 'You' : (selectedChat?.name || 'Contact')}
                        </div>
                        <div className="line-clamp-2 whitespace-pre-wrap text-gray-600">
                            {quotedText || 'Original message'}
                        </div>
                    </div>
                )}
                {msg.text ? <p className="whitespace-pre-wrap text-[14.2px] leading-[19px] tracking-normal text-[#111b21]">{msg.text}</p> : null}
            </div>
        )
    }

    const renderMessageMeta = (msg, className = '') => (
        <div className={`ml-5 flex select-none items-center justify-end gap-0.5 text-right text-[11px] leading-3 text-[#667781]/80 ${msg.forwarded ? 'mt-0.5' : 'mt-1'} ${className}`}>
            {msg.time}
            {msg.sender === 'agent' && (
                msg.status === 'sending' ? <Clock className="h-3 w-3 text-gray-400" /> :
                    msg.status === 'failed' ? <AlertCircle className="h-3 w-3 text-red-500" /> :
                        msg.status === 'read' ? <CheckCheck className="h-3 w-3 text-blue-500" /> :
                            msg.status === 'delivered' ? <CheckCheck className="h-3 w-3 text-gray-400" /> :
                                <Check className="h-3 w-3 text-gray-400" />
            )}
        </div>
    )

    const renderMessageSourceBadge = (msg, isZeroPadding = false) => {
        if (msg.sender !== 'agent' || msg.forwarded) return null;

        const source = msg.automationSource || msg.automation_source || msg.metadata?.automation_source;
        const senderType = msg.senderType || msg.sender_type;

        let label = msg.agentName || 'You';
        let colorClass = 'text-[#6676ff]'; // Default color for You

        if (source === 'flow' || msg.metadata?.flow_id) {
            label = msg.metadata?.flow_name || 'Flow';
            colorClass = 'text-[#0284c7]';
        } else if (source === 'ai_agent' || msg.isBotReply || msg.botAgentId) {
            label = msg.botAgentName || getBotName(msg.botAgentId) || 'AI Agent';
            colorClass = 'text-[#059669]';
        } else if (source === 'broadcast') {
            label = 'Broadcast';
            colorClass = 'text-[#9333ea]';
        } else if (senderType === 'human_agent') {
            label = msg.agentName || 'You';
        }

        return (
            <div className={`mb-0.5 text-[13px] font-medium leading-4 ${colorClass} ${isZeroPadding ? 'px-2.5 pt-1.5' : ''}`}>
                {label}
            </div>
        );
    }

    const startReplyToMessage = (msg) => {
        setReplyingTo({
            id: msg.id,
            wa_message_id: msg.wa_message_id,
            text: msg.text || msg.fileName || `[${msg.type || 'message'}]`,
            type: msg.type || 'text',
            sender: msg.sender,
        })
        closeMessageMenu()
        requestAnimationFrame(() => messageInputRef.current?.focus?.())
    }

    const getForwardableText = (msg) => {
        const template = msg?.content?.template
        if (template?.body) return template.body
        if (msg?.content?.text) return msg.content.text
        if (msg?.text) return msg.text
        if (msg?.fileName) return msg.fileName
        return ''
    }

    const forwardMessage = (msg) => {
        const text = getForwardableText(msg)
        if (!text.trim()) {
            alertDialog('Only text/caption messages can be forwarded right now.', { title: 'Forward unavailable', tone: 'warning' })
            closeMessageMenu()
            return
        }

        closeMessageMenu()
        setForwardingMessage(msg)
        setForwardSearch('')
        setForwardSelectedIds([])
    }

    const closeForwardModal = () => {
        if (isForwarding) return
        setForwardingMessage(null)
        setForwardSearch('')
        setForwardSelectedIds([])
    }

    const toggleForwardRecipient = (chatId) => {
        setForwardSelectedIds(prev => (
            prev.some(id => idsEqual(id, chatId))
                ? prev.filter(id => !idsEqual(id, chatId))
                : [...prev, chatId]
        ))
    }

    const sendForwardedMessages = async () => {
        if (!forwardingMessage || forwardSelectedIds.length === 0) return

        const text = getForwardableText(forwardingMessage)
        if (!text.trim()) return

        setIsForwarding(true)
        const activeWasTarget = selectedChat && forwardSelectedIds.some(id => idsEqual(id, selectedChat.id))
        const optimisticId = `forward-${Date.now()}`
        if (activeWasTarget) {
            setMessages(prev => [...prev, {
                id: optimisticId,
                text,
                sender: 'agent',
                time: format(new Date(), 'h:mm a'),
                type: 'text',
                messageType: 'text',
                agentName: 'You',
                status: 'sending',
                forwarded: true,
                content: { text, forwarded: true },
            }])
        }
        try {
            const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session'
            for (const conversationId of forwardSelectedIds) {
                const res = await fetch(`${API_BASE}/conversations/${conversationId}/send`, {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        session_id: sessionId,
                        forward_from_message_id: forwardingMessage.wa_message_id || forwardingMessage.id
                    })
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err?.error || 'Failed to forward message')
                }
            }

            if (activeWasTarget) await fetchMessages(selectedChat)
            await fetchChats()
            setForwardingMessage(null)
            setForwardSearch('')
            setForwardSelectedIds([])
        } catch (err) {
            console.error('Forward failed:', err)
            if (activeWasTarget) {
                setMessages(prev => prev.map(m => idsEqual(m.id, optimisticId) ? { ...m, status: 'failed' } : m))
            }
            alertDialog(err?.message || 'Failed to forward message', { title: 'Forward failed', tone: 'danger' })
        } finally {
            setIsForwarding(false)
        }
    }

    const copyMessageText = async (msg) => {
        const text = msg.text || msg.fileName || ''
        if (!text) return
        try {
            await navigator.clipboard?.writeText(text)
        } catch {
            const area = document.createElement('textarea')
            area.value = text
            document.body.appendChild(area)
            area.select()
            document.execCommand('copy')
            document.body.removeChild(area)
        }
        closeMessageMenu()
    }

    const deleteMessageLocal = async (msg) => {
        const confirmed = await confirmDialog('Delete this message from this view?', {
            title: 'Delete message',
            tone: 'danger',
            confirmLabel: 'Delete message',
        })
        if (!confirmed) return
        const keys = [
            getMessageKey(msg),
            msg?.id ? String(msg.id) : '',
            msg?.wa_message_id ? String(msg.wa_message_id) : '',
            msg?.clientMessageId ? String(msg.clientMessageId) : '',
            msg?.client_message_id ? String(msg.client_message_id) : '',
            msg?.content?.client_message_id ? String(msg.content.client_message_id) : '',
        ].filter(Boolean)

        const dbMessageId = msg?.id && UUID_RE.test(String(msg.id)) ? String(msg.id) : ''
        if (dbMessageId && session?.access_token) {
            try {
                const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(dbMessageId)}`, {
                    method: 'DELETE',
                    headers: authHeaders,
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data?.error || 'Failed to delete message')

                if (data?.conversation_id) {
                    setChats(prev => prev.map(chat => (
                        idsEqual(chat.id, data.conversation_id)
                            ? { ...chat, lastMessage: data.last_message_preview || 'No messages' }
                            : chat
                    )))
                }
            } catch (err) {
                console.error('Failed to delete message from table:', err)
                alertDialog(err?.message || 'Failed to delete message from database', {
                    title: 'Delete message failed',
                    tone: 'danger',
                })
                closeMessageMenu()
                return
            }
        }

        setHiddenMessageKeys(prev => {
            const next = new Set(prev)
            keys.forEach(key => next.add(key))
            return next
        })
        setMessages(prev => prev.filter(item => {
            const itemKeys = [
                getMessageKey(item),
                item?.id ? String(item.id) : '',
                item?.wa_message_id ? String(item.wa_message_id) : '',
                item?.clientMessageId ? String(item.clientMessageId) : '',
                item?.client_message_id ? String(item.client_message_id) : '',
                item?.content?.client_message_id ? String(item.content.client_message_id) : '',
            ].filter(Boolean)

            return !itemKeys.some(itemKey => keys.some(key => itemKey === key || idsEqual(itemKey, key)))
        }))
        closeMessageMenu()
    }

    const getChatLabels = (chat) => (
        Array.isArray(chat?.tags) ? chat.tags.map(tag => String(tag).toLowerCase()) : []
    )

    const hasChatLabel = (chat, label) => getChatLabels(chat).includes(label)

    const getMutedUntil = (chat) => {
        const labels = getChatLabels(chat)
        const muteLabel = labels.find(label => label.startsWith(MUTED_UNTIL_LABEL_PREFIX))
        if (!muteLabel) return null
        const value = muteLabel.slice(MUTED_UNTIL_LABEL_PREFIX.length)
        const date = new Date(value)
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null
        return date
    }

    const isChatMuted = (chat) => !!getMutedUntil(chat)

    const stripMuteLabels = (labels) => labels.filter(label => !label.startsWith(MUTED_UNTIL_LABEL_PREFIX))

    const updateChatMeta = async (chat, patch) => {
        if (!chat?.id || !session?.access_token) return
        const previous = chats
        setActiveChatMenuId(null)
        setChats(prev => prev.map(item => idsEqual(item.id, chat.id) ? { ...item, ...patch } : item))
        if (selectedChat?.id && idsEqual(selectedChat.id, chat.id)) {
            setSelectedChat(prev => prev ? { ...prev, ...patch } : prev)
        }

        try {
            const body = {}
            if (Object.prototype.hasOwnProperty.call(patch, 'status')) body.status = patch.status
            if (Object.prototype.hasOwnProperty.call(patch, 'tags')) body.labels = patch.tags

            const res = await fetch(`${API_BASE}/conversations/${chat.id}/meta`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify(body)
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to update chat')
        } catch (err) {
            console.error('Failed to update chat', err)
            setChats(previous)
            if (selectedChat?.id && idsEqual(selectedChat.id, chat.id)) {
                setSelectedChat(previous.find(item => idsEqual(item.id, chat.id)) || selectedChat)
            }
            alertDialog(err?.message || 'Failed to update chat', { title: 'Chat update failed', tone: 'danger' })
        }
    }

    const toggleChatLabel = (chat, label) => {
        const labels = getChatLabels(chat)
        if (label === 'pinned' && !labels.includes('pinned')) {
            const pinnedCount = chats.filter(item => hasChatLabel(item, 'pinned')).length
            if (pinnedCount >= 4) {
                setActiveChatMenuId(null)
                alertDialog('You can pin up to 4 chats.', { title: 'Pin limit reached', tone: 'warning' })
                return
            }
        }
        const next = labels.includes(label)
            ? labels.filter(item => item !== label)
            : [...labels, label]
        updateChatMeta(chat, { tags: next })
    }

    const muteChatFor = (chat, hours) => {
        const mutedUntil = new Date(Date.now() + hours * 60 * 60 * 1000)
        const labels = stripMuteLabels(getChatLabels(chat))
        updateChatMeta(chat, { tags: [...labels, `${MUTED_UNTIL_LABEL_PREFIX}${mutedUntil.toISOString()}`] })
    }

    const unmuteChat = (chat) => {
        updateChatMeta(chat, { tags: stripMuteLabels(getChatLabels(chat)) })
    }

    const markChatUnread = async (chat) => {
        if (!chat?.id || !session?.access_token) return
        setActiveChatMenuId(null)
        try {
            const res = await fetch(`${API_BASE}/conversations/${chat.id}/unread`, {
                method: 'POST',
                headers: authHeaders
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to mark unread')
            setChats(prev => prev.map(item => idsEqual(item.id, chat.id) ? { ...item, unread: Math.max(1, Number(item.unread) || 0), userHasRead: false } : item))
            if (selectedChat?.id && idsEqual(selectedChat.id, chat.id)) {
                setSelectedChat(prev => prev ? { ...prev, unread: 1, userHasRead: false } : prev)
            }
        } catch (err) {
            console.error('Failed to mark unread', err)
            alertDialog(err?.message || 'Failed to mark unread', { title: 'Update failed', tone: 'danger' })
        }
    }

    const clearChat = async (chat) => {
        if (!chat?.id || !session?.access_token) return
        const confirmed = await confirmDialog(`Clear all messages in ${chat.name}?`, {
            title: 'Clear chat',
            tone: 'danger',
            confirmLabel: 'Clear messages',
        })
        if (!confirmed) return
        setActiveChatMenuId(null)
        try {
            const res = await fetch(`${API_BASE}/conversations/${chat.id}/clear`, {
                method: 'POST',
                headers: authHeaders
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to clear chat')
            setChats(prev => prev.map(item => idsEqual(item.id, chat.id) ? { ...item, lastMessage: 'No messages', unread: 0, userHasRead: true } : item))
            if (selectedChat?.id && idsEqual(selectedChat.id, chat.id)) {
                setMessages([])
                loadedMessagesChatIdRef.current = null
            }
        } catch (err) {
            console.error('Failed to clear chat', err)
            alertDialog(err?.message || 'Failed to clear chat', { title: 'Clear chat failed', tone: 'danger' })
        }
    }

    const deleteChat = async (chat) => {
        if (!chat?.id || !session?.access_token) return
        const confirmed = await confirmDialog(`Delete ${chat.name} and all messages from this inbox?`, {
            title: 'Delete chat',
            tone: 'danger',
            confirmLabel: 'Delete chat',
        })
        if (!confirmed) return
        setActiveChatMenuId(null)
        try {
            const res = await fetch(`${API_BASE}/conversations/${chat.id}`, {
                method: 'DELETE',
                headers: authHeaders
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to delete chat')
            setChats(prev => prev.filter(item => !idsEqual(item.id, chat.id)))
            if (selectedChat?.id && idsEqual(selectedChat.id, chat.id)) {
                setSelectedChat(null)
                setMessages([])
                loadedMessagesChatIdRef.current = null
            }
        } catch (err) {
            console.error('Failed to delete chat', err)
            alertDialog(err?.message || 'Failed to delete chat', { title: 'Delete chat failed', tone: 'danger' })
        }
    }

    const filteredMessages = messages.filter(msg => {
        const keys = [
            getMessageKey(msg),
            msg?.id ? String(msg.id) : '',
            msg?.wa_message_id ? String(msg.wa_message_id) : '',
            msg?.clientMessageId ? String(msg.clientMessageId) : '',
            msg?.client_message_id ? String(msg.client_message_id) : '',
            msg?.content?.client_message_id ? String(msg.content.client_message_id) : '',
        ].filter(Boolean)

        if (keys.some(key => hiddenMessageKeys.has(key))) return false
        if (selectedAccount === 'All') return true
        if (!msg.account) return true
        return normalizeAccountKey(msg.account) === normalizeAccountKey(selectedAccount)
    });

    const chatFilterCounts = useMemo(() => {
        const activeChats = chats.filter(chat => !['archived', 'closed'].includes(String(chat.status || 'open').toLowerCase()))
        return {
            all: activeChats.length,
            read: activeChats.filter(chat => (Number(chat.unread) || 0) === 0).length,
            unread: activeChats.filter(chat => (Number(chat.unread) || 0) > 0).length,
            assigned: activeChats.filter(chat => !!chat.assigned_to).length,
            unassigned: activeChats.filter(chat => !chat.assigned_to).length,
            favorites: activeChats.filter(chat => hasChatLabel(chat, 'favorite')).length,
            bot_enabled: activeChats.filter(chat => chat.botEnabled !== false).length,
            bot_disabled: activeChats.filter(chat => chat.botEnabled === false).length,
            archived: chats.filter(chat => ['archived', 'closed'].includes(String(chat.status || '').toLowerCase())).length,
        }
    }, [chats])

    const visibleChats = useMemo(() => {
        const query = chatSearch.trim().toLowerCase()

        return chats.filter(chat => {
            const unreadCount = Number(chat.unread) || 0
            const status = String(chat.status || 'open').toLowerCase()
            if (chatFilter !== 'archived' && ['archived', 'closed'].includes(status)) return false
            if (chatFilter === 'read' && unreadCount > 0) return false
            if (chatFilter === 'unread' && unreadCount === 0) return false
            if (chatFilter === 'assigned' && !chat.assigned_to) return false
            if (chatFilter === 'unassigned' && chat.assigned_to) return false
            if (chatFilter === 'favorites' && !hasChatLabel(chat, 'favorite')) return false
            if (chatFilter === 'bot_enabled' && chat.botEnabled === false) return false
            if (chatFilter === 'bot_disabled' && chat.botEnabled !== false) return false
            if (chatFilter === 'archived' && !['archived', 'closed'].includes(status)) return false

            if (!query) return true
            const haystack = [
                chat.name,
                chat.phone,
                chat.waId,
                chat.lastMessage,
                ...(Array.isArray(chat.tags) ? chat.tags.filter(tag => !String(tag).toLowerCase().startsWith(MUTED_UNTIL_LABEL_PREFIX)) : [])
            ].filter(Boolean).join(' ').toLowerCase()

            return haystack.includes(query)
        }).sort((a, b) => {
            const aPinned = hasChatLabel(a, 'pinned') ? 1 : 0
            const bPinned = hasChatLabel(b, 'pinned') ? 1 : 0
            if (aPinned !== bPinned) return bPinned - aPinned
            return (b.lastMessageAt?.getTime?.() || 0) - (a.lastMessageAt?.getTime?.() || 0)
        })
    }, [chats, chatFilter, chatSearch])

    const forwardRecipientChats = useMemo(() => {
        const query = forwardSearch.trim().toLowerCase()
        return chats.filter(chat => {
            if (!query) return true
            const haystack = [
                chat.name,
                chat.phone,
                chat.waId,
                chat.lastMessage,
                ...(Array.isArray(chat.tags) ? chat.tags.filter(tag => !String(tag).toLowerCase().startsWith(MUTED_UNTIL_LABEL_PREFIX)) : [])
            ].filter(Boolean).join(' ').toLowerCase()

            return haystack.includes(query)
        })
    }, [chats, forwardSearch])

    const renderedThread = useMemo(() => {
        const items = []
        let lastDayKey = null
        let lastMsg = null

        for (const msg of filteredMessages) {
            const dt = msg.createdAt ? new Date(msg.createdAt) : null
            const dayKey = dt ? format(dt, 'yyyy-MM-dd') : 'unknown'

            if (dayKey !== lastDayKey) {
                let label = '—'
                if (dt) {
                    if (isToday(dt)) label = 'Today'
                    else if (isYesterday(dt)) label = 'Yesterday'
                    else label = format(dt, 'dd MMM yyyy')
                }
                items.push({ kind: 'separator', key: `sep-${dayKey}`, label })
                lastDayKey = dayKey
                lastMsg = null
            }

            const gapMs = lastMsg?.createdAt && msg.createdAt ? (msg.createdAt.getTime() - lastMsg.createdAt.getTime()) : 999999
            const sameSender = lastMsg && lastMsg.sender === msg.sender
            const grouped = sameSender && gapMs < 2 * 60 * 1000 && lastMsg.type !== 'note' && msg.type !== 'note'

            items.push({ kind: 'message', key: msg.id, msg, grouped })
            lastMsg = msg
        }

        return items
    }, [filteredMessages]);

    const customerWindowState = useMemo(() => {
        if (!selectedChat) {
            return {
                hasLoadedMessages: false,
                hasCustomerMessage: false,
                hasFailedOutboundMessage: false,
                latestCustomerMessageAt: null,
            }
        }

        let latest = 0
        let hasFailedOutboundMessage = false
        for (const msg of filteredMessages) {
            const sender = String(msg?.sender || msg?.direction || msg?.senderType || msg?.sender_type || '').toLowerCase()
            const isCustomerMessage = sender === 'user' || sender === 'inbound' || sender === 'customer'
            const isOutboundMessage = sender === 'agent' || sender === 'outbound' || sender === 'human_agent'

            if (isOutboundMessage && String(msg?.status || '').toLowerCase() === 'failed') {
                hasFailedOutboundMessage = true
            }

            if (!isCustomerMessage) continue
            const timestamp = msg.createdAt instanceof Date
                ? msg.createdAt.getTime()
                : new Date(msg?.createdAt || 0).getTime()
            if (Number.isFinite(timestamp) && timestamp > latest) {
                latest = timestamp
            }
        }

        return {
            hasLoadedMessages: filteredMessages.length > 0,
            hasCustomerMessage: latest > 0,
            hasFailedOutboundMessage,
            latestCustomerMessageAt: latest > 0 ? latest : null,
        }
    }, [filteredMessages, selectedChat?.id])

    const isCustomerWindowExpired = useMemo(() => {
        if (!selectedChat) return false
        if (customerWindowState.latestCustomerMessageAt) {
            return Date.now() - customerWindowState.latestCustomerMessageAt > CUSTOMER_SERVICE_WINDOW_MS
        }
        if (expiredWindowChatIds.has(String(selectedChat.id))) return true
        if (customerWindowState.hasFailedOutboundMessage) return true

        // If the loaded thread has no customer message, WhatsApp's free-form service window is not open.
        return customerWindowState.hasLoadedMessages && !customerWindowState.hasCustomerMessage
    }, [customerWindowState, expiredWindowChatIds, selectedChat])

    const markCustomerWindowExpired = (chatId) => {
        if (!chatId) return
        setExpiredWindowChatIds(prev => {
            const next = new Set(prev)
            next.add(String(chatId))
            return next
        })
    }

    useEffect(() => {
        if (!selectedChat) {
            setTimeRemainingStr('')
            setIsUrgentTime(false)
            return
        }

        const updateTimer = () => {
            if (isCustomerWindowExpired) {
                setTimeRemainingStr('Closed')
                setIsUrgentTime(true)
                return
            }

            const latestAt = customerWindowState.latestCustomerMessageAt
            if (!latestAt) {
                setTimeRemainingStr('')
                setIsUrgentTime(false)
                return
            }

            const diff = CUSTOMER_SERVICE_WINDOW_MS - (Date.now() - latestAt)
            if (diff <= 0) {
                setTimeRemainingStr('Closed')
                setIsUrgentTime(true)
                return
            }

            // Mark as urgent if <= 12 hours remaining
            const urgentLimit = 12 * 60 * 60 * 1000
            setIsUrgentTime(diff <= urgentLimit)

            const totalMinutes = Math.floor(diff / (60 * 1000))
            const hours = Math.floor(totalMinutes / 60)
            const minutes = totalMinutes % 60

            if (hours > 0) {
                setTimeRemainingStr(`${hours}h ${minutes}m left`)
            } else {
                setTimeRemainingStr(`${minutes}m left`)
            }
        }

        updateTimer()
        const interval = setInterval(updateTimer, 15000)
        return () => clearInterval(interval)
    }, [selectedChat, customerWindowState, isCustomerWindowExpired])

    const openTemplateSender = () => {
        if (!selectedChat) return
        navigate('/broadcast', {
            state: {
                source: 'live_chat_24h_window',
                contact: {
                    id: selectedChat.contactId,
                    name: selectedChat.name,
                    phone: selectedChat.phone || selectedChat.waId,
                    wa_id: selectedChat.waId,
                },
                conversationId: selectedChat.id,
            },
        })
    }

    const requestFreshQr = () => {
        const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session';
        if (!socket.connected) socket.connect();
        socket.emit('request_qr', sessionId, memberProfile?.organization_id);
    };

    const activeMenuMessage = activeMessageMenuId
        ? messages.find(m => idsEqual(m.id, activeMessageMenuId))
        : null;

    if (connectionState === 'loading') {
        return <LiveChatLoadingSkeleton sidebarWidth={sidebarWidth} isDesktop={isDesktop} />
    }

    if (connectionState === 'error') {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white p-8 text-center" role="alert">
                <div className="mb-4 rounded-full bg-red-50 p-4">
                    <AlertCircle className="h-10 w-10 text-red-600" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-gray-900">We couldn&apos;t load your WhatsApp connection</h2>
                <p className="mb-6 max-w-sm text-sm text-gray-500">
                    {accountsError?.message || 'Please check your connection and try again.'}
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setConnectionState('loading')
                        void refetchAccounts()
                    }}
                    className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                >
                    Retry
                </button>
            </div>
        )
    }

    // The connect prompt appears only after the authoritative REST check confirms no account.
    if (connectionState === 'disconnected' && connectedAccounts.length === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white p-8 text-center">
                <div className="bg-green-50 p-4 rounded-full mb-4">
                    <Phone className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Connect your WhatsApp account for live chat</h2>
                <p className="text-gray-500 mb-6 max-w-sm text-sm">You need an active WhatsApp connection to send and receive messages in real-time.</p>
                <a
                    href="/whatsapp-connect"
                    className="px-6 py-2.5 bg-[#25D366] text-white rounded-xl font-bold text-sm hover:bg-[#20b956] transition-all shadow-md shadow-green-100"
                >
                    Go to Connect Page
                </a>
            </div>
        );
    }

    // Render Chat Interface
    return (
        <AudioPlayerProvider>
            <div className="flex h-full min-h-0 overflow-hidden bg-white">
                {/* Left Cone: Chat List */}
                <div
                    id="chat-list-container"
                    className={`${selectedChat ? 'hidden lg:flex' : 'flex'} w-full flex-col overflow-hidden border-r border-gray-200 bg-white`}
                    style={{ width: isDesktop ? `${sidebarWidth}px` : undefined }}
                >
                    {/* Header / Account Switcher */}
                    <div className="p-3 border-b border-gray-200 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inbox</label>
                            <select
                                value={selectedAccount}
                                onChange={(e) => {
                                    const next = e.target.value
                                    setSelectedAccount(next)
                                    localStorage.setItem('selected_wa_account_id', next)
                                    window.dispatchEvent(new CustomEvent('selected-wa-account-change', { detail: { accountId: next } }))
                                }}
                                className="max-w-[48vw] cursor-pointer truncate bg-transparent text-xs font-medium text-indigo-600 focus:outline-none sm:max-w-none"
                            >
                                <option value="All">All Accounts</option>
                                {connectedAccounts.map(acc => (
                                    <option key={acc} value={acc}>{acc} (Active)</option>
                                ))}
                            </select>
                        </div>
                        <div data-tour="chat-search" className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search or start a new chat"
                                value={chatSearch}
                                onChange={(e) => setChatSearch(e.target.value)}
                                className="w-full rounded-full border-0 bg-gray-100 py-2.5 pl-11 pr-4 text-sm text-gray-700 placeholder:text-gray-500 outline-none transition-colors focus:bg-white focus:ring-1 focus:ring-green-500/40"
                            />
                        </div>
                        <div className="relative mt-2 flex items-center justify-between gap-1.5" data-chat-filter-menu>
                            <div data-tour="chat-filters" className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pr-8">
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'bot_enabled', label: 'Agent On' },
                                    { id: 'bot_disabled', label: 'Agent Off' },
                                ].map(filter => {
                                    const active = chatFilter === filter.id
                                    return (
                                        <button
                                            key={filter.id}
                                            type="button"
                                            onClick={() => {
                                                setChatFilter(filter.id)
                                                setIsChatFilterMenuOpen(false)
                                            }}
                                            className={`h-7 shrink-0 rounded-full border px-3 text-xs font-semibold transition-all duration-150 ${active
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                }`}
                                        >
                                            {filter.label} {chatFilterCounts[filter.id] > 0 ? chatFilterCounts[filter.id] : ''}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Apple/Meta style more filters button and dropdown */}
                            <div className="relative shrink-0 pb-1">
                                <button
                                    type="button"
                                    onClick={() => setIsChatFilterMenuOpen(v => !v)}
                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all duration-120 ${['favorites', 'archived', 'assigned', 'unassigned'].includes(chatFilter)
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800 hover:scale-105 active:scale-95'
                                        }`}
                                    title="More filters"
                                >
                                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isChatFilterMenuOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isChatFilterMenuOpen && (
                                    <>
                                        {/* Backdrop for mobile */}
                                        <div
                                            onClick={() => setIsChatFilterMenuOpen(false)}
                                            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm sm:hidden transition-opacity duration-300"
                                        />
                                        <div className="fixed bottom-0 left-0 right-0 z-[101] w-full rounded-t-3xl border-t border-gray-100 bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-8 sm:w-44 sm:rounded-xl sm:border sm:p-0 sm:shadow-lg sm:z-50 animate-in slide-in-from-bottom sm:animate-none">
                                            {/* Handle bar on mobile */}
                                            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200 sm:hidden" />
                                            <div className="py-1">
                                                <p className="text-[11px] font-bold text-gray-400 px-4 mb-2.5 uppercase tracking-wider sm:hidden">Filter Chats</p>
                                                {[
                                                    { id: 'favorites', label: 'Favourites' },
                                                    { id: 'bot_disabled', label: 'AI Paused (Manual)' },
                                                    { id: 'archived', label: 'Archived' },
                                                    { id: 'assigned', label: 'Assigned' },
                                                    { id: 'unassigned', label: 'Unassigned' },
                                                ].map(filter => {
                                                    const active = chatFilter === filter.id
                                                    return (
                                                        <button
                                                            key={filter.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setChatFilter(filter.id)
                                                                setIsChatFilterMenuOpen(false)
                                                            }}
                                                            className={`flex w-full items-center justify-between px-4 py-3 sm:py-2 text-left text-sm rounded-xl sm:rounded-none transition-colors ${active ? 'bg-green-50 text-green-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                                                        >
                                                            <span>{filter.label}</span>
                                                            <div className="flex items-center gap-1.5">
                                                                {chatFilterCounts[filter.id] > 0 && (
                                                                    <span className="text-xs text-gray-400 bg-gray-100/50 px-1.5 py-0.5 rounded-full font-normal">
                                                                        {chatFilterCounts[filter.id]}
                                                                    </span>
                                                                )}
                                                                {active && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {chatsLoadState === 'loading' && chats.length === 0 ? (
                            <ChatListLoadingSkeleton />
                        ) : chatsLoadState === 'error' && chats.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="mb-3 text-sm text-gray-500">Couldn&apos;t load conversations.</p>
                                <button
                                    type="button"
                                    onClick={() => fetchChats()}
                                    className="rounded-lg px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                                >
                                    Retry
                                </button>
                            </div>
                        ) : chats.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                No chats yet. Messages you receive will appear here.
                            </div>
                        ) : visibleChats.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                No chats match this filter.
                            </div>
                        ) : (
                            <>
                            {visibleChats.map(chat => (
                                <div
                                    key={chat.id}
                                    onClick={() => setSelectedChat(chat)}
                                    className={`group relative flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3.5 transition-all duration-200 ${selectedChat?.id === chat.id ? 'bg-emerald-50/45' : 'hover:bg-gray-50'}`}
                                >
                                    {selectedChat?.id === chat.id ? (
                                        <div className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-emerald-500" />
                                    ) : null}
                                    <div className="relative shrink-0">
                                        {chat.profilePhotoUrl ? (
                                            <img
                                                src={chat.profilePhotoUrl}
                                                alt={chat.name}
                                                className="h-11 w-11 rounded-full object-cover"
                                                loading="lazy"
                                                onError={() => clearBrokenProfilePhoto(chat.contactId, chat.profilePhotoUrl)}
                                            />
                                        ) : (
                                            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-[17px] font-bold ${getAvatarColor(chat.name)} shadow-sm`}>
                                                {chat.name ? chat.name.charAt(0).toUpperCase() : '?'}
                                            </div>
                                        )}
                                        {chat.botEnabled !== false ? (
                                            <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-[#10b981] border-2 border-white" title="AI Agent active" />
                                        ) : (
                                            <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-[#f59e0b] border-2 border-white animate-pulse" title="AI Agent paused" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline gap-2 mb-0.5">
                                            <h3 className={`truncate text-sm font-semibold ${selectedChat?.id === chat.id ? 'text-gray-950' : 'text-gray-900'}`}>
                                                {chat.name}
                                            </h3>
                                            <div className="flex shrink-0 items-center gap-1">
                                                {hasChatLabel(chat, 'pinned') && <Pin className="h-3 w-3 text-gray-400" />}
                                                {hasChatLabel(chat, 'favorite') && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                                                {isChatMuted(chat) && <BellOff className="h-3 w-3 text-gray-400" />}
                                                <span className="text-[10px] font-medium text-gray-400">{chat.time}</span>
                                                <button
                                                    type="button"
                                                    data-chat-row-menu
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setActiveChatMenuId(prev => idsEqual(prev, chat.id) ? null : chat.id)
                                                    }}
                                                    className={`ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 ${activeChatMenuId && idsEqual(activeChatMenuId, chat.id) ? 'bg-black/5 opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                                    title="Chat actions"
                                                >
                                                    <ChevronDown className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className={`mb-1 truncate text-xs ${selectedChat?.id === chat.id ? 'text-gray-600' : 'text-gray-500'}`}>{chat.lastMessage}</p>
                                        <div className="flex items-center gap-1.5">
                                            {(Array.isArray(chat.tags) ? chat.tags : []).filter(tag => {
                                                const normalized = String(tag).toLowerCase()
                                                return !['favorite', 'pinned'].includes(normalized) && !normalized.startsWith(MUTED_UNTIL_LABEL_PREFIX)
                                            }).map(tag => (
                                                <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                    {tag}
                                                </span>
                                            ))}
                                            {chat.assigned_to && (
                                                <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded" title={`Assigned to ${getAgentName(chat.assigned_to)}`}>
                                                    <User className="h-3 w-3" />
                                                    {getAgentName(chat.assigned_to).split(' ')[0]}
                                                </div>
                                            )}
                                            {chat.unread > 0 && (
                                                <div className="ml-auto bg-green-500 text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center shadow-sm">
                                                    {chat.unread}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {activeChatMenuId && idsEqual(activeChatMenuId, chat.id) && (
                                        <div
                                            data-chat-row-menu
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute right-3 top-12 z-40 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-2 shadow-[0_8px_24px_rgba(11,20,26,0.18)]"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => updateChatMeta(chat, { status: ['archived', 'closed'].includes(String(chat.status || '').toLowerCase()) ? 'open' : 'archived' })}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#111b21] hover:bg-[#f5f6f6]"
                                            >
                                                {['archived', 'closed'].includes(String(chat.status || '').toLowerCase()) ? <Inbox className="h-4 w-4 text-[#54656f]" /> : <Archive className="h-4 w-4 text-[#54656f]" />}
                                                {['archived', 'closed'].includes(String(chat.status || '').toLowerCase()) ? 'Move to inbox' : 'Archive chat'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleChatLabel(chat, 'pinned')}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#111b21] hover:bg-[#f5f6f6]"
                                            >
                                                {hasChatLabel(chat, 'pinned') ? <PinOff className="h-4 w-4 text-[#54656f]" /> : <Pin className="h-4 w-4 text-[#54656f]" />}
                                                {hasChatLabel(chat, 'pinned') ? 'Unpin chat' : 'Pin chat'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => markChatUnread(chat)}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#111b21] hover:bg-[#f5f6f6]"
                                            >
                                                <MailOpen className="h-4 w-4 text-[#54656f]" />
                                                Mark as unread
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleChatLabel(chat, 'favorite')}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#111b21] hover:bg-[#f5f6f6]"
                                            >
                                                {hasChatLabel(chat, 'favorite') ? <StarOff className="h-4 w-4 text-[#54656f]" /> : <Star className="h-4 w-4 text-[#54656f]" />}
                                                {hasChatLabel(chat, 'favorite') ? 'Remove from favourites' : 'Add to favourites'}
                                            </button>
                                            {isChatMuted(chat) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => unmuteChat(chat)}
                                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#111b21] hover:bg-[#f5f6f6]"
                                                >
                                                    <BellOff className="h-4 w-4 text-[#54656f]" />
                                                    Unmute notifications
                                                </button>
                                            ) : (
                                                <div className="border-t border-gray-100 py-1">
                                                    <div className="flex items-center gap-3 px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#8696a0]">
                                                        <BellOff className="h-3.5 w-3.5" />
                                                        Mute notifications
                                                    </div>
                                                    {[
                                                        { label: 'For 1 hour', hours: 1 },
                                                        { label: 'For 8 hours', hours: 8 },
                                                        { label: 'For 1 day', hours: 24 },
                                                    ].map(option => (
                                                        <button
                                                            key={option.hours}
                                                            type="button"
                                                            onClick={() => muteChatFor(chat, option.hours)}
                                                            className="flex w-full items-center gap-3 px-11 py-2 text-left text-sm text-[#111b21] hover:bg-[#f5f6f6]"
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="border-t border-gray-100" />
                                            <button
                                                type="button"
                                                onClick={() => clearChat(chat)}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#111b21] hover:bg-[#f5f6f6]"
                                            >
                                                <Eraser className="h-4 w-4 text-[#54656f]" />
                                                Clear chat
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteChat(chat)}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Delete chat
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {nextConversationCursor && (
                                <div className="border-t border-gray-100 p-3 text-center">
                                    <button
                                        type="button"
                                        disabled={isLoadingMoreChats}
                                        onClick={() => fetchChats({ cursor: nextConversationCursor })}
                                        className="rounded-lg px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                                    >
                                        {isLoadingMoreChats ? 'Loading more chats…' : 'Load more chats'}
                                    </button>
                                </div>
                            )}
                            </>
                        )}
                    </div>
                </div>

                {/* Resize Handle (only visible on desktop) */}
                {isDesktop && (
                    <div
                        onMouseDown={startResizing}
                        className={`group relative z-30 w-[4px] h-full -ml-[2px] cursor-col-resize select-none bg-transparent transition-colors hover:bg-emerald-500/50 ${isResizing ? 'bg-emerald-500/50' : ''
                            }`}
                    >
                        <div className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize" />
                    </div>
                )}

                {/* Middle Cone: Chat Area */}
                <div className={`${!selectedChat ? 'hidden lg:flex' : 'flex'} relative min-w-0 flex-1 flex-col bg-[#efeae2]`}>
                    {!selectedChat ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <Send className="h-8 w-8 text-gray-300 ml-1" />
                            </div>
                            <p className="text-sm font-medium">Select a chat to start messaging</p>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div data-tour="chat-header" className="relative z-40 flex h-14 sm:h-16 shrink-0 items-center justify-between gap-1 sm:gap-2 border-b border-gray-200 bg-[#f0f2f5] px-1.5 sm:px-4">
                                <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
                                    <button onClick={() => setSelectedChat(null)} className="lg:hidden p-0.5 -ml-1 text-gray-600 hover:bg-gray-200 rounded-lg">
                                        <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                                    </button>
                                    {selectedChat?.profilePhotoUrl ? (
                                        <img
                                            src={selectedChat.profilePhotoUrl}
                                            alt={selectedChat?.name || 'Contact'}
                                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover shrink-0"
                                            onError={() => clearBrokenProfilePhoto(selectedChat.contactId, selectedChat.profilePhotoUrl)}
                                        />
                                    ) : (
                                        <DiceBearAvatar seed={selectedChat?.name} className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover shrink-0 ring-1 ring-gray-200" />
                                    )}
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1 sm:gap-2">
                                            <h3 className="truncate text-xs sm:text-sm font-bold leading-tight text-gray-900">{selectedChat?.name}</h3>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFocusAliasOnOpen(true)
                                                    setIsContactDrawerOpen(true)
                                                }}
                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                title="Set custom name"
                                            >
                                                <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                            </button>
                                        </div>
                                        <div className="flex min-w-0 items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-gray-500">
                                            <span className="truncate">{formatPhoneForDisplay(selectedChat?.phone || selectedChat?.waId || '')}</span>
                                            {timeRemainingStr && (
                                                <div className="relative inline-flex" data-time-tooltip>
                                                    <button
                                                        type="button"
                                                        aria-expanded={showTimeTooltip}
                                                        aria-label={`WhatsApp 24-hour window: ${timeRemainingStr}`}
                                                        onMouseEnter={() => setShowTimeTooltip(true)}
                                                        onMouseLeave={() => setShowTimeTooltip(false)}
                                                        onFocus={() => setShowTimeTooltip(true)}
                                                        onBlur={() => setShowTimeTooltip(false)}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setShowTimeTooltip(prev => !prev)
                                                        }}
                                                        className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border leading-none tracking-wide uppercase transition-all duration-300 select-none outline-none ${timeRemainingStr === 'Closed' || isCustomerWindowExpired || isUrgentTime
                                                            ? 'bg-rose-50 text-rose-600 border-rose-200/50 hover:bg-rose-100/70'
                                                            : 'bg-emerald-50 text-emerald-600 border-emerald-200/50 hover:bg-emerald-100/70'
                                                            }`}
                                                    >
                                                        <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                                                        <span className="sm:hidden">
                                                            {timeRemainingStr.includes('h') ? `${timeRemainingStr.split('h')[0].trim()}h left` : timeRemainingStr}
                                                        </span>
                                                        <span className="hidden sm:inline">
                                                            {timeRemainingStr}
                                                        </span>
                                                    </button>

                                                    {/* META Level Tooltip Popup */}
                                                    {showTimeTooltip && (
                                                        <div
                                                            role="tooltip"
                                                            className="absolute left-1/2 top-full z-[9999] mt-2.5 w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3.5 text-left normal-case shadow-[0_14px_40px_rgba(15,23,42,0.18)] sm:p-4"
                                                        >
                                                            {/* Tiny arrow pointing up */}
                                                            <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-gray-200 bg-white" />
                                                            <div className="flex items-start gap-3">
                                                                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${timeRemainingStr === 'Closed' || isCustomerWindowExpired || isUrgentTime ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                                    <Clock className="h-4.5 w-4.5" />
                                                                </div>
                                                                <div className="min-w-0 flex-1 space-y-1">
                                                                    <h4 className="text-xs font-bold leading-tight text-gray-900">WhatsApp 24h Window</h4>
                                                                    <p className={`text-[13px] font-bold leading-5 tracking-tight ${timeRemainingStr === 'Closed' || isCustomerWindowExpired || isUrgentTime ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                        {(() => {
                                                                            if (timeRemainingStr === 'Closed' || isCustomerWindowExpired) return 'Window Closed';
                                                                            const latestAt = customerWindowState.latestCustomerMessageAt;
                                                                            if (!latestAt) return 'No customer message yet';
                                                                            const diff = CUSTOMER_SERVICE_WINDOW_MS - (Date.now() - latestAt);
                                                                            if (diff <= 0) return 'Window Closed';
                                                                            const totalMinutes = Math.floor(diff / (60 * 1000));
                                                                            const hrs = Math.floor(totalMinutes / 60);
                                                                            const mins = totalMinutes % 60;
                                                                            return `${hrs} ${hrs === 1 ? 'Hour' : 'Hours'} ${mins} ${mins === 1 ? 'Minute' : 'Minutes'} Left`;
                                                                        })()}
                                                                    </p>
                                                                    <p className="text-[11px] font-medium leading-[1.55] text-gray-600">
                                                                        {timeRemainingStr === 'Closed' || isCustomerWindowExpired
                                                                            ? "This user's 24-hour reply window has closed. You can only send template messages now."
                                                                            : "After this time, you won't be able to send normal messages to this user. You can only reply with approved templates."}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                                    <TourButton compact className="hidden sm:block" />
                                    {/* Assign Agent Dropdown */}
                                    <div className="relative hidden sm:block" data-assign-menu>
                                        <button
                                            type="button"
                                            onClick={() => setIsAssignMenuOpen(v => !v)}
                                            className="inline-flex h-10 min-w-[160px] items-center justify-between gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                                            title="Assign chat"
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                {(() => {
                                                    const assignedMember = teamMembers.find(m => m.user_id === selectedChat?.assigned_to);
                                                    if (assignedMember) {
                                                        if (assignedMember.is_online) {
                                                            return (
                                                                <span className="relative flex h-2 w-2 shrink-0">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                                                </span>
                                                            );
                                                        } else {
                                                            return (
                                                                <span className="h-2 w-2 rounded-full bg-rose-300 shrink-0" />
                                                            );
                                                        }
                                                    }
                                                    return <User className="h-4 w-4 shrink-0 text-gray-400" />;
                                                })()}
                                                <span className="truncate">{getAgentName(selectedChat?.assigned_to)}</span>
                                            </span>
                                            <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                                        </button>
                                        {isAssignMenuOpen && (
                                            <div className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-gray-200 bg-white p-1 shadow-xl transition-all duration-150 animate-in fade-in slide-in-from-top-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        assignAgent(selectedChat.id, '')
                                                        setIsAssignMenuOpen(false)
                                                    }}
                                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm rounded-lg transition-colors ${!selectedChat?.assigned_to ? 'bg-green-50 text-green-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    <span className="flex items-center gap-2.5">
                                                        <span className="h-2 w-2 rounded-full bg-gray-350 shrink-0" />
                                                        <span className="font-medium">Unassigned</span>
                                                    </span>
                                                    {!selectedChat?.assigned_to && <Check className="h-4 w-4 text-emerald-600" />}
                                                </button>
                                                <div className="my-1 border-t border-gray-100" />
                                                {assignableTeamMembers.length === 0 && (
                                                    <div className="px-3 py-2 text-sm text-gray-500">
                                                        No active agents available
                                                    </div>
                                                )}
                                                {assignableTeamMembers.map(m => (
                                                    <button
                                                        key={m.user_id}
                                                        type="button"
                                                        onClick={() => {
                                                            assignAgent(selectedChat.id, m.user_id)
                                                            setIsAssignMenuOpen(false)
                                                        }}
                                                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm rounded-lg transition-colors ${selectedChat?.assigned_to === m.user_id ? 'bg-green-50 text-green-800' : 'text-gray-700 hover:bg-gray-50'}`}
                                                    >
                                                        <span className="truncate flex items-center gap-2.5">
                                                            {m.is_online ? (
                                                                <span className="relative flex h-2 w-2 shrink-0">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                                                </span>
                                                            ) : (
                                                                <span className="h-2 w-2 rounded-full bg-rose-300 shrink-0" />
                                                            )}
                                                            <span className="font-medium text-gray-700">{m.name}</span>
                                                            <span className="text-[9px] text-gray-400 font-bold uppercase bg-gray-100 px-1.5 py-0.5 rounded tracking-wide ml-1 shrink-0">
                                                                {m.role}
                                                            </span>
                                                        </span>
                                                        {selectedChat?.assigned_to === m.user_id && <Check className="h-4 w-4 text-emerald-600" />}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>


                                    {/* Bot Toggle Button */}
                                    <div className="relative shrink-0" data-bot-menu>
                                        <button
                                            onClick={() => setShowBotMenu(!showBotMenu)}
                                            className={`inline-flex h-8 sm:h-10 items-center justify-center gap-1 sm:gap-2 rounded-xl border px-2 sm:px-3 text-[10px] sm:text-xs font-semibold tracking-tight transition-all duration-150 outline-none ${effectiveBotEnabled
                                                ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm hover:bg-neutral-800'
                                                : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                                                }`}
                                            title={effectiveBotEnabled ? 'AI agent automation is active' : 'Enable AI agent'}
                                        >
                                            {effectiveBotEnabled ? (
                                                <span className="relative flex h-1.5 w-1.5 shrink-0">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                                </span>
                                            ) : (
                                                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0"></span>
                                            )}
                                            <span>AI Agent</span>
                                            {effectiveBotEnabled && (
                                                <span className="px-1 py-0.5 text-[8px] sm:text-[9px] font-bold rounded uppercase bg-white/20 text-white shrink-0">
                                                    {botEnabled ? 'On' : 'Auto'}
                                                </span>
                                            )}
                                        </button>

                                        {/* Bot Menu Dropdown */}
                                        {showBotMenu && (
                                            <>
                                                {/* Backdrop for mobile */}
                                                <div
                                                    onClick={() => setShowBotMenu(false)}
                                                    className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm sm:hidden transition-opacity duration-300"
                                                />
                                                <div className="fixed bottom-0 left-0 right-0 z-[101] w-full rounded-t-3xl border-t border-gray-200 bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:z-50 sm:mt-2 sm:w-64 sm:rounded-xl sm:border sm:p-0 sm:shadow-lg animate-in slide-in-from-bottom sm:animate-none">
                                                    {/* Handle bar on mobile */}
                                                    <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200 sm:hidden" />
                                                    <div className="p-3 sm:p-3 border-b border-gray-100 flex items-center justify-between">
                                                        <div>
                                                            <span className="text-sm font-semibold text-gray-900">Bot Auto-Reply</span>
                                                            <p className="text-xs text-gray-500 mt-0.5 normal-case">
                                                                {botEnabled
                                                                    ? 'AI Agent can reply only when no active flow matches.'
                                                                    : workspaceAutoReplyBot
                                                                        ? `AI Agent fallback is off for this chat. Flow Builder still works.`
                                                                        : 'AI Agent fallback is off for this chat. Flow Builder still works.'}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => toggleBotForConversation(!botEnabled, selectedBotId || workspaceAutoReplyBot?.id || null)}
                                                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${effectiveBotEnabled ? 'bg-green-600' : 'bg-gray-200'
                                                                }`}
                                                        >
                                                            <span
                                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${effectiveBotEnabled ? 'translate-x-6' : 'translate-x-1'
                                                                    }`}
                                                            />
                                                        </button>
                                                    </div>

                                                    {availableBots.length > 0 && (
                                                        <div className="p-2 border-t border-gray-100 max-h-60 overflow-y-auto">
                                                            <p className="text-[11px] font-bold text-gray-400 px-2 mb-1.5 uppercase tracking-wider">Select Agent</p>
                                                            {availableBots.map(bot => (
                                                                <button
                                                                    key={bot.id}
                                                                    onClick={() => toggleBotForConversation(true, bot.id)}
                                                                    className={`w-full text-left px-3 py-2.5 sm:py-2 rounded-xl text-sm flex items-center gap-3 transition-colors ${effectiveBotEnabled && selectedBotId === bot.id
                                                                        ? 'bg-green-50 text-green-700 font-semibold'
                                                                        : 'hover:bg-gray-50 text-gray-700'
                                                                        }`}
                                                                >
                                                                    <Bot className="h-5 w-5 sm:h-4 sm:w-4 shrink-0 text-gray-500" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-semibold sm:font-medium truncate text-gray-800">{bot.name}</div>
                                                                        <div className="text-xs text-gray-500 truncate">{bot.model}</div>
                                                                    </div>
                                                                    {effectiveBotEnabled && selectedBotId === bot.id && (
                                                                        <Check className="h-4.5 w-4.5 sm:h-4 sm:w-4 text-green-600 shrink-0" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                            <button
                                                                onClick={() => toggleBotForConversation(true, null)}
                                                                className={`w-full text-left px-3 py-2.5 sm:py-2 rounded-xl text-sm flex items-center gap-3 mt-1.5 sm:mt-1 transition-colors ${effectiveBotEnabled && !selectedBotId
                                                                    ? 'bg-green-50 text-green-700 font-semibold'
                                                                    : 'hover:bg-gray-50 text-gray-700'
                                                                    }`}
                                                            >
                                                                <Bot className="h-5 w-5 sm:h-4 sm:w-4 shrink-0 text-gray-500" />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-semibold sm:font-medium truncate text-gray-800">Auto (Workspace Rules)</div>
                                                                    <div className="text-xs text-gray-500 truncate">Keyword/default/unknown rules</div>
                                                                </div>
                                                                {effectiveBotEnabled && !selectedBotId && (
                                                                    <Check className="h-4.5 w-4.5 sm:h-4 sm:w-4 text-green-600 shrink-0" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}

                                                    {availableBots.length === 0 && (
                                                        <div className="p-3 text-center">
                                                            <p className="text-xs text-gray-500 font-medium">No bots configured yet</p>
                                                            <a
                                                                href="/bot-agents"
                                                                className="text-xs text-green-600 font-semibold hover:underline"
                                                            >
                                                                Create a bot →
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setFocusAliasOnOpen(false)
                                            setIsContactDrawerOpen(true)
                                        }}
                                        className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 shrink-0"
                                        title="Contact info"
                                    >
                                        <Info className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    </button>
                                    {isAdmin && (
                                        <div className="relative shrink-0" data-auto-assign-menu>
                                            <button
                                                onClick={() => setIsAutoAssignMenuOpen(!isAutoAssignMenuOpen)}
                                                className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100"
                                            >
                                                <MoreVertical className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                            </button>
                                            {isAutoAssignMenuOpen && (
                                                <>
                                                    {/* Backdrop for mobile */}
                                                    <div
                                                        onClick={() => setIsAutoAssignMenuOpen(false)}
                                                        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm sm:hidden transition-opacity duration-300"
                                                    />
                                                    <div className="fixed bottom-0 left-0 right-0 z-[101] w-full rounded-t-3xl border-t border-gray-200 bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-56 sm:overflow-hidden sm:rounded-xl sm:border sm:p-0 sm:shadow-xl sm:z-50 animate-in slide-in-from-bottom sm:animate-none">
                                                        {/* Handle bar on mobile */}
                                                        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200 sm:hidden" />
                                                        <div className="py-1">
                                                            <p className="text-[11px] font-bold text-gray-400 px-4 mb-2.5 uppercase tracking-wider sm:hidden">Admin Actions</p>
                                                            <button
                                                                onClick={() => {
                                                                    setDraftAutoAssignSettings({ enabled: autoAssignSettings.enabled, batch_size: autoAssignSettings.batch_size });
                                                                    setIsAutoAssignModalOpen(true);
                                                                    setIsAutoAssignMenuOpen(false);
                                                                }}
                                                                className="w-full text-left px-4 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 sm:gap-2 rounded-xl sm:rounded-none transition-colors"
                                                            >
                                                                <Bot className="h-5 w-5 sm:h-4 sm:w-4 text-green-500" />
                                                                <span className="font-semibold sm:font-normal">Auto Assign Rules</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setDraftPausedAgents([...autoAssignSettings.paused_agents]);
                                                                    setIsAgentStatusModalOpen(true);
                                                                    setIsAutoAssignMenuOpen(false);
                                                                }}
                                                                className="w-full text-left px-4 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 sm:gap-2 rounded-xl sm:rounded-none transition-colors"
                                                            >
                                                                <User className="h-5 w-5 sm:h-4 sm:w-4 text-blue-500" />
                                                                <span className="font-semibold sm:font-normal">Agent Status (Pause)</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Messages Display */}
                            <div className="relative flex-1 flex flex-col overflow-hidden bg-[#efeae2]">
                                <div className="absolute inset-0 z-0 opacity-40 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-[length:410px]" />
                                <div
                                    ref={messagesListRef}
                                    className={`wa-chat-scroll relative z-10 flex-1 overflow-y-auto px-5 py-3 sm:px-8 lg:px-14 xl:px-20 2xl:px-28 transition-opacity duration-200 ${isThreadLoading ? 'opacity-0' : 'opacity-100'}`}
                                    onScroll={() => {
                                        const el = messagesListRef.current
                                        if (!el) return
                                        if (activeMessageMenuId) closeMessageMenu()
                                        if (el.scrollTop === 0 && hasMoreMessages && !isLoadingOlder) {
                                            loadOlder()
                                        }
                                        const nearBottom = isNearBottom()
                                        isNearBottomRef.current = nearBottom
                                        setShowJumpToLatest(!nearBottom)
                                        if (nearBottom) setNewMessagesPending(0)
                                    }}
                                >
                                    {hasMoreMessages && (
                                        <div className="flex justify-center my-4">
                                            <button
                                                type="button"
                                                onClick={loadOlder}
                                                disabled={isLoadingOlder}
                                                className="px-5 py-1.5 rounded-full bg-white/95 backdrop-blur text-indigo-600 hover:text-indigo-700 hover:bg-white text-xs font-semibold shadow-sm border border-gray-200/50 hover:scale-105 active:scale-95 disabled:opacity-55 transition-all flex items-center gap-2"
                                            >
                                                {isLoadingOlder ? (
                                                    <>
                                                        <svg className="animate-spin h-3 w-3 text-indigo-600" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Loading older...
                                                    </>
                                                ) : (
                                                    'Load older messages'
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {renderedThread.map((row) => (
                                        row.kind === 'separator' ? (
                                            <div key={row.key} className="flex justify-center my-3">
                                                <div className="px-3 py-1 rounded-full bg-white/70 text-gray-600 text-xs shadow-sm border border-gray-100">
                                                    {row.label}
                                                </div>
                                            </div>
                                        ) : (
                                            <div key={row.key} className={`flex ${row.msg.sender === 'user' ? 'justify-start' : 'justify-end'} ${row.grouped ? 'mt-0.5' : 'mt-2'} ${Array.isArray(row.msg.reactions) && row.msg.reactions.some(r => r?.emoji) ? 'mb-3' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300 message-row-virtualized`}>
                                                {row.msg.type === 'note' ? (
                                                    <div className="w-full flex justify-center my-2">
                                                        <div className="bg-amber-50 border border-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                                                            <AlertCircle className="h-3.5 w-3.5" />
                                                            <span className="font-bold">{row.msg.agentName}:</span>
                                                            {row.msg.text.replace('Internal Note: ', '')}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className={`group relative w-fit max-w-[86%] sm:max-w-[76%] lg:max-w-[64%] xl:max-w-[58%] wa-bubble text-[#111b21] ${row.msg.sender === 'user'
                                                        ? `wa-bubble-in ${!row.grouped ? 'wa-bubble-tail-in' : ''}`
                                                        : `wa-bubble-out ${!row.grouped ? 'wa-bubble-tail-out' : ''}`
                                                        } ${(row.msg.content?.template || row.msg.content?.interactive?.type === 'button') ? 'p-0' : 'px-2.5 py-1.5'}`}>
                                                        <div className={`absolute top-1 ${row.msg.sender === 'user' ? '-right-9' : '-left-9'} opacity-0 transition-opacity group-hover:opacity-100 ${activeMessageMenuId === row.msg.id ? 'opacity-100' : ''}`} data-message-menu>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => openMessageMenu(e, row.msg)}
                                                                className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-gray-600 shadow-sm ring-1 transition hover:text-gray-900 ${activeMessageMenuId === row.msg.id ? 'ring-gray-900' : 'ring-gray-200'}`}
                                                                title="Message actions"
                                                            >
                                                                <ChevronDown className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                        {renderMessageSourceBadge(row.msg, row.msg.content?.template || row.msg.content?.interactive?.type === 'button')}
                                                        {renderMessageBody(row.msg)}
                                                        {renderReactionsPill(row.msg)}
                                                        {!(row.msg.content?.template || row.msg.content?.interactive?.type === 'button') && renderMessageMeta(row.msg)}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                {isThreadLoading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[#efeae2]/80 z-20 backdrop-blur-sm">
                                        <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/85 backdrop-blur-md border border-white/60 shadow-lg animate-in fade-in duration-300">
                                            <svg className="animate-spin h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                        </div>
                                    </div>
                                )}

                                {/* Jump to Latest button (relative to message area scroll boundary) */}
                                {(showJumpToLatest || newMessagesPending > 0) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            scrollToBottom('smooth')
                                            setNewMessagesPending(0)
                                        }}
                                        className="absolute bottom-4 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#54656f] shadow-[0_2px_8px_rgba(11,20,26,0.18)] transition hover:bg-gray-50 hover:text-[#111b21] active:scale-95"
                                        title={newMessagesPending > 0 ? `${newMessagesPending} new message${newMessagesPending > 1 ? 's' : ''}` : 'Jump to latest'}
                                    >
                                        <ArrowDown className="h-5 w-5" />
                                        {newMessagesPending > 0 && (
                                            <span className="absolute right-0.5 top-0.5 flex h-3 w-3 rounded-full bg-[#25d366] ring-2 ring-[#00a884]" />
                                        )}
                                    </button>
                                )}
                            </div>

                            {activeMenuMessage && messageMenuAnchor && (
                                <>
                                    {/* Backdrop for mobile */}
                                    <div
                                        onClick={closeMessageMenu}
                                        className="fixed inset-0 z-[79] bg-black/50 backdrop-blur-sm sm:hidden transition-opacity duration-300 animate-in fade-in"
                                    />
                                    <div
                                        data-message-menu
                                        className="fixed bottom-0 left-0 right-0 z-[80] w-full rounded-t-3xl border-t border-gray-200 bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out sm:fixed sm:bottom-auto sm:left-auto sm:right-auto sm:w-56 sm:overflow-hidden sm:rounded-2xl sm:border sm:p-0 sm:shadow-2xl sm:z-[80] animate-in slide-in-from-bottom sm:animate-none"
                                        style={typeof window !== 'undefined' && window.innerWidth >= 640 ? {
                                            top: `${messageMenuAnchor.top}px`,
                                            left: `${messageMenuAnchor.left}px`,
                                        } : undefined}
                                    >
                                        {/* Handle bar on mobile */}
                                        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200 sm:hidden" />

                                        {/* Horizontal reactions at the top */}
                                        <div className="flex items-center justify-between gap-1 border-b border-gray-100 pb-3 mb-3 sm:pb-2 sm:mb-0 sm:px-3 sm:py-2">
                                            {QUICK_REACTIONS.map(item => (
                                                <button
                                                    key={item.label}
                                                    type="button"
                                                    onClick={() => sendReaction(activeMenuMessage, item.emoji)}
                                                    className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-full transition hover:scale-110 hover:bg-gray-100"
                                                    title={item.label}
                                                >
                                                    <EmojiAsset emoji={item.emoji} label={item.label} className="h-6 w-6 sm:h-5 sm:w-5" />
                                                </button>
                                            ))}
                                        </div>
                                        <div className="py-1">
                                            <button
                                                type="button"
                                                onClick={() => startReplyToMessage(activeMenuMessage)}
                                                className="flex w-full items-center gap-3 px-4 py-3 sm:py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 rounded-xl sm:rounded-none font-semibold sm:font-normal"
                                            >
                                                <Reply className="h-5 w-5 sm:h-4 sm:w-4 text-gray-500" />
                                                Reply
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => copyMessageText(activeMenuMessage)}
                                                className="flex w-full items-center gap-3 px-4 py-3 sm:py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 rounded-xl sm:rounded-none font-semibold sm:font-normal"
                                            >
                                                <Copy className="h-5 w-5 sm:h-4 sm:w-4 text-gray-500" />
                                                Copy
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => forwardMessage(activeMenuMessage)}
                                                className="flex w-full items-center gap-3 px-4 py-3 sm:py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 rounded-xl sm:rounded-none font-semibold sm:font-normal"
                                            >
                                                <Forward className="h-5 w-5 sm:h-4 sm:w-4 text-gray-500" />
                                                Forward
                                            </button>
                                            <div className="my-1.5 sm:my-1 border-t border-gray-100" />
                                            <button
                                                type="button"
                                                onClick={() => deleteMessageLocal(activeMenuMessage)}
                                                className="flex w-full items-center gap-3 px-4 py-3 sm:py-2.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-xl sm:rounded-none font-semibold sm:font-normal"
                                            >
                                                <Trash2 className="h-5 w-5 sm:h-4 sm:w-4" />
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}



                            {forwardingMessage && (
                                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4 py-6">
                                    <div className="flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                                        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={closeForwardModal}
                                                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
                                                title="Close"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-base font-semibold text-gray-900">Forward to</div>
                                                <div className="truncate text-xs text-gray-500">
                                                    {forwardSelectedIds.length > 0 ? `${forwardSelectedIds.length} selected` : 'Select one or more chats'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={sendForwardedMessages}
                                                disabled={forwardSelectedIds.length === 0 || isForwarding}
                                                className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white shadow-md transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                                                title="Forward"
                                            >
                                                {isForwarding ? <Clock className="h-5 w-5 animate-spin" /> : <WhatsAppSendIcon className="h-5 w-5" />}
                                            </button>
                                        </div>

                                        <div className="border-b border-gray-100 px-4 py-3">
                                            <div className="relative">
                                                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                                                <input
                                                    type="text"
                                                    value={forwardSearch}
                                                    onChange={(e) => setForwardSearch(e.target.value)}
                                                    placeholder="Search chats"
                                                    className="w-full rounded-full border-0 bg-gray-100 py-2.5 pl-11 pr-4 text-sm text-gray-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-green-500/40"
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                                <div className="flex items-center gap-1 text-[11px] italic text-gray-500">
                                                    <Forward className="h-3 w-3" />
                                                    Forwarded
                                                </div>
                                                <div className="mt-1 line-clamp-2 text-sm text-gray-800">
                                                    {getForwardableText(forwardingMessage)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="min-h-0 flex-1 overflow-y-auto py-1">
                                            {forwardRecipientChats.length === 0 ? (
                                                <div className="px-6 py-10 text-center text-sm text-gray-500">No chats found.</div>
                                            ) : (
                                                forwardRecipientChats.map(chat => {
                                                    const selected = forwardSelectedIds.some(id => idsEqual(id, chat.id))
                                                    return (
                                                        <button
                                                            key={chat.id}
                                                            type="button"
                                                            onClick={() => toggleForwardRecipient(chat.id)}
                                                            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selected ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                                                        >
                                                            <div className="relative shrink-0">
                                                                {chat.profilePhotoUrl ? (
                                                                    <img
                                                                        src={chat.profilePhotoUrl}
                                                                        alt={chat.name}
                                                                        className="h-11 w-11 rounded-full object-cover"
                                                                        loading="lazy"
                                                                        onError={() => clearBrokenProfilePhoto(chat.contactId, chat.profilePhotoUrl)}
                                                                    />
                                                                ) : (
                                                                    <DiceBearAvatar seed={chat.name} className="h-11 w-11 rounded-full object-cover ring-1 ring-gray-200" />
                                                                )}
                                                                <div className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${selected ? 'bg-green-500 text-white' : 'bg-white text-transparent ring-1 ring-gray-300'}`}>
                                                                    <Check className="h-3.5 w-3.5" />
                                                                </div>
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate text-sm font-semibold text-gray-900">{chat.name}</div>
                                                                <div className="truncate text-xs text-gray-500">{chat.lastMessage}</div>
                                                            </div>
                                                        </button>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Input Area */}
                            <div data-tour="chat-composer" className={`px-2 py-1.5 sm:px-4 sm:py-2.5 lg:px-5 ${isInternalNote ? 'border-t border-amber-200 bg-amber-50' : 'bg-[#f0f2f5]'}`}>
                                {!botEnabled && (
                                    <div className="mx-auto mb-2 flex w-full max-w-[1180px] items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-amber-50/70 to-white/90 px-3.5 py-2 shadow-xs backdrop-blur-md animate-in fade-in duration-200">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 ring-1 ring-amber-200/80">
                                                <Bot className="h-4 w-4" />
                                            </span>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="relative flex h-2 w-2 shrink-0">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                </span>
                                                <span className="truncate text-xs font-medium text-amber-950 sm:text-sm">
                                                    AI Agent is paused for this conversation. You are talking directly with the customer.
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => toggleBotForConversation(true, selectedBotId || workspaceAutoReplyBot?.id || null)}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300/80 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 shadow-xs hover:bg-amber-100/70 hover:border-amber-400 transition-all active:scale-[0.98]"
                                        >
                                            <Bot className="h-3.5 w-3.5 text-amber-700" />
                                            <span>Resume AI Bot</span>
                                        </button>
                                    </div>
                                )}
                                {isCustomerWindowExpired && !isInternalNote && (
                                    <div className="mx-auto mb-2 flex w-full max-w-[1180px] flex-col gap-3 rounded-2xl bg-[#fffbfa] p-3 sm:p-4 shadow-sm border border-rose-100 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 bg-rose-50 p-1.5 rounded-full shrink-0">
                                                <AlertCircle className="h-4.5 w-4.5 text-rose-600" />
                                            </div>
                                            <div className="min-w-0 text-xs sm:text-sm leading-relaxed text-gray-700">
                                                <div className="font-bold text-gray-900 text-sm mb-0.5">24 Hour Limit</div>
                                                <p className="text-gray-600">
                                                    WhatsApp does not allow sending normal messages 24 hours after the user's last message. You can still initiate contact using a template message.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={openTemplateSender}
                                            className="inline-flex h-10 w-full sm:w-auto shrink-0 items-center justify-center rounded-xl bg-[#00a884] hover:bg-[#029977] px-2 text-sm font-bold text-white transition-all duration-200 shadow-sm shadow-green-100 active:scale-[0.98] outline-none"
                                        >
                                            Send Template
                                        </button>
                                    </div>
                                )}
                                <form onSubmit={handleSendMessage} className={`mx-auto flex w-full max-w-[1180px] items-end gap-1 sm:gap-2 ${isCustomerWindowExpired && !isInternalNote ? 'justify-end' : ''}`}>
                                    {!isCustomerWindowExpired && (
                                        <div className="flex items-center gap-0.5 sm:gap-1 pb-0.5 shrink-0">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEmojiOpen(v => !v)}
                                                    className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full text-[#54656f] transition-colors hover:bg-black/5 hover:text-[#111b21]"
                                                    title="Emoji"
                                                >
                                                    <Smile className="h-5 w-5 sm:h-6 sm:w-6" />
                                                </button>

                                                {isEmojiOpen && (
                                                    <div className="absolute bottom-12 left-0 z-20 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                                                        <div className="text-[11px] font-bold text-gray-500 mb-2">Emoji</div>
                                                        <div className="grid grid-cols-8 gap-1">
                                                            {EMOJI_PICKER_ITEMS.map(e => (
                                                                <button
                                                                    key={e}
                                                                    type="button"
                                                                    onClick={() => insertEmoji(e)}
                                                                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
                                                                >
                                                                    <EmojiAsset emoji={e} className="h-5 w-5" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full text-[#54656f] transition-colors hover:bg-black/5 hover:text-[#111b21]"
                                                title="Attach file"
                                            >
                                                <Paperclip className="h-5 w-5 sm:h-6 sm:w-6" />
                                            </button>
                                        </div>
                                    )}
                                    {(!isCustomerWindowExpired || isInternalNote) && (
                                        <div className="flex flex-1 flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-all focus-within:ring-1 focus-within:ring-black/10">
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                className="hidden"
                                                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0] || null
                                                    setSelectedFile(f)
                                                    if (f) {
                                                        setPendingAudio(null)
                                                        setIsAudioPanelOpen(false)
                                                    }
                                                }}
                                            />

                                            {selectedFile && !isCustomerWindowExpired && (
                                                <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                                                    <div className="text-xs text-gray-700 truncate">
                                                        Attached: <span className="font-medium">{selectedFile.name}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedFile(null)}
                                                        className="text-xs text-gray-500 hover:text-gray-700"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            )}

                                            {isAudioPanelOpen && !isInternalNote && !isCustomerWindowExpired && (
                                                <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
                                                    <AudioRecorderOrUploader value={pendingAudio} onChange={setPendingAudio} />
                                                </div>
                                            )}

                                            {isInternalNote && (
                                                <div className="flex items-center gap-1 border-b border-amber-100 bg-amber-100/50 px-3 py-1 text-[10px] font-bold text-amber-700">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Internal Note (Private)
                                                </div>
                                            )}
                                            {replyingTo && !isInternalNote && (
                                                <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-green-50 px-3 py-2">
                                                    <div className="min-w-0 border-l-4 border-green-500 pl-2">
                                                        <div className="text-xs font-semibold text-green-800">
                                                            Replying to {replyingTo.sender === 'agent' ? 'You' : (selectedChat?.name || 'contact')}
                                                        </div>
                                                        <div className="truncate text-xs text-gray-600">{replyingTo.text || 'Original message'}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setReplyingTo(null)}
                                                        className="rounded-full p-1 text-gray-500 hover:bg-white hover:text-gray-800"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            )}
                                            <textarea
                                                ref={messageInputRef}
                                                value={messageText}
                                                onChange={handleTextChange}
                                                placeholder={isInternalNote ? "Type an internal note..." : "Type a message..."}
                                                rows={1}
                                                className="max-h-42 min-h-[36px] sm:min-h-[42px] w-full resize-none border-0 bg-transparent px-2 sm:px-4 py-[7px] sm:py-[11px] text-sm sm:text-[15px] leading-5 text-[#111b21] outline-none placeholder:text-[#8696a0] focus:border-transparent focus:outline-none focus:ring-0"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendMessage(e);
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-0.5 sm:gap-1 pb-0.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsInternalNote(v => !v)
                                                setIsAudioPanelOpen(false)
                                                setPendingAudio(null)
                                            }}
                                            className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full transition-all ${isInternalNote ? 'bg-amber-200 text-amber-800' : 'text-[#54656f] hover:bg-black/5 hover:text-[#111b21]'}`}
                                            title="Internal note"
                                        >
                                            <FileText className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                        </button>

                                        {(messageText.trim() || selectedFile || pendingAudio?.file) && (!isCustomerWindowExpired || isInternalNote) ? (
                                            <button type="submit" className="flex h-8 w-8 sm:h-10 sm:w-10 scale-100 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition-all duration-200 hover:bg-[#029977] active:scale-95">
                                                <WhatsAppSendIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                            </button>
                                        ) : (!isCustomerWindowExpired && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isInternalNote) return
                                                    setIsAudioPanelOpen(v => !v)
                                                }}
                                                className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full text-[#54656f] transition-all hover:bg-black/5 hover:text-[#111b21]"
                                                title="Audio message"
                                            >
                                                <Mic className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                            </button>
                                        ))}
                                    </div>
                                </form>
                            </div>
                        </>
                    )}
                </div>

                <ContactProfileDrawer
                    isOpen={isContactDrawerOpen}
                    onClose={() => {
                        setIsContactDrawerOpen(false)
                        setFocusAliasOnOpen(false)
                    }}
                    focusAliasOnOpen={focusAliasOnOpen}
                    botEnabled={botEnabled}
                    onToggleBot={(enabled) => toggleBotForConversation(enabled, selectedBotId)}
                    messages={filteredMessages}
                    conversationId={selectedChat?.id || null}
                    contact={selectedChat?.contact ? {
                        ...selectedChat.contact,
                        // UI fallbacks
                        name: selectedChat.contact.name || selectedChat?.name || 'Unknown',
                        phone: selectedChat.contact.phone || selectedChat?.phone || selectedChat?.waId || '',
                        wa_id: selectedChat.contact.wa_id || selectedChat?.waId || '',
                        profile_photo_url: selectedChat.contact.profile_photo_url || selectedChat?.profilePhotoUrl || '',
                        tags: selectedChat.contact.tags || [],
                        custom_fields: selectedChat.contact.custom_fields || {},
                    } : {
                        id: null,
                        name: selectedChat?.name || 'Unknown',
                        custom_name: null,
                        phone: selectedChat?.phone || selectedChat?.waId || '',
                        wa_id: selectedChat?.waId || '',
                        profile_photo_url: selectedChat?.profilePhotoUrl || '',
                        tags: selectedChat?.contact?.tags || [],
                        created_at: selectedChat?.contact?.created_at || null,
                        custom_fields: selectedChat?.contact?.custom_fields || {},
                    }}
                    onContactUpdated={(updated) => {
                        if (!updated) return
                        setChats(prev => prev.map(c => {
                            const sameById = updated?.id && idsEqual(c?.contactId, updated.id)
                            const sameByWa = updated?.wa_id && String(c?.waId || '') === String(updated.wa_id)
                            if (!sameById && !sameByWa) return c
                            const nextContact = { ...(c.contact || {}), ...updated }
                            return { ...c, contact: nextContact, name: getDisplayName(nextContact), profilePhotoUrl: getProfilePhotoUrl(nextContact) }
                        }))
                        setSelectedChat(prev => {
                            if (!prev) return prev
                            const nextContact = { ...(prev.contact || {}), ...updated }
                            return { ...prev, contact: nextContact, name: getDisplayName(nextContact), profilePhotoUrl: getProfilePhotoUrl(nextContact) }
                        })
                    }}
                />
                {/* Auto Assign Modal */}
                {isAutoAssignModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <Bot className="h-5 w-5 text-green-500" /> Auto Assign Rules
                                </h3>
                                <button onClick={() => setIsAutoAssignModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                                    <ChevronLeft className="h-5 w-5 rotate-180" />
                                </button>
                            </div>
                            <div className="p-5 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-gray-800 text-sm">Enable Auto Assignment</p>
                                        <p className="text-xs text-gray-500 mt-1">Automatically distribute new chats equally to available agents.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={draftAutoAssignSettings.enabled}
                                            onChange={(e) => setDraftAutoAssignSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                    </label>
                                </div>

                                {draftAutoAssignSettings.enabled && (
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm">Chats per Agent (Batch Size)</p>
                                            <p className="text-xs text-gray-500 mt-1">Number of consecutive chats assigned to an agent before rotating to the next one.</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={draftAutoAssignSettings.batch_size}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (val > 0) setDraftAutoAssignSettings(prev => ({ ...prev, batch_size: val }));
                                                }}
                                                className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-semibold focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                                            />
                                            <span className="text-sm text-gray-500 font-medium">chats at a time</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                                <button
                                    onClick={() => setIsAutoAssignModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveAutoAssignRules}
                                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Agent Status Modal */}
                {isAgentStatusModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[80vh]">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <User className="h-5 w-5 text-blue-500" /> Agent Status Control
                                </h3>
                                <button onClick={() => setIsAgentStatusModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                                    <ChevronLeft className="h-5 w-5 rotate-180" />
                                </button>
                            </div>
                            <div className="p-4 border-b border-gray-50 shrink-0">
                                <p className="text-xs text-gray-500">Pause an agent to temporarily stop them from receiving new auto-assigned chats (e.g., if they are absent today).</p>
                            </div>
                            <div className="overflow-y-auto p-4 space-y-3 flex-1 custom-scrollbar">
                                {orgAgents.length === 0 ? (
                                    <p className="text-center text-sm text-gray-500 py-4">No agents found in this organization.</p>
                                ) : (
                                    orgAgents.map((agent) => {
                                        const isPaused = draftPausedAgents.includes(agent.user_id);
                                        return (
                                            <div key={agent.user_id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-white shadow-sm">
                                                <div>
                                                    <p className="font-semibold text-sm text-gray-800">{agent.name || 'Unnamed Agent'}</p>
                                                    <p className="text-xs text-gray-500">{agent.email}</p>
                                                </div>
                                                <button
                                                    onClick={() => toggleDraftAgentPause(agent.user_id)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${isPaused
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                        : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                                        }`}
                                                >
                                                    {isPaused ? 'Paused' : 'Active'}
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 shrink-0">
                                <button
                                    onClick={() => setIsAgentStatusModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveAgentStatus}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                    Save Status
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AudioPlayerProvider>
    )
}

