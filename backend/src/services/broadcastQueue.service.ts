import { getBroadcastSendQueue, getBroadcastRedis } from '../config/broadcastQueue.js';
import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';
import { derivePhoneForStorage } from '../utils/format.js';
import { getMetaSendErrorMessage } from './meta.service.js';
import { getActiveWhatsappRate, normalizeWhatsappBillingCategory, storeMessage, upsertConversation } from './messages.service.js';

const PREPARE_BATCH_SIZE = 500;
const DISPATCH_WINDOW = Number(process.env.BROADCAST_DISPATCH_WINDOW || 100);
const MAX_CAMPAIGN_RECIPIENTS = Number(process.env.BROADCAST_MAX_RECIPIENTS || 10_000);
const RATE_PER_SECOND = Math.max(1, Number(process.env.BROADCAST_RATE_PER_SECOND || 10));

export class BroadcastPausedError extends Error {
    retryAfterMs: number;
    constructor(message: string, retryAfterMs = 60_000) {
        super(message);
        this.name = 'BroadcastPausedError';
        this.retryAfterMs = retryAfterMs;
    }
}

export function renderRecipientPayload(campaign: any, contact: any, recipient: string) {
    const mapping = campaign.variable_mapping || {};
    let renderedText = mapping._template_body || `[Broadcast Template: ${campaign.template_name}]`;
    const parameters: any[] = [];
    const components: any[] = [];
    const variableKeys = Array.isArray(mapping._template_variables)
        ? mapping._template_variables.map(String)
        : [...String(renderedText).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => String(match[1]));

    const frozenVariables: Record<string, string> = {};
    for (const key of [...new Set<string>(variableKeys)]) {
        const field = mapping[key];
        const value = field === 'name'
            ? contact.custom_name || contact.name || ''
            : field === 'phone'
                ? recipient
                : field === 'email'
                    ? contact.email || ''
                    : String(field || '').startsWith('field:')
                        ? contact.custom_fields?.[String(field).slice(6)] ?? ''
                        : String(field || '');
        frozenVariables[key] = String(value);
        renderedText = renderedText.replace(
            new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'),
            value,
        );
        const parameter: any = { type: 'text', text: value || ' ' };
        if (!/^\d+$/.test(key)) parameter.parameter_name = key;
        parameters.push(parameter);
    }

    const headerType = String(mapping._header_media_type || mapping.header_media_type || '').toLowerCase();
    const headerUrl = String(mapping._header_media_url || mapping.header_media_url || '').trim();
    if (headerType && headerUrl) {
        components.push({ type: 'header', parameters: [{ type: headerType, [headerType]: { link: headerUrl } }] });
    }
    if (parameters.length) components.push({ type: 'body', parameters });

    for (const key of Object.keys(mapping).filter((item) => /^_?button_url_\d+$/.test(item))) {
        const index = key.match(/(\d+)$/)?.[1];
        const value = String(mapping[key] || '').trim();
        if (index && value) {
            components.push({ type: 'button', sub_type: 'url', index, parameters: [{ type: 'text', text: value }] });
        }
    }

    return {
        frozenVariables,
        renderedText,
        payload: {
            messaging_product: 'whatsapp',
            to: recipient,
            type: 'template',
            template: {
                name: campaign.template_name,
                language: { code: campaign.template_language },
                components,
            },
        },
    };
}

async function loadAudience(campaign: any) {
    if (Array.isArray(campaign.csv_data)) return campaign.csv_data.slice(0, MAX_CAMPAIGN_RECIPIENTS + 1);

    const contacts: any[] = [];
    for (let from = 0; from <= MAX_CAMPAIGN_RECIPIENTS; from += 1_000) {
        let query = supabase
            .from('w_contacts')
            .select('id, name, custom_name, email, phone, wa_id, tags, custom_fields')
            .eq('organization_id', campaign.organization_id)
            .eq('contact_type', 'individual')
            .range(from, from + 999);
        const audienceType = campaign.audience_type || campaign.variable_mapping?._audience_type || 'all';
        if (audienceType === 'saved') query = query.not('saved_at', 'is', null);
        if (audienceType === 'tag' && campaign.audience_tag) query = query.contains('tags', [campaign.audience_tag]);
        const { data, error } = await query;
        if (error) throw error;
        contacts.push(...(data || []));
        if (!data || data.length < 1_000) break;
    }
    return contacts;
}

export async function prepareCampaignForQueue(campaignId: string) {
    const { data: campaign, error } = await supabase.from('w_campaigns').select('*').eq('id', campaignId).single();
    if (error || !campaign) throw error || new Error('Campaign not found');
    if (['cancelled', 'cancelling', 'completed'].includes(campaign.status)) return;
    if (campaign.schema_version >= 2 && ['queued', 'processing', 'paused'].includes(campaign.status)) return;

    await supabase.from('w_campaigns').update({
        status: 'preparing', schema_version: 2, queue_error: null, last_progress_at: new Date().toISOString(),
    }).eq('id', campaign.id);

    const audience = await loadAudience(campaign);
    if (audience.length > MAX_CAMPAIGN_RECIPIENTS) throw new Error(`Campaign exceeds ${MAX_CAMPAIGN_RECIPIENTS} recipients`);

    const category = normalizeWhatsappBillingCategory(
        campaign.billing_category || campaign.variable_mapping?._template_category,
        'marketing',
    );
    const rate = await getActiveWhatsappRate(category);
    const reservedPerRecipient = category === 'service' ? 0 : Number(rate.rate_paise || 0);
    const seen = new Set<string>();
    const rows: any[] = [];

    for (const contact of audience) {
        const recipient = derivePhoneForStorage(contact.phone || contact.wa_id);
        if (!recipient || seen.has(recipient)) continue;
        seen.add(recipient);
        const rendered = renderRecipientPayload(campaign, contact, recipient);
        rows.push({
            campaign_id: campaign.id,
            organization_id: campaign.organization_id,
            wa_account_id: campaign.wa_account_id,
            contact_id: contact.id || null,
            normalized_phone: recipient,
            contact_name: contact.custom_name || contact.name || recipient,
            frozen_variables: rendered.frozenVariables,
            rendered_payload: { ...rendered.payload, _preview_text: rendered.renderedText },
            billing_category: category,
            reserved_paise: reservedPerRecipient,
            billing_status: reservedPerRecipient ? 'pending' : 'free',
        });
    }
    if (!rows.length) throw new Error('Campaign has no valid recipients');

    for (let index = 0; index < rows.length; index += PREPARE_BATCH_SIZE) {
        const { error: insertError } = await supabase
            .from('w_campaign_recipients')
            .upsert(rows.slice(index, index + PREPARE_BATCH_SIZE), { onConflict: 'campaign_id,normalized_phone', ignoreDuplicates: true });
        if (insertError) throw insertError;
    }

    const estimatedCost = rows.length * reservedPerRecipient;
    const { data: reservation, error: reserveError } = await supabase.rpc('reserve_broadcast_campaign', {
        p_campaign_id: campaign.id,
        p_amount_paise: estimatedCost,
        p_idempotency_key: `broadcast-reserve-${campaign.id}`,
    });
    if (reserveError) throw reserveError;
    if (!reservation?.reserved) throw new Error('Insufficient wallet balance');
    if (reservedPerRecipient > 0) {
        const { error: recipientReserveError } = await supabase.from('w_campaign_recipients')
            .update({ billing_status: 'reserved' })
            .eq('campaign_id', campaign.id)
            .eq('billing_status', 'pending');
        if (recipientReserveError) throw recipientReserveError;
    }

    await supabase.from('w_campaigns').update({
        status: 'queued',
        total_contacts: rows.length,
        prepared_count: rows.length,
        billing_category: category,
        estimated_cost_paise: estimatedCost,
        csv_data: null,
        results: null,
        last_progress_at: new Date().toISOString(),
    }).eq('id', campaign.id);

    await dispatchCampaignWindow(campaign.id);
}

export async function dispatchCampaignWindow(campaignId: string) {
    const { data: campaign } = await supabase
        .from('w_campaigns').select('id, status').eq('id', campaignId).maybeSingle();
    if (!campaign || ['paused', 'pausing', 'cancelling', 'cancelled', 'completed', 'failed'].includes(campaign.status)) return 0;

    const { count: inFlight } = await supabase
        .from('w_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['queued', 'processing']);
    const availableSlots = Math.max(0, DISPATCH_WINDOW - Number(inFlight || 0));
    if (!availableSlots) return 0;

    const { data: rows, error } = await supabase
        .from('w_campaign_recipients')
        .select('id, campaign_id, wa_account_id')
        .eq('campaign_id', campaignId)
        .in('status', ['prepared', 'retrying'])
        .or(`retry_after.is.null,retry_after.lte.${new Date().toISOString()}`)
        .order('created_at')
        .limit(availableSlots);
    if (error) throw error;
    if (!rows?.length) {
        await finalizeCampaignIfComplete(campaignId);
        return 0;
    }

    const ids = rows.map((row: any) => row.id);
    await supabase.from('w_campaign_recipients').update({
        status: 'queued', queued_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).in('id', ids).in('status', ['prepared', 'retrying']);
    await supabase.from('w_campaigns').update({
        status: 'processing',
        queued_count: Number(inFlight || 0) + rows.length,
        processing_started_at: new Date().toISOString(),
        last_progress_at: new Date().toISOString(),
    }).eq('id', campaignId).in('status', ['queued', 'processing']);

    await getBroadcastSendQueue().addBulk(rows.map((row: any) => ({
        name: 'send-recipient',
        data: { recipientId: row.id, campaignId: row.campaign_id, waAccountId: row.wa_account_id },
        opts: { jobId: `recipient-${row.id}` },
    })));
    return rows.length;
}

async function acquireAccountRateSlot(phoneNumberId: string) {
    const redis = getBroadcastRedis();
    const key = `broadcast-rate-${phoneNumberId}-${Math.floor(Date.now() / 1000)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 2);
    if (count > RATE_PER_SECOND) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return acquireAccountRateSlot(phoneNumberId);
    }
}

export function classifyMetaError(status: number, body: any) {
    const code = String(body?.error?.code || status);
    const retryable = status === 429 || status >= 500 || [1, 2, 4, 17, 32, 613].includes(Number(body?.error?.code));
    return { retryable, code, message: getMetaSendErrorMessage(body?.error), errorClass: retryable ? 'temporary' : 'permanent' };
}

export async function sendQueuedRecipient(recipientId: string) {
    const { data: recipient, error } = await supabase
        .from('w_campaign_recipients').select('*').eq('id', recipientId).single();
    if (error || !recipient) throw error || new Error('Recipient not found');
    if (['accepted', 'sent', 'delivered', 'read', 'failed', 'cancelled'].includes(recipient.status)) return;
    if (process.env.BROADCAST_GLOBAL_PAUSED === 'true') {
        throw new BroadcastPausedError('Broadcast worker is globally paused');
    }

    const { data: campaign } = await supabase
        .from('w_campaigns').select('*').eq('id', recipient.campaign_id).single();
    if (!campaign || ['cancelling', 'cancelled'].includes(campaign.status)) {
        await supabase.rpc('release_broadcast_recipient', { p_recipient_id: recipient.id, p_status: 'cancelled' });
        return;
    }
    if (['paused', 'pausing'].includes(campaign.status)) {
        await supabase.from('w_campaign_recipients').update({ status: 'retrying', retry_after: new Date(Date.now() + 5_000).toISOString() }).eq('id', recipient.id);
        return;
    }

    const { data: claimedRows, error: claimError } = await supabase.rpc('claim_broadcast_recipient', {
        p_recipient_id: recipient.id,
    });
    if (claimError) throw claimError;
    const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    if (!claimed) return;

    const { data: account, error: accountError } = await supabase
        .from('w_wa_accounts')
        .select('phone_number_id, access_token_encrypted, broadcasts_paused')
        .eq('id', recipient.wa_account_id)
        .single();
    if (accountError || !account) {
        await supabase.rpc('release_broadcast_recipient', {
            p_recipient_id: recipient.id,
            p_status: 'failed',
            p_error_class: 'account',
            p_error_code: 'ACCOUNT_NOT_FOUND',
            p_error_message: accountError?.message || 'WhatsApp account not found',
        });
        return;
    }
    if (account.broadcasts_paused) {
        await supabase.rpc('retry_broadcast_recipient', {
            p_recipient_id: recipient.id,
            p_error_class: 'account_paused',
            p_error_code: 'ACCOUNT_PAUSED',
            p_error_message: 'Broadcasts are paused for this WhatsApp account',
            p_retry_after: new Date(Date.now() + 60_000).toISOString(),
        });
        throw new BroadcastPausedError('Broadcasts are paused for this WhatsApp account');
    }
    await acquireAccountRateSlot(account.phone_number_id);

    const { _preview_text: previewText, ...metaPayload } = recipient.rendered_payload || {};
    let response: Response;
    try {
        response = await fetch(`https://graph.facebook.com/v21.0/${account.phone_number_id}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${decryptToken(account.access_token_encrypted)}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(metaPayload),
        });
    } catch (networkError: any) {
        await supabase.rpc('retry_broadcast_recipient', {
            p_recipient_id: recipient.id,
            p_error_class: 'network',
            p_error_code: 'NETWORK_ERROR',
            p_error_message: networkError.message || 'Meta network request failed',
            p_retry_after: new Date(Date.now() + 2_000 * (2 ** claimed.attempt_count)).toISOString(),
        });
        throw networkError;
    }
    const body = await response.json();

    if (!response.ok) {
        const failure = classifyMetaError(response.status, body);
        if (failure.retryable && claimed.attempt_count < claimed.max_attempts) {
            const retryAfterMs = Number(response.headers.get('retry-after') || 0) * 1_000;
            await supabase.rpc('retry_broadcast_recipient', {
                p_recipient_id: recipient.id,
                p_error_class: failure.errorClass,
                p_error_code: failure.code,
                p_error_message: failure.message,
                p_retry_after: new Date(Date.now() + Math.max(retryAfterMs, 2_000 * (2 ** claimed.attempt_count))).toISOString(),
            });
            throw new Error(failure.message);
        }
        await supabase.rpc('release_broadcast_recipient', {
            p_recipient_id: recipient.id,
            p_status: 'failed',
            p_error_class: failure.errorClass,
            p_error_code: failure.code,
            p_error_message: failure.message,
        });
        return;
    }

    const waMessageId = body.messages?.[0]?.id;
    if (!waMessageId) throw new Error('Meta accepted request without a message id');
    const { error: settleError } = await supabase.rpc('settle_broadcast_recipient', {
        p_recipient_id: recipient.id,
        p_wa_message_id: waMessageId,
        p_meta_request_id: response.headers.get('x-fb-trace-id'),
    });
    if (settleError) throw settleError;

    let contactId = recipient.contact_id;
    if (!contactId) {
        const { data: contact } = await supabase.from('w_contacts').insert({
            organization_id: recipient.organization_id,
            wa_account_id: recipient.wa_account_id,
            name: recipient.contact_name,
            phone: recipient.normalized_phone,
            wa_id: body.contacts?.[0]?.wa_id || recipient.normalized_phone,
            contact_type: 'individual',
        }).select('id').single();
        contactId = contact?.id;
    }
    if (contactId) {
        const conversation = await upsertConversation(recipient.organization_id, recipient.wa_account_id, contactId, {
            preview: `[Broadcast] ${campaign.template_name}`,
        });
        if (conversation?.id) {
            await storeMessage({
                organization_id: recipient.organization_id,
                conversation_id: conversation.id,
                contact_id: contactId,
                wa_message_id: waMessageId,
                direction: 'outbound',
                type: 'template',
                status: 'sent',
                content: { text: previewText, template: recipient.rendered_payload?.template },
                sender_type: 'system',
                automation_source: 'broadcast',
                metadata: { campaign_id: campaign.id, campaign_recipient_id: recipient.id },
            });
        }
    }
}

export async function finalizeCampaignIfComplete(campaignId: string) {
    const { count: active } = await supabase.from('w_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['prepared', 'queued', 'processing', 'retrying']);
    if (active) return false;
    const { data: campaign } = await supabase.from('w_campaigns')
        .select('status, wallet_reserved_paise').eq('id', campaignId).single();
    if (!campaign) return false;
    const terminalStatus = ['cancelling', 'cancelled'].includes(campaign.status) ? 'cancelled' : 'completed';
    await supabase.from('w_campaigns').update({
        status: terminalStatus,
        completed_at: new Date().toISOString(),
        billing_status: 'charged',
        queued_count: 0,
        processing_count: 0,
        last_progress_at: new Date().toISOString(),
    }).eq('id', campaignId);
    return true;
}

export async function cancelCampaignRecipients(campaignId: string) {
    while (true) {
        const { data: rows } = await supabase.from('w_campaign_recipients')
            .select('id').eq('campaign_id', campaignId)
            .in('status', ['prepared', 'queued', 'retrying']).limit(PREPARE_BATCH_SIZE);
        if (!rows?.length) break;
        for (const row of rows) {
            await supabase.rpc('release_broadcast_recipient', { p_recipient_id: row.id, p_status: 'cancelled' });
        }
    }
    await finalizeCampaignIfComplete(campaignId);
}
