import fs from 'fs';
import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { storeMessage, upsertConversation } from '../services/messages.service.js';
import { normalizeWaIdToPhone } from '../utils/format.js';
import { applyReactionUpdate, sendReactionMessage, sendTextMessage, sendMediaMessageMeta } from '../services/messages.sender.js';
import { sessions } from '../services/whatsapp.service.js';
import { io } from '../socket.js';
import { triggerHandoffWebhook } from '../services/n8n.service.js';
import { sendOutboundMessage } from '../services/outboundDispatch.service.js';
import dotenv from "dotenv";
import { uploadMediaToStorage } from '../services/broadcast.service.js';
import { decryptToken } from '../utils/crypto.js';
import { generateConversationSummaryDirect } from '../services/summary.service.js';
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

        if (io && typeof io.to === 'function') {
            io.to(`org:${orgId}`).emit('conversation_summary_updated', {
                conversation_id: conversationId,
                summary_status: 'pending',
            });
        }

        // Direct AI summary generation (No n8n!)
        const result = await generateConversationSummaryDirect(
            conversationId,
            orgId,
            req.user?.id || null
        );

        res.json({
            success: true,
            conversation: result.conversation,
            summary: result.summary,
        });
    } catch (err: any) {
        console.error('[Summary] Error requesting summary:', err);
        await supabase
            .from('w_conversations')
            .update({ summary_status: 'failed' })
            .eq('id', conversationId)
            .eq('organization_id', orgId);

        res.status(500).json({ error: err.message || 'Failed to generate AI summary' });
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

        io.to(`org:${orgId}`).emit('message_updated', {
            organization_id: orgId,
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
        if (!orgId) throw new Error('Organization not configured');

        const dispatchResult = await sendOutboundMessage({
            organizationId: orgId,
            conversationId: conv.id,
            contactId: conv.contact.id,
            waAccountId: conv.wa_account_id,
            phoneNumberId: conv.account?.phone_number_id,
            sessionId: session_id,
            to: String(conv.contact.wa_id),
            type: 'text',
            text,
            replyToWaMessageId: reply_to_message_id,
            forwardFromMessageId: forward_from_message_id,
            clientMessageId: client_message_id,
            senderType: 'agent',
            automationSource: 'manual',
            metadata: {
                sender_user_id: (req as any).user?.id || null,
            },
        });

        res.json({
            success: true,
            result: dispatchResult.raw,
            message: {
                id: dispatchResult.storedMessageId,
                wa_message_id: dispatchResult.waMessageId,
                created_at: new Date().toISOString(),
                conversation_id: conv.id,
                contact_id: conv.contact.id,
                direction: 'outbound',
                type: 'text',
                content: { text, forwarded: !!forward_from_message_id, client_message_id: client_message_id || null },
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

export async function sendMediaMessage(req: any, res: Response) {
    const { conversationId } = req.params;
    const orgId = req.organization_id;
    const caption = String(req.body?.caption || "").trim();
    const session_id = String(req.body?.session_id || "");
    const client_message_id = String(req.body?.client_message_id || "");
    const file = req.file;

    if (!file) return res.status(400).json({ error: "file required" });

    try {
        const { data: conv, error: convErr } = await supabase
            .from("w_conversations")
            .select(`
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name, phone),
                account:w_wa_accounts(id, phone_number_id, display_phone_number, access_token_encrypted)
            `)
            .eq("id", conversationId)
            .eq("organization_id", orgId)
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id) throw new Error("Conversation contact missing wa_id");
        if (!orgId) throw new Error("Organization not configured");

        const mimeType = file.mimetype || "application/octet-stream";
        const fileName = file.originalname || "file";

        let msgType: "image" | "video" | "audio" | "document" = "document";
        if (mimeType.startsWith("image/")) msgType = "image";
        else if (mimeType.startsWith("video/")) msgType = "video";
        else if (mimeType.startsWith("audio/")) msgType = "audio";

        const uploaded = await uploadMediaToStorage({
            organization_id: orgId,
            conversation_id: conv.id,
            fileName,
            mimeType,
            buffer: file.buffer,
        });

        const dispatchResult = await sendOutboundMessage({
            organizationId: orgId,
            conversationId: conv.id,
            contactId: conv.contact.id,
            waAccountId: conv.wa_account_id,
            phoneNumberId: conv.account?.phone_number_id,
            sessionId: session_id,
            to: String(conv.contact.wa_id),
            type: msgType,
            text: caption || undefined,
            media: {
                buffer: file.buffer,
                url: uploaded.publicUrl,
                mimeType,
                fileName,
                caption: caption || undefined,
                type: msgType,
            },
            clientMessageId: client_message_id,
            senderType: 'agent',
            automationSource: 'manual',
            metadata: {
                sender_user_id: (req as any).user?.id || null,
            },
        });

        res.json({
            success: true,
            wa_message_id: dispatchResult.waMessageId,
            media_url: uploaded.publicUrl,
            message: {
                id: dispatchResult.storedMessageId,
                wa_message_id: dispatchResult.waMessageId,
                conversation_id: conv.id,
                contact_id: conv.contact.id,
                direction: "outbound",
                type: msgType,
                content: {
                    text: caption || null,
                    media_url: uploaded.publicUrl,
                    mime_type: mimeType,
                    file_name: fileName,
                    size: file.size,
                },
                status: "sent",
            },
        });
    } catch (err: any) {
        console.error("Error sending media:", err);
        res.status(500).json({ error: err.message || "Failed to send media" });
    }
}
