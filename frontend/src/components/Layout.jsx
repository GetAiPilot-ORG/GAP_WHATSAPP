import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState, useRef } from 'react'
import Sidebar from './Sidebar'
import Modal from './Modal'
import { Bell, User, LogOut, AlertCircle, Save, Loader2, Mail, Shield, ExternalLink, Menu, Moon, SunMedium, X, CheckCircle2, AlertTriangle, Check, Sparkles, ArrowRight, Megaphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { OnboardingProvider } from '../onboarding/OnboardingProvider'
import TourButton from '../onboarding/TourButton'
import { formatINRFromPaise } from '../config/whatsappPricing'
import { supabase } from '../supabaseClient'

const NIGHT_LIGHT_KEY = 'gap_night_light_enabled'

export default function Layout() {
    const { user, userRole, loading, isProfileLoading, memberProfile, signOut, updateMyProfile, apiCall, updateMyOnlineStatus, setMemberProfile } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const isTemplateWizard = location.pathname === '/templates/new'
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isSavingProfile, setIsSavingProfile] = useState(false)
    const [profileError, setProfileError] = useState('')
    const [profileDraft, setProfileDraft] = useState({ name: '', avatar_color: '#4f46e5' })
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
    const [isNightLight, setIsNightLight] = useState(() => localStorage.getItem(NIGHT_LIGHT_KEY) === 'true')
    const handleStatusToggle = async () => {
        if (!memberProfile) return
        const nextStatus = !memberProfile.is_online
        
        // Optimistic UI Update
        setMemberProfile(prev => prev ? { ...prev, is_online: nextStatus } : prev)
        
        try {
            await updateMyOnlineStatus(nextStatus)
        } catch (e) {
            console.error("Failed to toggle online status in navbar", e)
            // Revert state on failure
            setMemberProfile(prev => prev ? { ...prev, is_online: !nextStatus } : prev)
        }
    }

    const [walletBalance, setWalletBalance] = useState(null)
    const [isWalletLoading, setIsWalletLoading] = useState(true)
    const [toasts, setToasts] = useState([])
    const transactionBufferRef = useRef({})
    const notificationSignatureRef = useRef({})

    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
    const [notifications, setNotifications] = useState([])
    const [readIds, setReadIds] = useState(() => {
        try {
            const stored = localStorage.getItem('gap_read_notifications')
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    })
    const [dismissedIds, setDismissedIds] = useState(() => {
        try {
            const stored = localStorage.getItem('gap_dismissed_notifications')
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    })
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(true)
    const [profileBilling, setProfileBilling] = useState(null)
    const [isLoadingProfileBilling, setIsLoadingProfileBilling] = useState(false)

    // Save to localStorage when states change
    useEffect(() => {
        localStorage.setItem('gap_read_notifications', JSON.stringify(readIds))
    }, [readIds])

    useEffect(() => {
        localStorage.setItem('gap_dismissed_notifications', JSON.stringify(dismissedIds))
    }, [dismissedIds])

    // Relative time formatting utility
    const formatRelativeTime = (dateInput) => {
        if (!dateInput) return '';
        try {
            const date = new Date(dateInput);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            if (diffMs < 0) return 'Just now';

            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;

            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${diffHours}h ago`;

            const diffDays = Math.floor(diffHours / 24);
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays}d ago`;

            return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        } catch {
            return 'Recently';
        }
    };

    // Fetch dynamic notifications from database endpoint
    const fetchNotifications = async () => {
        if (!user) return;
        try {
            const res = await apiCall(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/billing/notifications`);
            if (res.ok) {
                const data = await res.json();
                if (data?.notifications) {
                    setNotifications(data.notifications);
                }
            }
        } catch (err) {
            console.error('Failed to fetch notifications in Layout:', err);
        } finally {
            setIsLoadingNotifications(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchNotifications();
            const intervalId = setInterval(fetchNotifications, 60000);
            return () => clearInterval(intervalId);
        }
    }, [user, apiCall]);

    // Compute active list and unread count via useMemo
    const visibleNotifications = useMemo(() => {
        return notifications
            .filter(n => !dismissedIds.includes(n.id))
            .map(n => ({
                ...n,
                read: readIds.includes(n.id)
            }));
    }, [notifications, readIds, dismissedIds]);

    const unreadCount = useMemo(() => {
        return visibleNotifications.filter(n => !n.read).length;
    }, [visibleNotifications]);

    // Close on click outside
    useEffect(() => {
        if (!isNotificationsOpen) return;
        const handleOutsideClick = (e) => {
            if (!e.target.closest('.gap-bell-dropdown-container')) {
                setIsNotificationsOpen(false);
            }
        };
        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, [isNotificationsOpen]);

    const handleMarkAllAsRead = () => {
        const unreadItems = visibleNotifications.filter(n => !n.read);
        const newReadIds = [...readIds, ...unreadItems.map(n => n.id)];
        setReadIds(newReadIds);
    }

    const handleMarkAsRead = (id) => {
        if (!readIds.includes(id)) {
            setReadIds(prev => [...prev, id]);
        }
    }

    const handleDismissNotification = (id, e) => {
        e.stopPropagation()
        setDismissedIds(prev => [...prev, id]);
    }


    useEffect(() => {
        let active = true;
        const fetchWallet = async () => {
            try {
                const res = await apiCall(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/billing/wallet`);
                if (res.ok) {
                    const data = await res.json();
                    if (active && data?.wallet) {
                        setWalletBalance(data.wallet.balance_paise);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch wallet in Layout:', err);
            } finally {
                if (active) setIsWalletLoading(false);
            }
        };

        if (user) {
            fetchWallet();
        }

        return () => {
            active = false;
        };
    }, [user, location.pathname, apiCall]);

    useEffect(() => {
        if (!isProfileOpen || !user) return;
        let active = true;
        const fetchProfileBilling = async () => {
            setIsLoadingProfileBilling(true);
            try {
                const res = await apiCall(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/billing/overview`);
                if (res.ok && active) {
                    const data = await res.json();
                    setProfileBilling(data);
                }
            } catch (err) {
                console.error('Failed to fetch profile billing in Layout:', err);
            } finally {
                if (active) setIsLoadingProfileBilling(false);
            }
        };
        fetchProfileBilling();
        return () => {
            active = false;
        };
    }, [isProfileOpen, user, apiCall]);

    // Supabase Realtime Wallet & Campaigns Subscription
    useEffect(() => {
        if (!user || !memberProfile?.organization_id) return;

        const triggerCampaignNotification = (campaignId, stageInfo = 'realtime_event') => {
            if (!campaignId) return;

            if (!transactionBufferRef.current[campaignId]) {
                transactionBufferRef.current[campaignId] = {
                    campaignId,
                    timeoutId: null,
                    lastFired: 0
                };
            }

            const buf = transactionBufferRef.current[campaignId];
            const now = Date.now();
            const timeSinceLastFire = now - buf.lastFired;

            if (buf.timeoutId) {
                clearTimeout(buf.timeoutId);
            }

            // Priority events bypass standard debounce
            const isPriority = stageInfo.includes('wallet_transaction') || stageInfo.includes('completed') || stageInfo.includes('cancelled') || stageInfo.includes('failed');
            const delay = isPriority ? 100 : (timeSinceLastFire > 2500 ? 200 : 2500);

            buf.timeoutId = setTimeout(async () => {
                buf.lastFired = Date.now();
                let campaignName = 'Campaign';
                let totalMessages = 0;
                let sent_count = 0;
                let failed_count = 0;
                let delivered_count = 0;
                let read_count = 0;
                let status = 'processing';
                let campaignRow = null;

                try {
                    const { data: campaign, error: campaignErr } = await supabase
                        .from('w_campaigns')
                        .select('id, organization_id, name, status, schema_version, total_contacts, accepted_count, sent_count, delivered_count, read_count, failed_count, results, created_at, completed_at')
                        .eq('id', campaignId)
                        .eq('organization_id', memberProfile.organization_id)
                        .maybeSingle();

                    if (campaignErr) {
                        console.error('Failed to fetch campaign for real-time notification:', campaignErr);
                        return;
                    }

                    if (!campaign) {
                        delete transactionBufferRef.current[campaignId];
                        return;
                    }

                    campaignRow = campaign;
                    campaignName = campaign.name || 'Campaign';
                    status = campaign.status || 'processing';
                    if (Number(campaign.schema_version || 1) >= 2) {
                        totalMessages = Number(campaign.total_contacts || 0);
                        sent_count = Number(campaign.accepted_count ?? campaign.sent_count ?? 0);
                        failed_count = Number(campaign.failed_count ?? 0);
                        delivered_count = Number(campaign.delivered_count ?? 0);
                        read_count = Number(campaign.read_count ?? 0);
                    } else {
                        const results = Array.isArray(campaign.results) ? campaign.results : [];
                        totalMessages = results.length || Number(campaign.total_contacts || 0);
                        sent_count = results.filter(r => ['accepted', 'sent', 'delivered', 'read'].includes(r?.status)).length;
                        delivered_count = results.filter(r => ['delivered', 'read'].includes(r?.status)).length;
                        read_count = results.filter(r => r?.status === 'read').length;
                        failed_count = results.filter(r => r?.status === 'failed').length;
                    }
                } catch (err) {
                    console.error('Error fetching campaign details for notification:', err);
                    return;
                }

                // Query database ledger transactions for exact finances
                let total_charged = 0;
                let total_refunded = 0;
                try {
                    const { data: txs, error: txsErr } = await supabase
                        .from('whatsapp_wallet_transactions')
                        .select('type, amount_paise, metadata, created_at')
                        .eq('organization_id', memberProfile.organization_id)
                        .eq('status', 'completed')
                        .filter('metadata->>campaign_id', 'eq', campaignId);

                    if (txsErr) {
                        console.error('Failed to fetch transactions for campaign notification:', txsErr);
                        return;
                    }

                    if (txs) {
                        txs.forEach(tx => {
                            const val = Math.abs(tx.amount_paise || 0);
                            if (['message_debit', 'campaign_reserve'].includes(tx.type)) {
                                total_charged += val;
                            } else if (['message_refund', 'refund', 'campaign_release'].includes(tx.type)) {
                                total_refunded += val;
                            }
                        });
                    }
                } catch (err) {
                    console.error('Error calculating campaign transaction costs:', err);
                    return;
                }

                const total_charged_formatted = formatINRFromPaise(total_charged);
                const total_refunded_formatted = formatINRFromPaise(total_refunded);
                const net_cost_formatted = formatINRFromPaise(total_charged - total_refunded);
                const signature = JSON.stringify({
                    campaignId,
                    status,
                    totalMessages,
                    sent_count,
                    failed_count,
                    delivered_count,
                    read_count,
                    total_charged,
                    total_refunded,
                    updated_at: campaignRow?.updated_at || null,
                    completed_at: campaignRow?.completed_at || null
                });
                const signatureChanged = notificationSignatureRef.current[campaignId] !== signature;
                notificationSignatureRef.current[campaignId] = signature;

                const notifId = `campaign-${campaignId}`;

                let toastTitle = 'Campaign Started';
                let toastDesc = `${totalMessages} messages · ${total_charged_formatted} charged`;

                if (status === 'processing') {
                    toastTitle = 'Campaign Progress';
                    toastDesc = `Sent ${sent_count}/${totalMessages} · ${failed_count} failed`;
                } else if (status === 'completed') {
                    toastTitle = 'Campaign Completed';
                    toastDesc = `Delivered ${delivered_count}/${totalMessages} · Failed ${failed_count}\nNet Cost ${net_cost_formatted}`;
                } else if (status === 'failed') {
                    toastTitle = 'Campaign Failed';
                    toastDesc = `Failed to process. Delivered ${delivered_count}/${totalMessages} · ${failed_count} failed\nNet Cost ${net_cost_formatted}`;
                } else if (status === 'cancelled') {
                    toastTitle = 'Campaign Cancelled';
                    toastDesc = `Cancelled. Delivered ${delivered_count}/${totalMessages} · ${failed_count} failed\nNet Cost ${net_cost_formatted}`;
                } else if (total_refunded > 0) {
                    toastTitle = 'Campaign Refund Processed';
                    toastDesc = `${failed_count} failed messages · ${total_refunded_formatted} refunded to wallet`;
                }

                let newNotif;
                try {
                    newNotif = {
                        id: notifId,
                        title: toastTitle,
                        message: toastDesc,
                        type: 'campaign',
                        time: new Date().toISOString(),
                        read: false,
                        link: `/broadcast?campaignId=${campaignId}`,
                        metadata: {
                            campaignName,
                            status,
                            total_messages: totalMessages,
                            sent_count,
                            delivered_count,
                            read_count,
                            failed_count,
                            total_charged: total_charged_formatted,
                            total_refunded: total_refunded_formatted,
                            net_cost: net_cost_formatted
                        }
                    };
                } catch (err) {
                    console.error('Failed to compile notification payload:', err);
                    delete transactionBufferRef.current[campaignId];
                    return;
                }

                // Render Bell notifications state
                try {
                    setNotifications(prev => {
                        const filtered = prev.filter(n => n.id !== notifId);
                        return [newNotif, ...filtered];
                    });
                } catch (err) {
                    console.error('Failed to update bell notifications state:', err);
                }

                // Render Toast notifications state
                try {
                    if (signatureChanged) {
                        setToasts(prev => {
                            const filtered = prev.filter(t => t.id !== notifId);
                            const toastItem = {
                                id: notifId,
                                title: toastTitle,
                                campaignName,
                                description: toastDesc,
                                type: status === 'completed' || status === 'failed' || status === 'cancelled' ? 'completed' : total_refunded > 0 ? 'refund' : 'debit'
                            };
                            // Setup auto-dismiss timeout for this toast
                            setTimeout(() => {
                                setToasts(curr => curr.filter(t => t.id !== notifId));
                            }, 6000);
                            return [...filtered, toastItem];
                        });
                    }
                } catch (err) {
                    console.error('Failed to update toast notifications state:', err);
                }

                // Delete buffer
                delete transactionBufferRef.current[campaignId];
            }, delay);
        };

        const handleTxEvent = (newTx) => {
            // Update wallet balance in header
            setWalletBalance(prev => {
                if (prev === null) return prev;
                return prev + Number(newTx.amount_paise || 0);
            });

            // Parse JSONB metadata safely in case it is serialized as string in postgres_changes payload
            let metadata = newTx.metadata;
            if (typeof metadata === 'string') {
                try {
                    metadata = JSON.parse(metadata);
                } catch (err) {
                    console.error('Failed to parse wallet transaction metadata:', err);
                }
            }

            const campaignId = metadata?.campaign_id || null;
            if (campaignId) {
                triggerCampaignNotification(campaignId, 'wallet_transaction_insert');
            }
        };

        const txChannel = supabase
            .channel(`wallet_tx_realtime:${memberProfile.organization_id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'whatsapp_wallet_transactions',
                    filter: `organization_id=eq.${memberProfile.organization_id}`
                },
                (payload) => {
                    handleTxEvent(payload.new);
                }
            );

        txChannel.subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || err) {
                console.error('Real-time subscription failed for wallet transactions:', err || status);
            }
        });

        const campaignsChannel = supabase
            .channel(`campaigns_realtime:${memberProfile.organization_id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'w_campaigns',
                    filter: `organization_id=eq.${memberProfile.organization_id}`
                },
                (payload) => {
                    const campaignId = payload.new?.id || null;
                    if (campaignId) {
                        triggerCampaignNotification(campaignId, `campaign_table_${payload.eventType}`);
                    }
                }
            );

        const usageLogsChannel = supabase
            .channel(`usage_logs_realtime:${memberProfile.organization_id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'whatsapp_message_usage_logs',
                    filter: `organization_id=eq.${memberProfile.organization_id}`
                },
                (payload) => {
                    const campaignId = payload.new?.campaign_id || payload.old?.campaign_id || null;
                    const deliveryStatus = payload.new?.delivery_status || payload.old?.delivery_status || null;
                    const billingStatus = payload.new?.billing_status || payload.old?.billing_status || null;
                    if (campaignId && (deliveryStatus || billingStatus)) {
                        triggerCampaignNotification(campaignId, `usage_log_${payload.eventType}`);
                    }
                }
            );

        usageLogsChannel.subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || err) {
                console.error('Real-time subscription failed for usage logs:', err || status);
            }
        });

        campaignsChannel.subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || err) {
                console.error('Real-time subscription failed for campaigns:', err || status);
            }
        });

        return () => {
            supabase.removeChannel(txChannel);
            supabase.removeChannel(campaignsChannel);
            supabase.removeChannel(usageLogsChannel);
            if (window.testNotificationPipeline) {
                delete window.testNotificationPipeline;
            }
        };
    }, [memberProfile?.organization_id, user]);

    const formatPlanDate = (dateString) => {
        if (!dateString) return 'N/A'
        try {
            const date = new Date(dateString)
            if (Number.isNaN(date.getTime())) return 'N/A'
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        } catch {
            return 'N/A'
        }
    }

    const getDaysRemaining = (endDateString) => {
        if (!endDateString) return null
        try {
            const end = new Date(endDateString)
            const now = new Date()
            const diffTime = end.getTime() - now.getTime()
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            return diffDays > 0 ? diffDays : 0
        } catch {
            return null
        }
    }

    const getUpgradeRecommendation = (currentPlanId) => {
        const pId = String(currentPlanId || '').toLowerCase()
        if (pId.includes('pro') || pId.includes('ultimate') || pId.includes('max') || pId.includes('ecosystem')) {
            return null
        }
        if (pId.includes('growth')) {
            return {
                name: 'Pro',
                price: '₹3,499/mo',
                features: ['50,000 contacts', '10 agents', 'API & Webhooks']
            }
        }
        return {
            name: 'Growth',
            price: '₹1,999/mo',
            features: ['10,000 contacts', 'Unlimited flows', 'Broadcast campaigns']
        }
    }

    const isOwner = userRole === 'owner'
    const isLiveChat = location.pathname === '/live-chat'
    const isFlowBuilder = location.pathname.startsWith('/flow-builder')
    const isIndustryLibrary = location.pathname.startsWith('/templates/industries')
    const displayName = memberProfile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
    const avatarColor = memberProfile?.avatar_color || user?.user_metadata?.avatar_color || '#4f46e5'
    const userEmail = memberProfile?.email || user?.email || ''
    const roleLabel = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'User'
    const avatarInitials = useMemo(() => {
        const parts = String(displayName || 'User').trim().split(/\s+/).filter(Boolean)
        return (parts[0]?.[0] || 'U') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
    }, [displayName])

    useEffect(() => {
        if (!isProfileOpen) return
        setProfileDraft({
            name: displayName,
            avatar_color: avatarColor,
        })
        setProfileError('')
    }, [isProfileOpen, displayName, avatarColor])

    useEffect(() => {
        setIsMobileNavOpen(false)
    }, [location.pathname])

    useEffect(() => {
        document.documentElement.classList.toggle('fp-night-light', isNightLight)
        localStorage.setItem(NIGHT_LIGHT_KEY, String(isNightLight))
        localStorage.removeItem('gap_appearance_mode')
    }, [isNightLight])

    const planName = String(user?.plan || '').toLowerCase();
    const isWhatsAppPlan = planName.includes('whatsapp') || planName.includes('ultimate') || planName.includes('ecosystem') || planName.includes('all_in_one') || planName.includes('bundle') || planName.includes('starter') || planName.includes('growth') || planName.includes('pro') || planName.includes('gap') || planName.includes('max') || planName.includes('core');
    const hasActiveSubscription = user?.subscription_status === 'active' && isWhatsAppPlan;

    const handleDirectLogout = async () => {
        setIsLoggingOut(true);
        try {
            await signOut();
            navigate('/login');
        } catch (err) {
            console.error('Logout error:', err);
            navigate('/login');
        } finally {
            setIsLoggingOut(false);
        }
    };

    if (loading || (user && !user.subscription_checked)) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (!user) return <Navigate to="/login" replace />
    if (userRole === null) return null

    if (!hasActiveSubscription) {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 p-4 font-sans z-[9999]">
                <div className="w-full max-w-lg bg-white/85 backdrop-blur-md rounded-3xl border border-gray-200/80 shadow-2xl p-8 sm:p-10 flex flex-col items-center text-center">
                    {/* Logo */}
                    <div className="h-16 w-16 bg-gradient-to-tr from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg rotate-3 hover:rotate-0 transition-transform duration-300">
                        <img src="/logo.png" alt="GetAiPilot" className="h-9 w-9 object-contain" />
                    </div>

                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">GAP WhatsApp Access Locked</h2>
                    <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-sm">
                        An active WhatsApp Starter, Growth, Pro, or All-in-One plan subscription is required to access your WhatsApp automations.
                    </p>

                    {/* Features Locker Info */}
                    <div className="w-full bg-slate-50/80 rounded-2xl border border-slate-100 p-5 my-6 text-left space-y-3.5">
                        <div className="flex items-start gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">✓</span>
                            <div>
                                <p className="text-sm font-bold text-gray-900 leading-none">Official Meta Cloud API Connection</p>
                                <p className="text-xs text-gray-500 mt-1">Connect official business numbers or QR sessions securely.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">✓</span>
                            <div>
                                <p className="text-sm font-bold text-gray-900 leading-none">AI Chatbots & Interactive Flows</p>
                                <p className="text-xs text-gray-500 mt-1">Deploy automated answers and visual multi-step dialogs.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">✓</span>
                            <div>
                                <p className="text-sm font-bold text-gray-900 leading-none">Broadcasts & Campaigns</p>
                                <p className="text-xs text-gray-500 mt-1">Send bulk marketing/notification messages using approved templates.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <a
                            href="https://getaipilot.in/pricing"
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-md shadow-indigo-100"
                        >
                            Upgrade Plan / Unlock Now
                            <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                            type="button"
                            onClick={handleDirectLogout}
                            disabled={isLoggingOut}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log Out of Session'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Redirect non-owners to live-chat if they try to access restricted paths
    if (!isOwner && location.pathname !== '/live-chat') {
        return <Navigate to="/live-chat" replace />
    }

    const handleLogoutClick = () => {
        setIsLogoutConfirmOpen(true)
    }

    const handleConfirmLogout = async () => {
        setIsLoggingOut(true)
        try {
            await signOut()
            setIsLogoutConfirmOpen(false)
            navigate('/login')
        } catch (err) {
            console.error('Logout error:', err)
            // Even if it fails on server, we should usually force a redirect or clear local state
            setIsLogoutConfirmOpen(false)
            navigate('/login')
        } finally {
            setIsLoggingOut(false)
        }
    }

    const handleContinueToGetAiPilot = () => {
        setIsLogoutConfirmOpen(false)
        window.location.href = 'https://getaipilot.in'
    }

    const handleCancelLogout = () => {
        setIsLogoutConfirmOpen(false)
    }

    const avatarColors = ['#4f46e5', '#16a34a', '#0891b2', '#dc2626', '#db2777', '#ea580c']

    const handleSaveProfile = async (e) => {
        e.preventDefault()
        const name = profileDraft.name.trim()
        if (!name) {
            setProfileError('Name is required.')
            return
        }
        setIsSavingProfile(true)
        setProfileError('')
        try {
            await updateMyProfile({
                name,
                avatar_color: profileDraft.avatar_color
            })
            setIsProfileOpen(false)
        } catch (err) {
            setProfileError(err?.message || 'Failed to update profile.')
        } finally {
            setIsSavingProfile(false)
        }
    }
    return (
        <OnboardingProvider>
            <div className="fixed inset-0 flex min-w-0 bg-[#f5f7fa]">
                <Sidebar
                    onRequestLogout={handleLogoutClick}
                    isMobileOpen={isMobileNavOpen}
                    onMobileClose={() => setIsMobileNavOpen(false)}
                />

                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    {/* Topbar */}
                    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 sm:h-16 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setIsMobileNavOpen(true)}
                                data-tour="mobile-menu-button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 md:hidden"
                                aria-label="Open navigation"
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                            <TourButton compact />
                            {user && ['agent', 'admin'].includes(userRole) && memberProfile && (
                                <button
                                    type="button"
                                    onClick={handleStatusToggle}
                                    className={`relative inline-flex h-9 w-[98px] shrink-0 items-center rounded-full border p-1 transition-all duration-300 ease-out active:scale-[0.97] cursor-pointer shadow-inner ${
                                        memberProfile.is_online
                                            ? 'border-emerald-250 bg-emerald-100/50 hover:bg-emerald-100/80 text-emerald-800'
                                            : 'border-gray-200 bg-gray-100/65 hover:bg-gray-100/85 text-gray-500'
                                    }`}
                                    title={memberProfile.is_online ? "You are online (Click to go offline)" : "You are offline (Click to go online)"}
                                >
                                    <span
                                        className={`absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white border border-gray-200/80 shadow-[0_2px_5px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-out ${
                                            memberProfile.is_online ? 'translate-x-[62px]' : 'translate-x-0'
                                        }`}
                                    >
                                        <span className="relative flex h-2 w-2 shrink-0">
                                            {memberProfile.is_online && (
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            )}
                                            <span className={`relative inline-flex rounded-full h-2 w-2 ${memberProfile.is_online ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                                        </span>
                                    </span>
                                    
                                    {memberProfile.is_online ? (
                                        <span className="pl-2.5 pr-1.5 mr-auto text-[10px] font-black uppercase tracking-wider text-emerald-700 select-none">
                                            Online
                                        </span>
                                    ) : (
                                        <span className="pl-1.5 pr-2.5 ml-auto text-[10px] font-black uppercase tracking-wider text-gray-500 select-none">
                                            Offline
                                        </span>
                                    )}
                                </button>
                            )}
                            {user && (
                                <button
                                    type="button"
                                    onClick={() => navigate('/billing')}
                                    className="group flex items-center gap-2.5 rounded-full border border-gray-200 bg-white pl-2 pr-4 py-1 hover:bg-gray-50/80 hover:border-gray-300  active:scale-[0.98] transition-all duration-200 shadow-sm cursor-pointer"
                                    title="Message Wallet Balance (Click to recharge)"
                                >
                                    <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100/30 overflow-hidden">
                                        <img
                                            src="/images/money.png"
                                            alt="Wallet"
                                            className="h-5 w-5 object-contain group-hover:scale-110 transition-transform duration-300 drop-shadow-sm"
                                        />
                                    </div>
                                    <div className="flex flex-col items-start leading-none">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider group-hover:text-gray-500 transition-colors">Wallet</span>
                                        <span className=" text-xs font-bold text-gray-800 tracking-tight">
                                            {isWalletLoading ? (
                                                <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-gray-200" />
                                            ) : (
                                                formatINRFromPaise(walletBalance ?? 0)
                                            )}
                                        </span>
                                    </div>
                                </button>
                            )}
                            <div className="relative hidden md:block">
                                <button
                                    type="button"
                                    onClick={() => setIsNightLight(prev => !prev)}
                                    className={`relative inline-flex h-9 w-[86px] items-center rounded-full border p-1 transition-all duration-300 ease-out ${isNightLight
                                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                    aria-label={isNightLight ? 'Switch to normal light' : 'Switch to night light'}
                                    aria-pressed={isNightLight}
                                >
                                    <span className="sr-only">{isNightLight ? 'Night Light is on' : 'Light mode is on'}</span>
                                    <span
                                        className={`absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 ease-out ${isNightLight ? 'translate-x-[49px] text-amber-700' : 'translate-x-0 text-[#0064b7]'
                                            }`}
                                    >
                                        {isNightLight ? <Moon className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
                                    </span>
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${isNightLight ? 'text-amber-700/40' : 'text-transparent'}`}>
                                        <SunMedium className="h-3.5 w-3.5" />
                                    </span>
                                    <span className={`ml-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${isNightLight ? 'text-transparent' : 'text-gray-400'}`}>
                                        <Moon className="h-3.5 w-3.5" />
                                    </span>
                                </button>
                            </div>
                            <div className="relative gap-bell-dropdown-container">
                                <button
                                    type="button"
                                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                    className={`relative rounded-full p-2 transition-colors duration-200 ${isNotificationsOpen ? 'bg-gray-150 text-gray-800' : 'text-gray-400 hover:bg-gray-105 hover:text-gray-505'}`}
                                    aria-label="Open notifications tray"
                                >
                                    <Bell className="h-5 w-5 text-gray-450 hover:text-gray-600 transition-colors" />
                                    {unreadCount > 0 && (
                                        <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-450 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                    )}
                                </button>

                                {/* Dropdown panel */}
                                <div
                                    style={{ borderRadius: '14px' }}
                                    className={`absolute right-0 mt-3.5 w-80 sm:w-96 origin-top-right border border-neutral-200/80 bg-white/95 backdrop-blur-xl shadow-[0_24px_50px_rgba(0,0,0,0.12)] transition-all duration-200 ease-out transform z-50 overflow-hidden ${isNotificationsOpen
                                        ? 'opacity-100 scale-100 translate-y-0'
                                        : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                                        }`}
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between border-b border-neutral-100/90 px-4 py-3 bg-[#fafafa]/80">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-neutral-900 tracking-wider uppercase font-mono">Alert Inbox</span>
                                            {unreadCount > 0 && (
                                                <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold text-white font-mono leading-none">
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        {unreadCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleMarkAllAsRead}
                                                className="text-[10px] font-bold text-neutral-500 hover:text-neutral-900 transition-colors uppercase tracking-wider font-mono"
                                            >
                                                Mark all as read
                                            </button>
                                        )}
                                    </div>

                                    {/* Body */}
                                    <div
                                        className="max-h-[360px] overflow-y-auto py-1.5 scrollbar-thin scrollbar-thumb-neutral-200 scrollbar-track-transparent"
                                        style={{ scrollbarWidth: 'thin' }}
                                    >
                                        {isLoadingNotifications ? (
                                            <div className="p-3 space-y-2.5">
                                                {[1, 2, 3].map(i => (
                                                    <div key={i} className="flex gap-3 items-start p-2.5 rounded-xl border border-neutral-100/50 bg-neutral-50/20 animate-pulse animate-duration-1000">
                                                        <div className="h-7 w-7 rounded-lg bg-neutral-200 shrink-0" />
                                                        <div className="flex-1 space-y-2 py-0.5">
                                                            <div className="h-3 bg-neutral-200 rounded w-1/3" />
                                                            <div className="h-2.5 bg-neutral-200 rounded w-5/6" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : visibleNotifications.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                                <p className="mt-3 text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono">All Caught Up</p>
                                                <p className="mt-1 text-[11px] text-neutral-500">No new wallet or system alerts at this moment.</p>
                                            </div>
                                        ) : (
                                            visibleNotifications.map(item => {
                                                const isCritical = item.type === 'critical';
                                                const isError = item.type === 'error';
                                                const isSuccess = item.type === 'success';
                                                const isWarning = item.type === 'warning';

                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => {
                                                            handleMarkAsRead(item.id);
                                                            setIsNotificationsOpen(false);
                                                            if (item.link) navigate(item.link);
                                                        }}
                                                        className={`group relative flex items-start gap-3 px-3 py-2.5 mx-2 my-1 rounded-xl border transition-all duration-155 cursor-pointer hover:bg-neutral-50/50 active:scale-[0.99] ${!item.read
                                                            ? 'bg-[#0070d1]/[0.02] border-neutral-150'
                                                            : 'bg-transparent border-transparent'
                                                            }`}
                                                        style={{ borderRadius: '10px' }}
                                                    >
                                                        {/* Pulsing blue unread dot indicator */}
                                                        {!item.read && (
                                                            <span className="absolute left-1.5 top-4.5 h-1.5 w-1.5 rounded-full bg-[#0070d1] animate-pulse" />
                                                        )}
                                                        {/* Status Icon Indicator */}
                                                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs shadow-[0_1px_2px_rgba(0,0,0,0.01)] ${
                                                            item.type === 'campaign'
                                                                ? item.metadata?.status === 'completed'
                                                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                                                    : item.metadata?.status === 'failed'
                                                                        ? 'bg-rose-50 border-rose-100 text-rose-600'
                                                                        : 'bg-indigo-50 border-indigo-100 text-indigo-600'
                                                                : isCritical
                                                                    ? 'bg-rose-50 border-rose-100 text-rose-600'
                                                                    : isError
                                                                        ? 'bg-red-50 border-red-100 text-red-600'
                                                                        : isSuccess
                                                                            ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                                                            : isWarning
                                                                                ? 'bg-amber-50 border-amber-100 text-amber-600'
                                                                                : 'bg-neutral-50 border-neutral-200 text-neutral-600'
                                                            }`}
                                                        >
                                                            {item.type === 'campaign' ? (
                                                                <Megaphone className="h-3.5 w-3.5" />
                                                            ) : isCritical ? (
                                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                            ) : isError ? (
                                                                <AlertCircle className="h-3.5 w-3.5" />
                                                            ) : isSuccess ? (
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                            ) : isWarning ? (
                                                                <AlertCircle className="h-3.5 w-3.5" />
                                                            ) : (
                                                                <Bell className="h-3.5 w-3.5" />
                                                            )}
                                                        </div>

                                                        {/* Details */}
                                                        <div className="min-w-0 flex-1 pr-4 font-sans text-xs">
                                                            {item.type === 'campaign' ? (
                                                                <div className="space-y-1.5">
                                                                    <p className={`text-[13px] font-bold tracking-tight ${!item.read ? 'text-neutral-900' : 'text-neutral-650'}`}>
                                                                        {item.title}
                                                                    </p>
                                                                    <div className="text-[11px] font-medium text-neutral-500 space-y-1 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100/50">
                                                                        <div className="flex justify-between items-center pb-1 border-b border-neutral-100/60">
                                                                            <span className="font-bold text-neutral-805 truncate max-w-[180px]">{item.metadata?.campaignName}</span>
                                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                                                                item.metadata?.status === 'completed'
                                                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                                                    : item.metadata?.status === 'failed'
                                                                                        ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                                                                        : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                                                            }`}>
                                                                                {item.metadata?.status}
                                                                            </span>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 font-mono text-[10px]">
                                                                            <div>Total: <span className="font-bold text-neutral-800">{item.metadata?.total_messages}</span></div>
                                                                            <div>Sent: <span className="font-bold text-neutral-800">{item.metadata?.sent_count}</span></div>
                                                                            <div>Delivered: <span className="font-bold text-neutral-800">{item.metadata?.delivered_count}</span></div>
                                                                            <div>Read: <span className="font-bold text-neutral-800">{item.metadata?.read_count}</span></div>
                                                                            <div className="col-span-2 text-rose-600">Failed: <span className="font-bold">{item.metadata?.failed_count}</span></div>
                                                                        </div>
                                                                        <div className="pt-1.5 mt-1 border-t border-neutral-100/60 grid grid-cols-3 gap-1 font-mono text-[9px] text-neutral-500">
                                                                            <div>Charged: <span className="font-bold text-neutral-700">₹{item.metadata?.total_charged}</span></div>
                                                                            <div>Refunded: <span className="font-bold text-emerald-600">₹{item.metadata?.total_refunded}</span></div>
                                                                            <div>Net: <span className="font-bold text-neutral-900">₹{item.metadata?.net_cost}</span></div>
                                                                        </div>
                                                                    </div>
                                                                    <span className="block text-[8px] font-bold text-neutral-450 uppercase tracking-wider font-mono">
                                                                        {formatRelativeTime(item.time)}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <p className={`text-xs font-semibold tracking-tight leading-tight ${!item.read ? 'text-neutral-900' : 'text-neutral-600'}`}>
                                                                        {item.title}
                                                                    </p>
                                                                    <p className="mt-0.5 text-[11px] leading-normal text-neutral-500 font-medium">
                                                                        {item.message}
                                                                    </p>
                                                                    <span className="mt-1 block text-[8px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                                                                        {formatRelativeTime(item.time)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Dismiss button */}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDismissNotification(item.id, e)}
                                                            className="absolute right-2 top-2 rounded p-0.5 text-neutral-400 opacity-0 hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100 transition-all focus:opacity-100"
                                                            aria-label="Dismiss notification"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                </div>
                            </div>
                            <div className="relative flex min-w-0 items-center gap-2 sm:gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsProfileOpen(true)}
                                    className="flex min-w-0 items-center gap-2 rounded-full bg-[#f5f7fa] p-1 pr-2 transition-colors hover:bg-gray-100 sm:pr-3"
                                    title="Edit profile"
                                >
                                    <div
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white overflow-hidden"
                                        style={avatarColor?.startsWith('/images/avatars/') ? {} : { backgroundColor: avatarColor }}
                                    >
                                        {isProfileLoading ? (
                                            <User className="h-4 w-4" />
                                        ) : avatarColor?.startsWith('/images/avatars/') ? (
                                            <img src={avatarColor} className="h-full w-full object-cover" alt={displayName} />
                                        ) : (
                                            avatarInitials.toUpperCase()
                                        )}
                                    </div>
                                    <span className="hidden max-w-[120px] truncate text-sm font-medium capitalize text-gray-700 sm:inline">{displayName}</span>
                                </button>
                                <button
                                    onClick={handleLogoutClick}
                                    className="hidden items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 sm:flex"
                                >
                                    <LogOut className="h-4 w-4 shrink-0" />
                                    <span className="hidden sm:inline">Logout</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main data-tour="page-content" className={`min-w-0 flex-1 ${isLiveChat ? 'overflow-hidden p-0' : (isFlowBuilder || isIndustryLibrary || isTemplateWizard) ? 'overflow-y-auto p-0' : 'overflow-y-auto p-3 sm:p-5 lg:p-6'}`}>
                        <Outlet />
                    </main>

                    {/* Profile Modal */}
                    <Modal
                        isOpen={isProfileOpen}
                        onClose={() => !isSavingProfile && setIsProfileOpen(false)}
                        title="My Profile"
                        maxWidth="max-w-lg"
                    >
                        <form onSubmit={handleSaveProfile} className="space-y-4 font-sans">
                            {/* Header card (Vercel/Apple Style) */}
                            <div className="flex items-center gap-4 rounded-2xl border border-neutral-100 bg-[#fafafa]/50 p-4 relative overflow-hidden">
                                <div
                                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-sm ring-4 ring-white overflow-hidden"
                                    style={profileDraft.avatar_color?.startsWith('/images/avatars/') ? {} : { backgroundColor: profileDraft.avatar_color }}
                                >
                                    {profileDraft.avatar_color?.startsWith('/images/avatars/') ? (
                                        <img src={profileDraft.avatar_color} className="h-full w-full object-cover" alt="Profile preview" />
                                    ) : (
                                        String(profileDraft.name || displayName || 'U').trim().charAt(0).toUpperCase() || 'U'
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="truncate text-base font-bold text-neutral-900 tracking-tight">{profileDraft.name || displayName}</h3>
                                    <p className="truncate text-xs font-medium text-neutral-400 mt-0.5">{userEmail}</p>
                                </div>
                            </div>

                            {profileError && (
                                <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-2.5 text-xs text-red-700 font-medium">
                                    {profileError}
                                </div>
                            )}

                            {/* Display Name Input */}
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-bold text-neutral-400 uppercase tracking-wider">Display name</span>
                                <input
                                    value={profileDraft.name}
                                    onChange={(e) => setProfileDraft(prev => ({ ...prev, name: e.target.value }))}
                                    maxLength={80}
                                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 transition-all placeholder-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                                    placeholder="Your name"
                                />
                            </label>

                            {/* Avatar Customization */}
                            <div className="space-y-4">
                                <div>
                                    <div className="mb-2 text-xs font-bold text-neutral-450 uppercase tracking-wider">Avatar Color Theme</div>
                                    <div className="flex flex-wrap gap-2.5">
                                        {avatarColors.map(color => (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={() => setProfileDraft(prev => ({ ...prev, avatar_color: color }))}
                                                className={`h-7 w-7 rounded-full border-2 transition-all duration-200 hover:scale-105 active:scale-95 ${profileDraft.avatar_color === color ? 'border-neutral-900 ring-2 ring-neutral-900/10' : 'border-white ring-1 ring-neutral-200'}`}
                                                style={{ backgroundColor: color }}
                                                aria-label={`Use avatar color ${color}`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-bold text-neutral-450 uppercase tracking-wider">Or Select Premium Character Avatar</div>
                                    <div className="flex flex-wrap gap-4 mt-3">
                                        {[
                                            { path: '/images/avatars/male_one.png', label: 'Male Avatar 1' },
                                            { path: '/images/avatars/male_two.png', label: 'Male Avatar 2' },
                                            { path: '/images/avatars/female_one.png', label: 'Female Avatar 1' },
                                            { path: '/images/avatars/female_two.png', label: 'Female Avatar 2' },
                                        ].map(av => (
                                            <button
                                                key={av.path}
                                                type="button"
                                                onClick={() => setProfileDraft(prev => ({ ...prev, avatar_color: av.path }))}
                                                className={`group relative h-14 w-14 shrink-0 rounded-full border-2 overflow-hidden transition-all duration-200 hover:scale-105 active:scale-95 ${profileDraft.avatar_color === av.path ? 'border-neutral-900 ring-2 ring-neutral-900/10 bg-neutral-50' : 'border-neutral-100 hover:border-neutral-300 bg-[#fafafa]/50'}`}
                                                aria-label={av.label}
                                            >
                                                <img src={av.path} className="h-full w-full object-cover p-1 transition-transform group-hover:scale-110" alt={av.label} />
                                                {profileDraft.avatar_color === av.path && (
                                                    <div className="absolute inset-0 bg-neutral-900/5 flex items-center justify-center">
                                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm ring-1 ring-white">
                                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </span>
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Compact Integrated Billing section */}
                            {isLoadingProfileBilling && !profileBilling ? (
                                <div className="rounded-2xl border border-neutral-100 bg-[#fafafa]/50 p-4 animate-pulse h-[88px] flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <div className="h-3.5 bg-neutral-200 rounded w-1/4" />
                                        <div className="h-4 bg-neutral-200 rounded w-1/3" />
                                    </div>
                                    <div className="h-3 bg-neutral-150 rounded w-1/2" />
                                </div>
                            ) : (() => {
                                const planId = profileBilling?.organization?.plan_id || user?.plan;
                                const isActivePlan = (profileBilling?.organization?.plan_status === 'active' || user?.subscription_status === 'active') && !!planId;
                                const endDate = profileBilling?.organization?.plan_end_date;
                                const daysLeft = endDate ? getDaysRemaining(endDate) : null;
                                const upgradeRecommend = planId ? getUpgradeRecommendation(planId) : null;

                                return (
                                    <div className="rounded-2xl border border-neutral-100 bg-gradient-to-br from-white to-[#fafafa] p-4 relative overflow-hidden transition-all duration-300 hover:border-neutral-200">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">Subscription Plan</span>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${isActivePlan ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10' : 'bg-neutral-100 text-neutral-600 ring-neutral-500/10'}`}>
                                                        {isActivePlan ? 'Active' : 'No Plan'}
                                                    </span>
                                                    {isActivePlan && daysLeft !== null && (
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${daysLeft < 5 ? 'bg-rose-50 text-rose-700 ring-rose-600/10 animate-pulse' : 'bg-indigo-50 text-indigo-700 ring-indigo-700/10'}`}>
                                                            {daysLeft} days left
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-base font-bold text-neutral-900 mt-1.5">
                                                    {isActivePlan ? (profileBilling?.current_plan?.name || planId) : 'Free Tier'}
                                                </h4>
                                                <p className="text-[11px] text-neutral-500 mt-0.5">
                                                    {isActivePlan ? `Cycle ends on ${formatPlanDate(endDate)}` : 'Access basic free WhatsApp features.'}
                                                </p>
                                            </div>

                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsProfileOpen(false);
                                                        navigate('/billing');
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-xl bg-neutral-950 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-neutral-800 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                                                >
                                                    {isActivePlan ? 'Manage Billing' : 'Upgrade Plan'}
                                                    <ArrowRight className="h-3 w-3" />
                                                </button>
                                                {isActivePlan && upgradeRecommend && (
                                                    <span className="text-[9px] font-semibold text-neutral-455">
                                                        Next: {upgradeRecommend.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Grid of details (Email / Role) */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-neutral-100 bg-[#fafafa]/50 p-3.5 flex items-center gap-3">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-neutral-100 text-neutral-500 shadow-sm">
                                        <Mail className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <span className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Email Address</span>
                                        <span className="block truncate text-sm font-semibold text-neutral-800 mt-0.5">{userEmail || 'Not available'}</span>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-neutral-100 bg-[#fafafa]/50 p-3.5 flex items-center gap-3">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-neutral-100 text-neutral-500 shadow-sm">
                                        <Shield className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <span className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Workspace Role</span>
                                        <span className="block truncate text-sm font-semibold text-neutral-800 mt-0.5">{roleLabel}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions (Vercel/Apple style) */}
                            <div className="flex justify-end gap-2.5 pt-3 border-t border-neutral-100">
                                <button
                                    type="button"
                                    onClick={() => setIsProfileOpen(false)}
                                    disabled={isSavingProfile}
                                    className="h-10 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-bold text-neutral-600 hover:bg-neutral-50 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingProfile}
                                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-neutral-950 px-4 text-xs font-bold text-white hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-neutral-950/10"
                                >
                                    {isSavingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </Modal>

                    <Modal
                        isOpen={isLogoutConfirmOpen}
                        onClose={handleCancelLogout}
                        title="Sign out options"
                        maxWidth="max-w-lg"
                    >
                        <div className="space-y-6">
                            {/* Apple-style minimal header/info banner */}
                            <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 transition-all duration-200">
                                <div className="flex items-start gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-gray-500 border border-gray-200 shadow-sm">
                                        <AlertCircle className="h-5 w-5" />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 leading-tight">Choose how you want to leave this workspace</p>
                                        <p className="mt-1.5 text-xs leading-relaxed text-gray-500 font-medium">
                                            You can keep this session active for GetAiPilot, or fully sign out and return to the login page.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Interactive Option Cards (Apple x Vercel) */}
                            <div className="grid gap-4">
                                <button
                                    onClick={handleContinueToGetAiPilot}
                                    disabled={isLoggingOut}
                                    className="group flex w-full items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-50/[0.02] hover:shadow-md hover:shadow-emerald-500/[0.01] hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 border border-gray-200 shadow-sm group-hover:bg-emerald-50 group-hover:text-emerald-600 group-hover:border-emerald-200 transition-colors">
                                        <ExternalLink className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-gray-950 group-hover:text-emerald-950 transition-colors leading-none">Keep me signed in</span>
                                        <span className="mt-2 block text-xs leading-relaxed text-gray-500 font-medium group-hover:text-emerald-800/85 transition-colors">
                                            Go to GetAiPilot without ending your current workspace session.
                                        </span>
                                    </span>
                                    <span className="flex h-10 items-center text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all">
                                        <ExternalLink className="h-4 w-4" />
                                    </span>
                                </button>

                                <button
                                    onClick={handleConfirmLogout}
                                    disabled={isLoggingOut}
                                    className="group flex w-full items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all duration-300 hover:border-red-500/30 hover:bg-red-50/[0.02] hover:shadow-md hover:shadow-red-500/[0.01] hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                                >
                                    {isLoggingOut ? (
                                        <>
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-650 border border-red-200 shadow-sm">
                                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-gray-900 leading-none">Signing out...</span>
                                                <span className="mt-2 block text-xs leading-relaxed text-gray-500 font-medium">Please wait while we close your session.</span>
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 border border-gray-200 shadow-sm group-hover:bg-red-50 group-hover:text-red-600 group-hover:border-red-200 transition-colors">
                                                <LogOut className="h-4 w-4" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-gray-950 group-hover:text-red-950 transition-colors leading-none">Sign out and go to login</span>
                                                <span className="mt-2 block text-xs leading-relaxed text-gray-500 font-medium group-hover:text-red-800/85 transition-colors">
                                                    End this session on this browser and return to the login screen.
                                                </span>
                                            </span>
                                            <span className="flex h-10 items-center text-gray-300 group-hover:text-red-650 group-hover:translate-x-0.5 transition-all">
                                                <LogOut className="h-4 w-4" />
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Footer Section */}
                            <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-2">
                                <p className="text-xs text-gray-400 font-medium">Nothing changes until you choose an option.</p>
                                <button
                                    onClick={handleCancelLogout}
                                    disabled={isLoggingOut}
                                    className="inline-flex h-9 items-center justify-center rounded-full border border-gray-300 bg-white px-5 text-xs font-semibold text-gray-750 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-900 active:scale-98 disabled:opacity-50"
                                >
                                    Stay here
                                </button>
                            </div>
                        </div>
                    </Modal>

                    {/* Toast notifications container */}
                    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
                        <style>{`
                            @keyframes slideIn {
                                from { transform: translateY(20px); opacity: 0; }
                                to { transform: translateY(0); opacity: 1; }
                            }
                            .animate-slide-in {
                                animation: slideIn 0.3s ease-out forwards;
                            }
                        `}</style>
                        {toasts.map(toast => (
                            <div
                                key={toast.id}
                                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-300 animate-slide-in backdrop-blur-md ${
                                    toast.type === 'refund'
                                        ? 'bg-amber-50/95 border-amber-200/60'
                                        : toast.type === 'completed'
                                            ? 'bg-emerald-50/95 border-emerald-200/60'
                                            : 'bg-white/95 border-neutral-200'
                                }`}
                            >
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs ${
                                    toast.type === 'refund'
                                        ? 'bg-amber-100 border-amber-200 text-amber-700'
                                        : toast.type === 'completed'
                                            ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                                            : toast.type === 'debit'
                                                ? 'bg-neutral-50 border-neutral-100 text-neutral-600'
                                                : 'bg-blue-50 border-blue-100 text-blue-600'
                                }`}>
                                    {toast.type === 'refund' ? (
                                        <AlertTriangle className="h-4 w-4" />
                                    ) : toast.type === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                    ) : toast.type === 'debit' ? (
                                        <img src="/images/money.png" className="h-4.5 w-4.5 object-contain" alt="Money" />
                                    ) : (
                                        <Megaphone className="h-4 w-4" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 font-sans">
                                    <p className={`text-xs font-bold leading-tight ${
                                        toast.type === 'refund' ? 'text-amber-900' : toast.type === 'completed' ? 'text-emerald-900' : 'text-neutral-900'
                                    }`}>
                                        {toast.title}
                                    </p>
                                    {toast.campaignName && (
                                        <p className={`text-[11px] font-semibold mt-0.5 ${
                                            toast.type === 'refund' ? 'text-amber-700' : toast.type === 'completed' ? 'text-emerald-700' : 'text-neutral-700'
                                        }`}>
                                            {toast.campaignName}
                                        </p>
                                    )}
                                    <p className={`mt-1 text-[11px] font-medium leading-normal whitespace-pre-line ${
                                        toast.type === 'refund' ? 'text-amber-600' : toast.type === 'completed' ? 'text-emerald-600' : 'text-neutral-500'
                                    }`}>
                                        {toast.description}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                    className={`p-0.5 shrink-0 ${
                                        toast.type === 'refund' ? 'text-amber-400 hover:text-amber-700' : toast.type === 'completed' ? 'text-emerald-400 hover:text-emerald-700' : 'text-neutral-400 hover:text-neutral-700'
                                    }`}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </OnboardingProvider>
    )
}
