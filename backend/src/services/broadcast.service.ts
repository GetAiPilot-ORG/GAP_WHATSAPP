import { supabase, MEDIA_BUCKET } from '../config/supabase.js';
import { getOrganizationPlanLimits } from './billing.service.js';
import { getActiveWhatsappRate, normalizeWhatsappBillingCategory } from './messages.service.js';
import { getMetaSendErrorMessage, inspectMetaTokenPermissions } from './meta.service.js';
import { decryptToken } from '../utils/crypto.js';
import { storeMessage, upsertConversation, recordWhatsappMessageUsage } from './messages.service.js';
import { derivePhoneForStorage } from '../utils/format.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:5000';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function normalizeFilename(filename: string) {
    return filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

export function normalizeTemplateHeaderMedia(mapping: any, fallbackType?: string) {
    const source = mapping && typeof mapping === 'object' ? mapping : {};
    const type = String(
        source._header_media_type ||
        source.header_media_type ||
        fallbackType ||
        ''
    ).toLowerCase();
    const url = String(
        source._header_media_url ||
        source.header_media_url ||
        source.headerImageUrl ||
        source.header_image_url ||
        source.headerUrl ||
        ''
    ).trim();

    return { type, url };
}

export async function countBroadcastAudience(organizationId: string, audienceTag?: string | null, csvData?: any[] | null, audienceType?: string) {
    if (Array.isArray(csvData)) {
        return csvData.filter(row => row?.phone || row?.wa_id).length;
    }

    let query = supabase
        .from('w_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('contact_type', 'individual');

    if (audienceType === 'saved') {
        query = query.not('saved_at', 'is', null);
    } else if (audienceType === 'tag' && audienceTag) {
        query = query.contains('tags', [audienceTag]);
    } else if (audienceTag) {
        query = query.contains('tags', [audienceTag]);
    }

    const { count, error } = await query;
    if (error) throw error;
    return Number(count || 0);
}

export async function getBroadcastCampaignsThisMonth(organizationId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { count, error } = await supabase
        .from('w_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', monthStart);
    if (error) throw error;
    return Number(count || 0);
}

export async function buildBroadcastBillingEstimate(params: {
    organization_id: string;
    audience_tag?: string | null;
    audience_type?: string | null;
    csv_data?: any[] | null;
    template_category?: any;
}) {
    const category = normalizeWhatsappBillingCategory(params.template_category, 'marketing');
    const rate = await getActiveWhatsappRate(category);
    const audienceCount = await countBroadcastAudience(params.organization_id, params.audience_tag || null, params.csv_data || null, params.audience_type || 'all');
    const estimatedCostPaise = audienceCount * Number(rate.rate_paise || 0);
    const [{ data: wallet }, planInfo, campaignsThisMonth] = await Promise.all([
        supabase
            .from('whatsapp_wallets')
            .select('balance_paise, currency')
            .eq('organization_id', params.organization_id)
            .maybeSingle(),
        getOrganizationPlanLimits(params.organization_id),
        getBroadcastCampaignsThisMonth(params.organization_id),
    ]);

    const walletBalancePaise = Number(wallet?.balance_paise || 0);
    const broadcastsLimit = Number(planInfo.limits?.broadcasts_per_month ?? 0);
    const broadcastsRemaining = broadcastsLimit < 0 ? -1 : Math.max(0, broadcastsLimit - campaignsThisMonth);
    const allowedByPlan = broadcastsLimit < 0 || campaignsThisMonth < broadcastsLimit;
    const enoughWallet = estimatedCostPaise <= walletBalancePaise;

    return {
        category,
        audience_count: audienceCount,
        rate_paise: Number(rate.rate_paise || 0),
        estimated_cost_paise: estimatedCostPaise,
        wallet_balance_paise: walletBalancePaise,
        wallet_after_paise: walletBalancePaise - estimatedCostPaise,
        enough_wallet: enoughWallet,
        plan: {
            id: planInfo.plan_id,
            name: planInfo.plan_name,
            broadcasts_per_month: broadcastsLimit,
            broadcasts_used_this_month: campaignsThisMonth,
            broadcasts_remaining: broadcastsRemaining,
            allowed: allowedByPlan,
        },
        can_launch: audienceCount > 0 && enoughWallet && allowedByPlan,
    };
}

export async function uploadMediaToStorage(params: {
    organization_id: string;
    conversation_id: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
}) {
    const safeName = normalizeFilename(params.fileName);
    const ext = safeName.includes('.') ? safeName.split('.').pop() : 'bin';

    if (supabase) {
        try {
            const storagePath = `${params.organization_id}/${params.conversation_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
                .from(MEDIA_BUCKET)
                .upload(storagePath, params.buffer, { contentType: params.mimeType, upsert: false });
            if (!upErr) {
                const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
                if (data?.publicUrl) return { path: storagePath, publicUrl: data.publicUrl };
            }
        } catch {
            // fall back to local
        }
    }

    const localName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const diskPath = path.join(UPLOADS_DIR, localName);
    fs.writeFileSync(diskPath, params.buffer);
    return { path: `uploads/${localName}`, publicUrl: `${PUBLIC_BASE_URL}/uploads/${encodeURIComponent(localName)}` };
}

function resolveTemplateButtonUrl(urlDef: string, value: string) {
    if (!urlDef) return value;
    if (urlDef.includes('{{1}}')) return urlDef.replace('{{1}}', encodeURIComponent(value || ''));
    return urlDef.endsWith('/') ? `${urlDef}${value}` : `${urlDef}/${value}`;
}

function normalizeBroadcastRecipient(value: any) {
    const normalized = derivePhoneForStorage(value);
    if (!normalized) return null;
    return normalized;
}

export async function processCampaign(campaign: any) {
    try {
        const originalVariableMapping = campaign?.variable_mapping || {};
        const { data: freshCampaign, error: freshCampaignErr } = await supabase
            .from('w_campaigns')
            .select('*')
            .eq('id', campaign.id)
            .maybeSingle();

        if (freshCampaignErr) {
            console.warn('[processCampaign] Could not refetch campaign before processing:', freshCampaignErr.message);
        } else if (freshCampaign) {
            const freshMapping = freshCampaign.variable_mapping || {};
            const originalHeaderMedia = normalizeTemplateHeaderMedia(originalVariableMapping);
            const freshHeaderMedia = normalizeTemplateHeaderMedia(freshMapping);

            campaign = { ...campaign, ...freshCampaign };

            if (originalHeaderMedia.url && !freshHeaderMedia.url) {
                campaign.variable_mapping = {
                    ...freshMapping,
                    ...originalVariableMapping
                };
            }
        }

        await supabase.from('w_campaigns').update({ status: 'processing' }).eq('id', campaign.id);

        const orgId = campaign.organization_id;
        const wa_account_id = campaign.wa_account_id;

        const { data: account, error: accErr } = await supabase
            .from('w_wa_accounts')
            .select('id, phone_number_id, whatsapp_business_account_id, access_token_encrypted')
            .eq('id', wa_account_id)
            .single();

        if (accErr || !account) throw new Error('WhatsApp account not found');
        const token = decryptToken(account.access_token_encrypted);
        const phone_number_id = account.phone_number_id;

        let contactsToProcess = [];
        if (campaign.csv_data && Array.isArray(campaign.csv_data)) {
            contactsToProcess = campaign.csv_data;
        } else {
            let query = supabase
                .from('w_contacts')
                .select('id, name, custom_name, phone, wa_id, tags')
                .eq('organization_id', orgId)
                .eq('contact_type', 'individual');

            const audienceType = campaign.variable_mapping?._audience_type || 'all';

            if (audienceType === 'saved') {
                query = query.not('saved_at', 'is', null);
            } else if (audienceType === 'tag' && campaign.audience_tag) {
                query = query.contains('tags', [campaign.audience_tag]);
            } else if (campaign.audience_tag) {
                query = query.contains('tags', [campaign.audience_tag]);
            }

            const { data: contacts, error: contactsErr } = await query;
            if (contactsErr) throw contactsErr;
            contactsToProcess = contacts || [];
        }

        // Deduplicate contacts by normalized phone number to prevent multiple sends
        const seenPhones = new Set<string>();
        const uniqueContacts = [];
        for (const contact of contactsToProcess) {
            const rawPhone = contact.phone || contact.wa_id;
            const normalized = derivePhoneForStorage(rawPhone);
            if (!normalized || seenPhones.has(normalized)) continue;
            seenPhones.add(normalized);
            uniqueContacts.push(contact);
        }
        contactsToProcess = uniqueContacts;

        if (contactsToProcess.length === 0) {
            await supabase.from('w_campaigns').update({ status: 'completed', total_contacts: 0 }).eq('id', campaign.id);
            return;
        }

        const billingCategory = normalizeWhatsappBillingCategory(
            campaign.billing_category || campaign.variable_mapping?._template_category,
            'marketing'
        );
        const campaignRate = await getActiveWhatsappRate(billingCategory);
        const estimatedCost = contactsToProcess.length * Number(campaignRate.rate_paise || 0);
        await supabase
            .from('w_campaigns')
            .update({
                billing_category: billingCategory,
                estimated_cost_paise: estimatedCost,
                billing_status: estimatedCost > 0 ? 'estimated' : 'charged',
            })
            .eq('id', campaign.id);

        let sent = 0;
        let failed = 0;
        let processed = 0;
        let isCancelled = false;
        const results = [];

        for (const contact of contactsToProcess) {
            processed++;
            if (processed % 10 === 0) {
                const { data: checkCamp } = await supabase.from('w_campaigns').select('status').eq('id', campaign.id).maybeSingle();
                if (checkCamp && (checkCamp.status === 'cancelled' || checkCamp.status === 'paused')) {
                    isCancelled = true;
                    console.log(`[processCampaign] Campaign ${campaign.id} was cancelled/paused. Stopping.`);
                    break;
                }
            }
            const rawRecipient = contact.phone || contact.wa_id;
            const recipient = normalizeBroadcastRecipient(rawRecipient);
            if (!recipient) {
                failed++;
                results.push({
                    phone: rawRecipient || null,
                    name: contact.name || contact.custom_name || 'Unknown',
                    status: 'failed',
                    error: 'Invalid or missing phone number. Use international format, for example 919876543210.'
                });
                continue;
            }

            const components = [];
            const mapping = campaign.variable_mapping || {};

            let renderedText = mapping._template_body || `[Broadcast Template: ${campaign.template_name}]`;
            const parameters = [];
            const { type: headerMediaType, url: headerMediaUrl } = normalizeTemplateHeaderMedia(mapping);

            if (headerMediaType && !headerMediaUrl) {
                failed++;
                results.push({
                    phone: recipient,
                    name: contact.name || contact.custom_name || 'Unknown',
                    status: 'failed',
                    error: `Missing required ${headerMediaType} header media URL`
                });
                continue;
            }

            if (headerMediaType && headerMediaUrl) {
                components.push({
                    type: 'header',
                    parameters: [
                        {
                            type: headerMediaType,
                            [headerMediaType]: { link: headerMediaUrl }
                        }
                    ]
                });
            }

            const buttonUrlKeys = Object.keys(mapping)
                .map((key) => {
                    const match = key.match(/^_?button_url_(\d+)$/);
                    return match ? { key, index: match[1] } : null;
                })
                .filter(Boolean)
                .sort((a: any, b: any) => parseInt(a.index) - parseInt(b.index));

            const addedButtonIndexes = new Set<string>();
            for (const item of buttonUrlKeys as any[]) {
                if (addedButtonIndexes.has(item.index)) continue;
                const text = String(mapping[`_button_url_${item.index}`] || mapping[`button_url_${item.index}`] || '').trim();
                if (!text) continue;

                components.push({
                    type: 'button',
                    sub_type: 'url',
                    index: item.index,
                    parameters: [{ type: 'text', text }]
                });
                addedButtonIndexes.add(item.index);
            }

            const templateVariableKeys = Array.isArray(mapping._template_variables)
                ? mapping._template_variables.map((key: any) => String(key).trim()).filter(Boolean)
                : [...String(renderedText || '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match => String(match[1] || '').trim()).filter(Boolean);
            const sortedKeys = [...new Set<string>(templateVariableKeys.length
                ? templateVariableKeys
                : Object.keys(mapping).filter(k => /^\d+$/.test(k)).sort((a: any, b: any) => parseInt(a) - parseInt(b)))];

            for (const key of sortedKeys) {
                const field = mapping[key];
                let text = '';
                if (field === 'name') text = contact.custom_name || contact.name || '';
                else if (field === 'phone') text = contact.phone || '';
                else text = field || '';

                renderedText = renderedText.replace(new RegExp(`\\{\\{\\s*${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'), text);
                const parameter: any = { type: 'text', text: text || ' ' };
                if (!/^\d+$/.test(String(key))) {
                    parameter.parameter_name = String(key);
                }
                parameters.push(parameter);
            }

            if (parameters.length > 0) {
                components.push({ type: 'body', parameters });
            }

            const payload = {
                messaging_product: 'whatsapp',
                to: recipient,
                type: 'template',
                template: {
                    name: campaign.template_name,
                    language: { code: campaign.template_language },
                    components: components
                }
            };

            try {
                console.log('[broadcast] Sending template', {
                    campaign_id: campaign.id,
                    contact: contact.name || contact.custom_name || 'Unknown',
                    raw_recipient: rawRecipient,
                    recipient,
                    template: campaign.template_name,
                    language: campaign.template_language,
                    components_count: components.length,
                });

                const response = await fetch(`https://graph.facebook.com/v21.0/${phone_number_id}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    sent++;
                    const wa_message_id = data.messages?.[0]?.id;
                    const realWaId = data.contacts?.[0]?.wa_id || recipient;
                    results.push({
                        phone: recipient,
                        raw_phone: rawRecipient,
                        name: contact.name || contact.custom_name || 'Unknown',
                        status: 'sent',
                        wa_message_id: wa_message_id || null,
                    });

                    let currentContactId = contact.id;

                    if (!currentContactId) {
                        const { data: existingContacts } = await supabase
                            .from('w_contacts')
                            .select('id')
                            .eq('organization_id', orgId)
                            .or(`wa_id.eq.${realWaId},phone.eq.${recipient}`)
                            .limit(1);

                        if (existingContacts && existingContacts.length > 0) {
                            currentContactId = existingContacts[0].id;
                        } else {
                            const { data: newContact, error: insertErr } = await supabase
                                .from('w_contacts')
                                .insert({
                                    organization_id: orgId,
                                    wa_account_id: wa_account_id,
                                    name: contact.name || contact.custom_name || recipient,
                                    phone: recipient,
                                    wa_id: realWaId,
                                    contact_type: 'individual'
                                })
                                .select('id')
                                .single();

                            if (newContact) {
                                currentContactId = newContact.id;
                            }
                        }
                    }

                    if (currentContactId) {
                        const conv = await upsertConversation(orgId, wa_account_id, currentContactId, {
                            lastMessagePreview: `[Broadcast] ${campaign.template_name}`
                        });

                        if (conv && conv.id) {
                            const templateButtons = Array.isArray(mapping._template_buttons)
                                ? mapping._template_buttons.map((button: any) => {
                                    const type = String(button?.type || '').toUpperCase();
                                    const buttonValue = mapping[`_button_url_${button.index}`] || mapping[`button_url_${button.index}`] || '';
                                    return {
                                        index: button.index,
                                        type,
                                        text: button?.text || `Button ${Number(button.index || 0) + 1}`,
                                        url: type === 'URL' ? resolveTemplateButtonUrl(button?.url, buttonValue) : '',
                                        phone_number: type === 'PHONE_NUMBER' ? (button?.phone_number || '') : ''
                                    };
                                }).filter((button: any) => button.text)
                                : [];

                            const storedMessage = await storeMessage({
                                organization_id: orgId,
                                conversation_id: conv.id,
                                contact_id: currentContactId,
                                wa_message_id: wa_message_id || `broadcast-${Date.now()}`,
                                direction: 'outbound',
                                type: 'template',
                                status: 'sent',
                                content: {
                                    text: renderedText,
                                    template: {
                                        name: campaign.template_name,
                                        language: campaign.template_language,
                                        body: renderedText,
                                        footer: mapping._template_footer || '',
                                        header: headerMediaUrl ? {
                                            type: headerMediaType,
                                            media_url: headerMediaUrl
                                        } : null,
                                        buttons: templateButtons
                                    }
                                },
                                sender_type: 'system',
                                automation_source: 'broadcast',
                                metadata: {
                                    campaign_id: campaign.id,
                                    template_name: campaign.template_name,
                                    recipient,
                                    raw_recipient: rawRecipient,
                                },
                            });

                            await recordWhatsappMessageUsage({
                                organization_id: orgId,
                                wa_account_id,
                                campaign_id: campaign.id,
                                conversation_id: conv.id,
                                contact_id: currentContactId,
                                message_id: storedMessage?.id || null,
                                wa_message_id: wa_message_id || null,
                                category: billingCategory,
                                template_name: campaign.template_name,
                                source: 'broadcast',
                            });
                        }
                    }
                } else {
                    const metaError = getMetaSendErrorMessage(data.error);
                    console.warn('[broadcast] Meta template send failed', {
                        campaign_id: campaign.id,
                        raw_recipient: rawRecipient,
                        recipient,
                        template: campaign.template_name,
                        language: campaign.template_language,
                        status: response.status,
                        error: metaError,
                        meta_error: data.error || data,
                    });
                    failed++;
                    results.push({
                        phone: recipient,
                        raw_phone: rawRecipient,
                        name: contact.name || contact.custom_name || 'Unknown',
                        status: 'failed',
                        error: metaError,
                        meta_code: data.error?.code || null,
                        meta_subcode: data.error?.error_subcode || null,
                        fbtrace_id: data.error?.fbtrace_id || null,
                    });
                }
            } catch (e: any) {
                console.error('[broadcast] Template send exception', {
                    campaign_id: campaign.id,
                    raw_recipient: rawRecipient,
                    recipient,
                    template: campaign.template_name,
                    error: e?.message || String(e),
                });
                failed++;
                results.push({ phone: recipient, raw_phone: rawRecipient, name: contact.name || contact.custom_name || 'Unknown', status: 'failed', error: e.message || 'Network/Unknown Error' });
            }

            await new Promise(r => setTimeout(r, 300));
        }

        await supabase.from('w_campaigns').update({
            status: isCancelled ? 'cancelled' : 'completed',
            total_contacts: contactsToProcess.length,
            sent_count: sent,
            failed_count: failed,
            results: results
        }).eq('id', campaign.id);

        await supabase.from('w_campaigns').update({
            actual_cost_paise: sent * Number(campaignRate.rate_paise || 0),
            billing_status: failed === contactsToProcess.length ? 'failed' : 'charged',
        }).eq('id', campaign.id);

    } catch (err) {
        console.error('Error processing campaign:', campaign.id, err);
        await supabase.from('w_campaigns').update({ status: 'failed' }).eq('id', campaign.id);
    }
}
