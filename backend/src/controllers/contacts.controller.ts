import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { getIO } from '../config/socket.js';
import { enforcePlanResourceLimit } from '../services/billing.service.js';
import {
    normalizeWaIdToPhone,
    normalizeIndianPhoneKey,
    derivePhoneForStorage
} from '../utils/format.js';

const CONTACT_SELECT = 'id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source';
const ADMIN_ROLES = new Set(['admin', 'owner']);

function requireContactsAdmin(req: any, res: Response) {
    if (!ADMIN_ROLES.has(String(req.role || '').toLowerCase())) {
        res.status(403).json({ error: 'Only admins can perform this action' });
        return false;
    }
    return true;
}

function normalizeTags(tags: any) {
    return Array.isArray(tags)
        ? tags.map((tag: any) => String(tag).trim()).filter(Boolean)
        : String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

function normalizeCustomFields(customFields: any) {
    if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return {};

    return Object.fromEntries(Object.entries(customFields)
        .map(([key, value]) => [String(key).trim(), value == null ? '' : String(value).trim()])
        .filter(([key]) => Boolean(key)));
}

export async function getContacts(req: any, res: Response) {
    const organization_id = req.organization_id;
    const includeGroups = req.query.include_groups === 'true';
    const includeUnsaved = req.query.include_unsaved === 'true';

    if (!organization_id) {
        return res.status(403).json({ error: 'No organization linked to this account' });
    }

    try {
        let query = supabase
            .from('w_contacts')
            .select(CONTACT_SELECT)
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        if (!includeGroups) {
            query = query.or('contact_type.eq.individual,contact_type.is.null');
        }

        if (!includeUnsaved) {
            query = query.not('saved_at', 'is', null);
        }

        let { data, error } = await query;
        if (error) throw error;

        // Fetch broadcast message counts grouped by contact_id
        const { data: broadcastMessages, error: broadcastErr } = await supabase
            .from('w_messages')
            .select('contact_id')
            .eq('organization_id', organization_id)
            .eq('automation_source', 'broadcast');

        const broadcastCounts: Record<string, number> = {};
        if (!broadcastErr && broadcastMessages) {
            for (const msg of broadcastMessages) {
                if (msg.contact_id) {
                    broadcastCounts[msg.contact_id] = (broadcastCounts[msg.contact_id] || 0) + 1;
                }
            }
        }

        const rows = (data || []).map((c: any) => {
            const next = { ...c };
            next.broadcast_count = broadcastCounts[c.id] || 0;
            const phone = String(next.phone || '').trim();
            if (!phone) {
                const derived = derivePhoneForStorage(next.wa_id);
                if (derived) next.phone = derived;
            }
            if (!next.wa_key) {
                next.wa_key = normalizeIndianPhoneKey(next.wa_id) || null;
            }
            return next;
        });

        res.json(rows);
    } catch (err: any) {
        console.error('Error fetching contacts:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch contacts' });
    }
}

export async function getContactProfilePhoto(req: any, res: Response) {
    const organization_id = req.organization_id;
    const contactId = req.params.id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data, error } = await supabase
            .from('w_contacts')
            .select('id, custom_fields')
            .eq('id', contactId)
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (error) throw error;
        if (!data?.id) {
            return res.status(200).json({ profile_photo_url: null });
        }

        const profilePhotoUrl = data.custom_fields?.profile_photo_url || null;
        res.json({ profile_photo_url: profilePhotoUrl });
    } catch (err: any) {
        console.error('Error fetching contact profile photo:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch contact profile photo' });
    }
}

export async function createContact(req: any, res: Response) {
    const organization_id = req.organization_id;
    const { name, phone, custom_name, tags = [], custom_fields = {}, wa_account_id = null } = req.body || {};

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const phoneDigits = normalizeWaIdToPhone(phone);
        if (!phoneDigits) return res.status(400).json({ error: 'Valid phone number is required' });

        const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
        const normalizedPhone = wa_key;
        const normalizedTags = normalizeTags(tags);
        const normalizedCustomFields = normalizeCustomFields(custom_fields);

        let normalizedAccountId: string | null = null;
        if (wa_account_id) {
            const { data: account, error: accountErr } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('id', String(wa_account_id))
                .eq('organization_id', organization_id)
                .maybeSingle();
            if (accountErr) throw accountErr;
            if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
            normalizedAccountId = account.id;
        }

        const { data: existing, error: existingErr } = await supabase
            .from('w_contacts')
            .select('id')
            .eq('organization_id', organization_id)
            .eq('wa_key', wa_key)
            .maybeSingle();
        if (existingErr) throw existingErr;
        if (existing?.id) return res.status(409).json({ error: 'Contact already exists' });

        await enforcePlanResourceLimit({
            organization_id,
            resource: 'contacts',
            table: 'w_contacts',
            filters: { contact_type: 'individual' },
            label: 'Contact',
        });

        const { data, error } = await supabase
            .from('w_contacts')
            .insert({
                organization_id,
                wa_account_id: normalizedAccountId,
                name: String(name || '').trim() || normalizedPhone,
                custom_name: typeof custom_name === 'string' && custom_name.trim() ? custom_name.trim() : null,
                phone: normalizedPhone,
                wa_id: normalizedPhone,
                wa_key,
                tags: normalizedTags,
                custom_fields: normalizedCustomFields,
                contact_type: 'individual',
                saved_at: new Date().toISOString(),
                saved_by_user_id: req.user?.id || null,
                save_source: 'manual'
            })
            .select(CONTACT_SELECT)
            .single();
        if (error) throw error;

        try { getIO().emit('contact_updated', { contact: data }); } catch(e) {}
        res.status(201).json(data);
    } catch (err: any) {
        console.error('Error creating contact:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create contact', limit: err.limit });
    }
}

export async function batchCreateContacts(req: any, res: Response) {
    const organization_id = req.organization_id;
    const { contacts = [] } = req.body || {};

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });
        if (!Array.isArray(contacts) || contacts.length === 0) return res.status(400).json({ error: 'contacts array is required' });
        if (contacts.length > 1000) return res.status(413).json({ error: 'Import batch is too large. Send 1000 contacts or fewer per request.' });

        const { limit, used, plan } = await enforcePlanResourceLimit({
            organization_id,
            resource: 'contacts',
            table: 'w_contacts',
            filters: { contact_type: 'individual' },
            label: 'Contact',
        });

        const normalizedByKey = new Map<string, any>();
        const invalidRows: number[] = [];
        const duplicateRows: number[] = [];

        for (const [index, c] of contacts.entries()) {
            const phoneDigits = normalizeWaIdToPhone(c.phone);
            if (!phoneDigits) {
                invalidRows.push(index + 1);
                continue;
            }

            const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
            if (normalizedByKey.has(wa_key)) {
                duplicateRows.push(index + 1);
                continue;
            }

            normalizedByKey.set(wa_key, {
                organization_id,
                wa_account_id: c.wa_account_id ? String(c.wa_account_id) : null,
                name: String(c.name || '').trim() || wa_key,
                custom_name: typeof c.custom_name === 'string' && c.custom_name.trim() ? c.custom_name.trim() : null,
                phone: wa_key,
                wa_id: wa_key,
                wa_key,
                tags: normalizeTags(c.tags),
                custom_fields: normalizeCustomFields(c.custom_fields),
                contact_type: 'individual',
                saved_at: new Date().toISOString(),
                saved_by_user_id: req.user?.id || null,
                save_source: 'manual'
            });
        }

        const insertPayloads = Array.from(normalizedByKey.values());
        if (insertPayloads.length === 0) {
            return res.status(400).json({ error: 'No valid contacts to import' });
        }

        const accountIds = Array.from(new Set(insertPayloads.map(row => row.wa_account_id).filter(Boolean)));
        if (accountIds.length) {
            const { data: validAccounts, error: accountErr } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('organization_id', organization_id)
                .in('id', accountIds);
            if (accountErr) throw accountErr;

            const validAccountIds = new Set((validAccounts || []).map((account: any) => account.id));
            insertPayloads.forEach(row => {
                if (row.wa_account_id && !validAccountIds.has(row.wa_account_id)) row.wa_account_id = null;
            });
        }

        const incomingKeys = insertPayloads.map(row => row.wa_key);
        const { data: existingRows, error: existingErr } = await supabase
            .from('w_contacts')
            .select('wa_key')
            .eq('organization_id', organization_id)
            .in('wa_key', incomingKeys);
        if (existingErr) throw existingErr;

        const existingKeys = new Set((existingRows || []).map((row: any) => row.wa_key));
        const newPayloads = insertPayloads.filter(row => !existingKeys.has(row.wa_key));
        const newContactsCount = newPayloads.length;

        if (limit > 0 && used + newContactsCount > limit) {
            return res.status(402).json({
                error: `Batch import would exceed the Contact limit for ${plan?.plan_name} plan (${used + newContactsCount}/${limit}). Upgrade your plan to add more.`,
                limit: { resource: 'contacts', used, limit, plan },
            });
        }

        if (newPayloads.length === 0) {
            return res.status(201).json({
                success: true,
                imported: 0,
                skipped_existing: existingKeys.size,
                skipped_duplicate_rows: duplicateRows.length,
                skipped_invalid_rows: invalidRows.length,
                contacts: [],
            });
        }

        const { data, error } = await supabase
            .from('w_contacts')
            .insert(newPayloads)
            .select(CONTACT_SELECT);

        if (error) throw error;

        res.status(201).json({
            success: true,
            imported: data?.length || 0,
            skipped_existing: existingKeys.size,
            skipped_duplicate_rows: duplicateRows.length,
            skipped_invalid_rows: invalidRows.length,
            contacts: data || [],
        });
    } catch (err: any) {
        console.error('Error batch creating contacts:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to batch create contacts', limit: err.limit });
    }
}

export async function updateContact(req: any, res: Response) {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id, wa_key, custom_fields')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) return res.status(403).json({ error: 'Forbidden' });

        const updates: any = {};

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'custom_name')) {
            const raw = (req.body?.custom_name ?? null);
            const custom_name = typeof raw === 'string' ? raw.trim() : null;
            updates.custom_name = custom_name ? custom_name : null;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
            updates.name = String(req.body?.name || '').trim() || null;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')) {
            const phoneDigits = normalizeWaIdToPhone(req.body?.phone);
            if (!phoneDigits) return res.status(400).json({ error: 'Valid phone number is required' });
            const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
            updates.phone = wa_key;
            updates.wa_id = wa_key;
            updates.wa_key = wa_key;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'tags')) {
            updates.tags = Array.isArray(req.body.tags)
                ? req.body.tags.map((tag: any) => String(tag).trim()).filter(Boolean)
                : String(req.body.tags || '').split(',').map((tag: string) => tag.trim()).filter(Boolean);
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'custom_fields')) {
            const incoming = req.body.custom_fields && typeof req.body.custom_fields === 'object' && !Array.isArray(req.body.custom_fields)
                ? Object.fromEntries(Object.entries(req.body.custom_fields)
                    .map(([key, value]) => [String(key).trim(), value == null ? '' : String(value).trim()])
                    .filter(([key]) => Boolean(key)))
                : {};
            const currentFields = existing.custom_fields && typeof existing.custom_fields === 'object' ? existing.custom_fields : {};
            const protectedFields = ['profile_photo_url', 'profile_photo_checked_at'].reduce((acc: any, key) => {
                if (currentFields[key]) acc[key] = currentFields[key];
                return acc;
            }, {});
            updates.custom_fields = { ...incoming, ...protectedFields };
        }

        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No contact fields were provided' });

        if (existing.wa_key && Object.prototype.hasOwnProperty.call(updates, 'custom_name')) {
            const { error: updAllErr } = await supabase
                .from('w_contacts')
                .update({ custom_name: updates.custom_name })
                .eq('organization_id', organization_id)
                .eq('wa_key', existing.wa_key);
            if (updAllErr) throw updAllErr;
        }

        const { data: updated, error: updErr } = await supabase
            .from('w_contacts')
            .update(updates)
            .eq('id', contactId)
            .select(CONTACT_SELECT)
            .single();
        if (updErr) throw updErr;

        try { getIO().emit('contact_updated', { contact: updated }); } catch(e) {}
        res.json(updated);
    } catch (err: any) {
        console.error('Error updating contact:', err);
        res.status(500).json({ error: err.message || 'Failed to update contact' });
    }
}

export async function saveContact(req: any, res: Response) {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id, saved_at')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) return res.status(403).json({ error: 'Forbidden' });

        const { data: updated, error: updErr } = await supabase
            .from('w_contacts')
            .update({
                saved_at: existing.saved_at || new Date().toISOString(),
                saved_by_user_id: req.user?.id || null,
                save_source: 'manual',
            })
            .eq('id', contactId)
            .select(CONTACT_SELECT)
            .single();
        if (updErr) throw updErr;

        try { getIO().emit('contact_updated', { contact: updated }); } catch(e) {}
        res.json(updated);
    } catch (err: any) {
        console.error('Error saving contact:', err);
        res.status(500).json({ error: err.message || 'Failed to save contact' });
    }
}

export async function deleteContact(req: any, res: Response) {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) return res.status(403).json({ error: 'Forbidden' });

        const { error } = await supabase
            .from('w_contacts')
            .delete()
            .eq('id', contactId)
            .eq('organization_id', organization_id);
        if (error) throw error;

        try { getIO().emit('contact_deleted', { id: contactId }); } catch(e) {}
        res.json({ success: true });
    } catch (err: any) {
        console.error('Error deleting contact:', err);
        res.status(500).json({ error: err.message || 'Failed to delete contact' });
    }
}

export async function deleteAllContacts(req: any, res: Response) {
    const organization_id = req.organization_id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });
        if (!requireContactsAdmin(req, res)) return;

        const confirmName = String(req.body?.confirm_name || '').trim();
        const confirmDelete = String(req.body?.confirm_delete || '').trim().toLowerCase();
        const { data: member, error: memberErr } = await supabase
            .from('organization_members')
            .select('name, email')
            .eq('organization_id', organization_id)
            .eq('user_id', req.user?.id)
            .maybeSingle();
        if (memberErr) throw memberErr;

        const validNames = [
            member?.name,
            member?.email,
            req.user?.user_metadata?.full_name,
            req.user?.user_metadata?.name,
            req.user?.email,
        ].map(value => String(value || '').trim()).filter(Boolean);

        if (!validNames.includes(confirmName) || confirmDelete !== 'delete all contacts') {
            return res.status(400).json({ error: 'Confirmation text did not match' });
        }

        const { count, error: countErr } = await supabase
            .from('w_contacts')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organization_id)
            .or('contact_type.eq.individual,contact_type.is.null');
        if (countErr) throw countErr;

        const { error } = await supabase
            .from('w_contacts')
            .delete()
            .eq('organization_id', organization_id)
            .or('contact_type.eq.individual,contact_type.is.null');
        if (error) throw error;

        try { getIO().to(`org:${organization_id}`).emit('contacts_deleted_all', { organization_id, deleted_count: count || 0 }); } catch(e) {}
        res.json({ success: true, deleted_count: count || 0 });
    } catch (err: any) {
        console.error('Error deleting all contacts:', err);
        res.status(500).json({ error: err.message || 'Failed to delete all contacts' });
    }
}
