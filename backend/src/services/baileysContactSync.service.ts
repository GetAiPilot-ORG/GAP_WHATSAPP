import { supabase as defaultSupabase } from '../config/supabase.js';
import { derivePhoneForStorage } from '../utils/format.js';
import {
    BatchLidMappingInput,
    ContactsServiceDeps,
    batchPersistContactLids,
    extractBaileysContactNameWithSource,
    isLidWaId,
    normalizeContactWaIdForStorage,
    normalizeJidWithoutDevice,
    normalizeLidForStorage,
    sanitizeContactDisplayName,
    upsertContact,
} from './contacts.service.js';

export interface ExtractedBaileysSignals {
    targetWaId: string;
    phoneWaId: string | null;
    lid: string | null;
    isGroup: boolean;
    isNewsletter: boolean;
    name: string | null;
    preferIncomingName: boolean;
}

export interface ResolveMessageIdentityInput {
    remoteJid: string;
    remoteJidAlt?: string | null;
    senderPn?: string | null;
    senderLid?: string | null;
    fromMe: boolean;
    myPhone?: string | null;
    myLid?: string | null;
    pushName?: string | null;
    verifiedBizName?: string | null;
}

export interface ResolvedMessageIdentity {
    isGroup: boolean;
    isNewsletter: boolean;
    contactWaId: string;
    phoneWaId: string | null;
    lid: string | null;
    contactNameForUpsert: string | null;
    preferIncomingName: boolean;
    fallbackSenderName: string | null;
    needsLidLookup: boolean;
}

export function extractBaileysContactSignals(
    raw: any,
    opts?: { source?: 'contact' | 'chat' },
): ExtractedBaileysSignals | null {
    if (!raw || typeof raw !== 'object') return null;

    const source = opts?.source || 'contact';
    const rawCandidates: Array<string | null | undefined> = [
        raw.jid,
        raw.pnJid,
        raw.newJid,
        raw.oldJid,
        typeof raw.id === 'string' ? raw.id : null,
        raw.lid,
        raw.lidJid,
        typeof raw.key === 'string' ? raw.key : raw.key?.remoteJid,
    ];

    const normalizedCandidates = rawCandidates
        .map((c) => normalizeJidWithoutDevice(c))
        .filter(Boolean);

    if (normalizedCandidates.length === 0) return null;

    for (const c of normalizedCandidates) {
        if (c === 'status@broadcast' || c.endsWith('@broadcast')) {
            return null;
        }
    }

    const groupOrChannelJid = normalizedCandidates.find(
        (c) => c.endsWith('@g.us') || c.endsWith('@newsletter'),
    );

    if (groupOrChannelJid) {
        const isGroup = groupOrChannelJid.endsWith('@g.us');
        const isNewsletter = groupOrChannelJid.endsWith('@newsletter');
        const targetWaId = normalizeContactWaIdForStorage(groupOrChannelJid);
        if (!targetWaId) return null;

        const { name, preferIncomingName } = extractBaileysContactNameWithSource(
            raw,
            targetWaId,
        );

        return {
            targetWaId,
            phoneWaId: null,
            lid: null,
            isGroup,
            isNewsletter,
            name,
            preferIncomingName: source === 'chat' ? Boolean(name) : preferIncomingName,
        };
    }

    let lid: string | null = null;
    let phoneWaId: string | null = null;

    for (const c of normalizedCandidates) {
        if (!lid) {
            const parsedLid = normalizeLidForStorage(c);
            if (parsedLid) {
                lid = parsedLid;
                continue;
            }
        }
        if (!phoneWaId && !c.endsWith('@lid')) {
            // Only accept @s.whatsapp.net / @c.us or explicit non-@lid pn/jid as phone numbers.
            if (c.endsWith('@s.whatsapp.net') || c.endsWith('@c.us') || !c.includes('@')) {
                const derived = derivePhoneForStorage(c);
                if (derived) {
                    phoneWaId = derived;
                }
            }
        }
    }

    const targetWaId = phoneWaId || lid;
    if (!targetWaId) return null;

    const extracted = extractBaileysContactNameWithSource(raw, targetWaId, [lid]);

    // For 1:1 chats from history/chats events, do not let potentially stale chat titles
    // overwrite saved phonebook contact names; still use them when contact has no name.
    const preferIncomingName =
        source === 'chat' ? false : extracted.preferIncomingName;

    return {
        targetWaId,
        phoneWaId,
        lid,
        isGroup: false,
        isNewsletter: false,
        name: extracted.name,
        preferIncomingName,
    };
}

export class BaileysContactDirectory {
    private readonly lidToPhone = new Map<string, string>();
    private readonly phoneToLid = new Map<string, string>();
    private readonly phoneToSavedName = new Map<string, string>();
    private readonly phoneToPushName = new Map<string, string>();
    private readonly lidToSavedName = new Map<string, string>();
    private readonly lidToPushName = new Map<string, string>();

    public record(params: {
        waId?: string | null;
        lid?: string | null;
        name?: string | null;
        preferIncomingName?: boolean;
    }): void {
        const normWa = params.waId ? normalizeContactWaIdForStorage(params.waId) : '';
        const phone =
            normWa && !isLidWaId(normWa) && !normWa.includes('@')
                ? derivePhoneForStorage(normWa)
                : null;
        const normLid =
            normalizeLidForStorage(params.lid) ||
            (isLidWaId(normWa) ? normalizeLidForStorage(normWa) : null);

        if (phone && normLid) {
            this.lidToPhone.set(normLid, phone);
            this.phoneToLid.set(phone, normLid);

            // Cross-pollinate any previously known names across the newly linked pair.
            const saved =
                this.phoneToSavedName.get(phone) || this.lidToSavedName.get(normLid);
            if (saved) {
                this.phoneToSavedName.set(phone, saved);
                this.lidToSavedName.set(normLid, saved);
            }
            const push =
                this.phoneToPushName.get(phone) || this.lidToPushName.get(normLid);
            if (push) {
                this.phoneToPushName.set(phone, push);
                this.lidToPushName.set(normLid, push);
            }
        }

        const effectivePhone = phone || (normLid ? this.lidToPhone.get(normLid) || null : null);
        const effectiveLid = normLid || (effectivePhone ? this.phoneToLid.get(effectivePhone) || null : null);

        const safeName = sanitizeContactDisplayName(
            params.name,
            effectivePhone || effectiveLid || normWa,
            [effectiveLid, effectivePhone],
        );

        if (!safeName) return;

        if (params.preferIncomingName) {
            if (effectivePhone) this.phoneToSavedName.set(effectivePhone, safeName);
            if (effectiveLid) this.lidToSavedName.set(effectiveLid, safeName);
        } else {
            if (effectivePhone) this.phoneToPushName.set(effectivePhone, safeName);
            if (effectiveLid) this.lidToPushName.set(effectiveLid, safeName);
        }
    }

    public seedFromDbContacts(rows: any[]): void {
        if (!Array.isArray(rows)) return;
        for (const row of rows) {
            if (!row || row.contact_type === 'group' || row.contact_type === 'channel') {
                continue;
            }
            const lid = normalizeLidForStorage(row?.custom_fields?.lid);
            const phone = !isLidWaId(row?.wa_id)
                ? derivePhoneForStorage(row?.phone) || derivePhoneForStorage(row?.wa_id)
                : null;
            if (!lid && !phone) continue;

            const rawName = row?.custom_name || row?.name || null;
            const name = sanitizeContactDisplayName(rawName, phone || row?.wa_id || '', [
                lid,
                row?.wa_id,
            ]);
            const isSaved =
                Boolean(row?.custom_name) ||
                row?.save_source === 'manual' ||
                Boolean(row?.saved_at);

            this.record({
                waId: phone || row?.wa_id,
                lid,
                name,
                preferIncomingName: isSaved,
            });
        }
    }

    public lookupPhone(lid: string | null | undefined): string | null {
        const normLid = normalizeLidForStorage(lid);
        if (!normLid) return null;
        return this.lidToPhone.get(normLid) || null;
    }

    public lookupLid(phoneOrWaId: string | null | undefined): string | null {
        const phone = derivePhoneForStorage(phoneOrWaId);
        if (!phone) return null;
        return this.phoneToLid.get(phone) || null;
    }

    public lookupName(
        waIdOrLid: string | null | undefined,
    ): { name: string; preferIncomingName: boolean } | null {
        const normLid = normalizeLidForStorage(waIdOrLid);
        if (normLid) {
            const saved = this.lidToSavedName.get(normLid);
            if (saved) return { name: saved, preferIncomingName: true };
            const mappedPhone = this.lidToPhone.get(normLid);
            if (mappedPhone) {
                const phoneSaved = this.phoneToSavedName.get(mappedPhone);
                if (phoneSaved) return { name: phoneSaved, preferIncomingName: true };
                const phonePush = this.phoneToPushName.get(mappedPhone);
                if (phonePush) return { name: phonePush, preferIncomingName: false };
            }
            const lidPush = this.lidToPushName.get(normLid);
            if (lidPush) return { name: lidPush, preferIncomingName: false };
            return null;
        }

        const phone = derivePhoneForStorage(waIdOrLid);
        if (!phone) return null;
        const saved = this.phoneToSavedName.get(phone);
        if (saved) return { name: saved, preferIncomingName: true };
        const mappedLid = this.phoneToLid.get(phone);
        if (mappedLid) {
            const lidSaved = this.lidToSavedName.get(mappedLid);
            if (lidSaved) return { name: lidSaved, preferIncomingName: true };
        }
        const push = this.phoneToPushName.get(phone);
        if (push) return { name: push, preferIncomingName: false };
        if (mappedLid) {
            const lidPush = this.lidToPushName.get(mappedLid);
            if (lidPush) return { name: lidPush, preferIncomingName: false };
        }
        return null;
    }

    public resolveMessageIdentity(
        input: ResolveMessageIdentityInput,
    ): ResolvedMessageIdentity {
        const remote = normalizeJidWithoutDevice(input.remoteJid);
        const isGroup = remote.endsWith('@g.us');
        const isNewsletter = remote.endsWith('@newsletter');

        if (isGroup || isNewsletter) {
            const contactWaId = normalizeContactWaIdForStorage(remote) || remote;
            return {
                isGroup,
                isNewsletter,
                contactWaId,
                phoneWaId: null,
                lid: null,
                contactNameForUpsert: null,
                preferIncomingName: false,
                fallbackSenderName: input.fromMe
                    ? null
                    : sanitizeContactDisplayName(input.pushName || input.verifiedBizName, contactWaId),
                needsLidLookup: false,
            };
        }

        const selfPhones = new Set<string>();
        const myPhoneClean = derivePhoneForStorage(input.myPhone);
        if (myPhoneClean) {
            selfPhones.add(myPhoneClean);
            if (myPhoneClean.length === 12 && myPhoneClean.startsWith('91')) {
                selfPhones.add(myPhoneClean.slice(2));
            }
        }
        const myLidNorm = normalizeLidForStorage(input.myLid);

        const isSelfPhone = (candidate: string | null) => {
            if (!candidate) return false;
            if (selfPhones.has(candidate)) return true;
            if (candidate.length === 12 && candidate.startsWith('91')) {
                return selfPhones.has(candidate.slice(2));
            }
            return false;
        };

        let lid = normalizeLidForStorage(remote);
        let phoneWaId = !isLidWaId(remote) ? derivePhoneForStorage(remote) : null;

        if (!input.fromMe) {
            const candidateLid = normalizeLidForStorage(input.senderLid);
            if (candidateLid && candidateLid !== myLidNorm && !lid) {
                lid = candidateLid;
            }
            const candidatePn = derivePhoneForStorage(input.senderPn);
            if (candidatePn && !isSelfPhone(candidatePn) && !phoneWaId) {
                phoneWaId = candidatePn;
            }
        }

        const altNorm = normalizeJidWithoutDevice(input.remoteJidAlt);
        if (altNorm) {
            if (isLidWaId(altNorm)) {
                const altLid = normalizeLidForStorage(altNorm);
                if (altLid && altLid !== myLidNorm && !lid) {
                    lid = altLid;
                }
            } else if (altNorm.endsWith('@s.whatsapp.net') || altNorm.endsWith('@c.us')) {
                const altPhone = derivePhoneForStorage(altNorm);
                if (altPhone && !isSelfPhone(altPhone) && !phoneWaId) {
                    phoneWaId = altPhone;
                }
            }
        }

        if (!phoneWaId && lid) {
            const knownPhone = this.lookupPhone(lid);
            if (knownPhone && !isSelfPhone(knownPhone)) {
                phoneWaId = knownPhone;
            }
        }

        if (!lid && phoneWaId) {
            const knownLid = this.lookupLid(phoneWaId);
            if (knownLid && knownLid !== myLidNorm) {
                lid = knownLid;
            }
        }

        const contactWaId =
            phoneWaId || lid || normalizeContactWaIdForStorage(remote) || remote;

        if (phoneWaId && lid) {
            this.record({ waId: phoneWaId, lid });
        }

        const dirName =
            this.lookupName(phoneWaId) || (lid ? this.lookupName(lid) : null);

        // CRITICAL: Never treat `msg.pushName` when `fromMe=true` as the recipient's name,
        // because Baileys/WA sets pushName on self-sent messages to our own account pushname.
        const rawInboundName = !input.fromMe
            ? sanitizeContactDisplayName(input.pushName, contactWaId, [lid]) ||
              sanitizeContactDisplayName(input.verifiedBizName, contactWaId, [lid])
            : null;

        if (rawInboundName) {
            this.record({
                waId: phoneWaId || contactWaId,
                lid,
                name: rawInboundName,
                preferIncomingName: false,
            });
        }

        let contactNameForUpsert: string | null = null;
        let preferIncomingName = false;

        if (dirName?.preferIncomingName) {
            contactNameForUpsert = dirName.name;
            preferIncomingName = true;
        } else if (rawInboundName) {
            contactNameForUpsert = rawInboundName;
            preferIncomingName = false;
        } else if (dirName?.name) {
            contactNameForUpsert = dirName.name;
            preferIncomingName = false;
        }

        return {
            isGroup: false,
            isNewsletter: false,
            contactWaId,
            phoneWaId,
            lid,
            contactNameForUpsert,
            preferIncomingName,
            fallbackSenderName: contactNameForUpsert,
            needsLidLookup: Boolean(!phoneWaId && lid && contactWaId.endsWith('@lid')),
        };
    }
}

const fullSyncInFlight = new Map<string, Promise<SyncMissingLidsResult>>();
const lastFullSyncAt = new Map<string, number>();

export interface SyncMissingLidsParams {
    sock: any;
    orgId: string;
    waAccountId?: string | null;
    directory: BaileysContactDirectory;
    forceFullSync?: boolean;
    fullSyncCooldownMs?: number;
    onDemandCooldownMs?: number;
    chunkSize?: number;
    deps?: ContactsServiceDeps;
}

export interface SyncMissingLidsResult {
    skipped?: boolean;
    checkedCount: number;
    matchedCount: number;
    updatedCount: number;
    mergedCount: number;
}

export async function syncMissingLidsForOrg(
    params: SyncMissingLidsParams,
): Promise<SyncMissingLidsResult> {
    const {
        sock,
        orgId,
        waAccountId,
        directory,
        forceFullSync = false,
        fullSyncCooldownMs = 5 * 60 * 1000,
        onDemandCooldownMs = 15 * 1000,
        chunkSize = 100,
        deps,
    } = params;

    if (!orgId || !sock?.user?.id || typeof sock.onWhatsApp !== 'function') {
        return { skipped: true, checkedCount: 0, matchedCount: 0, updatedCount: 0, mergedCount: 0 };
    }

    const existingPromise = fullSyncInFlight.get(orgId);
    if (existingPromise) {
        return existingPromise;
    }

    const now = Date.now();
    const lastAt = lastFullSyncAt.get(orgId) || 0;
    const minCooldown = forceFullSync ? fullSyncCooldownMs : onDemandCooldownMs;
    if (lastAt && now - lastAt < minCooldown) {
        return { skipped: true, checkedCount: 0, matchedCount: 0, updatedCount: 0, mergedCount: 0 };
    }

    const task = (async (): Promise<SyncMissingLidsResult> => {
        const supabaseClient = deps?.supabaseClient || defaultSupabase;
        const rows: any[] = [];
        const PAGE_SIZE = 1000;
        let from = 0;

        while (true) {
            const { data, error } = await supabaseClient
                .from('w_contacts')
                .select(
                    'id,wa_id,phone,name,custom_name,custom_fields,save_source,saved_at,contact_type',
                )
                .eq('organization_id', orgId)
                .or('contact_type.eq.individual,contact_type.is.null')
                .range(from, from + PAGE_SIZE - 1);

            if (error || !Array.isArray(data) || data.length === 0) break;
            rows.push(...data);
            if (data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        directory.seedFromDbContacts(rows);

        const existingLidWaIds = new Set<string>();
        const missingLidContacts: Array<{
            row: any;
            phone: string;
            queryJid: string;
        }> = [];
        const preMappedOverlaps: Array<{
            phoneRow: any;
            lid: string;
        }> = [];

        for (const row of rows) {
            const normLidWa = normalizeLidForStorage(row?.wa_id);
            if (normLidWa) {
                existingLidWaIds.add(normLidWa);
            }
        }

        for (const row of rows) {
            if (isLidWaId(row?.wa_id)) continue;

            const existingLid = normalizeLidForStorage(row?.custom_fields?.lid);
            if (existingLid) {
                if (existingLidWaIds.has(existingLid)) {
                    preMappedOverlaps.push({ phoneRow: row, lid: existingLid });
                }
                continue;
            }

            const phone = derivePhoneForStorage(row?.wa_id) || derivePhoneForStorage(row?.phone);
            if (!phone) continue;

            missingLidContacts.push({
                row,
                phone,
                queryJid: `${phone}@s.whatsapp.net`,
            });
        }

        let mergedCount = 0;
        for (const overlap of preMappedOverlaps) {
            try {
                await upsertContact(
                    orgId,
                    waAccountId || '',
                    overlap.phoneRow.wa_id,
                    null,
                    { lid: overlap.lid, skipProfilePhoto: true },
                    deps,
                );
                mergedCount++;
            } catch {
                // Continue best-effort overlap cleanup
            }
        }

        if (missingLidContacts.length === 0) {
            lastFullSyncAt.set(orgId, Date.now());
            return {
                checkedCount: 0,
                matchedCount: 0,
                updatedCount: 0,
                mergedCount,
            };
        }

        const byPhone = new Map<string, { row: any; phone: string }>();
        for (const item of missingLidContacts) {
            if (!byPhone.has(item.phone)) {
                byPhone.set(item.phone, { row: item.row, phone: item.phone });
            }
        }

        const uniqueJids = Array.from(byPhone.keys()).map((p) => `${p}@s.whatsapp.net`);
        const mappings: BatchLidMappingInput[] = [];
        let checkedCount = 0;
        let matchedCount = 0;

        for (let i = 0; i < uniqueJids.length; i += chunkSize) {
            if (!sock?.user?.id || typeof sock.onWhatsApp !== 'function') break;
            const batchJids = uniqueJids.slice(i, i + chunkSize);
            checkedCount += batchJids.length;

            try {
                const results = await sock.onWhatsApp(...batchJids);
                if (Array.isArray(results)) {
                    for (const res of results) {
                        const resPhone = derivePhoneForStorage(res?.jid);
                        const resLid = normalizeLidForStorage(res?.lid);
                        if (!resPhone || !resLid) continue;

                        const entry = byPhone.get(resPhone);
                        if (!entry) continue;

                        matchedCount++;
                        directory.record({
                            waId: entry.row.wa_id || resPhone,
                            lid: resLid,
                            name: entry.row.custom_name || entry.row.name || null,
                            preferIncomingName:
                                Boolean(entry.row.custom_name) ||
                                entry.row.save_source === 'manual' ||
                                Boolean(entry.row.saved_at),
                        });
                        mappings.push({
                            contactId: entry.row.id,
                            waId: entry.row.wa_id || resPhone,
                            customFields: entry.row.custom_fields,
                            lid: resLid,
                        });
                    }
                }
            } catch (err: any) {
                console.warn('[Baileys LID Sync] onWhatsApp batch failed:', err?.message || err);
            }

            if (i + chunkSize < uniqueJids.length) {
                await new Promise((r) => setTimeout(r, 120));
            }
        }

        const persisted = await batchPersistContactLids(
            orgId,
            waAccountId,
            mappings,
            existingLidWaIds,
            deps,
        );

        lastFullSyncAt.set(orgId, Date.now());
        return {
            checkedCount,
            matchedCount,
            updatedCount: persisted.updatedCount,
            mergedCount: mergedCount + persisted.mergedCount,
        };
    })().finally(() => {
        if (fullSyncInFlight.get(orgId) === task) {
            fullSyncInFlight.delete(orgId);
        }
    });

    fullSyncInFlight.set(orgId, task);
    return task;
}

export async function resolveLidsForPhoneWaIds(params: {
    sock: any;
    orgId: string;
    waAccountId?: string | null;
    phoneWaIds: string[];
    directory: BaileysContactDirectory;
    deps?: ContactsServiceDeps;
}): Promise<{ matchedCount: number; updatedCount: number; mergedCount: number }> {
    const { sock, orgId, waAccountId, phoneWaIds, directory, deps } = params;
    if (
        !orgId ||
        !sock?.user?.id ||
        typeof sock.onWhatsApp !== 'function' ||
        !Array.isArray(phoneWaIds) ||
        phoneWaIds.length === 0
    ) {
        return { matchedCount: 0, updatedCount: 0, mergedCount: 0 };
    }

    const supabaseClient = deps?.supabaseClient || defaultSupabase;
    const cleanPhones = Array.from(
        new Set(
            phoneWaIds
                .map((p) => derivePhoneForStorage(p))
                .filter((p): p is string => Boolean(p) && !directory.lookupLid(p)),
        ),
    );
    if (cleanPhones.length === 0) {
        return { matchedCount: 0, updatedCount: 0, mergedCount: 0 };
    }

    // Fetch existing @lid rows so any match triggers an immediate merge.
    const { data: lidRows } = await supabaseClient
        .from('w_contacts')
        .select('wa_id')
        .eq('organization_id', orgId)
        .like('wa_id', '%@lid');

    const existingLidWaIds = new Set<string>();
    for (const r of lidRows || []) {
        const norm = normalizeLidForStorage(r?.wa_id);
        if (norm) existingLidWaIds.add(norm);
    }

    // Fetch target DB contact rows for those phone wa_ids.
    const { data: phoneRows } = await supabaseClient
        .from('w_contacts')
        .select('id,wa_id,phone,name,custom_name,custom_fields,save_source,saved_at')
        .eq('organization_id', orgId)
        .in('wa_id', cleanPhones);

    const rowByPhone = new Map<string, any>();
    for (const r of phoneRows || []) {
        const ph = derivePhoneForStorage(r?.wa_id) || derivePhoneForStorage(r?.phone);
        if (ph) rowByPhone.set(ph, r);
    }

    const mappings: BatchLidMappingInput[] = [];
    let matchedCount = 0;

    for (let i = 0; i < cleanPhones.length; i += 100) {
        if (!sock?.user?.id) break;
        const batchPhones = cleanPhones.slice(i, i + 100);
        const batchJids = batchPhones.map((p) => `${p}@s.whatsapp.net`);
        try {
            const results = await sock.onWhatsApp(...batchJids);
            if (Array.isArray(results)) {
                for (const res of results) {
                    const resPhone = derivePhoneForStorage(res?.jid);
                    const resLid = normalizeLidForStorage(res?.lid);
                    if (!resPhone || !resLid) continue;

                    matchedCount++;
                    const row = rowByPhone.get(resPhone);
                    directory.record({
                        waId: row?.wa_id || resPhone,
                        lid: resLid,
                        name: row?.custom_name || row?.name || null,
                        preferIncomingName:
                            Boolean(row?.custom_name) ||
                            row?.save_source === 'manual' ||
                            Boolean(row?.saved_at),
                    });

                    if (row?.id) {
                        mappings.push({
                            contactId: row.id,
                            waId: row.wa_id,
                            customFields: row.custom_fields,
                            lid: resLid,
                        });
                    }
                }
            }
        } catch (err: any) {
            console.warn('[Baileys LID Lookup] onWhatsApp failed:', err?.message || err);
        }
    }

    const persisted = await batchPersistContactLids(
        orgId,
        waAccountId,
        mappings,
        existingLidWaIds,
        deps,
    );

    return {
        matchedCount,
        updatedCount: persisted.updatedCount,
        mergedCount: persisted.mergedCount,
    };
}
