import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';
import { inspectMetaTokenPermissions } from '../services/meta.service.js';
import { 
    uploadMediaToStorage, 
    buildBroadcastBillingEstimate, 
    normalizeTemplateHeaderMedia,
    processCampaign
} from '../services/broadcast.service.js';
import { cancelCampaignRecipients, dispatchCampaignWindow } from '../services/broadcastQueue.service.js';
import { enqueueCampaignPreparation, isBroadcastQueueEnabled } from '../config/broadcastQueue.js';
import crypto from 'crypto';

export async function getBroadcastTags(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data: contacts, error: fetchErr } = await supabase
            .from('w_contacts')
            .select('tags')
            .eq('organization_id', orgId);

        if (fetchErr) throw fetchErr;

        const tagsSet = new Set<string>();
        contacts?.forEach((c: any) => {
            if (Array.isArray(c.tags)) {
                c.tags.forEach((t: string) => tagsSet.add(t));
            }
        });

        res.json({ tags: Array.from(tagsSet) });
    } catch (err: any) {
        console.error('Fetch Tags Error:', err);
        res.status(500).json({ error: err.message });
    }
}

export async function uploadHeaderMedia(req: any, res: Response) {
    const orgId = req.organization_id;
    const file = req.file;

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });
        if (!file) return res.status(400).json({ error: 'File is required' });

        const uploaded = await uploadMediaToStorage({
            organization_id: orgId,
            conversation_id: 'broadcast-template-headers',
            fileName: file.originalname || `template-header-${crypto.randomUUID()}`,
            mimeType: file.mimetype || 'application/octet-stream',
            buffer: file.buffer
        });

        res.json(uploaded);
    } catch (err: any) {
        console.error('Broadcast header media upload error:', err);
        res.status(500).json({ error: err.message || 'Failed to upload header media' });
    }
}

export async function estimateBroadcast(req: any, res: Response) {
    const orgId = req.organization_id;
    const { audience_tag, audience_type, csv_data, template_category } = req.body || {};

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });
        const estimate = await buildBroadcastBillingEstimate({
            organization_id: orgId,
            audience_tag: audience_tag || null,
            audience_type: audience_type || null,
            csv_data: Array.isArray(csv_data) ? csv_data : null,
            template_category,
        });
        res.json(estimate);
    } catch (err: any) {
        console.error('[broadcast/estimate] Error:', err);
        res.status(500).json({ error: err.message || 'Failed to estimate broadcast cost' });
    }
}

export async function sendBroadcast(req: any, res: Response) {
    const orgId = req.organization_id;
    const {
        name,
        wa_account_id,
        audience_tag,
        audience_type,
        csv_data,
        template_name,
        template_language,
        variable_mapping,
        scheduled_at,
        required_header_type,
        header_media_type,
        header_media_url
    } = req.body;

    try {
        if (process.env.BROADCAST_GLOBAL_PAUSED === 'true') {
            return res.status(503).json({ error: 'Broadcast sending is temporarily paused by the platform' });
        }
        if (!wa_account_id || !template_name || !template_language) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const variableMapping = variable_mapping && typeof variable_mapping === 'object' ? { ...variable_mapping } : {};
        if (header_media_url) {
            const mediaType = String(header_media_type || variableMapping.header_media_type || variableMapping._header_media_type || 'image').toLowerCase();
            variableMapping._header_media_type = mediaType;
            variableMapping._header_media_url = header_media_url;
            variableMapping.header_media_type = mediaType;
            variableMapping.header_media_url = header_media_url;
        }

        const requiredHeaderTypeFromClient = String(required_header_type || '').toLowerCase();
        if (['image', 'video', 'document'].includes(requiredHeaderTypeFromClient)) {
            const { type: headerMediaType, url: headerMediaUrl } = normalizeTemplateHeaderMedia(variableMapping, requiredHeaderTypeFromClient);
            if (!headerMediaUrl) {
                return res.status(400).json({
                    error: `Template "${template_name}" requires a ${requiredHeaderTypeFromClient} header media URL. Upload media or paste a public URL before launching.`
                });
            }

            variableMapping._header_media_type = requiredHeaderTypeFromClient;
            variableMapping._header_media_url = headerMediaUrl;
            variableMapping.header_media_type = requiredHeaderTypeFromClient;
            variableMapping.header_media_url = headerMediaUrl;
        }

        const { data: account, error: accountErr } = await supabase
            .from('w_wa_accounts')
            .select('id, phone_number_id, access_token_encrypted, whatsapp_business_account_id, broadcasts_paused')
            .eq('id', wa_account_id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (accountErr) throw accountErr;
        if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
        if (account.broadcasts_paused) return res.status(423).json({ error: 'Broadcasts are paused for this WhatsApp account' });
        if (!account.access_token_encrypted) return res.status(400).json({ error: 'Selected WhatsApp account is missing a Meta access token. Reconnect this account.' });

        const { data: organization } = await supabase.from('organizations')
            .select('broadcasts_paused').eq('id', orgId).maybeSingle();
        if (organization?.broadcasts_paused) {
            return res.status(423).json({ error: 'Broadcasts are paused for this organization' });
        }

        const token = decryptToken(account.access_token_encrypted);
        const tokenInspection = await inspectMetaTokenPermissions(token);
        if (tokenInspection.checked && tokenInspection.missingScopes.length > 0) {
            return res.status(400).json({
                error: `Selected WhatsApp account token is missing required Meta permission(s): ${tokenInspection.missingScopes.join(', ')}. Reconnect using a System User or embedded signup token with whatsapp_business_messaging and whatsapp_business_management.`
            });
        }

        const payload: any = {
            organization_id: orgId,
            wa_account_id,
            name: name || `Broadcast to ${audience_tag || 'Audience'}`,
            audience_tag: audience_tag || null,
            audience_type: audience_type || variableMapping._audience_type || 'all',
            csv_data: Array.isArray(csv_data) ? csv_data : null,
            template_name,
            template_language,
            variable_mapping: variableMapping,
            status: isBroadcastQueueEnabled() ? 'preparing' : (scheduled_at ? 'scheduled' : 'processing'),
            schema_version: isBroadcastQueueEnabled() ? 2 : 1,
            idempotency_key: req.body.idempotency_key || req.get('Idempotency-Key') || null,
        };

        if (scheduled_at) {
            const schDate = new Date(scheduled_at);
            if (!isNaN(schDate.getTime())) {
                payload.scheduled_at = schDate.toISOString();
            }
        }

        if (isBroadcastQueueEnabled()) {
            const estimate = await buildBroadcastBillingEstimate({
                organization_id: orgId,
                audience_tag: audience_tag || null,
                audience_type: payload.audience_type,
                csv_data: payload.csv_data,
                template_category: variableMapping._template_category,
            });
            if (!estimate.plan.allowed) return res.status(403).json({ error: 'Monthly broadcast limit reached' });
            if (!estimate.enough_wallet) return res.status(402).json({ error: 'Insufficient wallet balance' });
            if (estimate.audience_count > Number(process.env.BROADCAST_MAX_RECIPIENTS || 10_000)) {
                return res.status(400).json({ error: 'Campaign cannot exceed 10,000 recipients' });
            }
        }

        const { data, error } = await supabase.from('w_campaigns').insert(payload).select().single();
        if (error?.code === '23505' && payload.idempotency_key) {
            const { data: existing } = await supabase.from('w_campaigns')
                .select('*').eq('organization_id', orgId).eq('idempotency_key', payload.idempotency_key).single();
            if (existing && isBroadcastQueueEnabled() && ['preparing', 'queued'].includes(existing.status)) {
                await enqueueCampaignPreparation(existing.id, existing.scheduled_at);
            }
            return res.json({ success: true, campaign: existing, idempotent_replay: true });
        }
        if (error) throw error;

        if (isBroadcastQueueEnabled()) {
            try {
                await enqueueCampaignPreparation(data.id, data.scheduled_at);
            } catch (queueError: any) {
                await supabase.from('w_campaigns').update({
                    queue_error: queueError.message || 'Queue unavailable',
                }).eq('id', data.id);
                return res.status(503).json({
                    error: 'Campaign was saved but the broadcast queue is unavailable. Retry with the same idempotency key.',
                    campaign: data,
                });
            }
        } else if (!scheduled_at) {
            processCampaign(data).catch(err => console.error('Background processCampaign error:', err));
        }
        res.status(202).json({ success: true, campaign: data });
    } catch (err: any) {
        console.error('Send Broadcast Error:', err);
        res.status(500).json({ error: err.message });
    }
}

export async function getCampaigns(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
        const from = (page - 1) * pageSize;
        const { data, error, count } = await supabase
            .from('w_campaigns')
            .select('id, organization_id, wa_account_id, name, audience_tag, audience_type, template_name, template_language, status, schema_version, total_contacts, prepared_count, queued_count, processing_count, accepted_count, sent_count, delivered_count, read_count, failed_count, cancelled_count, billing_category, estimated_cost_paise, actual_cost_paise, billing_status, scheduled_at, created_at, completed_at, queue_error', { count: 'exact' })
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) throw error;
        const legacyIds = (data || []).filter((campaign: any) => Number(campaign.schema_version || 1) < 2).map((campaign: any) => campaign.id);
        let legacyById = new Map<string, any>();
        if (legacyIds.length) {
            const { data: legacyRows } = await supabase.from('w_campaigns').select('id, csv_data, results').in('id', legacyIds);
            legacyById = new Map((legacyRows || []).map((campaign: any) => [campaign.id, campaign]));
        }
        const campaigns = (data || []).map((campaign: any) => ({ ...campaign, ...(legacyById.get(campaign.id) || {}) }));
        res.json({ campaigns, pagination: { page, page_size: pageSize, total: count || 0 } });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function deleteCampaign(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { error } = await supabase
            .from('w_campaigns')
            .delete()
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .eq('status', 'scheduled');

        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function cancelCampaign(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_campaigns')
            .update({ status: isBroadcastQueueEnabled() ? 'cancelling' : 'cancelled' })
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .in('status', ['preparing', 'queued', 'processing', 'pausing', 'paused', 'scheduled'])
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Campaign not found or cannot be cancelled' });
        if (isBroadcastQueueEnabled() && data.schema_version >= 2) {
            void cancelCampaignRecipients(data.id).catch(error => {
                console.error('[broadcast] Cancellation cleanup failed', { campaignId: data.id, message: error.message });
            });
        }
        res.json({ success: true, campaign: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function pauseCampaign(req: any, res: Response) {
    try {
        const { data, error } = await supabase.from('w_campaigns')
            .update({ status: 'paused', last_progress_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .eq('organization_id', req.organization_id)
            .in('status', ['queued', 'processing', 'pausing'])
            .select().maybeSingle();
        if (error) throw error;
        if (!data) return res.status(409).json({ error: 'Campaign cannot be paused in its current state' });
        res.json({ success: true, campaign: data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function resumeCampaign(req: any, res: Response) {
    try {
        const { data, error } = await supabase.from('w_campaigns')
            .update({ status: 'queued', last_progress_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .eq('organization_id', req.organization_id)
            .eq('status', 'paused')
            .select().maybeSingle();
        if (error) throw error;
        if (!data) return res.status(409).json({ error: 'Only paused campaigns can be resumed' });
        await dispatchCampaignWindow(data.id);
        res.json({ success: true, campaign: data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function getCampaignRecipients(req: any, res: Response) {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
        const from = (page - 1) * pageSize;
        const { data: campaign } = await supabase.from('w_campaigns')
            .select('id').eq('id', req.params.id).eq('organization_id', req.organization_id).maybeSingle();
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        let query = supabase.from('w_campaign_recipients')
            .select('id, normalized_phone, contact_name, status, attempt_count, wa_message_id, error_class, error_code, error_message, billing_status, accepted_at, delivered_at, read_at, failed_at, created_at', { count: 'exact' })
            .eq('campaign_id', campaign.id);
        if (req.query.status) query = query.eq('status', String(req.query.status));
        if (req.query.search) {
            const search = String(req.query.search).replace(/[%_,()]/g, '');
            query = query.or(`normalized_phone.ilike.%${search}%,contact_name.ilike.%${search}%`);
        }
        const { data, error, count } = await query.order('created_at').range(from, from + pageSize - 1);
        if (error) throw error;
        res.json({ recipients: data || [], pagination: { page, page_size: pageSize, total: count || 0 } });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function getBroadcastInsights(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });

        const now = new Date();
        // Default to last 90 days to include previous months' transactions
        const rangeStart = req.query.start
            ? new Date(String(req.query.start)).toISOString()
            : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90)).toISOString();
        const rangeEnd = req.query.end
            ? new Date(String(req.query.end)).toISOString()
            : now.toISOString();


        const FREE_CATEGORIES = new Set(['service', 'free_customer_service', 'free_entry_point']);

        // Fetch all message usage logs in the date range
        const [usageLogsResult, campaignsResult] = await Promise.all([
            supabase
                .from('whatsapp_message_usage_logs')
                .select('category, charged_amount_paise, billing_status, delivery_status, billable, created_at')
                .eq('organization_id', orgId)
                .gte('created_at', rangeStart)
                .lte('created_at', rangeEnd),

            supabase
                .from('w_campaigns')
                .select('id, name, status, total_contacts, sent_count, delivered_count, read_count, failed_count, billing_category, actual_cost_paise, estimated_cost_paise, billing_status, created_at, completed_at, template_name, audience_tag')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        const logs = usageLogsResult.data || [];
        const rawCampaigns = campaignsResult.data || [];

        const recentCampaigns = rawCampaigns.map((c: any) => {
            let sent = Number(c.sent_count || 0);
            let delivered = Number(c.delivered_count || 0);
            let read = Number(c.read_count || 0);
            let failed = Number(c.failed_count || 0);

            if (c.results && Array.isArray(c.results)) {
                const calculatedSent = c.results.filter((r: any) => r.status !== 'failed').length;
                const calculatedDelivered = c.results.filter((r: any) => 
                    ['delivered', 'read'].includes(r.status) || 
                    ['delivered', 'read'].includes(r.delivery_status)
                ).length;
                const calculatedRead = c.results.filter((r: any) => 
                    r.status === 'read' || 
                    r.delivery_status === 'read'
                ).length;
                const calculatedFailed = c.results.filter((r: any) => r.status === 'failed').length;

                sent = Math.max(sent, calculatedSent);
                delivered = Math.max(delivered, calculatedDelivered);
                read = Math.max(read, calculatedRead);
                failed = Math.max(failed, calculatedFailed);
            }

            return {
                ...c,
                sent_count: sent,
                delivered_count: delivered,
                read_count: read,
                failed_count: failed
            };
        });


        // --- Category definitions matching Meta ---
        const CATEGORIES = [
            { key: 'marketing',                  label: 'Marketing' },
            { key: 'marketing_lite',              label: 'Marketing - lite' },
            { key: 'utility',                     label: 'Utility' },
            { key: 'authentication',              label: 'Authentication' },
            { key: 'authentication_international',label: 'Authentication - international' },
            { key: 'ai_provider',                label: 'AI Provider' },
            { key: 'service',                     label: 'Service' },
        ];

        const FREE_CATEGORIES_DETAIL = [
            { key: 'free_customer_service', label: 'Free customer service' },
            { key: 'free_entry_point',      label: 'Free entry point' },
        ];

        // Aggregate per category
        const deliveredByCategory: Record<string, number> = {};
        const chargesByCategory: Record<string, number> = {};
        let totalSent = 0;
        let totalDelivered = 0;
        let totalReceived = 0;

        for (const log of logs) {
            const cat = (log.category || 'marketing').toLowerCase().replace(/-/g, '_').replace(/ /g, '_');
            // delivery_status: 'delivered', 'read', 'sent', 'failed'
            // billing_status: 'charged', 'free', 'pending', 'failed'
            const isDelivered = log.delivery_status === 'delivered'
                || log.delivery_status === 'read';


            // All outbound logs = sent; no direction column, all logs are outbound
            totalSent++;
            if (isDelivered) {
                totalDelivered++;
                deliveredByCategory[cat] = (deliveredByCategory[cat] || 0) + 1;
                chargesByCategory[cat] = (chargesByCategory[cat] || 0) + Number(log.charged_amount_paise || 0);
            }
        }


        // Build category rows
        const buildCategoryRows = (catList: { key: string; label: string }[]) =>
            catList.map(({ key, label }) => ({
                key,
                label,
                delivered: deliveredByCategory[key] || 0,
                charges_paise: chargesByCategory[key] || 0,
            }));

        const allCategoryRows = buildCategoryRows(CATEGORIES);
        const freeCategoryRows = buildCategoryRows(FREE_CATEGORIES_DETAIL);

        const totalDeliveredFromCats = allCategoryRows.reduce((s, r) => s + r.delivered, 0);
        const totalFreeDelivered = allCategoryRows
            .filter(r => FREE_CATEGORIES.has(r.key))
            .reduce((s, r) => s + r.delivered, 0)
            + freeCategoryRows.reduce((s, r) => s + r.delivered, 0);
        const totalPaidDelivered = totalDeliveredFromCats - totalFreeDelivered;
        const totalChargesPaise = allCategoryRows.reduce((s, r) => s + r.charges_paise, 0);

        res.json({
            date_range: { start: rangeStart, end: rangeEnd },
            all_messages: {
                total_sent: totalSent,
                total_delivered: totalDelivered,
                total_received: totalReceived,
            },
            messages_delivered: {
                total: totalDeliveredFromCats,
                categories: allCategoryRows,
            },
            free_messages_delivered: {
                total: totalFreeDelivered,
                categories: freeCategoryRows,
            },
            paid_messages_delivered: {
                total: totalPaidDelivered,
                categories: allCategoryRows.filter(r => !FREE_CATEGORIES.has(r.key)),
            },
            approximate_total_charges: {
                total_paise: totalChargesPaise,
                categories: allCategoryRows.map(r => ({
                    ...r,
                    // Only paid categories carry charges
                    charges_paise: FREE_CATEGORIES.has(r.key) ? 0 : r.charges_paise,
                })),
            },
            recent_campaigns: recentCampaigns,
        });
    } catch (err: any) {
        console.error('[broadcast/insights] Error:', err);
        res.status(500).json({ error: err.message });
    }
}

