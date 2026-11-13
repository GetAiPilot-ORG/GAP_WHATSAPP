import { supabase as defaultSupabase } from '../config/supabase.js';
import { io as defaultIo } from '../socket.js';
import { derivePhoneForStorage, normalizeIndianPhoneKey } from '../utils/format.js';
import { getCachedProfilePhotoUrl as defaultGetCachedProfilePhotoUrl } from './whatsapp.service.js';

export interface ContactsServiceDeps {
    supabaseClient?: any;
    ioClient?: { to: (room: string) => { emit: (event: string, payload: any) => void } } | null;
    getProfilePhotoUrlFn?: (waId: string | null | undefined) => Promise<string | null>;
}

export interface UpsertContactOptions {
    lid?: string | null;
    preferIncomingName?: boolean;
    skipProfilePhoto?: boolean;
}

export interface BatchLidMappingInput {
    contactId: string;
    waId: string;
    customFields?: Record<string, any> | null;
    lid: string;
}

const CONTACT_SELECT =
    "id,name,custom_name,phone,wa_id,wa_key,wa_account_id,created_at,tags,custom_fields,saved_at,saved_by_user_id,save_source,contact_type";

const orgContactLocks = new Map<string, Promise<any>>();

async function withOrgContactLock<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    const key = orgId || "__default__";
    const previous = orgContactLocks.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(fn);
    orgContactLocks.set(key, current);
    try {
        return await current;
    } finally {
        if (orgContactLocks.get(key) === current) {
            orgContactLocks.delete(key);
        }
    }
}

export function normalizeJidWithoutDevice(value: string | null | undefined): string {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const atIdx = raw.indexOf("@");
    if (atIdx === -1) return raw.replace(/:\d+$/, "");
    const left = raw.slice(0, atIdx).split(":")[0];
    const domain = raw.slice(atIdx + 1).toLowerCase();
    if (!left || !domain) return raw;
    return `${left}@${domain}`;
}

export function isLidWaId(value: string | null | undefined): boolean {
    const normalized = normalizeJidWithoutDevice(value);
    return normalized.endsWith("@lid");
}

export function normalizeLidForStorage(value: string | null | undefined): string | null {
    const normalized = normalizeJidWithoutDevice(value);
    if (!normalized) return null;
    const atIdx = normalized.indexOf("@");
    if (atIdx === -1) return null;
    const left = normalized.slice(0, atIdx).replace(/\D+/g, "");
    const domain = normalized.slice(atIdx + 1).toLowerCase();
    if (domain !== "lid" || !left) return null;
    return `${left}@lid`;
}

export function normalizeContactWaIdForStorage(
    value: string | null | undefined,
): string {
    const normalized = normalizeJidWithoutDevice(value);
    if (!normalized) return "";
    if (normalized.endsWith("@s.whatsapp.net") || normalized.endsWith("@c.us")) {
        return normalized.split("@")[0];
    }
    return normalized;
}

export function sanitizeContactDisplayName(
    name: string | null | undefined,
    waId: string,
    extraIds: Array<string | null | undefined> = [],
): string | null {
    const raw = String(name || "").trim();
    if (!raw) return null;

    if (raw.includes("@")) return null;
    if (/^\d+$/.test(raw)) return null;
    // Reject formatted phone numbers such as "+44 7767 747899", "(555) 123-4567", "+91-91742-22385"
    if (/\d/.test(raw) && /^\+?[\d\s().-]+$/.test(raw)) return null;

    const normalizedWa = normalizeJidWithoutDevice(waId);
    const waLeft = normalizedWa.split("@")[0];
    if (waLeft && (raw === waId || raw === normalizedWa || raw === waLeft)) return null;

    for (const extra of extraIds) {
        if (!extra) continue;
        const normExtra = normalizeJidWithoutDevice(extra);
        const extraLeft = normExtra.split("@")[0];
        if (raw === extra || raw === normExtra || (extraLeft && raw === extraLeft)) {
            return null;
        }
    }

    return raw;
}

export function isInvalidStoredContactName(name: any, waId: string): boolean {
    const raw = String(name || "").trim();
    if (!raw) return true;
    if (raw.includes("@")) return true;
    if (/^\d+$/.test(raw)) return true;
    if (/\d/.test(raw) && /^\+?[\d\s().-]+$/.test(raw)) return true;
    if (/^(?:Channel|Group)\s+[\d-]+$/i.test(raw)) return true;
    const normalizedWa = normalizeJidWithoutDevice(waId);
    const waLeft = normalizedWa.split("@")[0];
    if (waLeft && (raw === waId || raw === normalizedWa || raw === waLeft)) return true;
    return false;
}

export function extractBaileysContactNameWithSource(
    c: any,
    waId: string,
    extraIds: Array<string | null | undefined> = [],
): { name: string | null; preferIncomingName: boolean } {
    const savedCandidates = [c?.name, c?.fullName, c?.firstName];
    for (const candidate of savedCandidates) {
        if (typeof candidate !== "string") continue;
        const safe = sanitizeContactDisplayName(candidate, waId, extraIds);
        if (safe) return { name: safe, preferIncomingName: true };
    }

    if (typeof c?.subject === "string") {
        const safe = sanitizeContactDisplayName(c.subject, waId, extraIds);
        if (safe) return { name: safe, preferIncomingName: true };
    }

    const pushOrBizCandidates = [c?.verifiedName, c?.verifiedBizName, c?.notify];
    for (const candidate of pushOrBizCandidates) {
        if (typeof candidate !== "string") continue;
        const safe = sanitizeContactDisplayName(candidate, waId, extraIds);
        if (safe) return { name: safe, preferIncomingName: false };
    }

    return { name: null, preferIncomingName: false };
}

export function pickBestBaileysContactName(
    c: any,
    waId: string,
    extraIds: Array<string | null | undefined> = [],
): string | null {
    return extractBaileysContactNameWithSource(c, waId, extraIds).name;
}

function getClientDeps(deps?: ContactsServiceDeps) {
    return {
        supabaseClient: deps?.supabaseClient || defaultSupabase,
        ioClient: deps && "ioClient" in deps ? deps.ioClient : defaultIo,
        getProfilePhotoUrlFn: deps?.getProfilePhotoUrlFn || defaultGetCachedProfilePhotoUrl,
    };
}

function emitContactUpdated(
    ioClient: any,
    organizationId: string,
    payload: Record<string, any>,
) {
    try {
        ioClient?.to?.(`org:${organizationId}`)?.emit?.("contact_updated", payload);
    } catch {
        // Ignore socket emission failures in background/test contexts
    }
}

function scoreContactCandidate(row: any): number {
    const nonLid = !isLidWaId(row?.wa_id) ? 10000 : 0;
    const customName = row?.custom_name ? 1000 : 0;
    const saved = row?.saved_at || (row?.save_source && row.save_source !== "auto") ? 300 : 0;
    const validName = !isInvalidStoredContactName(row?.name, row?.wa_id || "") ? 50 : 0;
    const hasPhone = row?.phone ? 10 : 0;
    return nonLid + customName + saved + validName + hasPhone;
}

function pickCanonicalContact(rows: any[]): any | null {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => {
        const scoreDiff = scoreContactCandidate(b) - scoreContactCandidate(a);
        if (scoreDiff !== 0) return scoreDiff;
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
    });
    return sorted[0] || null;
}

async function bestEffortTableUpdate(
    supabaseClient: any,
    table: string,
    updates: Record<string, any>,
    matchColumn: string,
    matchValue: string,
) {
    try {
        await supabaseClient.from(table).update(updates).eq(matchColumn, matchValue);
    } catch {
        // Ignore optional/legacy tables or transient non-blocking constraint issues
    }
}

async function bestEffortTableDelete(
    supabaseClient: any,
    table: string,
    matchColumn: string,
    matchValue: string,
) {
    try {
        await supabaseClient.from(table).delete().eq(matchColumn, matchValue);
    } catch {
        // Ignore optional tables
    }
}

async function mergeConversationsIntoTarget(
    supabaseClient: any,
    organizationId: string,
    canonicalId: string,
    duplicate: any,
): Promise<Array<{ from_conversation_id: string; to_conversation_id: string }>> {
    const mergedConversations: Array<{ from_conversation_id: string; to_conversation_id: string }> = [];

    const { data: dupConvs, error: dupConvErr } = await supabaseClient
        .from("w_conversations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("contact_id", duplicate.id);

    if (dupConvErr || !Array.isArray(dupConvs) || dupConvs.length === 0) {
        return mergedConversations;
    }

    const { data: canonicalConvs } = await supabaseClient
        .from("w_conversations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("contact_id", canonicalId);

    const byAccount = new Map<string, any>();
    for (const conv of canonicalConvs || []) {
        byAccount.set(conv.wa_account_id || "__null__", conv);
    }

    for (const dupConv of dupConvs) {
        const accountKey = dupConv.wa_account_id || "__null__";
        let targetConv = byAccount.get(accountKey) || null;
        if (!targetConv && !dupConv.wa_account_id && Array.isArray(canonicalConvs) && canonicalConvs.length === 1) {
            targetConv = canonicalConvs[0];
        }

        if (!targetConv) {
            await supabaseClient
                .from("w_conversations")
                .update({ contact_id: canonicalId })
                .eq("id", dupConv.id);

            await bestEffortTableUpdate(
                supabaseClient,
                "w_messages",
                { contact_id: canonicalId },
                "conversation_id",
                dupConv.id,
            );
            await bestEffortTableUpdate(
                supabaseClient,
                "w_flow_sessions",
                { contact_id: canonicalId },
                "conversation_id",
                dupConv.id,
            );
            await bestEffortTableUpdate(
                supabaseClient,
                "w_flow_runs",
                { contact_id: canonicalId },
                "conversation_id",
                dupConv.id,
            );

            byAccount.set(accountKey, { ...dupConv, contact_id: canonicalId });
            continue;
        }

        await bestEffortTableUpdate(
            supabaseClient,
            "w_messages",
            { conversation_id: targetConv.id, contact_id: canonicalId },
            "conversation_id",
            dupConv.id,
        );
        await bestEffortTableUpdate(
            supabaseClient,
            "w_conversation_notes",
            { conversation_id: targetConv.id },
            "conversation_id",
            dupConv.id,
        );
        await bestEffortTableUpdate(
            supabaseClient,
            "w_conversation_summaries",
            { conversation_id: targetConv.id },
            "conversation_id",
            dupConv.id,
        );
        await bestEffortTableUpdate(
            supabaseClient,
            "w_flow_sessions",
            { conversation_id: targetConv.id, contact_id: canonicalId },
            "conversation_id",
            dupConv.id,
        );
        await bestEffortTableUpdate(
            supabaseClient,
            "w_flow_runs",
            { conversation_id: targetConv.id, contact_id: canonicalId },
            "conversation_id",
            dupConv.id,
        );
        await bestEffortTableUpdate(
            supabaseClient,
            "w_message_usage_logs",
            { conversation_id: targetConv.id },
            "conversation_id",
            dupConv.id,
        );
        await bestEffortTableDelete(supabaseClient, "w_conversation_reads", "conversation_id", dupConv.id);

        const targetTime = targetConv.last_message_at ? new Date(targetConv.last_message_at).getTime() : 0;
        const dupTime = dupConv.last_message_at ? new Date(dupConv.last_message_at).getTime() : 0;
        const targetPatch: Record<string, any> = {};

        if (dupTime > targetTime) {
            targetPatch.last_message_at = dupConv.last_message_at;
            if (dupConv.last_message_preview) {
                targetPatch.last_message_preview = dupConv.last_message_preview;
            }
            if (dupConv.status === "open" && targetConv.status !== "open") {
                targetPatch.status = "open";
            }
        }
        const combinedUnread = Number(targetConv.unread_count || 0) + Number(dupConv.unread_count || 0);
        if (combinedUnread !== Number(targetConv.unread_count || 0)) {
            targetPatch.unread_count = combinedUnread;
        }
        if (!targetConv.assigned_agent_id && dupConv.assigned_agent_id) {
            targetPatch.assigned_agent_id = dupConv.assigned_agent_id;
        }
        if (!targetConv.assigned_to && dupConv.assigned_to) {
            targetPatch.assigned_to = dupConv.assigned_to;
        }
        if (Object.keys(targetPatch).length > 0) {
            await supabaseClient.from("w_conversations").update(targetPatch).eq("id", targetConv.id);
            targetConv = { ...targetConv, ...targetPatch };
            byAccount.set(accountKey, targetConv);
        }

        await supabaseClient.from("w_conversations").delete().eq("id", dupConv.id);
        mergedConversations.push({
            from_conversation_id: dupConv.id,
            to_conversation_id: targetConv.id,
        });
    }

    return mergedConversations;
}

export async function findContactByLidInDb(
    organization_id: string,
    lid: string,
    deps?: ContactsServiceDeps,
) {
    const normalizedLid = normalizeLidForStorage(lid);
    if (!organization_id || !normalizedLid) return null;
    const { supabaseClient } = getClientDeps(deps);

    const { data, error } = await supabaseClient
        .from("w_contacts")
        .select(CONTACT_SELECT)
        .eq("organization_id", organization_id)
        .or(`custom_fields->>lid.eq.${normalizedLid},wa_id.eq.${normalizedLid}`)
        .limit(5);

    if (error || !Array.isArray(data) || data.length === 0) return null;
    return pickCanonicalContact(data);
}

export async function upsertContact(
    organization_id: string,
    wa_account_id: string,
    wa_id: string,
    name?: string | null,
    options?: UpsertContactOptions,
    deps?: ContactsServiceDeps,
) {
    const { supabaseClient, ioClient, getProfilePhotoUrlFn } = getClientDeps(deps);

    const normalizedIncomingWaId = normalizeContactWaIdForStorage(wa_id) || String(wa_id || "").trim();
    const isGroup = normalizedIncomingWaId.includes("@g.us");
    const isChannel = normalizedIncomingWaId.includes("@newsletter");
    const incomingIsLid = isLidWaId(normalizedIncomingWaId);

    const normalizedLid =
        normalizeLidForStorage(options?.lid) ||
        (incomingIsLid ? normalizeLidForStorage(normalizedIncomingWaId) : null);

    const lookupWaId = incomingIsLid
        ? normalizedLid || normalizedIncomingWaId
        : normalizedIncomingWaId;

    const contact_type = isGroup ? "group" : isChannel ? "channel" : "individual";
    const wa_key =
        !isGroup && !isChannel && !incomingIsLid
            ? normalizeIndianPhoneKey(lookupWaId)
            : null;
    const maybePhone =
        !isGroup && !isChannel && !incomingIsLid
            ? wa_key || derivePhoneForStorage(lookupWaId)
            : null;

    // Fetch profile photo before acquiring short DB mutex lock so slow RPC doesn't stall DB ops.
    const profilePhotoUrl = options?.skipProfilePhoto
        ? null
        : await getProfilePhotoUrlFn(maybePhone || lookupWaId).catch(() => null);

    return withOrgContactLock(organization_id, async () => {
        const candidateById = new Map<string, any>();
        const addCandidates = (rows: any[] | null | undefined) => {
            if (!Array.isArray(rows)) return;
            for (const row of rows) {
                if (row?.id && !candidateById.has(row.id)) {
                    candidateById.set(row.id, row);
                }
            }
        };

        if (wa_key) {
            const { data, error } = await supabaseClient
                .from("w_contacts")
                .select(CONTACT_SELECT)
                .eq("organization_id", organization_id)
                .eq("wa_key", wa_key);
            if (!error) addCandidates(data);
        }

        if (lookupWaId) {
            const { data, error } = await supabaseClient
                .from("w_contacts")
                .select(CONTACT_SELECT)
                .eq("organization_id", organization_id)
                .eq("wa_id", lookupWaId)
                .limit(10);
            if (!error) addCandidates(data);
        }

        if (maybePhone && maybePhone !== lookupWaId) {
            const { data, error } = await supabaseClient
                .from("w_contacts")
                .select(CONTACT_SELECT)
                .eq("organization_id", organization_id)
                .eq("wa_id", maybePhone)
                .limit(10);
            if (!error) addCandidates(data);
        }

        if (normalizedLid) {
            const { data, error } = await supabaseClient
                .from("w_contacts")
                .select(CONTACT_SELECT)
                .eq("organization_id", organization_id)
                .or(`custom_fields->>lid.eq.${normalizedLid},wa_id.eq.${normalizedLid}`)
                .limit(10);
            if (!error) addCandidates(data);
        }

        const candidates = Array.from(candidateById.values());
        const existing = pickCanonicalContact(candidates);
        const nowIso = new Date().toISOString();

        const targetWaId =
            existing?.id && isLidWaId(existing.wa_id) && !incomingIsLid
                ? lookupWaId
                : existing?.wa_id || lookupWaId;

        const safeName = sanitizeContactDisplayName(name, targetWaId, [normalizedLid]);

        if (existing?.id) {
            const duplicatesToMerge = candidates.filter(
                (c) =>
                    c.id !== existing.id &&
                    (isLidWaId(c.wa_id) ||
                        (normalizedLid && c?.custom_fields?.lid === normalizedLid)),
            );

            const previousWaId =
                existing.wa_id && existing.wa_id !== targetWaId ? existing.wa_id : null;

            const updates: Record<string, any> = {
                last_active: nowIso,
            };

            if (previousWaId) updates.wa_id = targetWaId;
            if (wa_key && (!existing.wa_key || previousWaId)) updates.wa_key = wa_key;
            if (maybePhone && (!existing.phone || previousWaId)) updates.phone = maybePhone;

            const isManuallySaved =
                existing.save_source === "manual" || Boolean(existing.saved_at);
            const currentNameInvalid = isInvalidStoredContactName(
                existing.name,
                targetWaId,
            );

            if (safeName) {
                if (currentNameInvalid) {
                    updates.name = safeName;
                } else if (
                    options?.preferIncomingName &&
                    !isManuallySaved &&
                    safeName !== existing.name
                ) {
                    updates.name = safeName;
                }
            }

            let mergedCustomFields: Record<string, any> = {
                ...(existing.custom_fields && typeof existing.custom_fields === "object"
                    ? existing.custom_fields
                    : {}),
            };
            let customFieldsChanged = false;

            if (normalizedLid && mergedCustomFields.lid !== normalizedLid) {
                mergedCustomFields.lid = normalizedLid;
                customFieldsChanged = true;
            }
            if (profilePhotoUrl) {
                mergedCustomFields.profile_photo_url = profilePhotoUrl;
                mergedCustomFields.profile_photo_checked_at = nowIso;
                customFieldsChanged = true;
            }

            const mergedConversations: Array<{
                from_conversation_id: string;
                to_conversation_id: string;
            }> = [];
            const mergedFromIds: string[] = [];
            const mergedPreviousWaIds: string[] = [];

            if (duplicatesToMerge.length > 0) {
                let mergedTags: string[] = Array.isArray(existing.tags)
                    ? [...existing.tags]
                    : [];

                for (const dup of duplicatesToMerge) {
                    const convMerges = await mergeConversationsIntoTarget(
                        supabaseClient,
                        organization_id,
                        existing.id,
                        dup,
                    );
                    mergedConversations.push(...convMerges);

                    await bestEffortTableUpdate(
                        supabaseClient,
                        "w_messages",
                        { contact_id: existing.id },
                        "contact_id",
                        dup.id,
                    );
                    await bestEffortTableUpdate(
                        supabaseClient,
                        "w_flow_sessions",
                        { contact_id: existing.id },
                        "contact_id",
                        dup.id,
                    );
                    await bestEffortTableUpdate(
                        supabaseClient,
                        "w_flow_runs",
                        { contact_id: existing.id },
                        "contact_id",
                        dup.id,
                    );
                    await bestEffortTableUpdate(
                        supabaseClient,
                        "w_broadcast_recipients",
                        { contact_id: existing.id },
                        "contact_id",
                        dup.id,
                    );

                    if (dup.custom_fields && typeof dup.custom_fields === "object") {
                        mergedCustomFields = {
                            ...dup.custom_fields,
                            ...mergedCustomFields,
                            ...(normalizedLid ? { lid: normalizedLid } : {}),
                        };
                        customFieldsChanged = true;
                    }

                    if (!existing.custom_name && !updates.custom_name && dup.custom_name) {
                        updates.custom_name = dup.custom_name;
                    }

                    if (
                        !updates.name &&
                        currentNameInvalid &&
                        dup.name &&
                        !isInvalidStoredContactName(dup.name, targetWaId)
                    ) {
                        const fallbackName = sanitizeContactDisplayName(dup.name, targetWaId, [
                            normalizedLid,
                            dup.wa_id,
                        ]);
                        if (fallbackName) updates.name = fallbackName;
                    }

                    if (Array.isArray(dup.tags) && dup.tags.length > 0) {
                        mergedTags = Array.from(new Set([...mergedTags, ...dup.tags]));
                    }

                    if (!existing.saved_at && !updates.saved_at && dup.saved_at) {
                        updates.saved_at = dup.saved_at;
                        updates.saved_by_user_id = dup.saved_by_user_id || null;
                        updates.save_source = dup.save_source || "manual";
                    }

                    await supabaseClient
                        .from("w_contacts")
                        .delete()
                        .eq("id", dup.id)
                        .eq("organization_id", organization_id);

                    mergedFromIds.push(dup.id);
                    if (dup.wa_id) mergedPreviousWaIds.push(dup.wa_id);
                }

                if (mergedTags.length > (Array.isArray(existing.tags) ? existing.tags.length : 0)) {
                    updates.tags = mergedTags;
                }
            }

            if (customFieldsChanged) {
                updates.custom_fields = mergedCustomFields;
            }

            const { data: updated, error: updErr } = await supabaseClient
                .from("w_contacts")
                .update(updates)
                .eq("id", existing.id)
                .select()
                .single();
            if (updErr) throw updErr;

            if (wa_key && (safeName || maybePhone)) {
                const propagate: any = { last_active: nowIso };
                if (safeName) propagate.name = safeName;
                if (maybePhone) propagate.phone = maybePhone;

                await supabaseClient
                    .from("w_contacts")
                    .update(propagate)
                    .eq("organization_id", organization_id)
                    .eq("wa_key", wa_key)
                    .or('name.is.null,name.eq.""');

                if (maybePhone) {
                    await supabaseClient
                        .from("w_contacts")
                        .update({ phone: maybePhone })
                        .eq("organization_id", organization_id)
                        .eq("wa_key", wa_key)
                        .is("phone", null);
                }
            }

            emitContactUpdated(ioClient, organization_id, {
                contact: updated,
                ...(previousWaId ? { previous_wa_id: previousWaId } : {}),
                ...(mergedFromIds.length > 0
                    ? {
                          merged_from_contact_id: mergedFromIds[0],
                          merged_from_contact_ids: mergedFromIds,
                          previous_wa_id: mergedPreviousWaIds[0] || previousWaId,
                          previous_wa_ids: mergedPreviousWaIds,
                          merged_conversations: mergedConversations,
                      }
                    : {}),
            });
            return updated;
        }

        const insertPayload: any = {
            organization_id,
            wa_account_id: wa_account_id || null,
            wa_id: targetWaId,
            name: safeName || null,
            last_active: nowIso,
            wa_key: wa_key || null,
            phone: maybePhone,
            contact_type,
            save_source: "auto",
        };

        const initialCustomFields: Record<string, any> = {};
        if (normalizedLid) initialCustomFields.lid = normalizedLid;
        if (profilePhotoUrl) {
            initialCustomFields.profile_photo_url = profilePhotoUrl;
            initialCustomFields.profile_photo_checked_at = nowIso;
        }
        if (Object.keys(initialCustomFields).length > 0) {
            insertPayload.custom_fields = initialCustomFields;
        }

        const { data: inserted, error: insErr } = await supabaseClient
            .from("w_contacts")
            .upsert(insertPayload, {
                onConflict: "organization_id,wa_id",
                ignoreDuplicates: false,
            })
            .select()
            .single();

        if (insErr) throw insErr;
        emitContactUpdated(ioClient, organization_id, { contact: inserted });
        return inserted;
    });
}

export async function batchPersistContactLids(
    organization_id: string,
    wa_account_id: string | null | undefined,
    mappings: BatchLidMappingInput[],
    existingLidWaIds: Set<string> = new Set(),
    deps?: ContactsServiceDeps,
): Promise<{ updatedCount: number; mergedCount: number }> {
    if (!organization_id || !Array.isArray(mappings) || mappings.length === 0) {
        return { updatedCount: 0, mergedCount: 0 };
    }

    const { supabaseClient } = getClientDeps(deps);
    let updatedCount = 0;
    let mergedCount = 0;

    // Count how many phone contacts claim each normalized LID so any collision also runs full reconciliation.
    const lidCounts = new Map<string, number>();
    const normalizedItems: Array<BatchLidMappingInput & { normalizedLid: string }> = [];
    for (const item of mappings) {
        const normalizedLid = normalizeLidForStorage(item.lid);
        if (!normalizedLid || !item.contactId || !item.waId) continue;
        lidCounts.set(normalizedLid, (lidCounts.get(normalizedLid) || 0) + 1);
        normalizedItems.push({ ...item, normalizedLid });
    }

    const needsMerge = normalizedItems.filter(
        (item) => existingLidWaIds.has(item.normalizedLid) || (lidCounts.get(item.normalizedLid) || 0) > 1,
    );
    const directPatch = normalizedItems.filter(
        (item) => !existingLidWaIds.has(item.normalizedLid) && (lidCounts.get(item.normalizedLid) || 0) <= 1,
    );

    const CONCURRENCY = 10;
    for (let i = 0; i < directPatch.length; i += CONCURRENCY) {
        const slice = directPatch.slice(i, i + CONCURRENCY);
        await Promise.all(
            slice.map(async (item) => {
                if (item.customFields?.lid === item.normalizedLid) return;
                try {
                    const nextCustomFields = {
                        ...(item.customFields && typeof item.customFields === "object"
                            ? item.customFields
                            : {}),
                        lid: item.normalizedLid,
                    };
                    const { error } = await supabaseClient
                        .from("w_contacts")
                        .update({ custom_fields: nextCustomFields })
                        .eq("id", item.contactId)
                        .eq("organization_id", organization_id);
                    if (!error) updatedCount++;
                } catch {
                    // Best-effort batch update
                }
            }),
        );
    }

    for (const item of needsMerge) {
        try {
            await upsertContact(
                organization_id,
                wa_account_id || "",
                item.waId,
                null,
                { lid: item.normalizedLid, skipProfilePhoto: true },
                deps,
            );
            mergedCount++;
        } catch {
            // Continue reconciling remaining contacts
        }
    }

    return { updatedCount, mergedCount };
}
