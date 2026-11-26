import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { API_BASE } from '../config/api'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useWhatsAppAccounts } from '../context/WhatsAppAccountContext'

const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50'
const linkClass = 'font-medium text-blue-700 underline underline-offset-2'
const metaSettings = 'https://business.facebook.com/settings'
const setupOptions = {
    messaging: {
        label: 'Meta Messaging Accounts',
        switchSteps: [
            'Ask your new provider whether both integrations can stay connected during the switch. Wati documents that it currently does not support multi-partner setups. If your provider requires removal first, schedule a messaging interruption and disconnect before connecting it.',
            'If both integrations support Conversation Routing, connect the new provider and set it as the primary responder in Meta Business Suite → Settings → WhatsApp accounts → your number → Conversation routing. Test incoming and outgoing messages before disconnecting GetAIPilot.',
        ],
        removal: 'In Meta Business Suite → Settings → Messaging accounts, select the GetAIPilot integration and remove its Messaging Account. Check its scope first if it covers other numbers you still use.',
    },
    legacy: {
        label: 'Legacy WhatsApp Business API',
        switchSteps: [
            'Ask the new provider to migrate your existing number. Follow its steps for billing and two-step verification where required. Keep GetAIPilot connected until the provider is ready, unless its migration instructions require removal first.',
            'Test messaging with the new provider. Review shared WhatsApp account access before removing a partner if other numbers still use it.',
        ],
        removal: 'In Meta Business Settings → Accounts → WhatsApp accounts, review GetAIPilot under Partners and remove its access if it is no longer needed for any numbers that share that account. If the removal is unavailable or affects another number, ask support for help.',
    },
    coexistence: {
        label: 'WhatsApp Business App Coexistence',
        switchSteps: [
            'Confirm that your new provider supports Coexistence and ask for its switching steps. Back up your chats and plan for a messaging interruption before removing the old partner.',
            'Complete setup with the new provider and test messaging on both the app and the new platform.',
        ],
        removal: 'In the WhatsApp Business app, open Settings → Account → Business Platform and remove GetAIPilot. Follow the new provider’s instructions if it requires extra steps to reconnect.',
    },
}

export default function WhatsAppOffboarding() {
    const { apiCall, loading, user, userRole } = useAuth()
    const { confirmDialog } = useDialog()
    const { refetchAccounts, refreshNumberPlan } = useWhatsAppAccounts()
    const [params] = useSearchParams()
    const [records, setRecords] = useState(null)
    const [migrationRequired, setMigrationRequired] = useState(false)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [selectedId, setSelectedId] = useState(null)
    const [intent, setIntent] = useState('switch')
    const [setup, setSetup] = useState('')
    const [confirmed, setConfirmed] = useState(false)
    const isAdmin = ['owner', 'admin'].includes(userRole)
    const apiRef = useRef(apiCall)
    useEffect(() => { apiRef.current = apiCall }, [apiCall])

    const request = useCallback(async (path, options) => {
        const response = await apiRef.current(`${API_BASE}/whatsapp${path}`, options)
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not update WhatsApp offboarding. Try again.')
        return body
    }, [])

    const loadRecords = useCallback(async () => {
        const result = await request('/offboarding')
        return Array.isArray(result) ? { records: result, migration_required: false } : result
    }, [request])

    const applyRecords = useCallback(result => {
        setRecords(result.records)
        setMigrationRequired(result.migration_required)
    }, [])

    useEffect(() => {
        if (!isAdmin || !user?.id) return
        let active = true
        loadRecords()
            .then(data => { if (active) applyRecords(data) })
            .catch(err => { if (active) setError(err.message) })
        return () => { active = false }
    }, [isAdmin, user?.id, loadRecords, applyRecords])

    const selected = records?.find(record => record.id === (selectedId ?? params.get('account'))) || records?.[0]
    const workflow = setupOptions[setup]

    async function run(action) {
        setError('')
        setBusy(true)
        try {
            await action()
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    async function disconnect() {
        const accepted = await confirmDialog(
            'GetAIPilot will stop sending and receiving new messages for this number and cancel its active and scheduled broadcasts. Messages already sent to Meta may still be delivered. Complete the partner removal in Meta to finish.',
            { title: 'Disconnect GetAIPilot?', tone: 'danger', confirmLabel: 'Disconnect GetAIPilot' },
        )
        if (!accepted) return

        await run(async () => {
            await request(`/accounts/${selected.id}`, { method: 'DELETE' })
            applyRecords(await loadRecords())
            void Promise.allSettled([refetchAccounts(), refreshNumberPlan()])
        })
    }

    async function recordRemoval() {
        await run(async () => {
            const updated = await request(`/offboarding/${selected.id}/confirm-meta-removal`, {
                method: 'POST',
                body: JSON.stringify({ confirmed, started_at: selected.offboarding_started_at }),
            })
            setRecords(previous => previous.map(record => record.id === updated.id ? updated : record))
            setConfirmed(false)
        })
    }

    async function downloadHistory() {
        await run(async () => {
            const parts = ['[\n']
            let first = true
            let offset = 0
            while (offset !== null) {
                const page = await request(`/offboarding/${selected.id}/history?offset=${offset}`)
                for (const message of page.messages) {
                    if (!first) parts.push(',\n')
                    parts.push(JSON.stringify(message))
                    first = false
                }
                offset = page.next_offset
            }
            parts.push('\n]\n')
            const url = URL.createObjectURL(new Blob(parts, { type: 'application/json' }))
            const link = document.createElement('a')
            link.href = url
            link.download = `whatsapp-history-${selected.id}.json`
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        })
    }

    if (loading || (user && userRole === null)) return <p role="status" className="p-6">Loading your workspace…</p>
    if (!user) return <Navigate to="/login" replace />
    if (!isAdmin) return <p role="alert" className="p-6">Only workspace owners and admins can manage WhatsApp offboarding.</p>

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-8 sm:py-12">
            <div className="mx-auto max-w-3xl space-y-6">
                <header>
                    <Link to="/whatsapp-connect" className={linkClass}>Back to WhatsApp accounts</Link>
                    <h1 className="mt-4 text-2xl font-semibold tracking-tight">Switch or disconnect WhatsApp</h1>
                    <p className="mt-2 max-w-xl text-sm text-slate-600">Move your number to another provider or stop using it with GetAIPilot.</p>
                </header>
                {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} {!records && <button type="button" className="underline" onClick={() => run(async () => applyRecords(await loadRecords()))}>Retry</button>}</p>}
                {migrationRequired && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    Switching instructions are available. Disconnect and chat export will be available after the workspace database update.{' '}
                    <button type="button" className="underline" disabled={busy} onClick={() => run(async () => applyRecords(await loadRecords()))}>Check again</button>
                </p>}
                {!records && !error && <p role="status">Loading WhatsApp numbers…</p>}
                {records && !selected && <p className="rounded-lg border bg-white p-4 text-sm">There are no Meta WhatsApp numbers in this workspace.</p>}
                {selected && (
                    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-busy={busy}>
                        <label className="block text-sm font-semibold">
                            WhatsApp number
                            <select value={selected.id} disabled={busy} onChange={event => {
                                setSelectedId(event.target.value)
                                setSetup('')
                                setConfirmed(false)
                                setError('')
                            }} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2.5 font-normal">
                                {records.map(record => <option key={record.id} value={record.id}>{record.display_phone_number || record.name || record.id}{record.offboarding_started_at ? ' (offboarding)' : ''}</option>)}
                            </select>
                        </label>

                        <div className="flex flex-wrap items-center gap-3 border-y border-slate-200 py-4">
                            <button type="button" className={buttonClass} disabled={busy || migrationRequired} onClick={downloadHistory}>Download chat history (JSON)</button>
                            <Link className={linkClass} to="/templates">Review templates</Link>
                            <Link className={linkClass} to="/billing">Review billing</Link>
                            <p className="basis-full text-sm text-slate-600">The export contains stored message records and media references. Check with the new provider about template copying or approval, and with your billing provider about any balance or refund.</p>
                        </div>

                        {selected.meta_removal_confirmed_at ? (
                            <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
                                Disconnected. A workspace admin confirmed removal of GetAIPilot access in Meta.
                            </p>
                        ) : (
                            <>
                                {selected.offboarding_started_at ? (
                                    <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950"><strong>Meta action pending.</strong> GetAIPilot messaging has stopped for this number. Finish removing the integration in Meta.</p>
                                ) : (
                                    <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                        <legend className="mb-2 font-semibold">What do you want to do?</legend>
                                        <label className="flex items-center gap-2"><input type="radio" name="offboarding-intent" checked={intent === 'switch'} onChange={() => setIntent('switch')} /> Switch provider</label>
                                        <label className="flex items-center gap-2"><input type="radio" name="offboarding-intent" checked={intent === 'disconnect'} onChange={() => setIntent('disconnect')} /> Disconnect GetAIPilot</label>
                                    </fieldset>
                                )}
                                <label className="block text-sm font-semibold">
                                    WhatsApp setup
                                    <select value={setup} onChange={event => { setSetup(event.target.value); setConfirmed(false) }} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2.5 font-normal">
                                        <option value="">Choose your Meta setup</option>
                                        {Object.entries(setupOptions).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
                                        <option value="unknown">I’m not sure</option>
                                    </select>
                                </label>
                                {setup === 'unknown' && <p className="text-sm text-slate-700">Open Meta Business Settings and check whether your number has a separate Messaging Account. If your number also runs in the WhatsApp Business app, check Account → Business Platform for Coexistence. Ask your provider to confirm the setup if you’re unsure.</p>}
                                {workflow && (
                                    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
                                        {!selected.offboarding_started_at && intent === 'switch' && (
                                            <ol className="list-decimal space-y-2 pl-5">
                                                {workflow.switchSteps.map(step => <li key={step}>{step}</li>)}
                                            </ol>
                                        )}
                                        {!selected.offboarding_started_at && intent === 'switch' && setup !== 'coexistence' && (
                                            <a className={linkClass} href={setup === 'messaging'
                                                ? 'https://support.wati.io/en/articles/18470818-understanding-the-new-whatsapp-business-platform-account-structure-whatsapp-account-model-evolution-wame-2026'
                                                : 'https://support.wati.io/en/articles/11463157-how-to-migrate-your-whatsapp-business-account-from-another-bsp-to-wati'}
                                            target="_blank" rel="noreferrer">Wati switching guidance</a>
                                        )}
                                        <p>{workflow.removal}</p>
                                        <p>Keep your WhatsApp number and business account in Meta during a provider switch.</p>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                                    <a href={metaSettings} target="_blank" rel="noreferrer" className={linkClass}>Open Meta Business Settings</a>
                                    <a href="mailto:support@gapwhatsapppilot.com" className={linkClass}>Contact support</a>
                                </div>
                                {selected.offboarding_started_at ? (
                                    <div className="space-y-3 border-t pt-4">
                                        <label className="flex items-start gap-2 text-sm">
                                            <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
                                            I checked Meta or the WhatsApp Business app and confirmed that GetAIPilot access was removed for this number.
                                        </label>
                                        <button type="button" className={buttonClass} disabled={busy || !confirmed} onClick={recordRemoval}>Record Meta removal</button>
                                    </div>
                                ) : (
                                    <div className="border-t pt-4">
                                        <button type="button" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50" disabled={busy || migrationRequired} onClick={disconnect}>Disconnect GetAIPilot</button>
                                    </div>
                                )}
                            </>
                        )}
                        {busy && <p role="status" className="text-sm text-slate-600">Working…</p>}
                    </div>
                )}
            </div>
        </main>
    )
}
