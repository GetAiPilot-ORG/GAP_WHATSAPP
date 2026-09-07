import { supabase, SUPABASE_URL } from "../config/supabase.js";

type WhatsAppContact = {
    id: string;
    organization_id: string;
    name?: string | null;
    custom_name?: string | null;
    phone?: string | null;
    wa_id?: string | null;
    wa_key?: string | null;
    tags?: string[] | null;
    custom_fields?: Record<string, any> | null;
};

const TARGET_PLATFORMS = ["crm", "voice", "social"];

function getSyncFunctionUrl() {
    return (
        process.env.HUB_ECOSYSTEM_SYNC_FUNCTION_URL ||
        `${SUPABASE_URL}/functions/v1/ecosystem-contact-sync`
    );
}

function getSyncSecret() {
    return process.env.ECOSYSTEM_SYNC_SECRET || "";
}

async function getOrganizationOwnerUserId(organizationId: string) {
    const override = process.env.HUB_OWNER_USER_ID || process.env.ECOSYSTEM_HUB_USER_ID;
    if (override) return override;

    const { data, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .in("role", ["owner", "admin"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data?.user_id || null;
}

function contactDisplayName(contact: WhatsAppContact) {
    return (
        String(contact.custom_name || "").trim() ||
        String(contact.name || "").trim() ||
        String(contact.phone || contact.wa_key || contact.wa_id || "WhatsApp Contact").trim()
    );
}

export async function syncWhatsAppContactToEcosystem(contact: WhatsAppContact) {
    const secret = getSyncSecret();
    const functionUrl = getSyncFunctionUrl();

    if (!secret || !functionUrl || !contact?.id || !contact.organization_id) return null;

    const userId = await getOrganizationOwnerUserId(contact.organization_id);
    if (!userId) {
        console.warn(`[ecosystem-sync] No owner found for WhatsApp org ${contact.organization_id}`);
        return null;
    }

    const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-ecosystem-sync-secret": secret,
        },
        body: JSON.stringify({
            action: "upsert_contact",
            user_id: userId,
            source_platform: "whatsapp",
            external_contact_id: contact.id,
            external_workspace_id: contact.organization_id,
            contact: {
                full_name: contactDisplayName(contact),
                phone: contact.phone || contact.wa_key || contact.wa_id || null,
                email: contact.custom_fields?.email || null,
                company: contact.custom_fields?.company || null,
                tags: ["whatsapp", ...(Array.isArray(contact.tags) ? contact.tags : [])],
                metadata: {
                    wa_id: contact.wa_id,
                    wa_key: contact.wa_key,
                    custom_fields: contact.custom_fields || {},
                },
            },
            target_platforms: TARGET_PLATFORMS,
        }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
        throw new Error(result?.error || result?.message || `Hub ecosystem sync failed with ${response.status}`);
    }

    const canonicalContactId = result?.contact?.id || null;
    if (canonicalContactId) {
        await supabase
            .from("w_contacts")
            .update({
                canonical_contact_id: canonicalContactId,
                ecosystem_synced_at: new Date().toISOString(),
                ecosystem_sync_source: "hub",
                ecosystem_sync_status: "synced",
            })
            .eq("id", contact.id)
            .eq("organization_id", contact.organization_id);
    }

    return result;
}

export function syncWhatsAppContactToEcosystemSoon(contact: WhatsAppContact) {
    syncWhatsAppContactToEcosystem(contact).catch((error) => {
        console.error("[ecosystem-sync] WhatsApp contact sync failed:", error.message || error);
        if (contact?.id && contact?.organization_id) {
            supabase
                .from("w_contacts")
                .update({
                    ecosystem_synced_at: new Date().toISOString(),
                    ecosystem_sync_status: "failed",
                })
                .eq("id", contact.id)
                .eq("organization_id", contact.organization_id)
                .then(() => undefined);
        }
    });
}
