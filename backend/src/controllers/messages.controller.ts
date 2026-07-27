import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { storeMessage, upsertConversation } from '../services/messages.service.js';
import { normalizeWaIdToPhone } from '../utils/format.js';
import { applyReactionUpdate, sendReactionMessage, sendTextMessage, sendMediaMessageMeta } from '../services/messages.sender.js';
import { sessions } from '../services/whatsapp.service.js';
import { io } from '../socket.js';
import { triggerHandoffWebhook } from '../services/n8n.service.js';
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const N8N_HANDOFF_WEBHOOK_URL = process.env.N8N_HANDOFF_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

export async function getMessages(req: any, res: Response) {
    const { conversationId } = req.params;
    const orgId = req.organization_id;
    try {
        const rawLimit = Number(req.query.limit || 50);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;
        const before = typeof req.query.before === 'string' ? req.query.before : null;

        let query = supabase
            .from('w_messages')
            .select("*")
            .eq("conversation_id", conversationId)
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (before) {
            query = query.lt('created_at', before);
        }

        const { data, error } = await query;

        if (error) throw error;
        const rows = Array.isArray(data) ? [...data].reverse() : [];
        res.json(rows);
    } catch (err: any) {
        console.error("Error fetching messages:", err);
        res.status(500).json({ error: err.message });
    }
}

export async function getConversationSummary(req: any, res: Response) {
    const conversationId = req.params.id;
    const orgId = req.organization_id;
    try {
        const { data: conversation, error: convErr } = await supabase
            .from('w_conversations')
            .select('id, handoff_status, handoff_reason, handoff_requested_at, summary_status, latest_summary_id')
            .eq('id', conversationId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const { data: summary, error: summaryErr } = await supabase
            .from('w_conversation_summaries')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (summaryErr) throw summaryErr;

        const { data: notes, error: notesErr } = await supabase
            .from('w_conversation_notes')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(30);
        if (notesErr) throw notesErr;

        res.json({ conversation, summary: summary || null, notes: notes || [] });
    } catch (err: any) {
        console.error('Error fetching conversation summary:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch summary' });
    }
}

export async function requestSummary(req: any, res: Response) {
    const conversationId = req.params.id;
    const orgId = req.organization_id;

    try {
        const { data: conversation, error: convErr } = await supabase
            .from('w_conversations')
            .select('id, organization_id, contact_id, handoff_status')
            .eq('id', conversationId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
        if (!N8N_HANDOFF_WEBHOOK_URL) {
            return res.status(400).json({ error: 'N8N_HANDOFF_WEBHOOK_URL is not configured' });
        }

        await supabase
            .from('w_conversations')
            .update({
                summary_status: 'pending',
                handoff_status: conversation.handoff_status === 'bot_active' ? 'handoff_requested' : conversation.handoff_status,
                handoff_reason: 'Manual summary requested',
                handoff_requested_at: new Date().toISOString(),
            })
            .eq('id', conversationId)
            .eq('organization_id', orgId);

        await triggerHandoffWebhook({
            event: 'manual_summary_requested',
            organization_id: orgId,
            conversation_id: conversationId,
            contact_id: conversation.contact_id,
            handoff_reason: 'Manual summary requested',
            requested_by_user_id: req.user?.id || null,
            summary_required: true,
        });

        const { data: latestConversation } = await supabase
            .from('w_conversations')
            .select('id, handoff_status, handoff_reason, handoff_requested_at, summary_status, latest_summary_id')
            .eq('id', conversationId)
            .eq('organization_id', orgId)
            .maybeSingle();

        io.to(`org:${orgId}`).emit('conversation_summary_updated', {
            conversation_id: conversationId,
            summary_status: latestConversation?.summary_status || 'pending',
        });

        res.json({ success: true, conversation: latestConversation || null });
    } catch (err: any) {
        console.error('[n8n] Error requesting summary:', err);
        res.status(500).json({ error: err.message || 'Failed to request summary' });
    }
}

export async function postSummary(req: any, res: Response) {
    const conversationId = String(req.params.conversationId || '').trim();
    const providedSecret = String(req.headers['x-n8n-secret'] || req.body?.secret || '');

    if (N8N_WEBHOOK_SECRET && providedSecret !== N8N_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid n8n secret' });
    }

    try {
        const { data: conversation, error: convErr } = await supabase
            .from('w_conversations')
            .select('id, organization_id')
            .eq('id', conversationId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const body = req.body || {};
        const summaryText = String(body.summary_text || body.summary || body.conversation_summary || '').trim();
        if (!summaryText) return res.status(400).json({ error: 'summary_text is required' });

        const asArray = (value: any) => {
            if (Array.isArray(value)) return value;
            if (value == null || value === '') return [];
            return [value];
        };

        const { data: inserted, error: insertErr } = await supabase
            .from('w_conversation_summaries')
            .insert({
                organization_id: conversation.organization_id,
                conversation_id: conversationId,
                summary_text: summaryText,
                customer_intent: body.customer_intent || body.intent || null,
                customer_stage: body.customer_stage || body.stage || null,
                lead_quality: body.lead_quality || body.quality || null,
                next_best_action: body.next_best_action || body.next_action || null,
                open_questions: asArray(body.open_questions),
                important_facts: asArray(body.important_facts || body.key_facts),
                objections: asArray(body.objections),
                products_discussed: asArray(body.products_discussed || body.products),
                summary_from_message_id: body.summary_from_message_id || null,
                summary_to_message_id: body.summary_to_message_id || null,
                generated_by: body.generated_by || 'n8n',
                model: body.model || null,
                metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
            })
            .select()
            .single();
        if (insertErr) throw insertErr;

        await supabase
            .from('w_conversations')
            .update({
                latest_summary_id: inserted.id,
                summary_status: 'ready',
            })
            .eq('id', conversationId)
            .eq('organization_id', conversation.organization_id);

        await supabase
            .from('w_conversation_notes')
            .insert({
                organization_id: conversation.organization_id,
                conversation_id: conversationId,
                note_type: 'ai_summary',
                body: summaryText,
                source: 'n8n',
                metadata: { summary_id: inserted.id },
            });

        io.to(`org:${conversation.organization_id}`).emit('conversation_summary_updated', {
            conversation_id: conversationId,
            summary: inserted,
            summary_status: 'ready',
        });

        res.json({ success: true, summary: inserted });
    } catch (err: any) {
        console.error('[n8n] Error saving summary:', err);
        res.status(500).json({ error: err.message || 'Failed to save summary' });
    }
}

export async function addReaction(req: any, res: Response) {
    const { messageId } = req.params;
    const orgId = req.organization_id;
    const rawEmoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : null;
    const emoji = rawEmoji || null;
    const actor = req.user?.id || req.user?.email || 'dashboard';

    try {
        const { data: message, error: msgErr } = await supabase
            .from('w_messages')
            .select('id, organization_id, conversation_id, wa_message_id, reactions')
            .eq('id', messageId)
            .eq('organization_id', orgId)
            .single();

        if (msgErr) throw msgErr;
        if (!message) return res.status(404).json({ error: 'Message not found' });
        if (!message.wa_message_id) return res.status(400).json({ error: 'This message cannot be reacted to yet. WhatsApp message id is missing.' });

        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select(`
                id,
                organization_id,
                contact:w_contacts(id, wa_id, phone),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `)
            .eq('id', message.conversation_id)
            .eq('organization_id', orgId)
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id && !conv?.contact?.phone) {
            return res.status(400).json({ error: 'Conversation contact is missing phone number' });
        }
        if (!conv?.account?.phone_number_id) {
            return res.status(400).json({ error: 'Conversation account is missing phone number id' });
        }

        const nextReactions = applyReactionUpdate(message.reactions, emoji, actor);
        const toMeta = normalizeWaIdToPhone(String(conv.contact.wa_id || conv.contact.phone || ''));
        if (!toMeta) return res.status(400).json({ error: 'Invalid recipient phone number' });

        if (conv.account.access_token_encrypted) {
            await sendReactionMessage(toMeta, message.wa_message_id, emoji, String(conv.account.phone_number_id));
        } else {
            return res.status(409).json({ error: 'Reactions are currently available for Cloud API connected accounts.' });
        }

        const { error: updErr } = await supabase
            .from('w_messages')
            .update({ reactions: nextReactions })
            .eq('id', message.id)
            .eq('organization_id', orgId);

        if (updErr) throw updErr;

        io.emit('message_updated', {
            conversation_id: message.conversation_id,
            message_id: message.id,
            wa_message_id: message.wa_message_id,
            reactions: nextReactions,
        });

        res.json({ success: true, reactions: nextReactions });
    } catch (err: any) {
        console.error('Reaction update error:', err);
        res.status(500).json({ error: err.message || 'Failed to update reaction' });
    }
}

export async function sendMessage(req: any, res: Response) {
    const { conversationId } = req.params;
    const orgId = req.organization_id;
    const { text, session_id, reply_to_message_id, forward_from_message_id, client_message_id } = req.body as { text?: string; session_id?: string; reply_to_message_id?: string; forward_from_message_id?: string; client_message_id?: string };

    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select(`
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name),
                account:w_wa_accounts(id, phone_number_id, display_phone_number, access_token_encrypted)
            `)
            .eq('id', conversationId)
            .eq('organization_id', orgId)
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id) throw new Error('Conversation contact missing wa_id');
        if (!conv?.account?.phone_number_id) throw new Error('Conversation account missing phone_number_id');

        if (!orgId) throw new Error('Organization not configured');

        const toPhone = String(conv.contact.wa_id);
        const accountPhoneOrId = String(conv.account.phone_number_id);

        let sendResult: any = null;
        let wa_message_id: string | null = null;
        let sentViaCloud = false;

        // Try Cloud API first if we have a token
        if (conv.account.access_token_encrypted) {
            try {
                const toMeta = normalizeWaIdToPhone(toPhone);
                if (!toMeta) throw new Error('Meta send requires a numeric recipient phone number');
                sendResult = await sendTextMessage(toMeta, text, accountPhoneOrId, reply_to_message_id || null);
                wa_message_id = sendResult?.messages?.[0]?.id || null;
                sentViaCloud = true;
            } catch (cloudErr: any) {
                console.warn(`[Cloud API] Failed to send message for account ${accountPhoneOrId}, attempting Baileys fallback:`, cloudErr.message);
                // We will fall through to Baileys if Cloud API fails (e.g. expired token)
            }
        }

        // Fallback or default to Baileys
        if (!sentViaCloud) {
            const sock = session_id ? sessions.get(session_id) : null;
            let resolvedSock = sock;
            if (!resolvedSock) {
                const accountDisplayPhone = String(conv.account.display_phone_number || '').replace(/\D+/g, '');
                console.log(`[Baileys Match] Looking for phone: ${accountPhoneOrId} or ${accountDisplayPhone}`);
                
                for (const s of sessions.values()) {
                    const connectedJid = s?.user?.id || '';
                    const connectedPhone = connectedJid ? connectedJid.split(':')[0] : '';
                    console.log(`[Baileys Match] Checking session with phone: ${connectedPhone}`);
                    if (connectedPhone && (connectedPhone === accountPhoneOrId || connectedPhone === accountDisplayPhone)) {
                        resolvedSock = s;
                        break;
                    }
                }

                // Aggressive fallback: if there's only one connected session or we failed to match, just use the first available one.
                if (!resolvedSock && sessions.size > 0) {
                    console.warn(`[Baileys Fallback] Could not match phone strictly. Falling back to the first available connected session.`);
                    resolvedSock = Array.from(sessions.values()).find(s => s?.user?.id) || null;
                }
            }

            if (!resolvedSock) {
                throw new Error(conv.account.access_token_encrypted ? 'Cloud API token expired and no active Baileys session found. Reconnect via QR.' : 'No active Baileys session found for this account. Reconnect via QR.');
            }

            if (!resolvedSock?.user?.id) {
                return res.status(409).json({
                    error: 'WhatsApp session is not connected yet. Click Generate QR and connect, then try again.'
                });
            }

            const normalizeForBaileys = (raw: string) => {
                const v = String(raw || '').trim();
                if (!v) return null;
                if (v.includes('@')) return v;
                const digits = v.replace(/[^0-9]/g, '');
                if (!digits) return null;
                return `${digits}@s.whatsapp.net`;
            };

            const jid = normalizeForBaileys(toPhone);
            if (!jid) throw new Error('Invalid recipient wa_id for Baileys');
            sendResult = await resolvedSock.sendMessage(jid, { text });
            wa_message_id = sendResult?.key?.id || null;
        }

        let quotedMessage: any = null;
        if (reply_to_message_id) {
            const { data: quotedMsg } = await supabase
                .from('w_messages')
                .select('id, text_body, type, content, wa_message_id, direction')
                .eq('wa_message_id', reply_to_message_id)
                .maybeSingle();
            quotedMessage = {
                wa_message_id: reply_to_message_id,
                text: quotedMsg?.text_body || quotedMsg?.content?.text || null,
                type: quotedMsg?.type || 'text',
                direction: quotedMsg?.direction || null,
                found: !!quotedMsg,
            };
        }

        const stored = await storeMessage({
            organization_id: orgId,
            contact_id: conv.contact.id,
            conversation_id: conv.id,
            wa_message_id,
            direction: 'outbound',
            type: 'text',
            content: { text, quoted: quotedMessage, forwarded: !!forward_from_message_id, client_message_id: client_message_id || null },
            status: 'sent',
            sender_type: 'human_agent',
            sender_user_id: (req as any).user?.id || null,
            automation_source: 'manual',
        } as any);

        await upsertConversation(orgId, conv.wa_account_id, conv.contact.id, {
            direction: 'outbound',
            preview: text
        });

        io.emit('new_message', {
            from: toPhone,
            text,
            quoted: quotedMessage,
            sender: 'agent',
            conversation_id: conv.id,
            contact_id: conv.contact.id,
            message_id: stored?.id || null,
            wa_message_id,
            client_message_id: client_message_id || null,
            created_at: stored?.created_at || new Date().toISOString(),
            status: 'sent',
            content: { text, quoted: quotedMessage, forwarded: !!forward_from_message_id, client_message_id: client_message_id || null }
        });

        res.json({
            success: true,
            result: sendResult,
            message: {
                id: stored?.id || null,
                wa_message_id,
                created_at: stored?.created_at || null,
                conversation_id: conv.id,
                contact_id: conv.contact.id,
                direction: 'outbound',
                type: 'text',
                content: { text, quoted: quotedMessage, forwarded: !!forward_from_message_id, client_message_id: client_message_id || null },
                status: 'sent',
            }
        });
    } catch (err: any) {
        console.error('Send message error:', err);
        res.status(500).json({ error: err.message || 'Failed to send' });
    }
}

export async function deleteMessage(req: any, res: Response) {
    const { messageId } = req.params;
    const orgId = req.organization_id;

    try {
        const { data: message, error: msgErr } = await supabase
            .from('w_messages')
            .select('id, organization_id, conversation_id')
            .eq('id', messageId)
            .eq('organization_id', orgId)
            .maybeSingle();

        if (msgErr) throw msgErr;
        if (!message) return res.status(404).json({ error: 'Message not found' });

        const { error: deleteErr } = await supabase
            .from('w_messages')
            .delete()
            .eq('id', message.id)
            .eq('organization_id', orgId);
        if (deleteErr) throw deleteErr;

        const { data: latest, error: latestErr } = await supabase
            .from('w_messages')
            .select('id, text_body, content, created_at')
            .eq('conversation_id', message.conversation_id)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (latestErr) throw latestErr;

        const latestContent = latest?.content && typeof latest.content === 'object' ? latest.content : {};
        const latestPreview = latest
            ? String(latest.text_body || latestContent.text || latestContent.caption || latestContent.template?.body || 'Media').slice(0, 160)
            : 'No messages';

        const conversationPatch: any = {
            last_message_preview: latestPreview,
            unread_count: latest ? undefined : 0,
        };
        if (latest?.created_at) {
            conversationPatch.last_message_at = latest.created_at;
        }
        Object.keys(conversationPatch).forEach(key => conversationPatch[key] === undefined && delete conversationPatch[key]);

        await supabase
            .from('w_conversations')
            .update(conversationPatch)
            .eq('id', message.conversation_id)
            .eq('organization_id', orgId);

        io.to(`org:${orgId}`).emit('message_deleted', {
            conversation_id: message.conversation_id,
            message_id: message.id,
            last_message_preview: latestPreview,
        });

        res.json({
            success: true,
            conversation_id: message.conversation_id,
            message_id: message.id,
            last_message_preview: latestPreview,
        });
    } catch (err: any) {
        console.error('Delete message error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete message' });
    }
}

export async function markAsRead(req: any, res: Response) {
    const { id } = req.params;
    const { user_id } = req.body; 

    try {
        const { data: conv, error: fetchErr } = await supabase
            .from('w_conversations')
            .select('organization_id, last_message_at')
            .eq('id', id)
            .single();

        if (fetchErr || !conv) throw new Error("Conversation not found");

        if (user_id) {
            const { error } = await supabase
                .from('w_conversation_reads')
                .upsert({
                    conversation_id: id,
                    user_id: user_id,
                    last_read_at: new Date().toISOString()
                }, { onConflict: 'conversation_id,user_id' });

            if (error) throw error;
        }

        await supabase
            .from('w_conversations')
            .update({ unread_count: 0 })
            .eq('id', id);

        await supabase
            .from('w_messages')
            .update({ status: 'read' })
            .eq('conversation_id', id)
            .in('direction', ['inbound', 'in'])
            .neq('status', 'read');

        res.json({ success: true });
    } catch (err: any) {
        console.error("Error marking read:", err);
        res.status(500).json({ error: err.message });
    }
}
