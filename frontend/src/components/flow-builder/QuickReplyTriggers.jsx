import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BACKEND_URL as API_URL } from '../../config/api';

const statuses = { unassigned: 'Unassigned', not_live: 'Not live', ready: 'Ready', conflict: 'Multiple live flows' };
const statusClass = { unassigned: 'bg-amber-50 text-amber-800', not_live: 'bg-zinc-100 text-zinc-700', ready: 'bg-green-50 text-green-800', conflict: 'bg-red-50 text-red-800' };

function useQuickReplyRegistry(revision) {
    const { session } = useAuth();
    const token = session?.access_token;
    const [data, setData] = useState({ quick_replies: [], flows: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const reload = useCallback(async (signal) => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const response = await axios.get(`${API_URL}/api/flows/quick-replies`, { headers: { Authorization: `Bearer ${token}` }, signal });
            if (!signal?.aborted) setData(response.data);
        } catch (err) {
            if (!axios.isCancel(err)) setError(err.response?.data?.error || 'Could not load quick reply triggers.');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [token]);
    useEffect(() => {
        const controller = new AbortController();
        reload(controller.signal);
        const onFocus = () => reload(controller.signal);
        window.addEventListener('focus', onFocus);
        return () => { controller.abort(); window.removeEventListener('focus', onFocus); };
    }, [reload, revision]);
    return { ...data, loading, error, reload: () => reload() };
}

export function QuickReplyTriggerPicker({ config, updateConfig, flowContext }) {
    const { quick_replies: entries, loading, error, reload } = useQuickReplyRegistry();
    const selected = Array.isArray(config.quickReplyKeywords) ? config.quickReplyKeywords : [];
    const options = entries.filter(entry => flowContext?.wa_account_scope !== 'selected' || flowContext.wa_account_ids?.includes(entry.wa_account_id));
    const available = entry => !entry.routes.some(route => route.flow_id !== flowContext?.id);
    const choose = (id) => {
        const entry = options.find(option => option.id === id);
        if (!entry || !available(entry)) return;
        if (!selected.some(value => value.toLowerCase() === entry.keyword.toLowerCase())) updateConfig('quickReplyKeywords', [...selected, entry.keyword]);
        updateConfig('matchType', 'exact');
    };
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <label htmlFor="quick-reply-trigger" className="text-sm font-medium text-gray-700">Template quick replies</label>
                <button type="button" onClick={reload} disabled={loading} aria-label="Refresh quick reply triggers" className="rounded p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"><RefreshCw size={14} /></button>
            </div>
            <select id="quick-reply-trigger" value="" disabled={loading || Boolean(error)} onChange={event => choose(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                <option value="">{loading ? 'Loading quick replies…' : 'Choose an available quick reply'}</option>
                <optgroup label="Available / this flow">
                    {options.filter(available).map(entry => <option key={entry.id} value={entry.id} disabled={selected.includes(entry.keyword)}>{entry.keyword} — {entry.sources.map(source => source.template_name).join(', ')}{entry.routes.length ? ' (this flow)' : ' (unassigned)'}</option>)}
                </optgroup>
                <optgroup label="Assigned to another flow">
                    {options.filter(entry => !available(entry)).map(entry => <option key={entry.id} disabled>{entry.keyword} — {entry.routes.map(route => route.flow_name).join(', ')} ({statuses[entry.status]})</option>)}
                </optgroup>
            </select>
            {error ? <p role="alert" className="text-xs text-red-700">{error} Use refresh to retry. Custom keywords still work.</p> : <p className="text-xs leading-5 text-gray-500">Select an unassigned button or type your own keywords below. Quick replies use exact match. Save and publish the flow to make them live.</p>}
            {!loading && !error && options.length === 0 && <p className="text-xs text-gray-500">No template quick replies for this flow’s selected numbers. Save or sync a template with quick reply buttons first.</p>}
            <div className="flex flex-wrap gap-2">
                {selected.map(keyword => <span key={keyword} className="inline-flex max-w-full items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800"><span className="break-words">{keyword}</span><button type="button" aria-label={`Remove ${keyword} trigger`} onClick={() => updateConfig('quickReplyKeywords', selected.filter(value => value !== keyword))} className="rounded p-0.5 hover:bg-blue-100 focus-visible:outline-2"><X size={12} /></button></span>)}
            </div>
        </div>
    );
}

export function QuickReplyInventory({ accounts = [], selectedAccount = 'All', onCreate, onOpen, revision }) {
    const { quick_replies: entries, loading, error, reload } = useQuickReplyRegistry(revision);
    const [filter, setFilter] = useState('needs_attention');
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState(false);
    const scoped = entries.filter(entry => selectedAccount === 'All' || !selectedAccount || entry.wa_account_id === selectedAccount);
    const pending = scoped.filter(entry => entry.status !== 'ready').length;
    const visible = scoped.filter(entry => (filter === 'all' || (filter === 'needs_attention' ? entry.status !== 'ready' : entry.status === filter)) && `${entry.keyword} ${entry.sources.map(source => source.template_name).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
    const rows = expanded ? visible : visible.slice(0, 8);
    return (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-label="Template quick reply routing">
            <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div><h2 className="text-sm font-semibold text-gray-900">Quick reply triggers</h2><p className="mt-1 text-xs leading-5 text-gray-500">{loading ? 'Checking template buttons…' : `${pending} need attention · ${scoped.length} quick replies`}. Connect each button to a flow before sending its template.</p></div>
                <button type="button" onClick={reload} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"><RefreshCw size={14} />Refresh</button>
            </div>
            <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50/40 px-4 py-3 sm:flex-row">
                <input aria-label="Search quick reply triggers" placeholder="Search button or template" value={search} onChange={event => { setSearch(event.target.value); setExpanded(false); }} className="h-9 min-w-0 flex-none rounded-md border border-gray-300 sm:flex-1 bg-white px-3 text-xs outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]" />
                <select aria-label="Quick reply routing status" value={filter} onChange={event => { setFilter(event.target.value); setExpanded(false); }} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs outline-none focus:border-[#0b74c9] focus:ring-1 focus:ring-[#0b74c9]"><option value="needs_attention">Needs attention</option><option value="unassigned">Unassigned</option><option value="not_live">Not live</option><option value="ready">Ready</option><option value="all">All quick replies</option></select>
            </div>
            {error ? <p role="alert" className="px-4 pb-4 text-sm text-red-700">{error} Refresh to retry; routing status is not verified.</p> : loading ? <p role="status" className="px-4 pb-4 text-sm text-zinc-500">Loading quick reply routing…</p> : rows.length === 0 ? <p className="px-4 pb-4 text-sm text-zinc-600">{entries.length ? 'No quick replies match this filter.' : 'Save or sync a WhatsApp template with quick reply buttons to see its triggers here.'}</p> : <div className="overflow-x-auto"><table className="block w-full text-left text-sm sm:table"><thead className="hidden border-b border-gray-200 bg-gray-50 text-xs text-zinc-600 sm:table-header-group"><tr><th className="px-4 py-3 font-medium">Button / trigger</th><th className="px-4 py-3 font-medium">Template / number</th><th className="px-4 py-3 font-medium">Routing</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody className="block divide-y divide-zinc-100 sm:table-row-group">{rows.map(entry => <tr key={entry.id} className="block py-3 sm:table-row sm:py-0"><td className="block break-words px-4 py-1 font-medium text-zinc-900 sm:table-cell sm:max-w-56 sm:py-3">{entry.keyword}</td><td className="block break-words px-4 py-1 text-zinc-600 sm:table-cell sm:py-3">{entry.sources.map(source => `${source.template_name} (${source.template_status})`).join(', ')}<div className="mt-1 text-xs">{accounts.find(account => account.id === entry.wa_account_id)?.display_phone_number || entry.wa_account_id || 'Account not specified'}</div></td><td className="block px-4 py-1 sm:table-cell sm:py-3"><span className={`inline-block rounded px-2 py-1 text-xs font-medium ${statusClass[entry.status]}`}>{statuses[entry.status]}</span>{entry.routes.map(route => <div key={route.flow_id} className="mt-1 text-xs text-zinc-600">{route.flow_name}{route.live ? ' · Live' : ' · Publish required'}</div>)}</td><td className="block px-4 py-1 sm:table-cell sm:py-3">{entry.routes.length ? <button type="button" onClick={() => onOpen(entry.routes[0].flow_id)} className="whitespace-nowrap text-sm font-medium text-blue-700 hover:underline focus-visible:outline-2">Open flow</button> : <button type="button" onClick={() => onCreate(entry)} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-blue-700 hover:underline focus-visible:outline-2"><Plus size={14} />Create flow</button>}</td></tr>)}</tbody></table></div>}
            {!expanded && visible.length > 8 && <button type="button" onClick={() => setExpanded(true)} className="m-4 text-sm font-medium text-blue-700 hover:underline">Show all {visible.length} quick replies</button>}
        </section>
    );
}

// Also check unsaved template labels against existing flow routing.
export function TemplateQuickReplyCoverage({ buttons, accountId }) {
    const { flows, loading, error, reload } = useQuickReplyRegistry();
    const replies = buttons.filter(button => button.type === 'QUICK_REPLY' && button.text?.trim());
    if (!replies.length) return null;
    const coverage = replies.map(button => {
        const value = button.text.trim().toLowerCase();
        const routes = flows.filter(flow => flow.wa_account_scope !== 'selected' || flow.wa_account_ids.includes(accountId)).filter(flow => flow.status === 'active' && flow.live_keywords.some(keyword => {
            const key = keyword.trim().toLowerCase();
            return key && (flow.live_match_type === 'exact' ? value === key : value.includes(key));
        }));
        return { label: button.text, routes };
    });
    return <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex items-center justify-between gap-2"><h3 className="font-medium text-slate-900">Quick reply routing</h3><button type="button" onClick={reload} disabled={loading} className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50">Refresh</button></div>
        {loading ? <p className="text-xs text-slate-600">Checking published flows…</p> : error ? <p role="alert" className="text-xs text-red-700">Routing could not be verified. Refresh to retry.</p> : coverage.map((item, index) => <p key={index} className={`text-xs ${item.routes.length === 1 ? 'text-green-800' : 'text-amber-800'}`}><strong>{item.label}</strong> — {item.routes.length === 1 ? `Connected to ${item.routes[0].name}` : item.routes.length ? 'Multiple live flows match; review routing.' : 'No live flow. Set up and publish its trigger before sending.'}</p>)}
        <a href="/flow-builder" target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-medium text-blue-700 hover:underline">Open Flow Builder</a>
    </div>;
}
