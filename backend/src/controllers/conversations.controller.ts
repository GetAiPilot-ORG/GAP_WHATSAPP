import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { getIO } from '../config/socket.js';
import { derivePhoneForStorage, normalizeIndianPhoneKey, isUuid } from '../utils/format.js';

const DEFAULT_CONVERSATION_PAGE_SIZE = 50;
const MAX_CONVERSATION_PAGE_SIZE = 100;

function decodeConversationCursor(value: unknown): { lastMessageAt: string; id: string } | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
        if (!parsed?.lastMessageAt || !isUuid(parsed?.id) || Number.isNaN(Date.parse(parsed.lastMessageAt))) return null;
        return { lastMessageAt: new Date(parsed.lastMessageAt).toISOString(), id: parsed.id };
    } catch {
        return null;
    }
}

function encodeConversationCursor(conversation: any): string | null {
    if (!conversation?.last_message_at || !conversation?.id) return null;
    return Buffer.from(JSON.stringify({
        lastMessageAt: conversation.last_message_at,
        id: conversation.id,
    }), 'utf8').toString('base64url');
}

export async function getConversations(req: any, res: Response) {
    const organization_id = req.organization_id;
    const wa_account_id = req.query.wa_account_id as string;
    const user_id = req.user.id;
    const user_role = req.role;
    const requestedLimit = Number.parseInt(String(req.query.limit || DEFAULT_CONVERSATION_PAGE_SIZE), 10);
    const pageSize = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), MAX_CONVERSATION_PAGE_SIZE)
        : DEFAULT_CONVERSATION_PAGE_SIZE;
    const cursorValue = req.query.cursor;
    const cursor = decodeConversationCursor(cursorValue);

    if (!organization_id) return res.status(403).json({ error: 'No organization linked to this account' });
    if (cursorValue && !cursor) return res.status(400).json({ error: 'Invalid conversation cursor' });

    try {
        let query = supabase
            .from('w_conversations')
            .select(`
                id,
                contact_id,
                wa_account_id,
                last_message_preview,
                last_message_at,
                unread_count,
                status,
                labels,
                assigned_to,
                assigned_agent_id,
                bot_enabled,
                assigned_bot_id,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields, saved_at, saved_by_user_id, save_source)
            `)
            .eq("organization_id", organization_id)
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .limit(pageSize + 1);

        if (user_role === 'agent') {
            query = query.eq('assigned_agent_id', user_id);
        }

        if (wa_account_id && wa_account_id !== 'All') {
            if (isUuid(wa_account_id)) {
                query = query.eq('wa_account_id', wa_account_id);
            } else {
                let raw = String(wa_account_id);
                if (raw.startsWith(' ')) {
                    raw = '+' + raw.trim();
                }
                const digits = raw.replace(/\D+/g, '');

                const findAccountId = async (value: string) => {
                    const { data: byPhoneId, error: e1 } = await supabase
                        .from('w_wa_accounts')
                        .select('id')
                        .eq('organization_id', organization_id)
                        .eq('phone_number_id', value)
                        .order('status', { ascending: true })
                        .limit(1);
                    if (e1) throw e1;
                    if (byPhoneId?.[0]?.id) return byPhoneId[0].id;

                    const { data: byDisplay, error: e2 } = await supabase
                        .from('w_wa_accounts')
                        .select('id')
                        .eq('organization_id', organization_id)
                        .eq('display_phone_number', value)
                        .order('status', { ascending: true })
                        .limit(1);
                    if (e2) throw e2;
                    if (byDisplay?.[0]?.id) return byDisplay[0].id;

                    return null;
                };

                let accountId = await findAccountId(raw);
                if (!accountId && digits && digits !== raw) accountId = await findAccountId(digits);

                if (accountId) {
                    query = query.eq('wa_account_id', accountId);
                } else {
                    console.warn(`⚠️ wa_account_id filter '${wa_account_id}' could not be resolved. Skipping account filter.`);
                }
            }
        }

        if (cursor) {
            query = query.or(
                `last_message_at.lt.${cursor.lastMessageAt},and(last_message_at.eq.${cursor.lastMessageAt},id.lt.${cursor.id})`
            );
        }

        let { data: conversations, error } = await query;
        if (error) throw error;
        const hasMore = (conversations?.length || 0) > pageSize;
        if (hasMore) conversations = conversations!.slice(0, pageSize);

        let readStatesMap = new Map();
        if (user_id && conversations?.length) {
            const { data: reads, error: readErr } = await supabase
                .from('w_conversation_reads')
                .select('conversation_id, last_read_at')
                .eq('user_id', user_id)
                .in('conversation_id', conversations.map((c: any) => c.id));

            if (!readErr && reads) {
                reads.forEach((r: any) => readStatesMap.set(r.conversation_id, r.last_read_at));
            }
        }

        // unread_count is maintained with the conversation and avoids returning every
        // unread message row across the network for an inbox page.
        const unreadCountMap = new Map<string, number>(
            (conversations || []).map((conversation: any) => [
                conversation.id,
                Math.max(Number(conversation.unread_count) || 0, 0),
            ])
        );

        const result = (conversations || []).map((c: any) => {
            const lastReadAt = readStatesMap.get(c.id);
            const userHasRead = lastReadAt ? new Date(lastReadAt) >= new Date(c.last_message_at) : false;
            const unread_for_user = userHasRead ? 0 : (unreadCountMap.get(c.id) || 0);
            const next = { ...c };

            if (next?.contact) {
                const phone = String(next.contact.phone || '').trim();
                if (!phone) {
                    const derived = derivePhoneForStorage(next.contact.wa_id);
                    if (derived) next.contact.phone = derived;
                }
                if (!next.contact.wa_key) {
                    next.contact.wa_key = normalizeIndianPhoneKey(next.contact.wa_id) || null;
                }
                const storedPhoto = next.contact.custom_fields?.profile_photo_url || null;
                // Missing photos are refreshed by the existing background photo endpoint.
                next.contact.profile_photo_url = storedPhoto;
            }

            return {
                ...next,
                user_has_read: userHasRead,
                unread_for_user
            };
        });

        const nextCursor = hasMore ? encodeConversationCursor(result[result.length - 1]) : null;
        res.json({ items: result, next_cursor: nextCursor, has_more: hasMore });
    } catch (err: any) {
        console.error("Error fetching conversations:", err);
        res.status(500).json({ error: err.message });
    }
}

export async function startConversation(req: any, res: Response) {
    const organization_id = req.organization_id;
    const { contact_id, wa_account_id } = req.body;

    if (!organization_id) return res.status(403).json({ error: 'No organization linked to this account' });
    if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

    try {
        let targetAccountId = wa_account_id;
        if (!targetAccountId) {
            const { data: account } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('organization_id', organization_id)
                .eq('status', 'connected')
                .limit(1)
                .maybeSingle();
            targetAccountId = account?.id;
        }

        if (!targetAccountId) {
            const { data: anyAccount } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('organization_id', organization_id)
                .limit(1)
                .maybeSingle();
            targetAccountId = anyAccount?.id;
        }

        if (!targetAccountId) {
            return res.status(400).json({ error: 'No WhatsApp account found for this organization. Please connect one first.' });
        }

        const { data: existing, error: findErr } = await supabase
            .from('w_conversations')
            .select(`
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields)
            `)
            .eq('organization_id', organization_id)
            .eq('wa_account_id', targetAccountId)
            .eq('contact_id', contact_id)
            .maybeSingle();

        if (findErr) throw findErr;
        if (existing) return res.json(existing);

        const { data: newConv, error: createErr } = await supabase
            .from('w_conversations')
            .insert({
                organization_id,
                wa_account_id: targetAccountId,
                contact_id,
                last_message_at: new Date().toISOString(),
                last_message_preview: 'Conversation started',
                unread_count: 0,
                status: 'open',
                bot_enabled: true
            })
            .select(`
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields)
            `)
            .single();

        if (createErr) throw createErr;

        try { getIO().to(`org:${organization_id}`).emit('conversation_created', newConv); } catch(e) {}
        return res.json(newConv);
    } catch (err: any) {
        console.error("Error starting conversation:", err);
        return res.status(500).json({ error: err.message || 'Failed to start conversation' });
    }
}

export async function assignConversation(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;
    const { agent_id } = req.body;

    try {
        const normalizedAgentId = agent_id ? String(agent_id) : null;
        if (normalizedAgentId) {
            const { data: member, error: memberErr } = await supabase
                .from('organization_members')
                .select('user_id, role, is_active')
                .eq('organization_id', orgId)
                .eq('user_id', normalizedAgentId)
                .maybeSingle();
            if (memberErr) throw memberErr;
            if (!member || !['agent', 'admin', 'owner'].includes(member.role) || member.is_active === false) {
                return res.status(400).json({ error: 'Conversation can only be assigned to an active team member' });
            }
        }

        const { data: updated, error } = await supabase
            .from('w_conversations')
            .update({
                assigned_to: normalizedAgentId,
                assigned_agent_id: normalizedAgentId
            })
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, assigned_to')
            .single();

        if (error) throw error;

        try { 
            getIO().to(`org:${orgId}`).emit('conversation_assigned', { conversation_id: id, assigned_to: normalizedAgentId }); 
            getIO().to(`org:${orgId}`).emit('chat_assigned', { conversation_id: id, assigned_to: normalizedAgentId }); 
        } catch(e) {}
        res.json({ success: true, conversation: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function updateConversationMeta(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;
    const payload: any = {};

    if (typeof req.body?.status === 'string') {
        const status = req.body.status.trim().toLowerCase();
        if (!['open', 'archived', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid conversation status' });
        payload.status = status;
    }

    if (Array.isArray(req.body?.labels)) {
        payload.labels = req.body.labels.map((label: any) => String(label || '').trim().toLowerCase()).filter(Boolean).slice(0, 20);
    }

    if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'No conversation fields provided' });

    try {
        const { data, error } = await supabase
            .from('w_conversations')
            .update(payload)
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, status, labels')
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Conversation not found' });

        try { getIO().to(`org:${orgId}`).emit('conversation_updated', data); } catch(e) {}
        res.json({ success: true, conversation: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to update conversation' });
    }
}

export async function markUnread(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { data: latestInbound, error: msgErr } = await supabase
            .from('w_messages')
            .select('id')
            .eq('conversation_id', id)
            .in('direction', ['inbound', 'in'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (msgErr) throw msgErr;

        if (latestInbound?.id) {
            const { error: updErr } = await supabase
                .from('w_messages')
                .update({ status: 'delivered' })
                .eq('id', latestInbound.id);
            if (updErr) throw updErr;
        }

        await supabase
            .from('w_conversations')
            .update({ unread_count: 1 })
            .eq('id', id)
            .eq('organization_id', orgId);

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to mark unread' });
    }
}

export async function clearConversation(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { error: deleteErr } = await supabase
            .from('w_messages')
            .delete()
            .eq('conversation_id', id);
        if (deleteErr) throw deleteErr;

        const { data: updated, error: updateErr } = await supabase
            .from('w_conversations')
            .update({
                last_message_preview: 'No messages',
                unread_count: 0
            })
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, last_message_preview, unread_count')
            .maybeSingle();
        if (updateErr) throw updateErr;

        try { getIO().to(`org:${orgId}`).emit('conversation_cleared', { conversation_id: id }); } catch(e) {}
        res.json({ success: true, conversation: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to clear chat' });
    }
}

export async function deleteConversation(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { error: msgErr } = await supabase
            .from('w_messages')
            .delete()
            .eq('conversation_id', id);
        if (msgErr) throw msgErr;

        const { error: deleteErr } = await supabase
            .from('w_conversations')
            .delete()
            .eq('id', id)
            .eq('organization_id', orgId);
        if (deleteErr) throw deleteErr;

        try { getIO().to(`org:${orgId}`).emit('conversation_deleted', { conversation_id: id }); } catch(e) {}
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to delete chat' });
    }
}
