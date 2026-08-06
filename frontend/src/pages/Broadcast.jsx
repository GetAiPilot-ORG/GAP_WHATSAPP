import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Send, Users, FileText, Calendar, Check, ArrowRight, LayoutGrid, Loader2, Clock, Trash2, ChevronDown, ChevronUp, Upload, Link as LinkIcon, Info, Wallet, Pause, Play, Phone, MessageSquare, ShieldCheck, TrendingUp, Search, X, Megaphone } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useWhatsAppAccounts } from '../context/WhatsAppAccountContext'
import { formatINRFromPaise } from '../config/whatsappPricing'
import { MESSAGING_TIERS, getMessagingTierLabel } from '../utils/messagingLimits'
import DateTimePicker from '../components/DateTimePicker'
import Modal from '../components/Modal'

const STEPS = [
    { id: 1, name: 'Setup', icon: LayoutGrid },
    { id: 2, name: 'Audience', icon: Users },
    { id: 3, name: 'Message', icon: FileText },
    { id: 4, name: 'Review', icon: Check },
]

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function parseVars(components) {
    const body = components?.find(c => c.type === 'BODY')?.text || ''
    const vars = []
    const seen = new Set()
    for (const match of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
        const key = String(match[1] || '').trim()
        if (!key || seen.has(key)) continue
        seen.add(key)
        vars.push({
            key,
            token: `{{${key}}}`,
            label: /^\d+$/.test(key) ? `Variable {{${key}}}` : key.replace(/[_-]/g, ' ')
        })
    }
    return vars
}

function getTemplateComponentSummary(components = []) {
    const header = components.find(c => c.type === 'HEADER')
    const buttons = components.find(c => c.type === 'BUTTONS')?.buttons || []
    const parts = []
    if (header?.format) parts.push(`${String(header.format).toLowerCase()} header`)
    if (buttons.length) parts.push(`${buttons.length} button${buttons.length > 1 ? 's' : ''}`)
    return parts.length ? parts.join(' · ') : 'Body only'
}

function cleanTemplateMapping(mapping = {}) {
    return Object.fromEntries(
        Object.entries(mapping).filter(([key]) => (
            !key.startsWith('_header_') &&
            !key.startsWith('header_media_') &&
            !key.startsWith('_button_url_') &&
            !key.startsWith('button_url_') &&
            !key.startsWith('_template_')
        ))
    )
}

function parseDynamicUrlButtons(components) {
    const buttons = components?.find(c => c.type === 'BUTTONS')?.buttons || []
    return buttons
        .map((button, index) => ({
            index,
            text: button.text || `Button ${index + 1}`,
            url: button.url || ''
        }))
        .filter(button => String(button.url).includes('{{'))
}

function normalizeDynamicUrlButtonValue(button, value) {
    let cleanValue = String(value || '').trim()
    const templateUrl = String(button?.url || '')
    const placeholderIndex = templateUrl.indexOf('{{')
    const staticPrefix = placeholderIndex >= 0 ? templateUrl.slice(0, placeholderIndex) : ''

    if (staticPrefix && cleanValue.startsWith(staticPrefix)) {
        cleanValue = cleanValue.slice(staticPrefix.length)
    }

    if (staticPrefix.endsWith('/') && cleanValue.startsWith('/')) {
        cleanValue = cleanValue.slice(1)
    }

    return cleanValue
}

function validateDynamicUrlButtonValue(button, value) {
    const rawValue = String(value || '').trim()
    const templateUrl = String(button?.url || '')
    const placeholderIndex = templateUrl.indexOf('{{')
    const staticPrefix = placeholderIndex >= 0 ? templateUrl.slice(0, placeholderIndex) : ''
    const normalizedValue = normalizeDynamicUrlButtonValue(button, rawValue)
    const isAbsoluteUrl = /^https?:\/\//i.test(rawValue)

    if (staticPrefix && isAbsoluteUrl && !rawValue.startsWith(staticPrefix)) {
        return {
            ok: false,
            value: normalizedValue,
            message: `Button "${button.text}" is approved for ${staticPrefix}... Enter only the placeholder part for that approved URL, or create a new Meta template for this different domain.`
        }
    }

    if (staticPrefix && /^https?:\/\//i.test(normalizedValue)) {
        return {
            ok: false,
            value: normalizedValue,
            message: `Button "${button.text}" needs only the URL placeholder value, not a full URL.`
        }
    }

    return {
        ok: !!normalizedValue,
        value: normalizedValue,
        message: `Button "${button.text}" needs the dynamic part of the URL, not the full approved URL. Example: ads, contact, or ?utm_source=whatsapp`
    }
}

export default function Broadcast({ defaultTab = 'new' }) {
    const { session, apiCall } = useAuth()
    const { alertDialog, confirmDialog } = useDialog()
    const token = session?.access_token
    const location = useLocation()
    const navigate = useNavigate()

    const getPreviewText = () => {
        if (!selectedTemplate) return '';
        const bodyComponent = selectedTemplate.components?.find(c => c.type === 'BODY');
        let text = bodyComponent?.text || '';

        variables.forEach(v => {
            const source = campaign.variable_mapping[v.key];
            let replacement = v.token;
            if (source === 'name') {
                replacement = '[Contact Name]';
            } else if (source === 'phone') {
                replacement = '[Contact Phone]';
            } else if (source === 'email') {
                replacement = '[Contact Email]';
            } else if (source?.startsWith('field:')) {
                replacement = `[${source.slice(6)}]`;
            } else if (source === 'custom') {
                replacement = customTexts[v.key] || v.token;
            }
            text = text.replaceAll(v.token, replacement);
        });
        return text;
    };

    const formatWhatsAppText = (text) => {
        if (!text) return '';
        let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        escaped = escaped.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>');
        escaped = escaped.replace(/~(.*?)~/g, '<del>$1</del>');
        escaped = escaped.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded font-mono text-xs">$1</code>');
        escaped = escaped.replace(/\n/g, '<br />');

        return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
    };


    const [activeTab, setActiveTab] = useState(defaultTab) // 'new' | 'history'

    useEffect(() => {
        setActiveTab(defaultTab)
    }, [defaultTab])
    const [campaignsList, setCampaignsList] = useState([])
    const [historySearch, setHistorySearch] = useState('')
    const [historyStatus, setHistoryStatus] = useState('all')
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [historyLoadState, setHistoryLoadState] = useState('idle')
    const [expandedCampaignId, setExpandedCampaignId] = useState(null)
    const [recipientReports, setRecipientReports] = useState({})
    const launchIdempotencyKey = useRef(crypto.randomUUID())

    const [currentStep, setCurrentStep] = useState(1)
    const [campaign, setCampaign] = useState({
        name: '',
        wa_account_id: '',
        scheduled_at: '',
        audience_type: 'saved',
        audience_tag: '',
        template_name: '',
        template_language: 'en_US',
        variable_mapping: {}
    })
    const [customTexts, setCustomTexts] = useState({})
    const [csvData, setCsvData] = useState(null)
    const [csvFileName, setCsvFileName] = useState('')

    const { accounts: waAccounts, isLoading: isAccountsLoading } = useWhatsAppAccounts()
    const [messagingLimits, setMessagingLimits] = useState(null)
    const [messagingLimitsState, setMessagingLimitsState] = useState('idle')
    const [tags, setTags] = useState([])
    const [contacts, setContacts] = useState([])
    const [templates, setTemplates] = useState([])

    const [isLoading, setIsLoading] = useState({ accounts: isAccountsLoading, tags: true, templates: true, contacts: false })
    const [isSending, setIsSending] = useState(false)
    const [sendResult, setSendResult] = useState(null)
    const [billingEstimate, setBillingEstimate] = useState(null)
    const [isEstimating, setIsEstimating] = useState(false)
    const [estimateError, setEstimateError] = useState('')
    const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false)
    const [broadcastAgainCamp, setBroadcastAgainCamp] = useState(null)
    const visibleCampaigns = campaignsList.filter(item => {
        const matchesSearch = !historySearch.trim() ||
            String(item.name || '').toLowerCase().includes(historySearch.trim().toLowerCase()) ||
            String(item.template_name || '').toLowerCase().includes(historySearch.trim().toLowerCase())
        return matchesSearch && (historyStatus === 'all' || item.status === historyStatus)
    })

    const templateUsageCounts = useMemo(() => {
        const counts = {};
        campaignsList.forEach(c => {
            if (c.template_name) {
                counts[c.template_name] = (counts[c.template_name] || 0) + 1;
            }
        });
        return counts;
    }, [campaignsList]);

    const selectedTemplate = templates.find(t => t.name === campaign.template_name && t.language === campaign.template_language)
        || templates.find(t => t.name === campaign.template_name)
    const selectedWaAccount = waAccounts.find(account => account.id === campaign.wa_account_id)
    const variables = selectedTemplate ? parseVars(selectedTemplate.components) : []
    const isVariableMapped = variable => {
        const source = campaign.variable_mapping[variable.key]
        return source && (source !== 'custom' || String(customTexts[variable.key] || '').trim())
    }
    const mappedVariableCount = variables.filter(isVariableMapped).length
    const dynamicUrlButtons = selectedTemplate ? parseDynamicUrlButtons(selectedTemplate.components) : []
    const selectedHeader = selectedTemplate?.components?.find(c => c.type === 'HEADER')
    const selectedHeaderFormat = String(selectedHeader?.format || '').toUpperCase()
    const needsHeaderMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedHeaderFormat)
    const [headerMediaUrl, setHeaderMediaUrl] = useState('')
    const [isHeaderUploading, setIsHeaderUploading] = useState(false)
    const [wabaProfile, setWabaProfile] = useState(null)

    useEffect(() => {
        if (!campaign.wa_account_id || !token) {
            setWabaProfile(null)
            return
        }
        let active = true
        apiCall(`${API_URL}/api/whatsapp/accounts/${campaign.wa_account_id}/business-profile`)
            .then(res => res.json())
            .then(data => {
                if (active && data?.profile) {
                    setWabaProfile(data.profile)
                }
            })
            .catch(err => {
                console.error("Error fetching WABA business profile:", err)
            })
        return () => { active = false }
    }, [campaign.wa_account_id, token])

    // Auto-select first template when entering Step 3
    useEffect(() => {
        if (currentStep === 3 && !campaign.template_name && templates.length > 0) {
            const approved = templates.filter(t => t.status === 'APPROVED')
            if (approved.length > 0) {
                const first = approved[0]
                setHeaderMediaUrl('')
                setCustomTexts({})
                setCampaign(prev => ({
                    ...prev,
                    template_name: first.name,
                    template_language: first.language,
                    variable_mapping: {}
                }))
            }
        }
    }, [currentStep, templates, campaign.template_name])

    // Popup custom selection states
    const [isContactsPopupOpen, setIsContactsPopupOpen] = useState(false)
    const [selectedContactKeys, setSelectedContactKeys] = useState(null)
    const [tempSelectedKeys, setTempSelectedKeys] = useState(new Set())
    const [popupSearch, setPopupSearch] = useState('')
    const [popupFilter, setPopupFilter] = useState('all') // 'all' | 'sent' | 'unsent'
    const [templateCategoryFilter, setTemplateCategoryFilter] = useState('ALL')
    const [templateSearchQuery, setTemplateSearchQuery] = useState('')

    useEffect(() => {
        setSelectedContactKeys(null);
    }, [campaign.audience_type, campaign.audience_tag, csvData]);

    const getContactKey = (c) => c.id || c.phone || c.wa_id;

    const baseAudienceContacts = campaign.audience_type === 'CSV_UPLOAD'
        ? (csvData || [])
        : campaign.audience_type === 'tag' && campaign.audience_tag
            ? contacts.filter(c => Array.isArray(c.tags) && c.tags.includes(campaign.audience_tag))
            : campaign.audience_type === 'saved'
                ? contacts.filter(c => c.saved_at != null)
                : contacts;

    const filteredContacts = selectedContactKeys
        ? baseAudienceContacts.filter(c => selectedContactKeys.has(getContactKey(c)))
        : baseAudienceContacts;

    const visibleFilteredContacts = baseAudienceContacts.filter(c => {
        // Search filter
        const query = popupSearch.trim().toLowerCase();
        const matchesSearch = !query || 
            String(c.custom_name || c.name || '').toLowerCase().includes(query) ||
            String(c.phone || c.wa_id || '').includes(query);
        
        // Tab/sent filter
        let matchesTab = true;
        if (popupFilter === 'sent') {
            matchesTab = Number(c.broadcast_count || 0) > 0;
        } else if (popupFilter === 'unsent') {
            matchesTab = !c.broadcast_count || Number(c.broadcast_count) === 0;
        }
        
        return matchesSearch && matchesTab;
    });

    const availableCustomFields = [...new Set(
        filteredContacts.flatMap(contact => Object.keys(contact?.custom_fields || {}))
    )].sort((a, b) => a.localeCompare(b))

    const selectedTemplateCategory = selectedTemplate?.category || campaign.variable_mapping?._template_category || 'MARKETING'

    const filteredApprovedTemplates = useMemo(() => {
        return templates.filter(t => {
            if (t.status !== 'APPROVED') return false;
            
            // Category filter
            if (templateCategoryFilter !== 'ALL') {
                if (!t.category || t.category.toUpperCase() !== templateCategoryFilter) {
                    return false;
                }
            }
            
            // Search filter
            if (templateSearchQuery.trim()) {
                const query = templateSearchQuery.toLowerCase();
                const bodyText = t.components?.find(c => c.type === 'BODY')?.text || '';
                const nameMatches = String(t.name || '').toLowerCase().includes(query);
                const bodyMatches = bodyText.toLowerCase().includes(query);
                return nameMatches || bodyMatches;
            }
            
            return true;
        });
    }, [templates, templateCategoryFilter, templateSearchQuery]);

    useEffect(() => {
        if (!token) return;

        const validAccounts = (waAccounts || []).filter(acc => acc.whatsapp_business_account_id || acc.phone_number_id);
        if (validAccounts.length > 0) {
            setCampaign(prev => {
                if (!prev.wa_account_id) {
                    return { ...prev, wa_account_id: validAccounts[0].id };
                }
                return prev;
            });
        }

        apiCall(`${API_URL}/api/broadcasts/tags`)
            .then(res => res.json())
            .then(data => { setTags(data?.tags || []); setIsLoading(p => ({ ...p, tags: false })) })
            .catch(() => setIsLoading(p => ({ ...p, tags: false })));

        apiCall(`${API_URL}/api/whatsapp/templates`)
            .then(res => res.json())
            .then(data => { setTemplates(Array.isArray(data) ? data : []); setIsLoading(p => ({ ...p, templates: false })) })
            .catch(() => setIsLoading(p => ({ ...p, templates: false })));

        setIsLoading(p => ({ ...p, contacts: true }));
        apiCall(`${API_URL}/api/contacts?include_unsaved=true`)
            .then(res => res.json())
            .then(data => {
                const individuals = (data?.contacts || data || []).filter(c => c.contact_type === 'individual');
                setContacts(individuals);
                setIsLoading(p => ({ ...p, contacts: false }));
            })
            .catch(() => setIsLoading(p => ({ ...p, contacts: false })));
    }, [token]);

    useEffect(() => {
        if (!campaign.wa_account_id) {
            setMessagingLimits(null)
            setMessagingLimitsState('idle')
            return
        }

        let cancelled = false
        setMessagingLimits(null)
        setMessagingLimitsState('loading')
        apiCall(`${API_URL}/api/whatsapp/accounts/${campaign.wa_account_id}/messaging-limits`)
            .then(async res => {
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.error || 'Could not load Meta messaging limits')
                return data
            })
            .then(data => {
                if (!cancelled) {
                    setMessagingLimits(data)
                    setMessagingLimitsState('success')
                }
            })
            .catch(() => {
                if (!cancelled) setMessagingLimitsState('error')
            })

        return () => { cancelled = true }
    }, [campaign.wa_account_id])

    const fetchCampaignHistory = (silent = false) => {
        if (!silent) {
            setIsLoadingHistory(true);
            setHistoryLoadState('loading');
        }
        apiCall(`${API_URL}/api/broadcasts/campaigns`)
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data?.error || `Could not load campaigns (${res.status})`);
                return data;
            })
            .then(data => {
                setCampaignsList(data.campaigns || []);
                setHistoryLoadState('success');
            })
            .catch(error => {
                console.error(error);
                if (!silent) setHistoryLoadState('error');
            })
            .finally(() => {
                if (!silent) setIsLoadingHistory(false);
            });
    }

    useEffect(() => {
        let interval;
        if (activeTab === 'history' && token) {
            fetchCampaignHistory(false);
            // Auto-refresh history every 5 seconds to show real-time status updates (Processing -> Completed)
            interval = setInterval(() => {
                fetchCampaignHistory(true);
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        }
    }, [activeTab, token]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const campaignId = params.get('campaignId') || location.state?.expandCampaignId;
        if (campaignId && campaignsList.length > 0) {
            const found = campaignsList.find(c => c.id === campaignId);
            if (found) {
                setActiveTab('history');
                setExpandedCampaignId(campaignId);
                if (found.schema_version >= 2) {
                    fetchRecipientReport(campaignId, 1);
                }
                // Clear state or URL search parameters so it doesn't expand on every reload
                window.history.replaceState(null, '', location.pathname);
            }
        }
    }, [location.search, location.state, campaignsList]);

    useEffect(() => {
        if (currentStep !== 4 || !token || !campaign.template_name) return;
        let cancelled = false;

        const fetchEstimate = async () => {
            setIsEstimating(true);
            setEstimateError('');
            try {
                const res = await apiCall(`${API_URL}/api/broadcasts/estimate`, {
                    method: 'POST',
                    body: JSON.stringify({
                        audience_tag: selectedContactKeys ? null : (campaign.audience_type === 'CSV_UPLOAD' || campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? null : campaign.audience_tag),
                        audience_type: selectedContactKeys ? 'CSV_UPLOAD' : (campaign.audience_type === 'CSV_UPLOAD' ? null : (campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? campaign.audience_type : 'tag')),
                        csv_data: selectedContactKeys ? filteredContacts : (campaign.audience_type === 'CSV_UPLOAD' ? csvData : null),
                        template_category: selectedTemplateCategory,
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to estimate broadcast cost');
                if (!cancelled) setBillingEstimate(data);
            } catch (err) {
                if (!cancelled) {
                    setBillingEstimate(null);
                    setEstimateError(err.message || 'Failed to estimate broadcast cost');
                }
            } finally {
                if (!cancelled) setIsEstimating(false);
            }
        };

        fetchEstimate();
        return () => { cancelled = true; };
    }, [currentStep, token, campaign.audience_type, campaign.audience_tag, campaign.template_name, selectedTemplateCategory, csvData, selectedContactKeys]);

    const cancelCampaign = async (id) => {
        const confirmed = await confirmDialog('Are you sure you want to stop this campaign? It will be permanently cancelled.', {
            title: 'Stop & Cancel Campaign',
            tone: 'danger',
            confirmLabel: 'Stop Campaign',
        });
        if (!confirmed) return;
        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/campaigns/${id}/cancel`, {
                method: 'POST'
            });
            if (res.ok) {
                fetchCampaignHistory();
            } else {
                const data = await res.json();
                alertDialog(data.error || 'Failed to cancel campaign', { title: 'Cancellation failed', tone: 'danger' });
            }
        } catch (e) {
            alertDialog('Error: ' + e.message, { title: 'Cancellation failed', tone: 'danger' });
        }
    }

    const updateCampaignState = async (id, action) => {
        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/campaigns/${id}/${action}`, { method: 'POST' })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || `Failed to ${action} campaign`)
            fetchCampaignHistory(true)
        } catch (error) {
            alertDialog(error.message, { title: 'Campaign update failed', tone: 'danger' })
        }
    }

    const fetchRecipientReport = async (campaignId, page = 1) => {
        setRecipientReports(previous => ({
            ...previous,
            [campaignId]: { ...(previous[campaignId] || {}), loading: true }
        }))
        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/campaigns/${campaignId}/recipients?page=${page}&page_size=25`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Could not load delivery report')
            setRecipientReports(previous => ({
                ...previous,
                [campaignId]: { recipients: data.recipients || [], pagination: data.pagination, loading: false }
            }))
        } catch (error) {
            setRecipientReports(previous => ({
                ...previous,
                [campaignId]: { ...(previous[campaignId] || {}), loading: false, error: error.message }
            }))
        }
    }

    const toggleCampaignDetails = (camp) => {
        if (expandedCampaignId === camp.id) {
            setExpandedCampaignId(null)
            return
        }
        setExpandedCampaignId(camp.id)
        if (camp.schema_version >= 2) fetchRecipientReport(camp.id, 1)
    }

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setCsvFileName(file.name);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) {
                alertDialog('CSV is empty', { title: 'CSV import failed', tone: 'warning' });
                return;
            }

            const parseCsvRow = row => {
                const values = []
                let value = ''
                let quoted = false
                for (let index = 0; index < row.length; index++) {
                    const char = row[index]
                    if (char === '"' && quoted && row[index + 1] === '"') {
                        value += '"'
                        index++
                    } else if (char === '"') {
                        quoted = !quoted
                    } else if (char === ',' && !quoted) {
                        values.push(value.trim())
                        value = ''
                    } else {
                        value += char
                    }
                }
                values.push(value.trim())
                return values
            }
            const originalHeaders = parseCsvRow(lines[0]).map(h => h.trim())
            const headers = originalHeaders.map(h => h.toLowerCase());
            const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number'));
            const nameIdx = headers.findIndex(h => h.includes('name'));
            const emailIdx = headers.findIndex(h => h === 'email' || h.includes('email address'));

            if (phoneIdx === -1) {
                alertDialog('CSV must contain a column for phone numbers (e.g. "Phone" or "Number")', { title: 'CSV import failed', tone: 'warning' });
                return;
            }

            const parsed = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = parseCsvRow(lines[i]);
                if (cols[phoneIdx]) {
                    const custom_fields = Object.fromEntries(
                        originalHeaders
                            .map((header, index) => [header, cols[index]?.trim()])
                            .filter(([header, value], index) => (
                                header && value && ![phoneIdx, nameIdx, emailIdx].includes(index)
                            ))
                    )
                    parsed.push({
                        phone: cols[phoneIdx].trim(),
                        name: nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx].trim() : 'Unknown',
                        email: emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx].trim() : '',
                        custom_fields
                    });
                }
            }
            setCsvData(parsed);
        };
        reader.readAsText(file);
    };

    const handleVariableMapChange = (varNum, value) => {
        setCampaign(prev => ({
            ...prev,
            variable_mapping: { ...prev.variable_mapping, [varNum]: value }
        }));
    };

    const validateHeaderMediaUrl = async () => {
        if (!needsHeaderMedia) return true
        const url = headerMediaUrl.trim()
        if (!url) {
            await alertDialog(`This template has a ${selectedHeaderFormat.toLowerCase()} header. Upload media or paste a public URL before sending.`, { title: 'Header media required', tone: 'warning' })
            return false
        }
        if (!/^https?:\/\/.+\..+/.test(url)) {
            await alertDialog('Header media URL must be a public http/https URL.', { title: 'Invalid media URL', tone: 'warning' })
            return false
        }
        if (/^https?:\/\/example\.com\//i.test(url)) {
            await alertDialog('Please replace the example URL with your actual public media URL.', { title: 'Replace example URL', tone: 'warning' })
            return false
        }
        return true
    }

    const syncHeaderMediaUrl = (url) => {
        const cleanUrl = String(url || '').trim()
        const mediaType = selectedHeaderFormat?.toLowerCase() || 'image'
        setHeaderMediaUrl(cleanUrl)
        setCampaign(prev => ({
            ...prev,
            variable_mapping: {
                ...prev.variable_mapping,
                _header_media_type: mediaType,
                _header_media_url: cleanUrl,
                header_media_type: mediaType,
                header_media_url: cleanUrl
            }
        }))
    }

    const handleButtonUrlParamChange = (buttonIndex, value) => {
        const button = dynamicUrlButtons.find(item => item.index === buttonIndex)
        const cleanValue = normalizeDynamicUrlButtonValue(button, value)
        setCampaign(prev => ({
            ...prev,
            variable_mapping: {
                ...prev.variable_mapping,
                [`_button_url_${buttonIndex}`]: cleanValue,
                [`button_url_${buttonIndex}`]: cleanValue
            }
        }))
    }

    const handleHeaderMediaUpload = async (file) => {
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        setIsHeaderUploading(true)
        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/header-media`, {
                method: 'POST',
                body: formData
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to upload header media')
            syncHeaderMediaUrl(data.publicUrl || '')
        } catch (err) {
            alertDialog(err.message, { title: 'Upload failed', tone: 'danger' })
        } finally {
            setIsHeaderUploading(false)
        }
    }

    const handleNext = async () => {
        if (currentStep === 1) {
            if (!campaign.name || !campaign.wa_account_id) return alertDialog('Campaign Name and WA Account are required.', { title: 'Missing campaign details', tone: 'warning' });
            const selectedAccountForCampaign = waAccounts.find(account => account.id === campaign.wa_account_id);
            if (selectedAccountForCampaign && !selectedAccountForCampaign.whatsapp_business_account_id) {
                return alertDialog('QR Session numbers cannot run broadcast campaigns. Select a Meta API account with approved template access.', { title: 'Meta API account required', tone: 'warning' });
            }
        }
        if (currentStep === 2) {
            if (campaign.audience_tag === 'CSV_UPLOAD' && (!csvData || csvData.length === 0)) {
                return alertDialog('Please upload a valid CSV file with contacts.', { title: 'Audience required', tone: 'warning' });
            }
            if (filteredContacts.length === 0) return alertDialog('No contacts selected in audience.', { title: 'Audience required', tone: 'warning' });
        }
        if (currentStep === 3) {
            if (!campaign.template_name) return alertDialog('Please select a template.', { title: 'Template required', tone: 'warning' });
            if (!(await validateHeaderMediaUrl())) return;
            for (const button of dynamicUrlButtons) {
                const validation = validateDynamicUrlButtonValue(button, campaign.variable_mapping[`_button_url_${button.index}`] || campaign.variable_mapping[`button_url_${button.index}`])
                if (!validation.ok) {
                    return alertDialog(validation.message, { title: 'Button URL needs attention', tone: 'warning' });
                }
            }
            for (let variable of variables) {
                const key = variable.key
                const source = campaign.variable_mapping[key]
                if (!source || (source === 'custom' && !String(customTexts[key] || '').trim())) {
                    return alertDialog(`Please map ${variable.token}.`, { title: 'Variable mapping required', tone: 'warning' });
                }
            }
        }
        setCurrentStep(p => Math.min(4, p + 1))
    };

    const handleBack = () => setCurrentStep(p => Math.max(1, p - 1));

    const handleLaunch = async () => {
        if (!(await validateHeaderMediaUrl())) return;
        if (billingEstimate && !billingEstimate.can_launch) {
            const reason = !billingEstimate.plan?.allowed
                ? 'Your current plan has reached its monthly broadcast limit.'
                : !billingEstimate.enough_wallet
                    ? 'Wallet balance is not enough for this campaign.'
                    : 'Broadcast cannot be launched with the current estimate.';
            return alertDialog(reason, { title: 'Billing check failed', tone: 'warning' });
        }
        setIsSending(true);
        setSendResult(null);

        const finalMapping = { ...campaign.variable_mapping };
        finalMapping._template_variables = variables.map(variable => variable.key);
        variables.forEach(variable => {
            const key = variable.key
            if (finalMapping[key] === 'custom') {
                finalMapping[key] = customTexts[key] || '';
            }
        });
        finalMapping._template_body = selectedTemplate?.components?.find(c => c.type === 'BODY')?.text || `[Template: ${campaign.template_name}]`;
        finalMapping._template_footer = selectedTemplate?.components?.find(c => c.type === 'FOOTER')?.text || '';
        const buttonsComp = selectedTemplate?.components?.find(c => c.type === 'BUTTONS');
        if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
            finalMapping._template_buttons = buttonsComp.buttons.map((btn, index) => ({
                index: String(btn.index !== undefined ? btn.index : index),
                type: btn.type,
                text: btn.text,
                url: btn.url,
                phone_number: btn.phone_number
            }));
        }
        finalMapping._template_category = selectedTemplateCategory;
        if (needsHeaderMedia) {
            finalMapping._header_media_type = selectedHeaderFormat.toLowerCase();
            finalMapping._header_media_url = headerMediaUrl.trim();
            finalMapping.header_media_type = selectedHeaderFormat.toLowerCase();
            finalMapping.header_media_url = headerMediaUrl.trim();
        }
        dynamicUrlButtons.forEach(button => {
            const value = validateDynamicUrlButtonValue(button, finalMapping[`_button_url_${button.index}`] || finalMapping[`button_url_${button.index}`]).value;
            finalMapping[`_button_url_${button.index}`] = value;
            finalMapping[`button_url_${button.index}`] = value;
        });

        let formattedScheduledAt = null;
        if (campaign.scheduled_at) {
            formattedScheduledAt = new Date(campaign.scheduled_at).toISOString();
        }

        const payload = {
            ...campaign,
            scheduled_at: formattedScheduledAt,
            audience_tag: selectedContactKeys ? null : (campaign.audience_type === 'CSV_UPLOAD' || campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? null : campaign.audience_tag),
            audience_type: selectedContactKeys ? 'CSV_UPLOAD' : (campaign.audience_type === 'CSV_UPLOAD' ? 'CSV_UPLOAD' : (campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? campaign.audience_type : 'tag')),
            csv_data: selectedContactKeys ? filteredContacts : (campaign.audience_type === 'CSV_UPLOAD' ? csvData : null),
            idempotency_key: launchIdempotencyKey.current,
            variable_mapping: finalMapping,
            required_header_type: needsHeaderMedia ? selectedHeaderFormat.toLowerCase() : undefined,
            header_media_type: needsHeaderMedia ? selectedHeaderFormat.toLowerCase() : undefined,
            header_media_url: needsHeaderMedia ? headerMediaUrl.trim() : undefined
        };

        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/send`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                setSendResult(data);
                launchIdempotencyKey.current = crypto.randomUUID();
            } else {
                alertDialog(data.error || 'Broadcast failed', { title: 'Broadcast failed', tone: 'danger' });
            }
        } catch (e) {
            alertDialog('Error launching broadcast: ' + e.message, { title: 'Broadcast failed', tone: 'danger' });
        } finally {
            setIsSending(false);
        }
    };

    const startNew = () => {
        setSendResult(null);
        setCurrentStep(1);
        setCsvData(null);
        setCsvFileName('');
        setSelectedContactKeys(null);
        setCampaign({
            ...campaign,
            name: '',
            scheduled_at: '',
            audience_type: 'saved',
            audience_tag: '',
            template_name: '',
            variable_mapping: {}
        });
    }

    const handleBroadcastAgain = (camp, audienceMode) => {
        const newMapping = { ...(camp.variable_mapping || {}) };
        const newCustomTexts = {};
        
        const predefinedSources = ['name', 'phone', 'email'];
        
        for (const key of Object.keys(newMapping)) {
            if (!key.startsWith('_') && !key.startsWith('button_url_') && !key.startsWith('header_media_')) {
                const val = newMapping[key];
                if (!predefinedSources.includes(val) && !String(val).startsWith('field:')) {
                    newCustomTexts[key] = val;
                    newMapping[key] = 'custom';
                }
            }
        }

        const newAudienceType = audienceMode === 'same' ? camp.audience_type : 'saved';
        const newAudienceTag = audienceMode === 'same' ? camp.audience_tag : '';

        setCampaign({
            name: `${camp.name} (Copy)`,
            wa_account_id: camp.wa_account_id,
            scheduled_at: '',
            audience_type: newAudienceType,
            audience_tag: newAudienceTag,
            template_name: camp.template_name,
            template_language: camp.template_language || 'en_US',
            variable_mapping: newMapping
        });
        
        setCustomTexts(newCustomTexts);
        setHeaderMediaUrl(camp.header_media_url || newMapping._header_media_url || newMapping.header_media_url || '');
        
        if (audienceMode === 'same' && (camp.audience_type === 'CSV_UPLOAD' || camp.csv_data)) {
            setCampaign(prev => ({ ...prev, audience_type: 'CSV_UPLOAD' }));
            if (camp.csv_data) {
                setCsvData(camp.csv_data);
                setCsvFileName('previous_upload.csv');
            } else {
                setCsvData(null);
                setCsvFileName('');
                alertDialog('Your previous CSV data is not available. Please re-upload your CSV.', { title: 'CSV Required', tone: 'warning' });
            }
        } else {
            if (audienceMode === 'other') {
                setCsvData(null);
                setCsvFileName('');
            }
        }
        
        setSelectedContactKeys(null);
        setSendResult(null);
        setCurrentStep(1);
        setActiveTab('new');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

        
const renderLivePreview = () => {
        if (!selectedTemplate) return null;
        return (
            <div className="space-y-3">
                <style dangerouslySetInnerHTML={{__html: `
                    .phone-chat-scroll::-webkit-scrollbar {
                        display: none;
                    }
                    .phone-chat-scroll {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}} />
                
                <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Preview
                </h3>
                
                {/* Phone mockup container */}
                <div className="mx-auto w-full max-w-[310px] rounded-[40px] border-[8px] border-black bg-black shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative overflow-hidden flex flex-col select-none aspect-[9/18] ring-1 ring-zinc-900">
                    
                    {/* Camera / Notch */}
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 h-4 w-20 bg-zinc-950 rounded-full z-30 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-800/80 mr-3" />
                        <span className="w-1 h-1 rounded-full bg-zinc-900/50" />
                    </div>

                    {/* iOS Status Bar */}
                    <div className="px-5 pt-3.5 pb-2.5 bg-zinc-50 text-zinc-900 flex justify-between items-center text-[10px] font-semibold tracking-tight z-20 relative border-b border-zinc-100">
                        <span>9:41</span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3.5 h-2 bg-zinc-800 rounded-sm" />
                            <span className="w-1.5 h-1.5 bg-zinc-800 rounded-full" />
                        </div>
                    </div>

                    {/* WhatsApp Chat Header */}
                    <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-150 flex items-center justify-between z-25 relative">
                        <div className="flex items-center gap-2 min-w-0">
                            {wabaProfile?.profile_picture_url ? (
                                <img 
                                    src={wabaProfile.profile_picture_url} 
                                    alt="Business account profile" 
                                    className="w-8 h-8 rounded-full object-cover border border-zinc-200 shrink-0" 
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-zinc-200 border border-zinc-300 flex items-center justify-center text-zinc-650 text-xs font-bold font-mono shrink-0">
                                    {(selectedWaAccount?.name || 'W').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0">
                                <div className="text-[11px] font-bold text-zinc-900 leading-tight truncate max-w-[130px]" title={selectedWaAccount?.name || 'WhatsApp Business'}>
                                    {selectedWaAccount?.name || 'WhatsApp Business'}
                                </div>
                                <div className="text-[9px] text-zinc-400 font-medium leading-none mt-0.5 truncate max-w-[130px]">
                                    {wabaProfile?.vertical ? String(wabaProfile.vertical).toLowerCase().replace(/_/g, ' ') : (selectedWaAccount?.display_phone_number || 'Business Account')}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 text-zinc-450 shrink-0">
                            <Phone className="h-3.5 w-3.5 hover:text-zinc-600 transition-colors" />
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </div>
                    </div>

                    {/* Chat Background / Wallpaper */}
                    <div className="flex-1 bg-[#eae6df] relative overflow-hidden flex flex-col p-3.5 justify-end">
                        {/* WhatsApp wallpaper pattern */}
                        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%23000000' stroke-width='0.7' stroke-opacity='0.04' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 15 l1.5 2.5 h2.5 l-2 1.8 l0.8 2.7 l-2.8 -1.7 l-2.8 1.7 l0.8 -2.7 l-2 -1.8 h2.5 z'/%3E%3Cpath d='M45 25 h8 a2 2 0 0 1 2 2 v4 a2 2 0 0 1 -2 2 h-5 l-3 3 v-3 h-2 a2 2 0 0 1 -2 -2 v-4 a2 2 0 0 1 2 -2 z'/%3E%3Cpath d='M90 15 a2 2 0 0 1 2 2 v1 a7 7 0 0 1 -7 7 h-1 a2 2 0 0 1 -2 -2 v-1 a2 2 0 0 1 2 -2 h1 a5 5 0 0 0 5 -5'/%3E%3Ccircle cx='120' cy='20' r='5'/%3E%3Ccircle cx='118.5' cy='18.5' r='0.4' fill='%23000000' fill-opacity='0.04'/%3E%3Ccircle cx='121.5' cy='18.5' r='0.4' fill='%23000000' fill-opacity='0.04'/%3E%3Cpath d='M118 21.5 q2 1 4 0'/%3E%3Cpath d='M20 65 c-1.5 -1.5 -3.5 -1.5 -5 0 l-1 1 l-1 -1 c-1.5 -1.5 -3.5 -1.5 -5 0 c-1.5 1.5 -1.5 3.5 0 5 l6 6 l6 -6 c1.5 -1.5 1.5 -3.5 0 -5 z'/%3E%3Cpath d='M85 60 a2 2 0 0 1 2 -2 a2.5 2.5 0 0 1 4 1 a2 2 0 0 1 1.5 2 h-7.5 z'/%3E%3Cpath d='M115 65 l2 2 l4 -4 M118 65 l2 2 l4 -4'/%3E%3Cpath d='M25 110 v-12 h6 v3 h-3 v9 a2 2 0 1 1 -3 -2'/%3E%3Cpath d='M55 105 h6 a2 2 0 0 1 2 2 v3 a2 2 0 0 1 -2 2 h-6 a2 2 0 0 1 -2 -2 v-3 a2 2 0 0 1 2 -2 z M63 107 h2 a1 1 0 0 1 1 1 v1 a1 1 0 0 1 -1 1 h-2'/%3E%3Cpath d='M95 110 c-3 -3 -3 -6 0 -9 c3 -3 6 -3 9 0 l-4.5 5.5 z'/%3E%3Ccircle cx='99.5' cy='104.5' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
                            backgroundSize: '140px 140px'
                        }} />

                        {/* Messages Area */}
                        <div className="flex flex-col space-y-3.5 z-10 w-full overflow-y-auto pr-0.5 phone-chat-scroll">
                            {/* Message Bubble */}
                            <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-zinc-150 relative self-start flex flex-col">
                                {/* Header Text/Media */}
                                {selectedTemplate.components?.find(c => c.type === 'HEADER') && (() => {
                                    const header = selectedTemplate.components.find(c => c.type === 'HEADER');
                                    if (header.format === 'TEXT') {
                                        return <div className="font-extrabold text-zinc-955 text-xs mb-1.5 leading-tight tracking-tight">{header.text}</div>;
                                    }
                                    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format)) {
                                        return (
                                            <div className="mb-2 rounded-lg bg-zinc-50/50 border border-zinc-150 flex items-center justify-center h-28 w-full text-zinc-400 font-bold text-[10px] overflow-hidden relative shadow-inner">
                                                {headerMediaUrl ? (
                                                    header.format === 'IMAGE' ? (
                                                        <img src={headerMediaUrl} alt="Header media preview" className="w-full h-full object-cover" />
                                                    ) : header.format === 'VIDEO' ? (
                                                        <video src={headerMediaUrl} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1.5 p-3">
                                                            <FileText className="h-6 w-6 text-zinc-500" />
                                                            <span className="truncate max-w-[120px] text-zinc-500 font-mono text-[9px]">{headerMediaUrl.split('/').pop()}</span>
                                                        </div>
                                                    )
                                                ) : (
                                                    <span className="flex flex-col items-center gap-1 text-center px-4">
                                                        <span className="uppercase text-[9px] bg-zinc-200/60 px-1.5 py-0.5 rounded text-zinc-650 font-mono font-bold tracking-wider">{header.format} Header</span>
                                                        <span className="text-[9px] text-zinc-400 font-normal leading-normal">URL required for send</span>
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Message Body */}
                                <div className="text-zinc-900 text-xs break-words whitespace-pre-wrap leading-relaxed">
                                    {formatWhatsAppText(getPreviewText())}
                                </div>

                                {/* Message Footer */}
                                {selectedTemplate.components?.find(c => c.type === 'FOOTER') && (
                                    <div className="text-[10px] text-zinc-400 mt-1.5 border-t border-zinc-100/50 pt-1 leading-normal font-sans">
                                        {selectedTemplate.components.find(c => c.type === 'FOOTER').text}
                                    </div>
                                )}

                                {/* Timestamp and tick */}
                                <div className="flex items-center justify-end gap-1 text-[8px] text-zinc-400 mt-1 select-none font-sans font-medium self-end">
                                    <span>12:00 PM</span>
                                    <span className="font-bold text-emerald-500">✓✓</span>
                                </div>
                            </div>

                            {/* Buttons */}
                            {selectedTemplate.components?.find(c => c.type === 'BUTTONS') && (
                                <div className="space-y-1.5 w-[85%] self-start z-10">
                                    {selectedTemplate.components.find(c => c.type === 'BUTTONS').buttons.map((btn, idx) => (
                                        <div key={idx} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 backdrop-blur-sm py-2 px-3 border border-zinc-200/80 text-[10px] font-bold text-zinc-800 shadow-sm cursor-default hover:bg-white active:scale-[0.98] transition-all">
                                            {btn.type === 'PHONE_NUMBER' ? <Phone className="h-3 w-3 text-zinc-555" /> : btn.type === 'URL' ? <LinkIcon className="h-3 w-3 text-zinc-555" /> : <MessageSquare className="h-3 w-3 text-zinc-555" />}
                                            <span className="truncate">{btn.text}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Chat Bar */}
                    <div className="p-2.5 bg-zinc-50 border-t border-zinc-150 flex items-center gap-2 z-20">
                        <div className="flex-1 bg-white border border-zinc-200 rounded-full h-8 px-3 flex items-center text-[10px] text-zinc-400">
                            Type a message...
                        </div>
                        <div className="w-8 h-8 rounded-full bg-zinc-955 flex items-center justify-center text-white shrink-0 shadow-sm">
                            <Send className="h-3 w-3" />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="mx-auto w-full max-w-[1600px] space-y-6 md:space-y-8 px-4 sm:px-6 lg:px-8 pb-16">
            <div className="flex flex-wrap gap-4 md:items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Broadcasts</h1>
                    <p className="text-xs md:text-sm text-gray-500 mt-1 md:mt-2 max-w-lg leading-relaxed">Design, schedule, and track bulk message campaigns for your audience.</p>
                </div>

                
                {activeTab === 'new' && !sendResult && (
                    <div className="hidden lg:flex items-center justify-center shrink-0 mx-2 xl:mx-4">
                        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-gray-200/60 shadow-sm">
                            {STEPS.map((step, index) => {
                                const isActive = step.id === currentStep
                                const isCompleted = step.id < currentStep
                                return (
                                    <React.Fragment key={step.id}>
                                        <button
                                            type="button"
                                            className={`flex items-center shrink-0 gap-1.5 ${isCompleted ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
                                            onClick={() => { if (isCompleted) setCurrentStep(step.id) }}
                                            disabled={!isCompleted && !isActive}
                                        >
                                            <div className={`flex shrink-0 h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${isActive ? 'bg-[#0070d1] text-white shadow-sm' : isCompleted ? 'bg-emerald-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                                                {isCompleted ? <Check className="h-3 w-3 shrink-0" /> : step.id}
                                            </div>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${isActive ? 'text-[#0070d1]' : isCompleted ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                {step.name}
                                            </span>
                                        </button>
                                        {index < STEPS.length - 1 && (
                                            <div className={`h-[2px] w-3 lg:w-5 shrink-0 rounded-full transition-colors ${step.id < currentStep ? 'bg-emerald-500' : 'bg-gray-100'}`} />
                                        )}
                                    </React.Fragment>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div data-tour="broadcast-tabs" className="flex items-center shrink-0 gap-2 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 shadow-sm backdrop-blur-sm w-full md:w-auto">
                        <button
                            onClick={() => navigate('/broadcast')}
                            className={`flex-1 md:flex-initial text-center px-3 py-2 md:px-5 md:py-2.5 text-xs md:text-sm font-semibold rounded-lg transition-colors ${activeTab === 'new' ? 'bg-white shadow-sm text-[#0064b7] ring-1 ring-gray-200/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                        >
                            New Campaign
                        </button>
                        <button
                            onClick={() => navigate('/broadcast/history')}
                            className={`flex-1 md:flex-initial text-center px-3 py-2 md:px-5 md:py-2.5 text-xs md:text-sm font-semibold rounded-lg transition-colors ${activeTab === 'history' ? 'bg-white shadow-sm text-[#0064b7] ring-1 ring-gray-200/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                        >
                            History
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'history' ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="border-b border-gray-200 bg-gray-50/60 p-4 sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-950">Campaign history</h2>
                            <p className="mt-1 text-sm text-gray-500">Monitor delivery and manage active broadcasts.</p>
                        </div>
                        <button onClick={fetchCampaignHistory} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#0064b7] transition-colors hover:bg-[#eef7ff]">
                            <Loader2 className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                            <input
                                type="search"
                                value={historySearch}
                                onChange={event => setHistorySearch(event.target.value)}
                                placeholder="Search campaigns or templates"
                                className="h-10 rounded-lg border-gray-300 bg-white text-sm"
                            />
                            <select
                                value={historyStatus}
                                onChange={event => setHistoryStatus(event.target.value)}
                                className="h-10 rounded-lg border-gray-300 bg-white text-sm"
                                aria-label="Filter campaigns by status"
                            >
                                <option value="all">All statuses</option>
                                {['scheduled', 'preparing', 'queued', 'processing', 'paused', 'completed', 'failed', 'cancelled'].map(status => (
                                    <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {(historyLoadState === 'idle' || isLoadingHistory) && campaignsList.length === 0 ? (
                        <div className="p-16 text-center flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-500" /></div>
                    ) : historyLoadState === 'error' && campaignsList.length === 0 ? (
                        <div className="p-16 text-center">
                            <p className="text-sm text-gray-500">Couldn&apos;t load campaigns.</p>
                            <button type="button" onClick={() => fetchCampaignHistory(false)} className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
                                Retry
                            </button>
                        </div>
                    ) : campaignsList.length === 0 ? (
                        <div className="p-16 text-center flex flex-col items-center justify-center">
                            <div className="w-16 h-16 bg-indigo-50 text-indigo-300 rounded-2xl flex items-center justify-center mb-4"><Calendar className="w-8 h-8" /></div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">No campaigns found</h3>
                            <p className="text-gray-500">Schedule your first broadcast to engage your audience.</p>
                        </div>
                    ) : visibleCampaigns.length === 0 ? (
                        <div className="p-12 text-center">
                            <p className="text-sm font-semibold text-gray-800">No matching campaigns</p>
                            <p className="mt-1 text-sm text-gray-500">Try a different search or status.</p>
                        </div>
                    ) : (
                        <>
                        <div className="divide-y divide-gray-150 md:hidden bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                            {visibleCampaigns.map(camp => (
                                <article key={camp.id} className="space-y-4 p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-base font-bold text-gray-950">{camp.name}</h3>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span className="truncate max-w-[150px]">{camp.template_name}</span>
                                                {templateUsageCounts[camp.template_name] > 0 && (
                                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                                                        {templateUsageCounts[camp.template_name]} {templateUsageCounts[camp.template_name] === 1 ? 'time' : 'times'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wide inline-flex items-center gap-1 ${
                                            camp.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                                            camp.status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-200/60' :
                                            camp.status === 'cancelled' ? 'bg-gray-50 text-gray-700 border border-gray-300' :
                                            camp.status === 'processing' ? 'bg-blue-50 text-blue-700 border border-blue-200/60' :
                                            'bg-amber-50 text-amber-700 border border-amber-200/60'
                                        }`}>
                                            {camp.status === 'processing' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                            {camp.status}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 rounded-xl bg-gray-50/80 p-4 border border-gray-100 text-xs">
                                        <div>
                                            <span className="block text-gray-500 font-medium">Audience</span>
                                            <span className="mt-1 block font-bold text-gray-800 flex items-center gap-1">
                                                <Users className="w-3.5 h-3.5 text-gray-400" />
                                                {camp.total_contacts || camp.prepared_count || 0} contacts
                                            </span>
                                            <span className="block text-[10px] text-gray-500 mt-1 font-medium truncate max-w-[130px]" title={camp.audience_tag}>
                                                Tag: {camp.audience_tag || (String(camp.audience_type).toLowerCase().includes('csv') || camp.csv_data ? 'CSV Upload' : camp.audience_type === 'saved' ? 'Saved Contacts' : 'All Contacts')}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-gray-500 font-medium">Date / Scheduled</span>
                                            <span className="mt-1 block font-semibold text-gray-750 text-[11px] leading-tight">
                                                {camp.scheduled_at ? format(new Date(camp.scheduled_at), 'MMM dd, yyyy · hh:mm a') : format(new Date(camp.created_at), 'MMM dd, yyyy · hh:mm a')}
                                            </span>
                                        </div>
                                    </div>

                                    {(camp.schema_version >= 2 || camp.status === 'completed') && (
                                        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                                            <span className="text-gray-550 font-medium">Performance:</span>
                                            <div className="flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100/60">
                                                <Check className="w-3 h-3" /> {camp.schema_version >= 2 ? (camp.accepted_count ?? camp.sent_count ?? 0) : (camp.results?.filter(r => ['accepted', 'sent', 'delivered', 'read'].includes(r?.status)).length || 0)}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-rose-700 font-bold bg-rose-50 px-2 py-1 rounded-md border border-rose-100/60">
                                                <Info className="w-3 h-3" /> {camp.schema_version >= 2 ? (camp.failed_count ?? 0) : (camp.results?.filter(r => r?.status === 'failed').length || 0)}
                                            </div>
                                            {camp.schema_version >= 2 && <span className="text-gray-500 font-mono text-[10px] ml-auto">{camp.prepared_count || 0}/{camp.total_contacts || 0}</span>}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {camp.schema_version >= 2 && ['queued', 'processing'].includes(camp.status) && (
                                            <button onClick={() => updateCampaignState(camp.id, 'pause')} className="flex-1 justify-center text-amber-705 text-xs font-bold flex items-center gap-1.5 bg-amber-50 active:scale-[0.98] py-2 rounded-lg border border-amber-200 transition-all">
                                                <Pause className="w-3.5 h-3.5" /> Pause
                                            </button>
                                        )}
                                        {camp.schema_version >= 2 && camp.status === 'paused' && (
                                            <button onClick={() => updateCampaignState(camp.id, 'resume')} className="flex-1 justify-center text-emerald-705 text-xs font-bold flex items-center gap-1.5 bg-emerald-50 active:scale-[0.98] py-2 rounded-lg border border-emerald-200 transition-all">
                                                <Play className="w-3.5 h-3.5" /> Resume
                                            </button>
                                        )}
                                        {(['preparing', 'queued', 'processing', 'paused', 'scheduled'].includes(camp.status)) && (
                                            <button
                                                onClick={() => cancelCampaign(camp.id)}
                                                className="flex-1 justify-center text-rose-600 hover:text-white text-xs font-bold flex items-center gap-1.5 bg-rose-50 active:scale-[0.98] hover:bg-rose-500 py-2 rounded-lg transition-all border border-rose-200 hover:border-rose-500"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" /> Cancel
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setBroadcastAgainCamp(camp)}
                                            className="flex-1 justify-center text-[#0064b7] hover:text-white text-xs font-bold flex items-center gap-1.5 bg-[#eef7ff] active:scale-[0.98] hover:bg-[#0064b7] py-2 rounded-lg transition-all border border-[#b9dcfb] hover:border-[#0064b7]"
                                        >
                                            <Megaphone className="w-3.5 h-3.5" /> Broadcast Again
                                        </button>
                                        {((camp.schema_version >= 2 && (camp.total_contacts || camp.prepared_count)) || ((camp.status === 'completed' || camp.status === 'cancelled') && camp.results?.length > 0)) && (
                                            <button
                                                onClick={() => toggleCampaignDetails(camp)}
                                                className="w-full justify-center text-[#0064b7] text-xs font-bold flex items-center gap-1.5 bg-sky-50/50 hover:bg-sky-50 active:scale-[0.98] py-2.5 rounded-lg transition-all border border-sky-100"
                                            >
                                                {expandedCampaignId === camp.id ? 'Hide Delivery Report' : 'View Delivery Report'}
                                                {expandedCampaignId === camp.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            </button>
                                        )}
                                    </div>

                                    {expandedCampaignId === camp.id && (
                                        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3 mt-3 shadow-inner max-h-72 overflow-y-auto">
                                            {recipientReports[camp.id]?.loading ? (
                                                <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading report</div>
                                            ) : recipientReports[camp.id]?.error ? (
                                                <p className="text-xs text-red-650">{recipientReports[camp.id].error}</p>
                                            ) : (recipientReports[camp.id]?.recipients || []).slice(0, 15).map(row => (
                                                <div key={row.id || row.normalized_phone} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs border border-gray-100 shadow-sm">
                                                    <span className="truncate font-bold text-gray-800">{row.contact_name || row.normalized_phone}</span>
                                                    <span className={`shrink-0 capitalize font-semibold ${['accepted', 'sent', 'delivered', 'read'].includes(row.status) ? 'text-emerald-600' : row.status === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>{row.status}</span>
                                                </div>
                                            ))}
                                            {camp.schema_version >= 2 && recipientReports[camp.id]?.pagination?.total > 15 && (
                                                <div className="pt-2 text-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                                    Showing first 15 recipients (View on Desktop for full report)
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50/80 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                                    <tr>
                                        <th className="px-5 py-4">Campaign Name</th>
                                        <th className="px-5 py-4">Status</th>
                                        <th className="px-5 py-4">Audience</th>
                                        <th className="px-5 py-4">Date / Scheduled</th>
                                        <th className="px-5 py-4">Performance</th>
                                        <th className="px-5 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {visibleCampaigns.map(camp => (
                                        <React.Fragment key={camp.id}>
                                            <tr className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-5 py-4">
                                                    <div className="font-bold text-gray-900">{camp.name}</div>
                                                    <div className="text-xs font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                                                        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" /> 
                                                        <span className="truncate max-w-[200px]">{camp.template_name}</span>
                                                        {templateUsageCounts[camp.template_name] > 0 && (
                                                            <span className="text-[10px] bg-gray-100/80 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-md font-semibold whitespace-nowrap" title={`This template has been used in ${templateUsageCounts[camp.template_name]} campaigns`}>
                                                                {templateUsageCounts[camp.template_name]} {templateUsageCounts[camp.template_name] === 1 ? 'time' : 'times'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wide flex items-center inline-flex gap-1.5 ${camp.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                                                            camp.status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-200/60' :
                                                                camp.status === 'cancelled' ? 'bg-gray-50 text-gray-700 border border-gray-300' :
                                                                    camp.status === 'processing' ? 'bg-blue-50 text-blue-700 border border-blue-200/60' :
                                                                        'bg-amber-50 text-amber-700 border border-amber-200/60'
                                                        }`}>
                                                        {camp.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                                                        {camp.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-gray-600 font-medium">
                                                    <div className="flex items-center gap-1.5">
                                                        <Users className="w-4 h-4 text-gray-400" />
                                                        {camp.audience_tag || (String(camp.audience_type).toLowerCase().includes('csv') || camp.csv_data ? 'CSV Upload' : camp.audience_type === 'saved' ? 'Saved Contacts' : 'All Contacts')}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-gray-600 font-medium">
                                                    {camp.scheduled_at ? format(new Date(camp.scheduled_at), 'MMM dd, yyyy · hh:mm a') : format(new Date(camp.created_at), 'MMM dd, yyyy · hh:mm a')}
                                                </td>
                                                <td className="px-5 py-4">
                                                    {camp.schema_version >= 2 || camp.status === 'completed' ? (
                                                        <div className="flex flex-wrap gap-2 text-xs items-center">
                                                            <div className="flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                                                                <Check className="w-3.5 h-3.5" /> {camp.schema_version >= 2 ? (camp.accepted_count ?? camp.sent_count ?? 0) : (camp.results?.filter(r => ['accepted', 'sent', 'delivered', 'read'].includes(r?.status)).length || 0)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-rose-700 font-bold bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-100">
                                                                <Info className="w-3.5 h-3.5" /> {camp.schema_version >= 2 ? (camp.failed_count ?? 0) : (camp.results?.filter(r => r?.status === 'failed').length || 0)}
                                                            </div>
                                                            {camp.schema_version >= 2 && <span className="text-gray-500">{camp.prepared_count || 0}/{camp.total_contacts || 0}</span>}
                                                        </div>
                                                    ) : <span className="text-gray-400 font-medium">-</span>}
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <div className="flex justify-end gap-3 items-center">
                                                        {camp.schema_version >= 2 && ['queued', 'processing'].includes(camp.status) && (
                                                            <button onClick={() => updateCampaignState(camp.id, 'pause')} className="text-amber-700 text-xs font-bold flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                                                                <Pause className="w-3.5 h-3.5" /> Pause
                                                            </button>
                                                        )}
                                                        {camp.schema_version >= 2 && camp.status === 'paused' && (
                                                            <button onClick={() => updateCampaignState(camp.id, 'resume')} className="text-emerald-700 text-xs font-bold flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                                                                <Play className="w-3.5 h-3.5" /> Resume
                                                            </button>
                                                        )}
                                                        {(['preparing', 'queued', 'processing', 'paused', 'scheduled'].includes(camp.status)) && (
                                                            <button
                                                                onClick={() => cancelCampaign(camp.id)}
                                                                className="text-rose-600 hover:text-white text-xs font-bold flex items-center gap-1.5 bg-rose-50 hover:bg-rose-500 px-3 py-1.5 rounded-lg transition-colors border border-rose-200 hover:border-rose-500"
                                                                title="Stop and Abandon Campaign"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" /> Stop & Cancel
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setBroadcastAgainCamp(camp)}
                                                            className="text-[#0064b7] hover:text-[#0064b7] hover:bg-[#eef7ff] text-xs font-bold flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg transition-colors border border-gray-200"
                                                            title="Broadcast Again"
                                                        >
                                                            <Megaphone className="w-3.5 h-3.5" /> Broadcast Again
                                                        </button>
                                                        {((camp.schema_version >= 2 && (camp.total_contacts || camp.prepared_count)) || ((camp.status === 'completed' || camp.status === 'cancelled') && camp.results?.length > 0)) && (
                                                            <button
                                                                onClick={() => toggleCampaignDetails(camp)}
                                                                className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                {expandedCampaignId === camp.id ? 'Hide Details' : 'View Results'}
                                                                {expandedCampaignId === camp.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedCampaignId === camp.id && (camp.schema_version >= 2 || camp.results) && (
                                                <tr>
                                                    <td colSpan="6" className="bg-gray-50/50 p-8 border-b border-gray-200 shadow-inner">
                                                        <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                            <LayoutGrid className="w-4 h-4 text-gray-400" /> Delivery Report
                                                        </h4>
                                                        <div className="max-h-80 overflow-y-auto space-y-2.5 pr-3 scrollbar-thin scrollbar-thumb-gray-200">
                                                            {(camp.schema_version >= 2 ? (recipientReports[camp.id]?.recipients || []).map(row => ({
                                                                name: row.contact_name,
                                                                phone: row.normalized_phone,
                                                                status: row.status,
                                                                error: row.error_message,
                                                            })) : camp.results).map((res, idx) => (
                                                                <div key={idx} className="grid grid-cols-[1fr_auto] gap-4 text-sm p-4 bg-white rounded-xl shadow-sm border border-gray-200/60 hover:border-gray-300 transition-colors">
                                                                    <div className="flex min-w-0 items-center gap-3">
                                                                        <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${['accepted', 'sent', 'delivered', 'read'].includes(res.status) ? 'bg-emerald-500 shadow-emerald-200' : res.status === 'failed' ? 'bg-rose-500 shadow-rose-200' : 'bg-amber-500 shadow-amber-200'}`}></div>
                                                                        <span className="font-bold text-gray-900">{res.name}</span>
                                                                        <span className="text-gray-500 bg-gray-100/80 px-2.5 py-1 rounded-md font-mono text-xs">{res.phone || 'Unknown Phone'}</span>
                                                                    </div>
                                                                    {['accepted', 'sent', 'delivered', 'read'].includes(res.status) ? (
                                                                        <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                                                                            <Check className="w-4 h-4" /> {res.status}
                                                                        </span>
                                                                    ) : res.status === 'failed' ? (
                                                                        <span className="max-w-xl whitespace-normal break-words text-right font-semibold text-rose-600 flex items-center gap-1.5" title={res.error}>
                                                                            <Info className="w-4 h-4 shrink-0" /> Failed: {
                                                                                res.error?.includes('131049') 
                                                                                    ? "Meta limit reached: User cannot receive more marketing messages today." 
                                                                                    : res.error?.split(' | ')[0] || res.error
                                                                            }
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-amber-600 font-semibold">{res.status}</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {camp.schema_version >= 2 && recipientReports[camp.id]?.loading && (
                                                                <div className="flex items-center justify-center gap-2 p-6 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading recipients…</div>
                                                            )}
                                                            {camp.schema_version >= 2 && recipientReports[camp.id]?.error && (
                                                                <div className="p-4 text-sm text-rose-600">{recipientReports[camp.id].error}</div>
                                                            )}
                                                        </div>
                                                        {camp.schema_version >= 2 && recipientReports[camp.id]?.pagination?.total > 25 && (
                                                            <div className="mt-4 flex items-center justify-between text-sm">
                                                                <span className="text-gray-500">{recipientReports[camp.id].pagination.total} recipients</span>
                                                                <div className="flex gap-2">
                                                                    <button disabled={recipientReports[camp.id].pagination.page <= 1} onClick={() => fetchRecipientReport(camp.id, recipientReports[camp.id].pagination.page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button>
                                                                    <button disabled={recipientReports[camp.id].pagination.page * 25 >= recipientReports[camp.id].pagination.total} onClick={() => fetchRecipientReport(camp.id, recipientReports[camp.id].pagination.page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </div>
            ) : sendResult ? (
                <div className="max-w-2xl mx-auto mt-12 bg-white rounded-2xl shadow-xl shadow-gray-200/40 p-10 text-center space-y-8 border border-gray-100">
                    <div className={`mx-auto h-24 w-24 rounded-full flex items-center justify-center ${sendResult.status === 'scheduled' ? 'bg-amber-50 text-amber-500 ring-8 ring-amber-50' : 'bg-emerald-50 text-emerald-500 ring-8 ring-emerald-50'}`}>
                        {sendResult.status === 'scheduled' ? <Clock className="h-12 w-12" /> : <Check className="h-12 w-12" />}
                    </div>
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-3">
                            {sendResult.status === 'scheduled' ? 'Campaign Scheduled!' : 'Campaign Launched!'}
                        </h2>
                        <p className="text-gray-500 text-lg leading-relaxed">
                            {sendResult.status === 'scheduled'
                                ? `It will automatically run at ${format(new Date(campaign.scheduled_at), 'PPp')}.`
                                : 'Your messages are currently being processed in the background.'}
                        </p>
                    </div>
                    <div className="flex justify-center gap-4 pt-4 border-t border-gray-100">
                        <button
                            onClick={startNew}
                            className="rounded-full bg-[#0070d1] px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0064b7]"
                        >
                            Start New Campaign
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className="px-8 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-bold shadow-sm transition-all"
                        >
                            View History
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-5">


                    {/* Step Content */}
                    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col overflow-visible">
                        <div className="flex-1">
                        {currentStep === 1 && (
                            <div className="grid gap-0 lg:grid-cols-[minmax(260px,0.8fr)_minmax(420px,1.2fr)] w-full">
                                <div className="relative overflow-hidden bg-gradient-to-br from-[#eef6ff] via-[#e0e7ff] to-[#f3f4f6] p-6 md:p-8 lg:p-10 text-slate-800 rounded-t-2xl lg:rounded-t-none lg:rounded-l-2xl border-b border-gray-200 lg:border-b-0 lg:border-r flex flex-col justify-center min-h-[280px]">
                                    {/* Muted decorative blurs */}
                                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-60 h-60 rounded-full bg-blue-400/10 blur-3xl pointer-events-none"></div>
                                    <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-60 h-60 rounded-full bg-indigo-400/10 blur-3xl pointer-events-none"></div>

                                    <div className="relative z-10 flex h-full flex-col justify-center">
                                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 backdrop-blur-md border border-white/80 text-indigo-650 shadow-sm">
                                            <LayoutGrid className="h-5 w-5" />
                                        </div>
                                        <h3 className="mt-5 text-lg md:text-xl font-bold text-slate-800 tracking-tight">Campaign Setup</h3>
                                        <p className="mt-2.5 text-xs md:text-sm text-slate-600 leading-relaxed font-medium">
                                            Name your campaign, select a verified WhatsApp business account, and schedule your broadcast delivery.
                                        </p>
                                        <div className="mt-6 rounded-xl border border-white/60 bg-white/40 backdrop-blur-md p-4 text-xs text-slate-700 leading-relaxed font-semibold shadow-sm flex gap-2.5 items-start">
                                            <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
                                            <span>
                                                Official Meta API connection is required. Templates must be pre-approved in the Meta WhatsApp Manager dashboard.
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 md:space-y-5 p-4 md:p-6 lg:p-8">
                                    <div>
                                        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-gray-800">Campaign Name <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            className="h-10 md:h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-xs md:text-sm text-gray-950 outline-none transition focus:border-[#0070d1] focus:ring-2 focus:ring-[#0070d1]/10"
                                            placeholder="e.g. Summer Sale Announcement"
                                            value={campaign.name}
                                            onChange={e => setCampaign({ ...campaign, name: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-gray-800">WhatsApp Account <span className="text-red-500">*</span></label>
                                        {isLoading.accounts ? (
                                            <div className="flex h-10 md:h-11 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs md:text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading accounts...</div>
                                        ) : (
                                            <div className="relative">
                                                <select
                                                    className="h-10 md:h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-10 text-xs md:text-sm text-gray-950 outline-none transition focus:border-[#0070d1] focus:ring-2 focus:ring-[#0070d1]/10"
                                                    value={campaign.wa_account_id}
                                                    onChange={e => setCampaign({ ...campaign, wa_account_id: e.target.value })}
                                                >
                                                    <option value="">Select an account</option>
                                                    {waAccounts.filter(acc => acc.whatsapp_business_account_id).map(acc => (
                                                        <option key={acc.id} value={acc.id}>
                                                            {acc.display_phone_number || acc.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                            </div>
                                        )}
                                        <p className="mt-1.5 text-[10px] md:text-xs leading-normal text-gray-500">
                                            An approved template and an official Meta API account are required.
                                        </p>
                                        {selectedWaAccount && (
                                            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                                                <Check className="h-3.5 w-3.5" /> Meta API account ready
                                            </p>
                                        )}
                                    </div>

                                    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                                        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                                            <div>
                                                <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-950">
                                                    Messaging limits
                                                    <span title="Live data fetched from the connected Meta account"><Info className="h-3.5 w-3.5 text-gray-400" /></span>
                                                </div>
                                                <p className="mt-0.5 text-[10px] text-gray-500">
                                                    {!selectedWaAccount ? 'Select an account to view limits' : messagingLimits?.fetched_at ? `Updated ${format(new Date(messagingLimits.fetched_at), 'MMM d, h:mm a')}` : 'Loading live Meta account data'}
                                                </p>
                                            </div>
                                            {selectedWaAccount && messagingLimits?.quality_rating && (
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold ${messagingLimits.quality_rating === 'GREEN' ? 'bg-emerald-50 text-emerald-700' : messagingLimits.quality_rating === 'YELLOW' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                                                    <ShieldCheck className="h-3 w-3" /> {messagingLimits.quality_rating} quality
                                                </span>
                                            )}
                                        </div>

                                        {!selectedWaAccount ? (
                                            <div className="flex h-[176px] flex-col items-center justify-center gap-2 text-xs text-gray-400 bg-gray-50/30">
                                                <Info className="h-6 w-6 opacity-30 mb-1" />
                                                <p>Select a WhatsApp account to view its Meta messaging limits.</p>
                                            </div>
                                        ) : messagingLimitsState === 'loading' || !messagingLimits ? (
                                            <div className="flex h-[176px] items-center justify-center gap-2 text-xs text-gray-500 bg-gray-50/30">
                                                <Loader2 className="h-5 w-5 animate-spin" /> Fetching from Meta...
                                            </div>
                                        ) : messagingLimitsState === 'error' ? (
                                            <div className="flex h-[176px] items-center justify-center p-4 bg-gray-50/30">
                                                <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 text-center">
                                                    Live messaging limit is unavailable. Reconnect or check this account’s Meta permissions.
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 min-h-[176px] flex flex-col justify-center">
                                                <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-gray-200">
                                                    {MESSAGING_TIERS.map((tier) => {
                                                        const isCurrent = tier.value === messagingLimits.messaging_limit_tier
                                                        return (
                                                            <div key={tier.value} className={`flex min-h-16 flex-col items-center justify-center border-r border-gray-200 px-1 text-center last:border-r-0 ${isCurrent ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300' : 'bg-gray-50 text-gray-400'}`}>
                                                                {isCurrent && <span className="mb-1 rounded-full bg-blue-600 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white">Current</span>}
                                                                <span className={`text-[9px] sm:text-[10px] ${isCurrent ? 'font-bold' : 'font-medium'}`}>{tier.label}</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                <div className="mt-3 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
                                                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                                    <div className="flex flex-col gap-1">
                                                        <p className="text-[10px] leading-4 text-gray-600">
                                                            Current limit: <strong className="text-gray-900">{getMessagingTierLabel(messagingLimits.messaging_limit_tier)}</strong> business-initiated conversations in a rolling 24-hour period.
                                                        </p>
                                                        <p className="text-[10px] leading-4 text-gray-500">
                                                            <strong className="font-medium text-gray-700">To increase limit:</strong> Maintain a Green quality rating and message more unique customers with high-quality content over 7 days.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </section>

                                    <div>
                                        <label className="mb-2 block text-xs md:text-sm font-semibold text-gray-800">Send timing</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={() => setCampaign({ ...campaign, scheduled_at: '' })}
                                                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-semibold ${!campaign.scheduled_at ? 'border-[#0070d1] bg-[#eef7ff] text-[#0064b7] ring-1 ring-[#0070d1]' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    Send now
                                                    <span className="mt-0.5 block text-xs font-normal text-gray-500">Start after review</span>
                                                </button>
                                            </div>
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={() => setCampaign({ ...campaign, scheduled_at: campaign.scheduled_at || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16) })}
                                                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-semibold ${campaign.scheduled_at ? 'border-[#0070d1] bg-[#eef7ff] text-[#0064b7] ring-1 ring-[#0070d1]' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    Schedule
                                                    <span className="mt-0.5 block text-xs font-normal text-gray-500">Choose date and time</span>
                                                </button>
                                                {campaign.scheduled_at && <div className="relative mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <DateTimePicker
                                                        value={campaign.scheduled_at}
                                                        onChange={val => setCampaign({ ...campaign, scheduled_at: val })}
                                                        placeholder="Choose date and time"
                                                    />
                                                </div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}

                        {currentStep === 2 && (
                            <div data-tour="broadcast-recipients" className="p-4 sm:p-6 lg:p-8">
                                <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                    <div>
                                        <h2 className="text-xl font-semibold text-gray-950">Select Audience</h2>
                                        <p className="mt-1 text-sm text-gray-500">Choose exactly who should receive this broadcast.</p>
                                    </div>
                                    <div className={`rounded-full border px-3 py-1 text-sm font-semibold transition-all ${selectedContactKeys ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                                        {filteredContacts.length} recipients selected
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                        ${campaign.audience_type === 'saved' ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_type === 'saved'}
                                            onChange={() => setCampaign({ ...campaign, audience_type: 'saved', audience_tag: '' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-semibold text-gray-950">Saved Contacts Only <span className="ml-2 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#0064b7] ring-1 ring-[#cfe5fb]">Recommended</span></span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <Users className="h-4 w-4 mr-1" />
                                                    {isLoading.contacts ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                                    {contacts.filter(c => c.saved_at != null).length} saved contacts
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_type === 'saved' ? 'text-[#0070d1]' : 'invisible'}`} />
                                    </label>

                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                        ${campaign.audience_type === 'all' ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_type === 'all'}
                                            onChange={() => setCampaign({ ...campaign, audience_type: 'all', audience_tag: '' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-semibold text-gray-950">All Contacts <span className="text-xs font-normal text-gray-400">(includes synced)</span></span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <Users className="h-4 w-4 mr-1" />
                                                    {isLoading.contacts ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                                    {contacts.length} total contacts
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_type === 'all' ? 'text-[#0070d1]' : 'invisible'}`} />
                                    </label>

                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                        ${campaign.audience_type === 'CSV_UPLOAD' ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_type === 'CSV_UPLOAD'}
                                            onChange={() => setCampaign({ ...campaign, audience_type: 'CSV_UPLOAD', audience_tag: 'CSV_UPLOAD' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-semibold text-gray-950">Upload CSV File</span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <FileText className="h-4 w-4 mr-1" />
                                                    {csvData ? `${csvData.length} contacts loaded` : 'Custom File Upload'}
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_type === 'CSV_UPLOAD' ? 'text-[#0070d1]' : 'invisible'}`} />
                                    </label>

                                    {isLoading.tags ? (
                                        <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-center text-gray-400">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        </div>
                                    ) : tags.map((tag) => {
                                        const tagCount = contacts.filter(c => Array.isArray(c.tags) && c.tags.includes(tag)).length;
                                        return (
                                            <label key={tag} className={`
                                                relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                                ${campaign.audience_type === 'tag' && campaign.audience_tag === tag ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                            `}>
                                                <input
                                                    type="radio"
                                                    name="audience"
                                                    className="sr-only"
                                                    checked={campaign.audience_type === 'tag' && campaign.audience_tag === tag}
                                                    onChange={() => setCampaign({ ...campaign, audience_type: 'tag', audience_tag: tag })}
                                                />
                                                <span className="flex flex-1">
                                                    <span className="flex flex-col">
                                                        <span className="block text-sm font-semibold text-gray-950">{tag}</span>
                                                        <span className="mt-1 flex items-center text-sm text-gray-500">
                                                            <Users className="h-4 w-4 mr-1" />
                                                            {tagCount} contacts
                                                        </span>
                                                    </span>
                                                </span>
                                                <Check className={`h-5 w-5 ${campaign.audience_type === 'tag' && campaign.audience_tag === tag ? 'text-[#0070d1]' : 'invisible'}`} />
                                            </label>
                                        )
                                    })}

                                    {campaign.audience_type === 'CSV_UPLOAD' && (
                                        <div className="mt-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition-colors hover:border-[#0070d1] lg:col-span-2">
                                            <input type="file" accept=".csv" className="hidden" id="csv-upload" onChange={handleFileUpload} />
                                            <label htmlFor="csv-upload" className="cursor-pointer">
                                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef7ff] text-[#0064b7]">
                                                    <FileText className="h-6 w-6" />
                                                </div>
                                                <span className="text-lg font-bold text-[#0064b7] hover:text-[#005ca8]">Click here to upload CSV</span>
                                                <p className="text-sm text-gray-500 mt-2">Make sure it has a "Phone" and "Name" column.</p>
                                            </label>
                                            {csvFileName && (
                                                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg inline-block text-indigo-800 font-medium text-sm shadow-sm">
                                                    File Loaded: {csvFileName} <span className="mx-2 text-indigo-300">|</span> {csvData?.length || 0} contacts found
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 shadow-sm overflow-visible">
                                    <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 bg-white rounded-t-xl">
                                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                                            <Users className="w-4 h-4 text-gray-400" />
                                            Preview Audience
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            {selectedContactKeys && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                                    Customized
                                                </span>
                                            )}
                                            {baseAudienceContacts.length > 0 && (
                                                <div className="relative group flex items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const keysSet = new Set(filteredContacts.map(getContactKey));
                                                            setTempSelectedKeys(keysSet);
                                                            setPopupSearch('');
                                                            setPopupFilter('all');
                                                            setIsContactsPopupOpen(true);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-100/80 hover:border-indigo-600 rounded-lg shadow-sm transition-all duration-200"
                                                    >
                                                        <Users className="w-3.5 h-3.5" />
                                                        Customize List
                                                    </button>
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-30">
                                                        <div className="bg-gray-900 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap border border-gray-800">
                                                            Select or deselect specific contacts for this broadcast
                                                        </div>
                                                        <div className="w-1.5 h-1.5 bg-gray-900 rotate-45 -mt-1 border-r border-b border-gray-800"></div>
                                                    </div>
                                                </div>
                                            )}
                                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">{filteredContacts.length} contacts</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2 p-4">
                                        {filteredContacts.slice(0, 5).map((c, i) => (
                                            <div key={c.id || i} className="flex items-center justify-between gap-4 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-gray-100">
                                                <span className="truncate font-semibold text-gray-900">{c.custom_name || c.name || 'Unknown'}</span>
                                                <span className="shrink-0 font-mono text-xs text-gray-500">{c.phone || c.wa_id}</span>
                                            </div>
                                        ))}
                                        {filteredContacts.length > 5 && (
                                            <div className="text-sm text-gray-400 pt-2 border-t border-gray-200 text-center">
                                                and {filteredContacts.length - 5} more...
                                            </div>
                                        )}
                                        {filteredContacts.length === 0 && (
                                            <div className="text-sm text-gray-400 text-center py-4">No contacts to display</div>
                                        )}
                                    </div>
                                </div>

                                {/* Custom contacts selection popup modal */}
                                {isContactsPopupOpen && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-sm animate-fade-in">
                                        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col max-h-[80vh] overflow-hidden">
                                            
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                                        <Users className="h-5 w-5 text-indigo-600" />
                                                        Select Target Contacts
                                                    </h3>
                                                    <p className="text-xs text-gray-500 mt-1">Select individual contacts or filter list by campaign history.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsContactsPopupOpen(false)}
                                                    className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
                                                >
                                                    <X className="h-5 w-5" />
                                                </button>
                                            </div>

                                            {/* Search and Filters */}
                                            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center">
                                                <div className="relative flex-1">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search contacts..."
                                                        value={popupSearch}
                                                        onChange={(e) => setPopupSearch(e.target.value)}
                                                        className="h-10 w-full pl-9 pr-4 text-xs rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-indigo-500 transition-all"
                                                    />
                                                </div>

                                                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200/40">
                                                    {[
                                                        { id: 'all', label: 'ALL' },
                                                        { id: 'sent', label: 'Already Sent' },
                                                        { id: 'unsent', label: 'Not Sent' }
                                                    ].map(tab => (
                                                        <button
                                                            key={tab.id}
                                                            type="button"
                                                            onClick={() => setPopupFilter(tab.id)}
                                                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${popupFilter === tab.id ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                                                        >
                                                            {tab.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Contacts List */}
                                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                                                <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={visibleFilteredContacts.length > 0 && visibleFilteredContacts.every(c => tempSelectedKeys.has(getContactKey(c)))}
                                                            onChange={(e) => {
                                                                const nextKeys = new Set(tempSelectedKeys);
                                                                if (e.target.checked) {
                                                                    visibleFilteredContacts.forEach(c => nextKeys.add(getContactKey(c)));
                                                                } else {
                                                                    visibleFilteredContacts.forEach(c => nextKeys.delete(getContactKey(c)));
                                                                }
                                                                setTempSelectedKeys(nextKeys);
                                                            }}
                                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        Select All Visible ({visibleFilteredContacts.length})
                                                    </label>
                                                    <span>
                                                        {tempSelectedKeys.size} selected of {baseAudienceContacts.length}
                                                    </span>
                                                </div>

                                                {visibleFilteredContacts.length === 0 ? (
                                                    <div className="py-12 text-center text-xs text-gray-400">No contacts match search or filters.</div>
                                                ) : (
                                                    visibleFilteredContacts.map(c => {
                                                        const key = getContactKey(c);
                                                        const isSelected = tempSelectedKeys.has(key);
                                                        return (
                                                            <label
                                                                key={key}
                                                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSelected ? 'border-indigo-150 bg-indigo-50/10' : 'border-gray-150 bg-white hover:bg-gray-50/40'}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={() => {
                                                                        const nextKeys = new Set(tempSelectedKeys);
                                                                        if (isSelected) {
                                                                            nextKeys.delete(key);
                                                                        } else {
                                                                            nextKeys.add(key);
                                                                        }
                                                                        setTempSelectedKeys(nextKeys);
                                                                    }}
                                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                                                />
                                                                <div className="min-w-0 flex-1 flex items-center justify-between gap-4">
                                                                    <div className="min-w-0">
                                                                        <span className="block text-sm font-semibold text-gray-900 truncate">
                                                                            {c.custom_name || c.name || 'Unknown'}
                                                                        </span>
                                                                        <span className="block text-xs text-gray-500 font-mono mt-0.5">
                                                                            {c.phone || c.wa_id}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        {c.broadcast_count > 0 ? (
                                                                            <span className="inline-flex items-center rounded bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 text-[9px] font-bold text-indigo-600">
                                                                                Broadcasts: {c.broadcast_count}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center rounded bg-gray-50 border border-gray-150 px-2 py-0.5 text-[9px] font-bold text-gray-505">
                                                                                Not Sent
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {/* Footer */}
                                            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsContactsPopupOpen(false)}
                                                    className="h-9 rounded-lg border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedContactKeys(tempSelectedKeys);
                                                        setIsContactsPopupOpen(false);
                                                    }}
                                                    className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 text-xs font-semibold shadow-sm transition-colors"
                                                >
                                                    Save Selection
                                                </button>
                                            </div>

                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                                                                        {currentStep === 3 && (
                            <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 border-b border-zinc-100">
                                <div className="grid grid-cols-1 lg:grid-cols-[40%_60%] gap-8">
                                    {/* Left Column (40%): Live Preview */}
                                    <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
                                        <div className="hidden md:block">
                                            {selectedTemplate ? (
                                                <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                                                    {renderLivePreview()}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase flex items-center gap-2">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-350" />
                                                        Live Preview
                                                    </h3>
                                                    <div className="rounded-2xl border border-dashed border-zinc-250/80 bg-white p-8 flex flex-col items-center justify-center text-center min-h-[380px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]">
                                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-zinc-150 text-zinc-400 mb-4 shadow-sm">
                                                            <MessageSquare className="h-4.5 w-4.5" />
                                                        </div>
                                                        <h3 className="text-xs font-bold text-zinc-800 tracking-tight">No template selected</h3>
                                                        <p className="text-[11px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed font-sans">
                                                            Choose a message template from the list on the right to preview the layout.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Mobile Toggle & Preview */}
                                        {selectedTemplate && (
                                            <div className="md:hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsMobilePreviewOpen(open => !open)}
                                                    className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs font-bold text-zinc-800 active:scale-[0.98] transition-all"
                                                    aria-expanded={isMobilePreviewOpen}
                                                >
                                                    Message preview
                                                    <ChevronDown className={`h-4 w-4 text-zinc-505 transition-transform ${isMobilePreviewOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                                <div className={`${isMobilePreviewOpen ? 'block' : 'hidden'} mt-2`}>
                                                    {renderLivePreview()}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column (60%): Templates List + Content Setup */}
                                    <div className="space-y-6">
                                        {/* Template Selection Panel */}
                                        <div data-tour="broadcast-template" className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5">
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
                                                <div>
                                                    <h2 className="text-lg font-bold tracking-tight text-zinc-900 leading-none">Choose a message template</h2>
                                                    <p className="text-xs text-zinc-400 mt-1.5 font-sans">Select a Meta-approved campaign template.</p>
                                                </div>
                                                <span className="self-start sm:self-center shrink-0 rounded bg-zinc-100 px-2 py-1 text-[9px] font-mono font-bold tracking-wider text-zinc-700 border border-zinc-200/50 uppercase">
                                                    {templates.filter(t => t.status === 'APPROVED').length} Approved
                                                </span>
                                            </div>

                                            {/* Filters and Search */}
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                                <div className="relative flex-1">
                                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search templates..."
                                                        value={templateSearchQuery}
                                                        onChange={(e) => setTemplateSearchQuery(e.target.value)}
                                                        className="h-10 w-full pl-10 pr-4 text-xs rounded-lg border border-zinc-200 bg-white placeholder-zinc-405 focus:outline-none focus:border-black focus:ring-0 transition-all font-sans"
                                                    />
                                                </div>

                                                <div className="flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/40 shrink-0">
                                                    {[
                                                        { id: 'ALL', label: 'All' },
                                                        { id: 'MARKETING', label: 'Marketing' },
                                                        { id: 'UTILITY', label: 'Utility' }
                                                    ].map(tab => (
                                                        <button
                                                            key={tab.id}
                                                            type="button"
                                                            onClick={() => setTemplateCategoryFilter(tab.id)}
                                                            className={`px-3.5 py-1.5 text-[11px] font-semibold rounded-md transition-all active:scale-[0.98] ${
                                                                templateCategoryFilter === tab.id 
                                                                    ? 'bg-white shadow-sm text-zinc-900 font-bold' 
                                                                    : 'text-zinc-555 hover:text-zinc-900'
                                                            }`}
                                                        >
                                                            {tab.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Grid template scroll list */}
                                            <div>
                                                {isLoading.templates ? (
                                                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-zinc-900" /></div>
                                                ) : templates.filter(t => t.status === 'APPROVED').length === 0 ? (
                                                    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center space-y-4">
                                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-zinc-150 text-zinc-450 mx-auto shadow-sm">
                                                            <FileText className="h-4.5 w-4.5" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <h3 className="text-sm font-bold text-zinc-900">No Approved Templates</h3>
                                                            <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed font-sans">
                                                                Without approved message templates, you cannot launch a broadcast campaign. Message templates must first be created and submitted to Meta for verification.
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate('/templates')}
                                                            className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-black text-white px-4 text-xs font-semibold shadow-sm hover:bg-zinc-800 transition-all active:scale-[0.98]"
                                                        >
                                                            <span>Manage Templates</span>
                                                            <ArrowRight className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="grid max-h-[240px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                                                        {filteredApprovedTemplates.map((tpl) => (
                                                            <button
                                                                type="button"
                                                                key={tpl.id || tpl.name}
                                                                onClick={() => {
                                                                    setHeaderMediaUrl('');
                                                                    setCustomTexts({});
                                                                    setCampaign({
                                                                        ...campaign,
                                                                        template_name: tpl.name,
                                                                        template_language: tpl.language,
                                                                        variable_mapping: cleanTemplateMapping(campaign.variable_mapping)
                                                                    });
                                                                }}
                                                                className={`group rounded-xl border p-4 text-left transition-all relative ${
                                                                    campaign.template_name === tpl.name
                                                                        ? 'border-black bg-zinc-50/20 ring-1 ring-black shadow-sm'
                                                                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/30 shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:shadow-sm'
                                                                } active:scale-[0.98]`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="font-bold text-xs text-zinc-900 truncate" title={tpl.name}>{tpl.name}</div>
                                                                    {campaign.template_name === tpl.name ? (
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0" />
                                                                    ) : (
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-transparent group-hover:bg-zinc-300 shrink-0 transition-colors" />
                                                                    )}
                                                                </div>
                                                                <div className="text-[11px] text-zinc-500 mt-2 line-clamp-2 leading-relaxed font-sans">
                                                                    {tpl.components?.find(c => c.type === 'BODY')?.text || 'No preview'}
                                                                </div>
                                                                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-2.5">
                                                                    <span className="text-[9px] font-mono tracking-wider text-zinc-400 uppercase">
                                                                        {getTemplateComponentSummary(tpl.components)}
                                                                    </span>
                                                                    <span className={`text-[9px] font-mono tracking-wider font-semibold px-2 py-0.5 rounded border uppercase ${
                                                                        tpl.category?.toUpperCase() === 'MARKETING' 
                                                                            ? 'bg-zinc-50 text-zinc-650 border-zinc-200/60' 
                                                                            : 'bg-zinc-100/50 text-zinc-800 border-zinc-200/80'
                                                                    }`}>
                                                                        {tpl.category?.toLowerCase() || 'marketing'}
                                                                    </span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                        {filteredApprovedTemplates.length === 0 && (
                                                            <div className="text-xs text-zinc-500 text-center py-8 col-span-2 font-mono">
                                                                No approved templates found matching filters.
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Content Setup Panel */}
                                        {selectedTemplate && (
                                            <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5">
                                                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3.5">
                                                    <div>
                                                        <h2 className="text-base font-bold text-zinc-950">Content setup</h2>
                                                        <p className="text-xs text-zinc-400 mt-1 font-sans">Map template placeholders to contact fields or fixed values.</p>
                                                    </div>
                                                    <span className={`shrink-0 rounded px-2.5 py-0.5 text-[10px] font-mono font-bold border uppercase ${
                                                        mappedVariableCount === variables.length 
                                                            ? 'bg-zinc-50 text-zinc-800 border-zinc-200' 
                                                            : 'bg-amber-50/50 text-amber-700 border-amber-100'
                                                    }`}>
                                                        {variables.length ? `${mappedVariableCount}/${variables.length} mapped` : 'No variables'}
                                                    </span>
                                                </div>

                                                <div className="space-y-5">
                                                    <div className="rounded-lg bg-zinc-50 px-4 py-3 border border-zinc-150 flex items-center justify-between text-xs font-mono">
                                                        <span className="font-semibold text-zinc-800">{selectedTemplate.name}</span>
                                                        <span className="text-zinc-500 lowercase tracking-wide">{selectedTemplate.category?.toLowerCase() || 'Template'} · {selectedTemplate.language}</span>
                                                    </div>

                                                    {needsHeaderMedia && (
                                                        <div className="rounded-xl border border-zinc-150 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.01)] space-y-4">
                                                            <div className="flex items-start gap-3">
                                                                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-zinc-50 text-zinc-800 border border-zinc-200">
                                                                    <FileText className="h-4 w-4" />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <h3 className="text-xs font-bold text-zinc-900 font-sans">Template header</h3>
                                                                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-amber-700 border border-amber-100">Required</span>
                                                                    </div>
                                                                    <p className="mt-1 text-[11px] text-zinc-400 font-sans leading-relaxed">
                                                                        This approved template has a {selectedHeaderFormat.toLowerCase()} header. Meta requires one public media URL for every send.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                                                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-4 text-center transition-all hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98]">
                                                                    {isHeaderUploading ? (
                                                                        <Loader2 className="h-5 w-5 animate-spin text-zinc-850" />
                                                                    ) : (
                                                                        <Upload className="h-5 w-5 text-zinc-800" />
                                                                    )}
                                                                    <span className="mt-2 text-xs font-semibold text-zinc-800">
                                                                        {isHeaderUploading ? 'Uploading...' : `Upload ${selectedHeaderFormat.toLowerCase()}`}
                                                                    </span>
                                                                    <input
                                                                        type="file"
                                                                        className="hidden"
                                                                        accept={selectedHeaderFormat === 'IMAGE' ? 'image/*' : selectedHeaderFormat === 'VIDEO' ? 'video/mp4,video/*' : '*/*'}
                                                                        disabled={isHeaderUploading}
                                                                        onChange={(e) => handleHeaderMediaUpload(e.target.files?.[0])}
                                                                    />
                                                                </label>
                                                                <div className="flex flex-col justify-center">
                                                                    <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Public media URL</label>
                                                                    <div className="relative">
                                                                        <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                                                        <input
                                                                            type="url"
                                                                            required
                                                                            placeholder="https://..."
                                                                            className={`h-10 w-full rounded-lg pl-9 text-xs border ${
                                                                                headerMediaUrl.trim() 
                                                                                    ? 'border-zinc-200 focus:border-black focus:ring-0' 
                                                                                    : 'border-amber-250 bg-amber-50/20 focus:border-amber-400 focus:ring-0'
                                                                            } transition-all`}
                                                                            value={headerMediaUrl}
                                                                            onChange={(e) => syncHeaderMediaUrl(e.target.value)}
                                                                        />
                                                                    </div>
                                                                    <p className="mt-2 flex items-start gap-1 text-[10px] text-zinc-400 leading-normal">
                                                                        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                                                                        Use an uploaded file or a public URL.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {dynamicUrlButtons.map((button) => (
                                                        <div key={`button-url-${button.index}`} className="rounded-xl border border-zinc-150 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                                                            <label className="mb-2 block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                                                                URL button · {button.text}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                required
                                                                placeholder={`Value for "${button.text}" URL`}
                                                                className={`h-10 w-full rounded-lg text-xs border ${
                                                                    (campaign.variable_mapping[`_button_url_${button.index}`] || campaign.variable_mapping[`button_url_${button.index}`]) 
                                                                        ? 'border-zinc-200 focus:border-black focus:ring-0' 
                                                                        : 'border-amber-250 bg-amber-50/20 focus:border-amber-400 focus:ring-0'
                                                                } transition-all`}
                                                                value={campaign.variable_mapping[`_button_url_${button.index}`] || campaign.variable_mapping[`button_url_${button.index}`] || ''}
                                                                onChange={(e) => handleButtonUrlParamChange(button.index, e.target.value)}
                                                            />
                                                            <p className="mt-1.5 text-[10px] text-zinc-400 font-sans leading-relaxed">
                                                                Approved URL: <code className="font-mono bg-zinc-50 px-1 py-0.5 rounded text-zinc-600">{button.url}</code>. Enter only the placeholder value (e.g., <code className="font-mono text-zinc-650 bg-zinc-50 px-1 py-0.5 rounded">ads</code> or <code className="font-mono text-zinc-650 bg-zinc-50 px-1 py-0.5 rounded">?utm_source=whatsapp</code>).
                                                            </p>
                                                        </div>
                                                    ))}

                                                    {variables.length > 0 && (
                                                        <div className="border-t border-zinc-100 pt-4">
                                                            <h3 className="text-sm font-semibold text-zinc-900 font-sans">Body variables</h3>
                                                            <p className="mt-1 text-xs text-zinc-550 font-sans">Choose where each placeholder value should come from.</p>
                                                        </div>
                                                    )}

                                                    {variables.length > 0 ? variables.map((variable) => (
                                                        <div key={variable.key} className={`rounded-xl border p-4 transition-all ${
                                                            isVariableMapped(variable) 
                                                                ? 'border-zinc-200 bg-zinc-50/30' 
                                                                : 'border-zinc-100 bg-white'
                                                        }`}>
                                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                                <div className="flex min-w-0 items-center gap-3">
                                                                    <span className="flex h-7 min-w-7 items-center justify-center rounded bg-zinc-900 px-2 font-mono text-[10px] font-semibold text-white">
                                                                        {variable.token}
                                                                    </span>
                                                                    <div>
                                                                        <p className="text-xs font-semibold capitalize text-zinc-905 font-sans">{variable.label}</p>
                                                                        <p className="text-[10px] text-zinc-400 font-sans">Choose the value sent to each recipient</p>
                                                                    </div>
                                                                </div>
                                                                {isVariableMapped(variable) ? (
                                                                    <span className="text-[10px] font-mono tracking-wider font-semibold text-zinc-650 bg-zinc-100 px-2 py-0.5 rounded uppercase">Mapped</span>
                                                                ) : (
                                                                    <span className="text-[10px] font-mono tracking-wider font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase">Required</span>
                                                                )}
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2">
                                                                {[
                                                                    ['name', 'Contact name'],
                                                                    ['phone', 'Phone number'],
                                                                    ['email', 'Email address'],
                                                                    ['custom', 'Fixed text']
                                                                ].map(([value, label]) => (
                                                                    <button
                                                                        key={value}
                                                                        type="button"
                                                                        onClick={() => handleVariableMapChange(variable.key, value)}
                                                                        className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all active:scale-[0.98] ${
                                                                            campaign.variable_mapping[variable.key] === value 
                                                                                ? 'border-black bg-black text-white font-semibold' 
                                                                                : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50/50'
                                                                        }`}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                            </div>

                                                            {availableCustomFields.length > 0 && (
                                                                <div className="mt-3">
                                                                    <label className="mb-1 block text-[10px] font-medium text-zinc-400 uppercase tracking-wider font-mono">Or use another contact field</label>
                                                                    <select
                                                                        className="h-9 w-full rounded-lg border-zinc-200 bg-white text-xs text-zinc-700 focus:border-black focus:ring-0 transition-all"
                                                                        value={campaign.variable_mapping[variable.key]?.startsWith('field:') ? campaign.variable_mapping[variable.key] : ''}
                                                                        onChange={e => e.target.value && handleVariableMapChange(variable.key, e.target.value)}
                                                                    >
                                                                        <option value="">Choose contact field</option>
                                                                        {availableCustomFields.map(field => (
                                                                            <option key={field} value={`field:${field}`}>{field}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {campaign.variable_mapping[variable.key] === 'custom' && (
                                                                <div className="mt-3">
                                                                    <label className="mb-1 block text-[10px] font-medium text-zinc-400 uppercase tracking-wider font-mono">Fixed value</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder={`Value for ${variable.token}`}
                                                                        className={`h-9 w-full rounded-lg text-xs border ${
                                                                            String(customTexts[variable.key] || '').trim() 
                                                                                ? 'border-zinc-205 focus:border-black focus:ring-0 bg-white' 
                                                                                : 'border-amber-250 bg-amber-50/20 focus:border-amber-400 focus:ring-0'
                                                                        } transition-all`}
                                                                        value={customTexts[variable.key] || ''}
                                                                        onChange={e => setCustomTexts({ ...customTexts, [variable.key]: e.target.value })}
                                                                    />
                                                                    <p className="mt-1 text-[10px] text-zinc-400 leading-normal">Every recipient will receive this same value.</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )) : (
                                                        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-8 text-center text-xs text-zinc-400 font-mono">
                                                            This template has no variables.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div data-tour="broadcast-cost" className="mx-auto grid max-w-5xl gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)] lg:p-8">
                                <div className="lg:sticky lg:top-6 lg:self-start">{renderLivePreview()}</div>
                                <div className="space-y-5">
                                <div>
                                    <h2 className="text-2xl font-semibold text-gray-950">Review and launch</h2>
                                    <p className="mt-2 text-sm text-gray-500">
                                        Confirm the campaign details before sending to <strong>{filteredContacts.length} contacts</strong>.
                                    </p>
                                </div>

                                <div className="grid gap-3 text-left text-sm sm:grid-cols-2">
                                    <button type="button" onClick={() => setCurrentStep(1)} className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left hover:border-[#b9dcfb] hover:bg-[#f5faff]">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Setup</span>
                                        <span className="mt-2 block font-semibold text-gray-950">{campaign.name}</span>
                                        <span className="mt-1 block text-xs text-gray-500">{selectedWaAccount?.display_phone_number || selectedWaAccount?.name}</span>
                                    </button>
                                    <button type="button" onClick={() => setCurrentStep(2)} className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left hover:border-[#b9dcfb] hover:bg-[#f5faff]">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audience</span>
                                        <span className="mt-2 block font-semibold text-gray-950">{filteredContacts.length} recipients</span>
                                        <span className="mt-1 block text-xs text-gray-500">{campaign.audience_type === 'CSV_UPLOAD' ? 'CSV upload' : campaign.audience_tag || campaign.audience_type}</span>
                                    </button>
                                    <button type="button" onClick={() => setCurrentStep(3)} className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left hover:border-[#b9dcfb] hover:bg-[#f5faff]">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Message</span>
                                        <span className="mt-2 block truncate font-semibold text-gray-950">{campaign.template_name}</span>
                                        <span className="mt-1 block text-xs text-gray-500">{mappedVariableCount}/{variables.length} variables mapped</span>
                                    </button>
                                    <button type="button" onClick={() => setCurrentStep(1)} className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left hover:border-[#b9dcfb] hover:bg-[#f5faff]">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Timing</span>
                                        <span className="mt-2 block font-semibold text-gray-950">{campaign.scheduled_at ? 'Scheduled' : 'Send immediately'}</span>
                                        <span className="mt-1 block text-xs text-gray-500">{campaign.scheduled_at ? format(new Date(campaign.scheduled_at), 'PPp') : 'Starts after launch'}</span>
                                    </button>
                                </div>

                                <div className={`rounded-xl border p-4 text-left ${billingEstimate?.can_launch ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
                                    }`}>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Wallet className={`h-4 w-4 ${billingEstimate?.can_launch ? 'text-green-700' : 'text-amber-700'}`} />
                                            <h3 className={`text-sm font-bold ${billingEstimate?.can_launch ? 'text-green-950' : 'text-amber-950'}`}>
                                                Billing estimate
                                            </h3>
                                        </div>
                                        {isEstimating && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                                    </div>

                                    {estimateError ? (
                                        <p className="text-sm text-red-700">{estimateError}</p>
                                    ) : billingEstimate ? (
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Template category</span>
                                                <span className="font-semibold capitalize text-gray-950">{billingEstimate.category}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Recipients</span>
                                                <span className="font-semibold text-gray-950">{billingEstimate.audience_count}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Rate</span>
                                                <span className="font-semibold text-gray-950">{formatINRFromPaise(billingEstimate.rate_paise)} / message</span>
                                            </div>
                                            <div className="flex justify-between border-t border-black/10 pt-2">
                                                <span className="font-semibold text-gray-700">Estimated cost</span>
                                                <span className="font-bold text-gray-950">{formatINRFromPaise(billingEstimate.estimated_cost_paise)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Wallet balance</span>
                                                <span className={`font-semibold ${billingEstimate.enough_wallet ? 'text-green-700' : 'text-red-700'}`}>
                                                    {formatINRFromPaise(billingEstimate.wallet_balance_paise)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">After launch</span>
                                                <span className={`font-semibold ${billingEstimate.wallet_after_paise >= 0 ? 'text-gray-950' : 'text-red-700'}`}>
                                                    {formatINRFromPaise(billingEstimate.wallet_after_paise)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Plan broadcasts</span>
                                                <span className={`font-semibold ${billingEstimate.plan?.allowed ? 'text-gray-950' : 'text-red-700'}`}>
                                                    {billingEstimate.plan?.broadcasts_per_month < 0
                                                        ? 'Unlimited'
                                                        : `${billingEstimate.plan?.broadcasts_used_this_month || 0}/${billingEstimate.plan?.broadcasts_per_month || 0} used`}
                                                </span>
                                            </div>
                                            {!billingEstimate.enough_wallet && (
                                                <p className="rounded-lg bg-white/70 p-3 text-xs font-medium leading-5 text-red-700">
                                                    Recharge your wallet before launching. You need {formatINRFromPaise(billingEstimate.estimated_cost_paise - billingEstimate.wallet_balance_paise)} more for this campaign.
                                                </p>
                                            )}
                                            {!billingEstimate.plan?.allowed && (
                                                <p className="rounded-lg bg-white/70 p-3 text-xs font-medium leading-5 text-red-700">
                                                    Your monthly broadcast limit has been reached. Upgrade your plan to continue.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-600">Estimate loading...</p>
                                    )}
                                    <button
                                        data-tour="broadcast-send"
                                        disabled={isSending || isEstimating || (billingEstimate && !billingEstimate.can_launch)}
                                        onClick={handleLaunch}
                                        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0070d1] px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#0064b7] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isSending ? (
                                            <><Loader2 className="w-5 h-5 animate-spin" /> {campaign.scheduled_at ? 'Scheduling...' : `Sending to ${filteredContacts.length} contacts...`}</>
                                        ) : (
                                            campaign.scheduled_at ? 'Schedule Campaign' : 'Launch Campaign Now'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                        )}
                        </div>

                        {/* Navigation */}
                        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-4 md:px-6 rounded-b-2xl mt-auto">
                            <button
                                onClick={handleBack}
                                disabled={currentStep === 1 || isSending}
                                className="h-10 rounded-full border border-gray-300 px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Back
                            </button>
                            <span className="hidden text-xs font-medium text-gray-500 sm:block">
                                Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1]?.name}
                            </span>

                            {currentStep < 4 && (
                                <button
                                    onClick={handleNext}
                                    className="flex h-10 items-center gap-2 rounded-full bg-[#0070d1] px-5 text-sm font-semibold text-white hover:bg-[#0064b7]"
                                >
                                    Continue <ArrowRight className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            <Modal isOpen={!!broadcastAgainCamp} onClose={() => setBroadcastAgainCamp(null)} title="Duplicate Campaign">
                <div className="space-y-5 mt-2">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        How would you like to set up the audience for this campaign? You can reuse the previous recipient list or select a new one.
                    </p>
                    <div className="flex gap-3 justify-end pt-2">
                        <button
                            onClick={() => {
                                handleBroadcastAgain(broadcastAgainCamp, 'other');
                                setBroadcastAgainCamp(null);
                            }}
                            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                        >
                            Select New Audience
                        </button>
                        <button
                            onClick={() => {
                                handleBroadcastAgain(broadcastAgainCamp, 'same');
                                setBroadcastAgainCamp(null);
                            }}
                            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            Reuse Previous Audience
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
