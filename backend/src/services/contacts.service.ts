import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { derivePhoneForStorage, normalizeIndianPhoneKey } from '../utils/format.js';
import { getCachedProfilePhotoUrl } from './whatsapp.service.js';

export function sanitizeContactDisplayName(
    name: string | null | undefined,
    waId: string,
): string | null {
    const raw = String(name || "").trim();
    if (!raw) return null;

    if (/^\d+$/.test(raw)) return null;

    if (raw.includes("@")) return null;

    const waLeft = String(waId || "").split("@")[0];
    if (!waLeft) return raw;
    if (raw === waId || raw === waLeft) return null;

    return raw;
}

export function isInvalidStoredContactName(name: any, waId: string): boolean {
    const raw = String(name || "").trim();
    if (!raw) return true;
    if (raw.includes("@")) return true;
    if (/^\d+$/.test(raw)) return true;
    const waLeft = String(waId || "").split("@")[0];
    if (waLeft && (raw === waId || raw === waLeft)) return true;
    return false;
}

export function normalizeContactWaIdForStorage(
    value: string | null | undefined,
): string {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.endsWith("@s.whatsapp.net")) return raw.split("@")[0];
    return raw;
}

export function pickBestBaileysContactName(c: any, waId: string): string | null {
    const candidate =
        (typeof c?.name === "string" && c.name.trim() ? c.name.trim() : null) ||
        (typeof c?.notify === "string" && c.notify.trim()
            ? c.notify.trim()
            : null) ||
        (typeof c?.verifiedName === "string" && c.verifiedName.trim()
            ? c.verifiedName.trim()
            : null) ||
        null;

    return sanitizeContactDisplayName(candidate, waId);
}

export async function upsertContact(
    organization_id: string,
    wa_account_id: string,
    wa_id: string,
    name?: string | null,
) {
    const wa_key = normalizeIndianPhoneKey(wa_id);
    const safeName = sanitizeContactDisplayName(name, wa_id);

    const isGroup = String(wa_id || "").includes("@g.us");
    const isChannel = String(wa_id || "").includes("@newsletter");
    const contact_type = isGroup ? "group" : isChannel ? "channel" : "individual";

    let candidates: any[] = [];
    if (wa_key) {
        const { data, error } = await supabase
            .from("w_contacts")
            .select(
                "id,name,custom_name,phone,wa_id,wa_key,created_at,custom_fields,saved_at,saved_by_user_id,save_source",
            )
            .eq("organization_id", organization_id)
            .eq("wa_key", wa_key);
        if (!error && data) {
            candidates = Array.isArray(data) ? data : [];
        }
    }

    if (!candidates.length) {
        const { data, error } = await supabase
            .from("w_contacts")
            .select(
                "id,name,custom_name,phone,wa_id,wa_key,created_at,custom_fields,saved_at,saved_by_user_id,save_source",
            )
            .eq("organization_id", organization_id)
            .eq("wa_id", wa_id)
            .limit(10);
        if (!error && data) {
            candidates = Array.isArray(data) ? data : [];
        }
    }

    const pickBest = (rows: any[]) => {
        const scored = (rows || []).map((r) => {
            const score =
                (r?.custom_name ? 100 : 0) + (r?.name ? 10 : 0) + (r?.phone ? 1 : 0);
            const createdAt = r?.created_at
                ? new Date(r.created_at).getTime()
                : Number.POSITIVE_INFINITY;
            return { r, score, createdAt };
        });
        scored.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
        return scored[0]?.r || null;
    };

    const existing = pickBest(candidates);
    const nowIso = new Date().toISOString();

    const maybePhone = wa_key ? wa_key : derivePhoneForStorage(wa_id);
    const profilePhotoUrl = await getCachedProfilePhotoUrl(maybePhone || wa_id);

    if (existing?.id) {
        const updates: any = {
            last_active: nowIso,
        };

        if (wa_key && !existing.wa_key) updates.wa_key = wa_key;
        if (!existing.phone && maybePhone) updates.phone = maybePhone;
        if (safeName && isInvalidStoredContactName(existing.name, wa_id))
            updates.name = safeName;
        if (profilePhotoUrl) {
            updates.custom_fields = {
                ...(existing.custom_fields && typeof existing.custom_fields === "object"
                    ? existing.custom_fields
                    : {}),
                profile_photo_url: profilePhotoUrl,
                profile_photo_checked_at: nowIso,
            };
        }

        const { data: updated, error: updErr } = await supabase
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

            await supabase
                .from("w_contacts")
                .update(propagate)
                .eq("organization_id", organization_id)
                .eq("wa_key", wa_key)
                .or('name.is.null,name.eq.""');

            if (maybePhone) {
                await supabase
                    .from("w_contacts")
                    .update({ phone: maybePhone })
                    .eq("organization_id", organization_id)
                    .eq("wa_key", wa_key)
                    .is("phone", null);
            }
        }

        io.to(`org:${organization_id}`).emit("contact_updated", {
            contact: updated,
        });
        return updated;
    }

    const insertPayload: any = {
        organization_id,
        wa_account_id,
        wa_id,
        name: safeName || null,
        last_active: nowIso,
        wa_key: wa_key || null,
        phone: maybePhone,
        contact_type,
        save_source: "auto",
    };

    if (profilePhotoUrl) {
        insertPayload.custom_fields = {
            profile_photo_url: profilePhotoUrl,
            profile_photo_checked_at: nowIso,
        };
    }

    const { data: inserted, error: insErr } = await supabase
        .from("w_contacts")
        .upsert(insertPayload, {
            onConflict: "organization_id,wa_id",
            ignoreDuplicates: false,
        })
        .select()
        .single();

    if (insErr) throw insErr;
    io.to(`org:${organization_id}`).emit("contact_updated", {
        contact: inserted,
    });
    return inserted;
}
