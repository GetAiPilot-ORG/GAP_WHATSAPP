import { supabase } from '../config/supabase.js';
import { DEFAULT_BILLING_CURRENCY, DEFAULT_BILLING_MARKET, DEFAULT_WHATSAPP_RATE_CARD } from '../utils/billing.js';
import { io } from '../socket.js';


export type WhatsappBillingCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export function normalizeWhatsappBillingCategory(value: any, fallback: WhatsappBillingCategory = 'marketing'): WhatsappBillingCategory {
    const raw = String(value || '').toLowerCase().trim();
    if (raw.includes('utility')) return 'utility';
    if (raw.includes('auth')) return 'authentication';
    if (raw.includes('service')) return 'service';
    if (raw.includes('marketing')) return 'marketing';
    return fallback;
}

export async function getActiveWhatsappRate(category: WhatsappBillingCategory) {
    const fallback = DEFAULT_WHATSAPP_RATE_CARD[category] || DEFAULT_WHATSAPP_RATE_CARD.marketing;
    try {
        const { data, error } = await supabase
            .from('whatsapp_rate_cards')
            .select('rate_paise, pass_through_rate_paise, markup_paise')
            .eq('market', DEFAULT_BILLING_MARKET)
            .eq('currency', DEFAULT_BILLING_CURRENCY)
            .eq('category', category)
            .eq('is_active', true)
            .order('effective_from', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) {
            return {
                rate_paise: fallback.rate_paise,
                pass_through_rate_paise: fallback.rate_paise,
                markup_paise: 0,
            };
        }
        return data;
    } catch {
        return {
            rate_paise: fallback.rate_paise,
            pass_through_rate_paise: fallback.rate_paise,
            markup_paise: 0,
        };
    }
}

export async function recordWhatsappMessageUsage(params: {
    organization_id: string;
    wa_account_id?: string | null;
    campaign_id?: string | null;
    conversation_id?: string | null;
    contact_id?: string | null;
    message_id?: string | null;
    wa_message_id?: string | null;
    category: WhatsappBillingCategory;
    template_name?: string | null;
    source?: 'manual' | 'broadcast' | 'flow' | 'ai_agent' | 'webhook' | 'system';
}) {
    const category = normalizeWhatsappBillingCategory(params.category);
    const rate = await getActiveWhatsappRate(category);
    const chargedAmount = category === 'service' ? 0 : Number(rate.rate_paise || 0);
    const now = new Date().toISOString();
    let billingStatus: 'charged' | 'free' | 'failed' = chargedAmount > 0 ? 'charged' : 'free';
    let walletTransactionId: string | null = null;

    try {
        if (chargedAmount > 0) {
            const { data: wallet } = await supabase
                .from('whatsapp_wallets')
                .select('balance_paise, currency')
                .eq('organization_id', params.organization_id)
                .maybeSingle();

            if (!wallet) {
                await supabase.from('whatsapp_wallets').insert({
                    organization_id: params.organization_id,
                    currency: DEFAULT_BILLING_CURRENCY,
                });
                billingStatus = 'failed';
            } else if (Number(wallet.balance_paise || 0) >= chargedAmount) {
                const nextBalance = Number(wallet.balance_paise || 0) - chargedAmount;
                const { error: walletErr } = await supabase
                    .from('whatsapp_wallets')
                    .update({ balance_paise: nextBalance, updated_at: now })
                    .eq('organization_id', params.organization_id)
                    .gte('balance_paise', chargedAmount);

                if (walletErr) {
                    billingStatus = 'failed';
                } else {
                    const { data: tx } = await supabase
                        .from('whatsapp_wallet_transactions')
                        .insert({
                            organization_id: params.organization_id,
                            type: 'message_debit',
                            amount_paise: -chargedAmount,
                            balance_after_paise: nextBalance,
                            currency: DEFAULT_BILLING_CURRENCY,
                            status: 'completed',
                            reference_type: params.source || 'message',
                            reference_id: params.message_id || params.wa_message_id || params.campaign_id || null,
                            description: `${DEFAULT_WHATSAPP_RATE_CARD[category]?.label || category} WhatsApp message charge`,
                            metadata: {
                                category,
                                template_name: params.template_name || null,
                                campaign_id: params.campaign_id || null,
                            },
                        })
                        .select('id')
                        .maybeSingle();
                    walletTransactionId = tx?.id || null;
                }
            } else {
                billingStatus = 'failed';
                await supabase.from('whatsapp_wallet_transactions').insert({
                    organization_id: params.organization_id,
                    type: 'failed_debit',
                    amount_paise: -chargedAmount,
                    balance_after_paise: Number(wallet.balance_paise || 0),
                    currency: DEFAULT_BILLING_CURRENCY,
                    status: 'failed',
                    reference_type: params.source || 'message',
                    reference_id: params.message_id || params.wa_message_id || params.campaign_id || null,
                    description: `Insufficient wallet balance for ${category} WhatsApp message charge`,
                    metadata: { category, template_name: params.template_name || null },
                });
            }

            if (params.message_id) {
                await supabase
                    .from('w_messages')
                    .update({
                        billing_category: category,
                        billing_amount_paise: chargedAmount,
                        billing_status: billingStatus,
                    })
                    .eq('id', params.message_id);
            }

            // Insert into whatsapp_message_usage_logs for analytics and billing breakdown
            await supabase.from('whatsapp_message_usage_logs').insert({
                organization_id: params.organization_id,
                wa_account_id: params.wa_account_id || null,
                campaign_id: params.campaign_id || null,
                conversation_id: params.conversation_id || null,
                contact_id: params.contact_id || null,
                message_id: params.message_id || null,
                wa_message_id: params.wa_message_id || null,
                direction: 'outbound',
                source: params.source || 'system',
                category,
                template_name: params.template_name || null,
                recipient_country: DEFAULT_BILLING_MARKET,
                rate_paise: chargedAmount,
                meta_cost_paise: Number(rate.pass_through_rate_paise || chargedAmount),
                markup_paise: Number(rate.markup_paise || 0),
                charged_amount_paise: chargedAmount,
                billable: chargedAmount > 0,
                billing_status: billingStatus,
                delivery_status: 'sent',
                wallet_transaction_id: walletTransactionId,
                metadata: {
                    market: DEFAULT_BILLING_MARKET,
                    currency: DEFAULT_BILLING_CURRENCY,
                },
            });
        }
    } catch (err: any) {

        console.error('recordWhatsappMessageUsage error:', err);
    }
}

export async function upsertConversation(organization_id: string, wa_account_id: string, contact_id: string, lastMessageOpts: any) {
    const { data: existing } = await supabase
        .from('w_conversations')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('wa_account_id', wa_account_id)
        .eq('contact_id', contact_id)
        .maybeSingle();

    let newUnread = (existing?.unread_count || 0);

    if (lastMessageOpts.direction === 'inbound') {
        newUnread += 1;
    } else {
        newUnread = 0; // Agent replied, so it's read
    }

    const payload = {
        organization_id,
        wa_account_id,
        contact_id,
        last_message_at: new Date().toISOString(),
        last_message_preview: lastMessageOpts.preview || "Media",
        unread_count: newUnread,
        status: 'open'
    };

    if (existing) {
        const { data, error } = await supabase
            .from('w_conversations')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single();
        if (error) console.error("Conversation Update Error:", error);

        if (data && !data.assigned_agent_id && lastMessageOpts.direction === 'inbound') {
            // NOTE: Auto assignment logic is not imported here to prevent circular dependencies.
            // It should be called externally if needed.
        }

        return data;
    } else {
        const { data, error } = await supabase
            .from('w_conversations')
            .insert({ ...payload, bot_enabled: true })
            .select()
            .single();
        if (error) console.error("Conversation Insert Error:", error);

        if (data) {
            try {
                // Emit new_chat_received event when a new conversation is created
                io.to(`org:${organization_id}`).emit('new_chat_received', data);
            } catch (e) {
                console.error("Failed to emit new_chat_received event:", e);
            }

            if (lastMessageOpts.direction === 'inbound') {
                // Auto assignment logic should be called externally if needed.
            }
        }

        return data;
    }
}

export async function storeMessage(params: {
    organization_id: string;
    contact_id: string;
    conversation_id?: string;
    wa_message_id?: string | null;
    direction: "inbound" | "outbound";
    type: string;
    content: any;
    status: "sent" | "delivered" | "read" | "failed";
    is_bot_reply?: boolean;
    bot_agent_id?: string | null;
    sender_type?: "customer" | "human_agent" | "ai_agent" | "system";
    sender_user_id?: string | null;
    is_internal_note?: boolean;
    automation_source?: "flow" | "ai_agent" | "broadcast" | "manual" | "webhook" | "n8n" | "system" | null;
    handoff_triggered?: boolean;
    metadata?: any;
}) {
    const textBody = typeof params.content?.text === 'string' ? params.content.text : null;
    const mediaUrl = typeof params.content?.media_url === 'string' ? params.content.media_url : null;
    const mediaMime = typeof params.content?.mime_type === 'string' ? params.content.mime_type : null;
    const mediaSize = Number.isFinite(Number(params.content?.size)) ? Number(params.content.size) : null;
    const durationSeconds = Number.isFinite(Number(params.content?.duration_seconds)) ? Number(params.content.duration_seconds) : null;
    const waveform = params.content?.waveform ?? null;
    const isBotReply = params.is_bot_reply === true
        || params.content?.is_bot_reply === true
        || params.content?.is_flow === true
        || !!params.bot_agent_id
        || !!params.content?.bot_agent_id;
    const botAgentId = params.bot_agent_id || params.content?.bot_agent_id || null;
    const senderType = params.sender_type
        || (params.is_internal_note ? 'system' : null)
        || (params.direction === 'inbound' ? 'customer' : null)
        || (isBotReply ? 'ai_agent' : 'human_agent');
    const automationSource = params.automation_source
        || (params.content?.is_flow ? 'flow' : null)
        || (isBotReply ? 'ai_agent' : null)
        || (params.direction === 'outbound' ? 'manual' : 'webhook');

    const payload = {
        organization_id: params.organization_id,
        conversation_id: (params as any).conversation_id,
        contact_id: params.contact_id,
        wa_message_id: params.wa_message_id || null,
        direction: params.direction,
        type: params.type,
        content: params.content,
        text_body: textBody,
        media_url: mediaUrl,
        media_mime: mediaMime,
        media_size: mediaSize,
        duration_seconds: durationSeconds,
        waveform,
        status: params.status,
        is_bot_reply: isBotReply,
        bot_agent_id: botAgentId,
        sender_type: senderType,
        sender_user_id: params.sender_user_id || null,
        is_internal_note: params.is_internal_note === true,
        automation_source: automationSource,
        handoff_triggered: params.handoff_triggered === true,
        metadata: params.metadata || {},
    };

    const op = params.wa_message_id
        ? supabase.from('w_messages').upsert(payload, { onConflict: 'wa_message_id' })
        : supabase.from('w_messages').insert(payload);

    const { data, error } = await op.select('id, wa_message_id, created_at').maybeSingle();
    if (error) console.error("Store Message Error:", error);
    return data;
}

export async function refundWhatsappMessage(messageIdOrWaMessageId: string) {
    try {
        console.log(`[Refund] Webhook reported failure. Refund function triggered for: ${messageIdOrWaMessageId}`);

        const { data, error } = await supabase.rpc('refund_whatsapp_message', {
            p_wa_message_id: messageIdOrWaMessageId
        });

        if (error) {
            console.error(`[Refund] Refund execution failed for ${messageIdOrWaMessageId}. Error:`, error);
            return { success: false, error: error.message };
        }

        const res = data as { success: boolean; reason?: string; refunded_amount?: number; new_balance?: number };
        if (res && res.success) {
            console.log(`[Refund] Refund SUCCESS: Credited ${res.refunded_amount} paise. New Balance: ${res.new_balance} paise. Message: ${messageIdOrWaMessageId}`);
        } else {
            console.log(`[Refund] Refund SKIPPED. Reason: ${res?.reason || 'unknown'}. Message: ${messageIdOrWaMessageId}`);
        }

        return res;
    } catch (err: any) {
        console.error(`[Refund] Refund execution failed for ${messageIdOrWaMessageId}. System Error:`, err);
        return { success: false, error: err.message };
    }
}

