import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { isMetaCloudAccount } from '../services/meta.service.js';

const accountFields = 'id, name, display_phone_number, whatsapp_business_account_id';
const offboardingFields = `${accountFields}, offboarding_started_at, meta_removal_confirmed_at`;

export function requireWhatsAppAdmin(req: any, res: Response, next: NextFunction) {
    if (!['owner', 'admin'].includes(req.role)) {
        return res.status(403).json({ error: 'Only a workspace owner or admin can manage WhatsApp offboarding' });
    }
    next();
}

export async function listWhatsAppOffboarding(req: any, res: Response) {
    const { data, error } = await supabase.from('w_wa_accounts')
        .select(offboardingFields)
        .eq('organization_id', req.organization_id)
        .or('offboarding_started_at.not.is.null,whatsapp_business_account_id.not.is.null,access_token_encrypted.not.is.null')
        .order('offboarding_started_at', { ascending: false, nullsFirst: true });
    if (error?.code === '42703') {
        const legacy = await supabase.from('w_wa_accounts')
            .select(accountFields).eq('organization_id', req.organization_id)
            .or('whatsapp_business_account_id.not.is.null,access_token_encrypted.not.is.null');
        if (!legacy.error) return res.json({ records: legacy.data, migration_required: true });
        console.error('[WhatsApp offboarding] Legacy account lookup failed', legacy.error.code);
    }
    if (error) {
        console.error('[WhatsApp offboarding] Account lookup failed', error.code);
        return res.status(500).json({ error: 'Could not load WhatsApp offboarding records' });
    }
    return res.json({ records: data, migration_required: false });
}

export async function confirmWhatsAppMetaRemoval(req: any, res: Response) {
    const startedAt = req.body?.started_at;
    if (req.body?.confirmed !== true || typeof startedAt !== 'string' || !Number.isFinite(Date.parse(startedAt))) {
        return res.status(400).json({ error: 'Confirm removal in Meta before completing offboarding' });
    }
    const { data, error } = await supabase.from('w_wa_accounts')
        .update({ meta_removal_confirmed_at: new Date().toISOString(), meta_removal_confirmed_by: req.user.id })
        .eq('id', req.params.id)
        .eq('organization_id', req.organization_id)
        .eq('offboarding_started_at', startedAt)
        .is('meta_removal_confirmed_at', null)
        .select(offboardingFields)
        .maybeSingle();
    if (error) return res.status(500).json({ error: 'Could not save your confirmation. Try again.' });
    if (data) return res.json(data);

    const existing = await supabase.from('w_wa_accounts')
        .select(offboardingFields)
        .eq('id', req.params.id)
        .eq('organization_id', req.organization_id)
        .eq('offboarding_started_at', startedAt)
        .maybeSingle();
    if (existing.error) return res.status(500).json({ error: 'Could not check the offboarding status' });
    if (existing.data?.meta_removal_confirmed_at) return res.json(existing.data);
    return res.status(409).json({ error: 'This offboarding record has changed. Refresh and try again.' });
}

export async function exportWhatsAppHistory(req: any, res: Response) {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > Number.MAX_SAFE_INTEGER - 500) {
        return res.status(400).json({ error: 'Invalid export offset' });
    }
    const account = await supabase.from('w_wa_accounts')
        .select('id, whatsapp_business_account_id, access_token_encrypted, offboarding_started_at')
        .eq('id', req.params.id)
        .eq('organization_id', req.organization_id)
        .maybeSingle();
    if (account.error) return res.status(500).json({ error: 'Could not load WhatsApp account' });
    if (!account.data || (!isMetaCloudAccount(account.data) && !account.data.offboarding_started_at)) {
        return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    const pageSize = 500;
    const { data, error } = await supabase.from('w_messages')
        .select('id, conversation_id, direction, type, content, created_at, w_conversations!inner(wa_account_id, organization_id, contact_id)')
        .eq('w_conversations.wa_account_id', req.params.id)
        .eq('w_conversations.organization_id', req.organization_id)
        .order('created_at')
        .order('id')
        .range(offset, offset + pageSize - 1);
    if (error) return res.status(500).json({ error: 'Could not export WhatsApp chat history' });
    return res.json({ messages: data, next_offset: data.length === pageSize ? offset + pageSize : null });
}
