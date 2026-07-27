import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
    AlertCircle,
    Building2,
    Calendar,
    Check,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    CreditCard,
    Database,
    Download,
    FileText,
    Filter,
    IndianRupee,
    Layers3,
    Mail,
    MapPin,
    MoreHorizontal,
    Phone,
    Plus,
    Save,
    Search,
    Tag,
    Trash2,
    Upload,
    UserRound,
    X,
    MessageSquareText,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'

import DiceBearAvatar from '../components/DiceBearAvatar'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const FIELD_GROUPS = [
    {
        label: 'Identity',
        icon: UserRound,
        fields: [
            { key: 'email', label: 'Email', type: 'email', placeholder: 'customer@example.com' },
            { key: 'alternate_phone', label: 'Alt phone', type: 'tel', placeholder: '+91 98765 43210' },
            { key: 'company', label: 'Company', type: 'text', placeholder: 'Business / organization' },
            { key: 'source', label: 'Source', type: 'text', placeholder: 'Instagram, referral, website' },
        ],
    },
    {
        label: 'Billing',
        icon: IndianRupee,
        fields: [
            { key: 'invoice', label: 'Invoice', type: 'text', placeholder: 'INV-1024' },
            { key: 'amount', label: 'Amount', type: 'number', placeholder: '10000' },
            { key: 'payment_status', label: 'Payment status', type: 'text', placeholder: 'paid, pending, overdue' },
            { key: 'due_date', label: 'Due date', type: 'date', placeholder: '' },
        ],
    },
    {
        label: 'Address',
        icon: MapPin,
        fields: [
            { key: 'address', label: 'Address', type: 'textarea', placeholder: 'Full delivery or billing address' },
            { key: 'city', label: 'City', type: 'text', placeholder: 'Bhopal' },
            { key: 'state', label: 'State', type: 'text', placeholder: 'Madhya Pradesh' },
            { key: 'pincode', label: 'Pincode', type: 'text', placeholder: '462001' },
        ],
    },
    {
        label: 'Service',
        icon: ClipboardList,
        fields: [
            { key: 'plan', label: 'Plan', type: 'text', placeholder: 'Premium / monthly' },
            { key: 'period', label: 'Period', type: 'text', placeholder: 'Jan 2026 - Mar 2026' },
            { key: 'status', label: 'Status', type: 'text', placeholder: 'active, renewal, completed' },
            { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Private notes for this customer' },
        ],
    },
    {
        label: 'Education',
        icon: FileText,
        fields: [
            { key: 'course', label: 'Course', type: 'text', placeholder: 'Course / program' },
            { key: 'batch', label: 'Batch', type: 'text', placeholder: 'Morning / 2026' },
            { key: 'form_id', label: 'Form ID', type: 'text', placeholder: 'Application ID' },
            { key: 'admission_status', label: 'Admission status', type: 'text', placeholder: 'submitted, pending, done' },
        ],
    },
]

const FIELD_PRESETS = FIELD_GROUPS.flatMap(group => group.fields)
const FIELD_PRESET_BY_KEY = FIELD_PRESETS.reduce((acc, field) => ({ ...acc, [field.key]: field }), {})

const HIDDEN_CUSTOM_FIELDS = new Set(['profile_photo_url', 'profile_photo_checked_at'])
const IGNORED_IMPORT_COLUMNS = new Set(['sr no', 'sr. no', 's.no', 's no', 'serial no', 'serial number', 'no', '#'])

const emptyDraft = {
    id: null,
    name: '',
    custom_name: '',
    phone: '',
    tagsText: '',
    wa_account_id: '',
    fields: [],
}

export default function Contacts() {
    const navigate = useNavigate()
    const { session, apiCall, memberProfile } = useAuth()
    const { alertDialog } = useDialog()
    const queryClient = useQueryClient()
    const fileInputRef = useRef(null)

    const [startingConversation, setStartingConversation] = useState(false)

    const handleDirectMessage = async () => {
        if (!activeContact?.id) return
        setStartingConversation(true)
        try {
            const res = await apiCall(`${API_BASE}/conversations/start`, {
                method: 'POST',
                body: JSON.stringify({
                    contact_id: activeContact.id,
                    wa_account_id: activeContact.wa_account_id || null
                })
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to start conversation')

            // Redirect to live chat with the phone query param
            navigate(`/live-chat?phone=${activeContact.phone || activeContact.wa_id}`)
        } catch (err) {
            alertDialog(err.message, { title: 'Failed to open chat', tone: 'danger' })
        } finally {
            setStartingConversation(false)
        }
    }

    const [searchTerm, setSearchTerm] = useState('')
    const [tagFilter, setTagFilter] = useState('')
    const [accountFilter, setAccountFilter] = useState('')
    const [fieldFilter, setFieldFilter] = useState('')
    const [activeContact, setActiveContact] = useState(null)
    const [drawerMode, setDrawerMode] = useState('view')
    const [draft, setDraft] = useState(emptyDraft)
    const [importStatus, setImportStatus] = useState(null)
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false)
    const [deleteAllConfirmName, setDeleteAllConfirmName] = useState('')
    const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('')
    const actionMenuRef = useRef(null)

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
                setIsActionMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleDownloadSample = async () => {
        try {
            const ExcelJS = await import('exceljs')
            const workbook = new ExcelJS.Workbook()
            const worksheet = workbook.addWorksheet('Sample Contacts')

            worksheet.columns = [
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Phone', key: 'phone', width: 22 },
                { header: 'Tag', key: 'tag', width: 15 },
                { header: 'Account', key: 'account', width: 25 }
            ]

            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
                cell.alignment = { vertical: 'middle', horizontal: 'center' }
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                }
            })

            const rows = [
                { name: 'Rahul Sharma', phone: '+91 98765 43210', tag: 'VIP', account: 'Main Account' },
                { name: 'Priya Singh', phone: '+91 87654 32109', tag: 'Lead', account: 'Sales Account' },
                { name: 'Amit Kumar', phone: '+91 76543 21098', tag: 'Follow-up', account: 'Support Account' },
                { name: 'Neha Gupta', phone: '+91 65432 10987', tag: 'Customer', account: 'Main Account' },
                { name: 'Vikram Singh', phone: '+91 54321 09876', tag: 'New', account: 'Sales Account' }
            ]

            rows.forEach((rowData, index) => {
                const row = worksheet.addRow(rowData)
                if (index % 2 === 0) {
                    row.eachCell((cell) => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
                    })
                }
                row.eachCell((cell) => {
                    cell.alignment = { vertical: 'middle', horizontal: 'left' }
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    }
                })
            })

            const buffer = await workbook.xlsx.writeBuffer()
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = 'sample_contacts.xlsx'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Error generating sample file:', error)
            alertDialog('Could not generate sample file.', { title: 'Error', tone: 'danger' })
        }
    }

    const authEnabled = !!session?.access_token
    const isAdmin = ['admin', 'owner'].includes(String(memberProfile?.role || '').toLowerCase())
    const adminConfirmName = String(
        memberProfile?.name ||
        session?.user?.user_metadata?.full_name ||
        session?.user?.user_metadata?.name ||
        session?.user?.email ||
        ''
    ).trim()

    const isHumanContact = (c) => {
        const waId = String(c?.wa_id || '').trim().toLowerCase()
        if (!waId) return true
        if (waId === 'status@broadcast') return false
        if (waId.includes('@g.us')) return false
        if (waId.includes('@newsletter')) return false
        if (waId.includes('@') && !waId.endsWith('@s.whatsapp.net')) return false
        return true
    }

    const { data: contacts = [], isLoading: contactsLoading, error: contactsError } = useQuery({
        queryKey: ['contacts', session?.access_token],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/contacts?include_unsaved=true`)
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(body || `Failed to fetch contacts (${res.status})`)
            }
            const data = await res.json()
            const rows = Array.isArray(data) ? data : []
            return rows.filter(isHumanContact)
        },
        staleTime: 1000 * 60 * 3,
        enabled: authEnabled,
    })

    const { data: accounts = [] } = useQuery({
        queryKey: ['wa-accounts', session?.access_token],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/whatsapp/accounts`)
            if (!res.ok) return []
            const data = await res.json()
            return Array.isArray(data) ? data : []
        },
        staleTime: 1000 * 60 * 5,
        enabled: authEnabled,
    })

    const formatPhoneForDisplay = (value) => {
        const raw = String(value || '')
        if (!raw) return ''
        const [left, right] = raw.includes('@') ? raw.split('@') : [raw, '']
        if (right && right !== 's.whatsapp.net') return ''
        const digits = String(left).replace(/[^0-9]/g, '')
        if (!digits) return ''
        if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
        if (digits.length === 12 && digits.startsWith('91')) {
            const local = digits.slice(2)
            return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
        }
        if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
        return ''
    }

    const getDisplayName = (contact) => {
        const custom = String(contact?.custom_name || '').trim()
        if (custom) return custom
        const rawName = String(contact?.name || '').trim()
        if (rawName && !rawName.includes('@') && !/^\d+$/.test(rawName)) return rawName
        return formatPhoneForDisplay(contact?.phone || contact?.wa_id) || 'Unknown'
    }

    const getPhone = (contact) => formatPhoneForDisplay(contact?.phone || contact?.wa_id) || ''

    const getProfilePhoto = (contact) => {
        return (
            contact?.profile_photo_url ||
            contact?.profilePhotoUrl ||
            contact?.photo_url ||
            contact?.avatar_url ||
            contact?.custom_fields?.profile_photo_url ||
            ''
        )
    }

    const getAccountLabel = (contactOrAccount) => {
        if (!contactOrAccount) return 'Unassigned'

        const isContact = Object.prototype.hasOwnProperty.call(contactOrAccount, 'wa_account_id')
            || Object.prototype.hasOwnProperty.call(contactOrAccount, 'wa_id')
            || Object.prototype.hasOwnProperty.call(contactOrAccount, 'phone')

        const account = isContact
            ? (contactOrAccount.wa_account_id
                ? accounts.find(item => item.id === contactOrAccount.wa_account_id) || contactOrAccount.account
                : contactOrAccount.account)
            : contactOrAccount
        if (!account) return 'Unassigned'
        return account.name || account.display_phone_number || account.phone_number_id || 'WhatsApp account'
    }

    const visibleCustomFields = (contact) => Object.entries(contact?.custom_fields || {})
        .filter(([key, value]) => {
            const normalizedKey = String(key || '').trim().toLowerCase()
            return !HIDDEN_CUSTOM_FIELDS.has(key)
                && !IGNORED_IMPORT_COLUMNS.has(normalizedKey)
                && value !== null
                && value !== undefined
                && String(value).trim() !== ''
        })

    const getFieldMeta = (key) => {
        const normalized = String(key || '').trim()
        return FIELD_PRESET_BY_KEY[normalized] || { key: normalized, label: normalized || 'Custom field', type: 'text', placeholder: 'Value' }
    }

    const allTags = useMemo(() => {
        const tags = new Set()
        contacts.forEach(contact => (contact.tags || []).forEach(tag => tags.add(tag)))
        return Array.from(tags).sort((a, b) => a.localeCompare(b))
    }, [contacts])

    const allFieldKeys = useMemo(() => {
        const keys = new Set()
        contacts.forEach(contact => visibleCustomFields(contact).forEach(([key]) => keys.add(key)))
        return Array.from(keys).sort((a, b) => a.localeCompare(b))
    }, [contacts])

    const stats = useMemo(() => {
        const withFields = contacts.filter(contact => visibleCustomFields(contact).length > 0).length
        const withTags = contacts.filter(contact => (contact.tags || []).length > 0).length
        const assigned = contacts.filter(contact => contact.wa_account_id || contact.account?.id).length
        return { total: contacts.length, withFields, withTags, assigned }
    }, [contacts])

    const query = searchTerm.trim().toLowerCase()
    const filteredContacts = contacts.filter(contact => {
        const fieldEntries = visibleCustomFields(contact)
        const searchable = [
            getDisplayName(contact),
            getPhone(contact),
            contact.wa_id,
            getAccountLabel(contact),
            ...(contact.tags || []),
            ...fieldEntries.flatMap(([key, value]) => [key, String(value)]),
        ].join(' ').toLowerCase()
        const matchesSearch = !query || searchable.includes(query)
        const matchesTag = !tagFilter || (contact.tags || []).includes(tagFilter)
        const contactAccountId = contact.wa_account_id || contact.account?.id || ''
        const matchesAccount = !accountFilter || contactAccountId === accountFilter
        const matchesField = !fieldFilter || fieldEntries.some(([key]) => key === fieldFilter)
        return matchesSearch && matchesTag && matchesAccount && matchesField
    })

    const hydrateDraft = (contact = null) => {
        if (!contact) return { ...emptyDraft, fields: [] }
        return {
            id: contact.id,
            name: String(contact.name || ''),
            custom_name: String(contact.custom_name || ''),
            phone: getPhone(contact) || String(contact.phone || contact.wa_id || ''),
            tagsText: (contact.tags || []).join(', '),
            wa_account_id: contact.wa_account_id || contact.account?.id || '',
            fields: visibleCustomFields(contact).map(([key, value]) => ({ key, value: String(value ?? '') })),
        }
    }

    useEffect(() => {
        if (!activeContact?.id) return
        const fresh = contacts.find(contact => contact.id === activeContact.id)
        if (fresh) setActiveContact(fresh)
    }, [contacts, activeContact?.id])

    const parseTags = (value) => String(value || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)

    const setDraftTags = (tags) => {
        const uniqueTags = Array.from(new Set(tags.map(tag => String(tag || '').trim()).filter(Boolean)))
        setDraft(prev => ({ ...prev, tagsText: uniqueTags.join(', ') }))
    }

    const addDraftTag = (tag) => {
        const cleanTag = String(tag || '').trim()
        if (!cleanTag) return
        setDraftTags([...parseTags(draft.tagsText), cleanTag])
    }

    const removeDraftTag = (tagToRemove) => {
        setDraftTags(parseTags(draft.tagsText).filter(tag => tag !== tagToRemove))
    }

    const fieldsToObject = (fields) => fields.reduce((acc, field) => {
        const key = String(field.key || '').trim()
        if (key) acc[key] = String(field.value ?? '').trim()
        return acc
    }, {})

    const buildPayload = (source) => ({
        name: source.name,
        custom_name: source.custom_name,
        phone: source.phone,
        tags: parseTags(source.tagsText),
        wa_account_id: source.wa_account_id || null,
        custom_fields: fieldsToObject(source.fields),
    })

    const saveMutation = useMutation({
        mutationFn: async (source) => {
            const isEdit = Boolean(source.id)
            const res = await apiCall(`${API_BASE}/contacts${isEdit ? `/${source.id}` : ''}`, {
                method: isEdit ? 'PATCH' : 'POST',
                body: JSON.stringify(buildPayload(source)),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error || `Failed to save contact (${res.status})`)
            }
            return res.json()
        },
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            setActiveContact(updated)
            setDraft(hydrateDraft(updated))
            setDrawerMode('view')
        },
    })

    const deleteMutation = useMutation({
        mutationFn: async (contact) => {
            const res = await apiCall(`${API_BASE}/contacts/${contact.id}`, { method: 'DELETE' })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error || 'Failed to delete contact')
            }
            return true
        },
        onSuccess: () => {
            setActiveContact(null)
            setDrawerMode('view')
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
        },
    })

    const resetDeleteAllModal = () => {
        setDeleteAllConfirmName('')
        setDeleteAllConfirmText('')
        setIsDeleteAllModalOpen(false)
    }

    const deleteAllMutation = useMutation({
        mutationFn: async () => {
            const res = await apiCall(`${API_BASE}/contacts/all`, {
                method: 'DELETE',
                body: JSON.stringify({
                    confirm_name: deleteAllConfirmName,
                    confirm_delete: deleteAllConfirmText,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || `Failed to delete contacts (${res.status})`)
            return data
        },
        onSuccess: (data) => {
            resetDeleteAllModal()
            setActiveContact(null)
            setDrawerMode('view')
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            setImportStatus({
                type: 'success',
                message: `Deleted ${data.deleted_count || 0} contact${Number(data.deleted_count || 0) === 1 ? '' : 's'}.`,
            })
            setTimeout(() => setImportStatus(null), 8000)
        },
    })

    const openContact = (contact) => {
        setActiveContact(contact)
        setDraft(hydrateDraft(contact))
        setDrawerMode('view')
    }

    const openNewContact = () => {
        setActiveContact(null)
        setDraft({ ...emptyDraft, fields: [{ key: 'source', value: '' }] })
        setDrawerMode('edit')
    }

    const updateDraft = (patch) => setDraft(prev => ({ ...prev, ...patch }))

    const addField = (key = '', value = '') => {
        setDraft(prev => ({ ...prev, fields: [...prev.fields, { key, value }] }))
    }

    const addFieldGroup = (group) => {
        setDraft(prev => {
            const existing = new Set(prev.fields.map(field => field.key))
            const nextFields = group.fields
                .filter(field => !existing.has(field.key))
                .map(field => ({ key: field.key, value: '' }))
            return { ...prev, fields: [...prev.fields, ...nextFields] }
        })
    }

    const updateField = (index, patch) => {
        setDraft(prev => ({
            ...prev,
            fields: prev.fields.map((field, i) => i === index ? { ...field, ...patch } : field),
        }))
    }

    const removeField = (index) => {
        setDraft(prev => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }))
    }

    const parseCsvLine = (line) => {
        const values = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (ch === '"' && line[i + 1] === '"') {
                current += '"'
                i++
            } else if (ch === '"') {
                inQuotes = !inQuotes
            } else if (ch === ',' && !inQuotes) {
                values.push(current.trim())
                current = ''
            } else {
                current += ch
            }
        }
        values.push(current.trim())
        return values
    }

    const handleImportCsv = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        try {
            setImportStatus({ type: 'info', message: 'Reading file...' })

            let parsedLines = []
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                const XLSX = await import('xlsx')
                const arrayBuffer = await file.arrayBuffer()
                const workbook = XLSX.read(arrayBuffer, { type: 'array' })

                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName]
                    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
                    const lines = rawData.map(row => row.map(cell => String(cell !== undefined && cell !== null ? cell : '').trim()))
                        .filter(row => row.some(cell => cell !== ''))

                    if (lines.length > 0) {
                        parsedLines = lines
                        break
                    }
                }

                if (parsedLines.length === 0) throw new Error('Excel file is completely empty')
            } else {
                const text = await file.text()
                parsedLines = text.split(/\r?\n/).filter(line => line.trim()).map(line => parseCsvLine(line))
            }

            if (parsedLines.length === 0) throw new Error('File is empty')

            let headers = parsedLines[0]
            let normalized = headers.map(header => header.toLowerCase().trim())
            let nameIdx = normalized.findIndex(header => header.includes('name'))
            let phoneIdx = normalized.findIndex(header => header.includes('phone') || header.includes('mobile') || header.includes('number') || header.includes('whatsapp') || header.includes('contact') || header === 'wa' || header === 'ph')
            let tagsIdx = normalized.findIndex(header => header.includes('tag'))
            let accountIdx = normalized.findIndex(header => header.includes('account'))

            // Auto-detect phone column if header name is completely unrecognized
            if (phoneIdx === -1 && parsedLines.length > 1) {
                phoneIdx = parsedLines[1].findIndex(cell => /^\+?[0-9\s-()]{10,20}$/.test(cell) && cell.replace(/\D/g, '').length >= 10)
            }

            // If still not found, maybe there is no header row and the first row is data
            if (phoneIdx === -1) {
                phoneIdx = parsedLines[0].findIndex(cell => /^\+?[0-9\s-()]{10,20}$/.test(cell) && cell.replace(/\D/g, '').length >= 10)
                if (phoneIdx !== -1) {
                    // Prepend dummy headers since the first row is actually data
                    headers = parsedLines[0].map((_, i) => i === phoneIdx ? 'phone' : `column_${i + 1}`)
                    parsedLines.unshift(headers)
                    normalized = headers
                }
            }

            if (phoneIdx === -1) throw new Error(`File needs a phone column (or auto-detectable phone numbers). Found columns: ${headers.join(', ') || 'none'}`)

            const ignoredColumnIndexes = headers
                .map((header, index) => IGNORED_IMPORT_COLUMNS.has(String(header || '').trim().toLowerCase()) ? index : -1)
                .filter(index => index >= 0)
            const reserved = new Set([nameIdx, phoneIdx, tagsIdx, accountIdx, ...ignoredColumnIndexes].filter(index => index >= 0))
            let imported = 0
            let failed = 0
            let skipped = 0
            const batchErrors = []

            const contactsToImport = parsedLines.slice(1);
            const total = contactsToImport.length;

            setImportStatus({ type: 'info', message: 'Importing contacts...', progress: { current: 0, total } });

            const BATCH_SIZE = 500;

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const chunk = contactsToImport.slice(i, i + BATCH_SIZE);
                const payload = [];

                for (const cols of chunk) {
                    if (!cols || cols.length === 0) continue;
                    const phone = cols[phoneIdx];
                    if (!phone) continue;
                    const accountText = accountIdx >= 0 ? String(cols[accountIdx] || '').trim().toLowerCase() : '';
                    const account = accountText
                        ? accounts.find(acc => [acc.id, acc.name, acc.display_phone_number, acc.phone_number_id].some(value => String(value || '').toLowerCase() === accountText))
                        : null;
                    const custom_fields = headers.reduce((acc, header, index) => {
                        if (reserved.has(index)) return acc;
                        const key = String(header || '').trim();
                        const value = String(cols[index] || '').trim();
                        if (key && value) acc[key] = value;
                        return acc;
                    }, {});

                    payload.push({
                        name: nameIdx >= 0 ? cols[nameIdx] : '',
                        phone,
                        tags: tagsIdx >= 0 ? cols[tagsIdx] : '',
                        wa_account_id: account?.id || null,
                        custom_fields,
                    });
                }

                if (payload.length > 0) {
                    try {
                        const res = await apiCall(`${API_BASE}/contacts/batch`, {
                            method: 'POST',
                            body: JSON.stringify({ contacts: payload }),
                        });
                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            throw new Error(errData.error || 'Batch import failed');
                        }
                        const data = await res.json();
                        imported += data.imported || 0;
                        skipped += Number(data.skipped_existing || 0) + Number(data.skipped_duplicate_rows || 0) + Number(data.skipped_invalid_rows || 0);

                        if (data.contacts && Array.isArray(data.contacts)) {
                            queryClient.setQueriesData({ queryKey: ['contacts'] }, (old) => {
                                const prev = Array.isArray(old) ? old : [];
                                const newIds = new Set(data.contacts.map(c => c.id));
                                return [...data.contacts, ...prev.filter(c => !newIds.has(c.id))];
                            });
                        }
                    } catch (err) {
                        console.error('Batch error:', err);
                        failed += payload.length;
                        if (err?.message && batchErrors.length < 3) batchErrors.push(err.message);
                        if (err.message && err.message.toLowerCase().includes('limit')) {
                            throw err; // Stop if it's a billing limit error
                        }
                    }
                }

                setImportStatus({ type: 'info', message: 'Importing contacts...', progress: { current: Math.min(i + BATCH_SIZE, total), total } });
            }

            if (failed && imported === 0) {
                throw new Error(batchErrors[0] || `Import failed for ${failed} contacts`);
            }

            setImportStatus({
                type: failed ? 'error' : 'success',
                message: `Imported ${imported} contact${imported === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}${failed ? `, failed ${failed}: ${batchErrors[0] || 'Some rows could not be imported'}` : ''}. Extra columns were saved as custom fields.`
            });
            setTimeout(() => setImportStatus(null), 8000);
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
        } catch (err) {
            setImportStatus({ type: 'error', message: err.message || 'Import failed' });
            setTimeout(() => setImportStatus(null), 8000);
            alertDialog(err.message, { title: 'Import failed', tone: 'danger' });
        }
    }

    const handleExportExcel = async () => {
        const toExport = filteredContacts.length > 0 ? filteredContacts : contacts;
        if (!toExport || toExport.length === 0) return;

        const formatHeader = (key) => {
            return String(key).split(/[_-\s]+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        const baseHeaders = ['Name', 'Phone', 'Tags', 'Account', 'Joined', 'Last Active'];
        const customFieldsHeaders = new Set();
        toExport.forEach(contact => {
            visibleCustomFields(contact).forEach(([key]) => customFieldsHeaders.add(key));
        });
        const customHeadersArray = Array.from(customFieldsHeaders);

        const headers = [...baseHeaders, ...customHeadersArray.map(formatHeader)];

        // Dynamic import to avoid initial bundle size increase
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Contacts');

        sheet.addRow(headers);

        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4F46E5' } // Indigo 600
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        toExport.forEach(contact => {
            const row = [];
            row.push(getDisplayName(contact));

            const phone = getPhone(contact) || contact.wa_id || '';
            row.push(phone.startsWith('+') ? phone : (phone ? `+${phone}` : ''));

            row.push((contact.tags || []).join(', '));
            row.push(getAccountLabel(contact));
            row.push(contact.created_at ? format(new Date(contact.created_at), 'MMM d, yyyy') : '');
            row.push(contact.last_active ? format(new Date(contact.last_active), 'MMM d, yyyy h:mm a') : '');

            const contactFields = Object.fromEntries(visibleCustomFields(contact));
            customHeadersArray.forEach(header => {
                row.push(contactFields[header] || '');
            });

            const addedRow = sheet.addRow(row);

            addedRow.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };
            });

            const phoneCell = addedRow.getCell(2);
            phoneCell.numFmt = '@';
        });

        sheet.columns.forEach((column) => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const columnLength = cell.value ? cell.value.toString().length : 10;
                if (columnLength > maxLength) {
                    maxLength = columnLength;
                }
            });
            column.width = Math.min(Math.max(maxLength + 2, 12), 50);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Contacts_Export_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resetFilters = () => {
        setSearchTerm('')
        setTagFilter('')
        setAccountFilter('')
        setFieldFilter('')
    }

    const selectedFields = visibleCustomFields(activeContact)
    const topFields = (contact) => visibleCustomFields(contact).slice(0, 4)
    const accountOptions = [
        { value: '', label: 'All accounts' },
        ...accounts.map(account => ({ value: account.id, label: getAccountLabel(account), helper: account.display_phone_number || account.phone_number_id || '' })),
    ]
    const assignAccountOptions = [
        { value: '', label: 'Unassigned' },
        ...accounts.map(account => ({ value: account.id, label: getAccountLabel(account), helper: account.display_phone_number || account.phone_number_id || '' })),
    ]
    const tagOptions = [{ value: '', label: 'All tags' }, ...allTags.map(tag => ({ value: tag, label: tag }))]
    const fieldOptions = [{ value: '', label: 'All fields' }, ...allFieldKeys.map(key => ({ value: key, label: getFieldMeta(key).label }))]
    const fieldPresetOptions = [
        { value: '', label: 'Custom field' },
        ...FIELD_PRESETS.map(field => ({ value: field.key, label: field.label })),
    ]
    const canConfirmDeleteAll = Boolean(
        isAdmin &&
        adminConfirmName &&
        deleteAllConfirmName.trim() === adminConfirmName &&
        deleteAllConfirmText.trim().toLowerCase() === 'delete all contacts'
    )

    return (
        <div className="min-h-full bg-gray-50/70">
            <div className="space-y-5 p-2 sm:p-5 lg:px-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start justify-between w-full lg:w-auto">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-950 flex items-center gap-2">
                                Contacts
                            </h1>
                            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-500">Manage customer profiles, account ownership, and tags.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:items-center sm:w-auto">

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv, .xls, .xlsx"
                            className="hidden"
                            onChange={(e) => {
                                handleImportCsv(e)
                                setIsImportModalOpen(false)
                                setIsActionMenuOpen(false)
                            }}
                        />
                        <div className="relative" ref={actionMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none transition-colors"
                            >
                                Actions
                                <ChevronDown className={`h-4 w-4 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isActionMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-48 z-10 rounded-xl border border-gray-100 bg-white shadow-lg shadow-gray-200/50 ring-1 ring-black ring-opacity-5 focus:outline-none">
                                    <div className="py-1">
                                        <button
                                            onClick={() => {
                                                setIsActionMenuOpen(false)
                                                setIsImportModalOpen(true)
                                            }}
                                            data-tour="contacts-import"
                                            className="group flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            <Upload className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                            Import Contacts
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsActionMenuOpen(false)
                                                handleExportExcel()
                                            }}
                                            className="group flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            <Download className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                            Export Excel
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsActionMenuOpen(false)
                                                openNewContact()
                                            }}
                                            data-tour="contacts-add"
                                            className="group flex w-full items-center gap-3 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                                        >
                                            <Plus className="h-4 w-4 text-indigo-500" />
                                            Add Contact
                                        </button>
                                        {isAdmin ? (
                                            <button
                                                onClick={() => {
                                                    setIsActionMenuOpen(false)
                                                    setIsDeleteAllModalOpen(true)
                                                }}
                                                className="group flex w-full items-center gap-3 border-t border-gray-100 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                Delete all contacts
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
                    {[
                        { label: 'Total contacts', value: stats.total, icon: UserRound },
                        { label: 'With account', value: stats.assigned, icon: Building2 },
                        { label: 'Tagged', value: stats.withTags, icon: Tag },
                    ].map(item => (
                        <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-2 sm:px-4 sm:py-3 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1">
                                <div className="text-[10px] sm:text-xs font-medium text-gray-500 truncate leading-tight">{item.label}</div>
                                <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 shrink-0" />
                            </div>
                            <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-gray-950 leading-none">{item.value}</div>
                        </div>
                    ))}
                </div>


                {(contactsError || saveMutation.error || deleteMutation.error || deleteAllMutation.error) ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{contactsError?.message || saveMutation.error?.message || deleteMutation.error?.message || deleteAllMutation.error?.message}</span>
                    </div>
                ) : null}

                <div data-tour="contacts-filters" className="rounded-xl border border-gray-200 bg-white p-2.5 sm:p-4 shadow-sm">
                    <div className="flex flex-col gap-2 xl:flex-row xl:gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 sm:left-3 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 text-gray-400" />
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search name, phone, tag..."
                                className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-2.5 text-xs sm:text-sm sm:py-2 sm:pl-10 sm:pr-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                            />
                        </div>
                        <CustomSelect value={accountFilter} onChange={setAccountFilter} options={accountOptions} className="xl:w-44" />
                        <CustomSelect value={tagFilter} onChange={setTagFilter} options={tagOptions} className="xl:w-40" />
                        <CustomSelect value={fieldFilter} onChange={setFieldFilter} options={fieldOptions} className="xl:w-44" />
                        <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                            <Filter className="h-4 w-4" />
                            Reset
                        </button>
                    </div>
                </div>

                <div data-tour="contacts-table" className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                                <tr>
                                    <th className="px-5 py-3">Customer</th>
                                    <th className="px-5 py-3">Account</th>
                                    <th className="px-5 py-3">Tags</th>
                                    <th className="px-5 py-3">Business data</th>
                                    <th className="px-5 py-3">Broadcasts</th>
                                    <th className="px-5 py-3">Activity</th>
                                    <th className="px-5 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {contactsLoading ? (
                                    <tr>
                                        <td colSpan="7" className="px-5 py-10 text-center text-sm text-gray-500">Loading contacts...</td>
                                    </tr>
                                ) : filteredContacts.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-5 py-10 text-center text-sm text-gray-500">No contacts match this view.</td>
                                    </tr>
                                ) : filteredContacts.map(contact => (
                                    <tr key={contact.id} onClick={() => openContact(contact)} className="cursor-pointer bg-white transition hover:bg-gray-50">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                {getProfilePhoto(contact) ? (
                                                    <img
                                                        src={getProfilePhoto(contact)}
                                                        alt={getDisplayName(contact)}
                                                        className="h-10 w-10 rounded-full object-cover shadow-sm shrink-0"
                                                    />
                                                ) : (
                                                    <DiceBearAvatar seed={getDisplayName(contact)} className="h-10 w-10 rounded-full object-cover shadow-sm shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold text-gray-950">{getDisplayName(contact)}</div>
                                                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-gray-500">
                                                        <Phone className="h-3 w-3" />
                                                        {getPhone(contact) || contact.wa_id || '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="inline-flex max-w-[210px] items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                                                <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                <span className="truncate">{getAccountLabel(contact)}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex max-w-[220px] flex-wrap gap-1">
                                                {(contact.tags || []).slice(0, 3).map(tag => (
                                                    <span key={tag} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{tag}</span>
                                                ))}
                                                {(contact.tags || []).length > 3 ? <span className="text-xs text-gray-400">+{contact.tags.length - 3}</span> : null}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            {topFields(contact).length ? (
                                                <BusinessDataCell fields={topFields(contact)} />
                                            ) : (
                                                <span className="text-xs text-gray-400">No fields</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex items-center gap-1 rounded-md  px-2.5 py-1 text-xs font-semibold text-indigo-700">
                                                {contact.broadcast_count || 0}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-xs text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                {contact.last_active ? format(new Date(contact.last_active), 'MMM d, yyyy h:mm a') : contact.created_at ? format(new Date(contact.created_at), 'MMM d, yyyy') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button type="button" onClick={(event) => { event.stopPropagation(); openContact(contact) }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                                <MoreHorizontal className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-col gap-1 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <span>Showing <strong className="text-gray-800">{filteredContacts.length}</strong> of <strong className="text-gray-800">{contacts.length}</strong> contacts</span>
                    </div>
                </div>

                {/* Mobile Card List (Apple X Meta High-Density Layout) */}
                <div className="block md:hidden space-y-1.5">
                    {contactsLoading ? (
                        <div className="rounded-xl border border-gray-200 bg-white p-5 text-center text-xs text-gray-500 shadow-sm">Loading contacts...</div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="rounded-xl border border-gray-200 bg-white p-5 text-center text-xs text-gray-500 shadow-sm">No contacts match this view.</div>
                    ) : (
                        filteredContacts.map(contact => (
                            <div
                                key={contact.id}
                                onClick={() => openContact(contact)}
                                className="rounded-xl border border-gray-100 bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all hover:border-indigo-300 hover:shadow active:scale-[0.99] cursor-pointer"
                            >
                                <div className="flex items-center gap-2.5">
                                    {/* Avatar */}
                                    {getProfilePhoto(contact) ? (
                                        <img
                                            src={getProfilePhoto(contact)}
                                            alt={getDisplayName(contact)}
                                            className="h-8 w-8 rounded-full object-cover shadow-sm shrink-0"
                                        />
                                    ) : (
                                        <DiceBearAvatar seed={getDisplayName(contact)} className="h-8 w-8 rounded-full object-cover shadow-sm shrink-0" />
                                    )}

                                    {/* Core Details */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <h3 className="truncate text-xs font-bold text-gray-950">{getDisplayName(contact)}</h3>
                                            {/* Account Name Badge */}
                                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-gray-50 px-1 py-0.2 text-[8px] font-semibold text-gray-500 border border-gray-100">
                                                {getAccountLabel(contact)}
                                            </span>
                                        </div>

                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] text-gray-400 font-mono">
                                            <span className="flex items-center gap-0.5">
                                                <Phone className="h-2.5 w-2.5" />
                                                {getPhone(contact) || contact.wa_id || '-'}
                                            </span>
                                            <span className="h-1 w-1 rounded-full bg-gray-200" />
                                            <span className="flex items-center gap-0.5">
                                                <Calendar className="h-2.5 w-2.5" />
                                                {contact.last_active ? format(new Date(contact.last_active), 'MMM d, yyyy') : contact.created_at ? format(new Date(contact.created_at), 'MMM d, yyyy') : '-'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Button & Tags */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="inline-flex shrink-0 items-center rounded bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.2 text-[8px] font-bold text-indigo-600">
                                            BC: {contact.broadcast_count || 0}
                                        </span>
                                        {(contact.tags && contact.tags.length > 0) && (
                                            <div className="flex gap-0.5">
                                                {contact.tags.slice(0, 1).map(tag => (
                                                    <span key={tag} className="rounded bg-blue-50 border border-blue-100/50 px-1.5 py-0.2 text-[8px] font-bold text-blue-600 truncate max-w-[50px]">{tag}</span>
                                                ))}
                                                {contact.tags.length > 1 ? (
                                                    <span className="rounded bg-gray-50 border border-gray-100 px-1 py-0.2 text-[8px] font-bold text-gray-500">+{contact.tags.length - 1}</span>
                                                ) : null}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(event) => { event.stopPropagation(); openContact(contact) }}
                                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[10px] text-gray-500 shadow-sm text-center">
                        Showing <strong className="text-gray-800">{filteredContacts.length}</strong> of <strong className="text-gray-800">{contacts.length}</strong> contacts
                    </div>
                </div>
            </div>

            {(activeContact || drawerMode === 'edit') ? (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    <div className="absolute inset-0 bg-gray-950/30" onClick={() => { setActiveContact(null); setDrawerMode('view') }} />
                    <div className="absolute inset-y-0 right-0 w-full max-w-[500px] bg-white shadow-2xl">
                        <div className="flex h-full flex-col">
                            <div className="border-b border-gray-200 px-5 py-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{draft.id ? 'Contact profile' : 'New contact'}</div>
                                        <h2 className="mt-1 truncate text-xl font-bold text-gray-950">{draft.id ? getDisplayName(activeContact) : 'Add customer data'}</h2>
                                        <p className="mt-1 text-sm text-gray-500">{draft.id ? getPhone(activeContact) || activeContact?.wa_id : 'Save phone, account, tags, and any extra fields.'}</p>
                                    </div>
                                    <button type="button" onClick={() => { setActiveContact(null); setDrawerMode('view') }} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                                {draft.id ? (
                                    <div className="mt-4 flex gap-2">
                                        <button type="button" onClick={() => setDrawerMode('view')} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${drawerMode === 'view' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Overview</button>
                                        <button type="button" onClick={() => { setDraft(hydrateDraft(activeContact)); setDrawerMode('edit') }} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${drawerMode === 'edit' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Edit</button>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex-1 overflow-y-auto bg-gray-50 p-5">
                                {drawerMode === 'view' && activeContact ? (
                                    <div className="space-y-5">
                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="flex items-center gap-4">
                                                {getProfilePhoto(activeContact) ? (
                                                    <img
                                                        src={getProfilePhoto(activeContact)}
                                                        alt={getDisplayName(activeContact)}
                                                        className="h-16 w-16 rounded-full object-cover shrink-0 shadow-sm"
                                                    />
                                                ) : (
                                                    <DiceBearAvatar seed={getDisplayName(activeContact)} className="h-16 w-16 rounded-full object-cover shrink-0 shadow-sm" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="text-lg font-bold text-gray-950">{getDisplayName(activeContact)}</div>
                                                    <div className="mt-1 font-mono text-sm text-gray-500">{getPhone(activeContact) || activeContact.wa_id || '-'}</div>
                                                </div>
                                            </div>
                                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                                <InfoRow label="Account" value={getAccountLabel(activeContact)} />
                                                <InfoRow label="WhatsApp ID" value={activeContact.wa_id || '-'} mono />
                                                <InfoRow label="Joined" value={activeContact.created_at ? format(new Date(activeContact.created_at), 'MMM d, yyyy') : '-'} />
                                                <InfoRow label="Last active" value={activeContact.last_active ? format(new Date(activeContact.last_active), 'MMM d, yyyy h:mm a') : '-'} />
                                                <InfoRow label="Broadcasts Sent" value={String(activeContact.broadcast_count || 0)} />
                                            </div>
                                        </section>

                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-gray-950">Tags</h3>
                                                <Tag className="h-4 w-4 text-gray-400" />
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {(activeContact.tags || []).length ? activeContact.tags.map(tag => (
                                                    <span key={tag} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{tag}</span>
                                                )) : <span className="text-sm text-gray-500">No tags yet</span>}
                                            </div>
                                        </section>

                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-gray-950">Business data</h3>
                                                <Database className="h-4 w-4 text-gray-400" />
                                            </div>
                                            {selectedFields.length ? (
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    {selectedFields.map(([key, value]) => (
                                                        <InfoRow key={key} label={getFieldMeta(key).label} value={String(value)} />
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-sm text-gray-500">No custom fields saved yet</span>
                                            )}
                                        </section>
                                    </div>
                                ) : (
                                    <form id="contact-editor" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(draft) }} className="space-y-5">
                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <h3 className="mb-4 text-sm font-bold text-gray-950">Core details</h3>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label="Name">
                                                    <input value={draft.name} onChange={event => updateDraft({ name: event.target.value })} className="field-input" placeholder="Customer name" />
                                                </Field>
                                                <Field label="Alias">
                                                    <input value={draft.custom_name} onChange={event => updateDraft({ custom_name: event.target.value })} className="field-input" placeholder="Private display name" />
                                                </Field>
                                                <Field label="Phone">
                                                    <input required value={draft.phone} onChange={event => updateDraft({ phone: event.target.value })} className="field-input" placeholder="+91 98765 43210" />
                                                </Field>
                                                <Field label="WhatsApp account">
                                                    <CustomSelect
                                                        value={draft.wa_account_id}
                                                        onChange={value => updateDraft({ wa_account_id: value })}
                                                        options={assignAccountOptions}
                                                    />
                                                </Field>
                                            </div>
                                            <Field label="Tags" className="mt-4">
                                                <div className="space-y-3">
                                                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
                                                        <input
                                                            value={draft.tagsText}
                                                            onChange={event => updateDraft({ tagsText: event.target.value })}
                                                            className="field-input"
                                                            placeholder="lead, vip, renewal"
                                                        />
                                                        <CustomSelect
                                                            value=""
                                                            onChange={(value) => addDraftTag(value)}
                                                            options={[
                                                                { value: '', label: allTags.length ? 'Select existing tag' : 'No saved tags yet' },
                                                                ...allTags
                                                                    .filter(tag => !parseTags(draft.tagsText).includes(tag))
                                                                    .map(tag => ({ value: tag, label: tag }))
                                                            ]}
                                                        />
                                                    </div>
                                                    {parseTags(draft.tagsText).length ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            {parseTags(draft.tagsText).map(tag => (
                                                                <span key={tag} className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                                                    {tag}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeDraftTag(tag)}
                                                                        className="rounded-full p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
                                                                        aria-label={`Remove ${tag}`}
                                                                    >
                                                                        <X className="h-3 w-3" />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-gray-500">Existing tags dropdown se select karein ya comma separated custom tags type karein.</p>
                                                    )}
                                                </div>
                                            </Field>
                                        </section>

                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-950">Custom fields</h3>
                                                    <p className="mt-1 text-xs text-gray-500">Invoice, address, course, payment ya business-specific data yahan save hota hai.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => addField()}
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add field
                                                </button>
                                            </div>

                                            <div className="mb-4 flex flex-wrap gap-2">
                                                {FIELD_GROUPS.map(group => {
                                                    const Icon = group.icon
                                                    return (
                                                        <button
                                                            key={group.label}
                                                            type="button"
                                                            onClick={() => addFieldGroup(group)}
                                                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                                        >
                                                            <Icon className="h-3.5 w-3.5" />
                                                            {group.label}
                                                        </button>
                                                    )
                                                })}
                                            </div>

                                            {draft.fields.length ? (
                                                <div className="space-y-3">
                                                    {draft.fields.map((field, index) => {
                                                        const meta = getFieldMeta(field.key)
                                                        return (
                                                            <div key={`${field.key || 'field'}-${index}`} className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[140px_minmax(0,1fr)_40px]">
                                                                <div className="space-y-2">
                                                                    <CustomSelect
                                                                        value={FIELD_PRESET_BY_KEY[field.key] ? field.key : ''}
                                                                        onChange={value => updateField(index, { key: value })}
                                                                        options={fieldPresetOptions}
                                                                    />
                                                                    {!FIELD_PRESET_BY_KEY[field.key] ? (
                                                                        <input
                                                                            value={field.key}
                                                                            onChange={event => updateField(index, { key: event.target.value })}
                                                                            className="field-input"
                                                                            placeholder="Field name"
                                                                        />
                                                                    ) : null}
                                                                </div>
                                                                <FieldValueInput
                                                                    field={field}
                                                                    meta={meta}
                                                                    onChange={value => updateField(index, { value })}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeField(index)}
                                                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                                    aria-label={`Remove ${meta.label}`}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                                                    No custom fields yet.
                                                </div>
                                            )}
                                        </section>

                                    </form>
                                )}
                            </div>

                            <div className="border-t border-gray-200 bg-white px-5 py-4">
                                {drawerMode === 'view' && activeContact ? (
                                    <div className="flex justify-between gap-3 w-full">
                                        <button type="button" onClick={() => deleteMutation.mutate(activeContact)} disabled={deleteMutation.isPending} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                                            <Trash2 className="h-4 w-4" />
                                            Delete
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDirectMessage}
                                            disabled={startingConversation}
                                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            <MessageSquareText className="h-4 w-4" />
                                            {startingConversation ? 'Opening chat...' : 'Direct Message'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex justify-end gap-3">
                                        <button type="button" onClick={() => { if (activeContact) setDrawerMode('view'); else setActiveContact(null) }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                                        <button type="submit" form="contact-editor" disabled={saveMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                                            <Save className="h-4 w-4" />
                                            {saveMutation.isPending ? 'Saving...' : 'Save contact'}
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {isImportModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4 backdrop-blur-sm">
                    <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Import Contacts</h3>
                            <button
                                onClick={() => setIsImportModalOpen(false)}
                                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="mb-6 text-sm text-gray-500">
                            Download the sample Excel or CSV file to see the required format, or directly upload your file if it's ready.
                        </p>

                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button
                                onClick={handleDownloadSample}
                                className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                            >
                                <Download className="h-4 w-4" />
                                Download Sample
                            </button>
                            <button
                                onClick={() => {
                                    setIsImportModalOpen(false)
                                    fileInputRef.current?.click()
                                }}
                                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                            >
                                <Upload className="h-4 w-4" />
                                Import File
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteAllModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto overflow-x-hidden bg-gray-950/40 p-4 backdrop-blur-sm">
                    <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-950 shadow-2xl">
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-xl font-bold">Delete All Contacts</h3>
                                    <p className="mt-3 text-sm leading-6 text-gray-600">
                                        This will permanently delete all individual contacts in this workspace. Sirf admin/owner is action ko complete kar sakta hai.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={resetDeleteAllModal}
                                    disabled={deleteAllMutation.isPending}
                                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                                    aria-label="Close delete all contacts modal"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="border-y border-gray-200 bg-gray-50 p-6">
                            <label className="block">
                                <span className="text-sm font-semibold text-gray-800">To confirm, type your admin name</span>
                                <span className="mt-2 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900">
                                    {adminConfirmName || 'Admin name'}
                                </span>
                                <input
                                    value={deleteAllConfirmName}
                                    onChange={event => setDeleteAllConfirmName(event.target.value)}
                                    disabled={deleteAllMutation.isPending}
                                    className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-950 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
                                    autoComplete="off"
                                />
                            </label>

                            <label className="mt-5 block">
                                <span className="text-sm font-semibold text-gray-800">To confirm, type "delete all contacts"</span>
                                <input
                                    value={deleteAllConfirmText}
                                    onChange={event => setDeleteAllConfirmText(event.target.value)}
                                    disabled={deleteAllMutation.isPending}
                                    className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-950 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
                                    autoComplete="off"
                                />
                            </label>
                        </div>

                        <div className="p-6">
                            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                                <span>Deleting contacts cannot be undone. Export contacts first if you need a backup.</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-200 bg-white p-4">
                            <button
                                type="button"
                                onClick={resetDeleteAllModal}
                                disabled={deleteAllMutation.isPending}
                                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => deleteAllMutation.mutate()}
                                disabled={!canConfirmDeleteAll || deleteAllMutation.isPending}
                                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
                            >
                                {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All Contacts'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {importStatus && (
                <div className={`fixed bottom-6 right-6 z-[110] w-80 overflow-hidden rounded-xl shadow-2xl ring-1 animate-in slide-in-from-bottom-5 fade-in duration-300 ${importStatus.type === 'success' ? 'bg-green-50 ring-green-100/50' :
                    importStatus.type === 'error' ? 'bg-red-50 ring-red-100/50' :
                        'bg-blue-50 ring-blue-100/50'
                    }`}>
                    <div className="p-4">
                        <div className="flex items-start gap-3">
                            {importStatus.type === 'info' && <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-500 animate-pulse" />}
                            {importStatus.type === 'success' && <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-200/50"><Check className="h-3 w-3 text-green-700" strokeWidth={3} /></div>}
                            {importStatus.type === 'error' && <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}

                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${importStatus.type === 'success' ? 'text-green-900' :
                                    importStatus.type === 'error' ? 'text-red-900' :
                                        'text-blue-900'
                                    }`}>{importStatus.message}</p>
                                {importStatus.progress && (
                                    <div className="mt-3">
                                        <div className={`flex items-center justify-between text-xs font-semibold mb-1.5 ${importStatus.type === 'success' ? 'text-green-700' :
                                            importStatus.type === 'error' ? 'text-red-700' :
                                                'text-blue-700'
                                            }`}>
                                            <span>{Math.round((importStatus.progress.current / importStatus.progress.total) * 100)}%</span>
                                            <span>{importStatus.progress.current} / {importStatus.progress.total}</span>
                                        </div>
                                        <div className={`h-1.5 w-full overflow-hidden rounded-full ${importStatus.type === 'success' ? 'bg-green-200/50' :
                                            importStatus.type === 'error' ? 'bg-red-200/50' :
                                                'bg-blue-200/50'
                                            }`}>
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ease-out ${importStatus.type === 'success' ? 'bg-green-600' :
                                                    importStatus.type === 'error' ? 'bg-red-600' :
                                                        'bg-blue-600'
                                                    }`}
                                                style={{ width: `${Math.max(2, (importStatus.progress.current / importStatus.progress.total) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {importStatus.type !== 'info' && (
                                <button
                                    onClick={() => setImportStatus(null)}
                                    className={`shrink-0 rounded-lg p-1 transition-colors ${importStatus.type === 'success' ? 'text-green-600 hover:bg-green-100' :
                                        importStatus.type === 'error' ? 'text-red-600 hover:bg-red-100' :
                                            'text-blue-600 hover:bg-blue-100'
                                        }`}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function Field({ label, children, className = '' }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
            {children}
        </label>
    )
}

function InfoRow({ label, value, mono = false }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                {label}
            </div>
            <div className={`truncate text-sm font-semibold text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</div>
        </div>
    )
}

function CustomSelect({ value, onChange, options, className = '' }) {
    const [open, setOpen] = useState(false)
    const selected = options.find(option => option.value === value) || options[0]

    return (
        <div className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setOpen(current => !current)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                className="w-full apple-select-trigger h-9 sm:h-[42px] text-xs sm:text-sm"
            >
                <span className="min-w-0 text-left">
                    <span className="block truncate text-[#1d1d1f]">{selected?.label || 'Select'}</span>
                    {selected?.helper ? <span className="block truncate text-[9.5px] font-medium text-gray-400 leading-tight">{selected.helper}</span> : null}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-505 transition ${open ? 'rotate-180 text-gray-800' : ''}`} strokeWidth={1.8} />
            </button>
            {open ? (
                <div className="absolute right-0 z-[70] mt-1 max-h-72 w-full min-w-48 overflow-y-auto apple-select-dropdown wa-chat-scroll">
                    {options.map(option => {
                        const active = option.value === value
                        return (
                            <button
                                key={option.value || 'empty'}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    onChange(option.value)
                                    setOpen(false)
                                }}
                                className={`apple-select-option ${active ? 'apple-select-option-selected' : ''}`}
                            >
                                <span className="min-w-0 text-left">
                                    <span className="block truncate">{option.label}</span>
                                    {option.helper ? <span className="block truncate text-[10px] text-gray-400 leading-tight mt-0.5">{option.helper}</span> : null}
                                </span>
                                {active ? <Check className="h-3.5 w-3.5 shrink-0 text-black ml-2" strokeWidth={2} /> : null}
                            </button>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

function FieldValueInput({ field, meta, onChange }) {
    if (meta.type === 'textarea') {
        return (
            <textarea
                value={field.value}
                onChange={event => onChange(event.target.value)}
                className="field-input min-h-20 resize-y"
                placeholder={meta.placeholder || 'Value'}
            />
        )
    }

    return (
        <input
            value={field.value}
            type={meta.type || 'text'}
            onChange={event => onChange(event.target.value)}
            className="field-input"
            placeholder={meta.placeholder || 'Value'}
        />
    )
}

function BusinessDataCell({ fields }) {
    const visible = fields.slice(0, 4)
    const extra = Math.max(0, fields.length - visible.length)

    return (
        <div className="flex max-w-[420px] flex-wrap gap-1.5">
            {visible.map(([key, value]) => {
                const meta = FIELD_PRESET_BY_KEY[key] || { label: key }
                const Icon = getFieldIcon(key)
                return (
                    <div key={key} className="inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="shrink-0 font-medium text-gray-500">{meta.label}</span>
                        <span className="truncate font-semibold text-gray-900">{String(value)}</span>
                    </div>
                )
            })}
            {extra > 0 ? (
                <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-500">+{extra} more</span>
            ) : null}
        </div>
    )
}

function getFieldIcon(key) {
    if (['email'].includes(key)) return Mail
    if (['address', 'city', 'state', 'pincode'].includes(key)) return MapPin
    if (['invoice', 'form_id'].includes(key)) return FileText
    if (['amount', 'payment_status', 'due_date'].includes(key)) return CreditCard
    if (['plan', 'period', 'status', 'course', 'batch', 'admission_status'].includes(key)) return ClipboardList
    return Database
}
