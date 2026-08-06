import { Request, Response } from "express";
import fs from "fs";
import { supabase } from "../config/supabase.js";
import { io } from "../socket.js";
import { encryptToken, decryptToken } from "../utils/crypto.js";
import { AccountHealthService } from "../services/accountHealth.service.js";
import { cleanText, cleanNullableText, isValidEmail } from "../utils/format.js";
import {
  enrichTemplateExamplesWithRealisticSamples,
  validateWhatsappTemplatePayload,
  TemplateValidationIssue,
} from "../utils/whatsapp.js";
import { enforceWhatsAppCloudNumberLimit } from "../services/billing.service.js";
import {
  inspectMetaTokenPermissions,
  toSafeWhatsappAccount,
  getMetaAccountDiagnostics,
  getOrgWhatsappAccount,
  fetchMetaBusinessProfile,
  uploadMetaProfilePicture,
  updateMetaBusinessProfile,
} from '../services/meta.service.js';
import { buildMetaTemplatePayload } from '../utils/templateBuilder.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || process.env.META_API_VERSION || "v21.0";

// In-memory registry of recently deleted templates (orgId::name -> expiry timestamp)
// Prevents deleted templates from being re-inserted on the next Meta sync
// when Meta API still returns them for a brief window after deletion
const recentlyDeletedTemplates = new Map<string, number>();
const RECENTLY_DELETED_TTL_MS = 30_000; // 30 seconds

function markTemplateDeleted(orgId: string, name: string) {
  const key = `${orgId}::${String(name).toLowerCase()}`;
  recentlyDeletedTemplates.set(key, Date.now() + RECENTLY_DELETED_TTL_MS);
  // Cleanup expired entries
  for (const [k, expiry] of recentlyDeletedTemplates) {
    if (Date.now() > expiry) recentlyDeletedTemplates.delete(k);
  }
}

function isTemplateRecentlyDeleted(orgId: string, name: string): boolean {
  const key = `${orgId}::${String(name).toLowerCase()}`;
  const expiry = recentlyDeletedTemplates.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    recentlyDeletedTemplates.delete(key);
    return false;
  }
  return true;
}

export async function getNumberRequests(req: any, res: Response) {
  const orgId = req.organization_id;

  try {
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const { data, error } = await supabase
      .from("whatsapp_number_requests")
      .select(
        "id, business_name, country, preferred_region, use_case, expected_monthly_messages, contact_name, contact_email, contact_phone, status, admin_notes, created_at, updated_at",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ requests: data || [] });
  } catch (err: any) {
    console.error("[whatsapp/number-requests] List error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to load number requests" });
  }
}

export async function createNumberRequest(req: any, res: Response) {
  const orgId = req.organization_id;
  const userId = req.user?.id || null;

  try {
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const businessName = cleanText(req.body?.business_name, 160);
    const country = cleanText(req.body?.country || "India", 80);
    const preferredRegion = cleanNullableText(req.body?.preferred_region, 120);
    const useCase = cleanText(req.body?.use_case, 800);
    const contactName = cleanNullableText(req.body?.contact_name, 120);
    const contactEmail = cleanNullableText(req.body?.contact_email, 160);
    const contactPhone = cleanNullableText(req.body?.contact_phone, 40);
    const expectedMonthlyMessagesRaw = req.body?.expected_monthly_messages;
    const expectedMonthlyMessages =
      expectedMonthlyMessagesRaw === "" ||
        expectedMonthlyMessagesRaw === null ||
        expectedMonthlyMessagesRaw === undefined
        ? null
        : Number(expectedMonthlyMessagesRaw);

    const errors: string[] = [];
    if (!businessName) errors.push("Business name is required.");
    if (!country) errors.push("Country is required.");
    if (!useCase || useCase.length < 20)
      errors.push(
        "Use case must explain the business requirement in at least 20 characters.",
      );
    if (contactEmail && !isValidEmail(contactEmail))
      errors.push("Contact email is invalid.");
    if (
      expectedMonthlyMessages !== null &&
      (!Number.isInteger(expectedMonthlyMessages) ||
        expectedMonthlyMessages < 0)
    ) {
      errors.push("Expected monthly messages must be a positive whole number.");
    }
    if (!contactEmail && !contactPhone)
      errors.push("Provide at least one contact email or phone number.");

    if (errors.length)
      return res.status(400).json({ error: errors[0], errors });

    const { data, error } = await supabase
      .from("whatsapp_number_requests")
      .insert({
        organization_id: orgId,
        user_id: userId,
        business_name: businessName,
        country,
        preferred_region: preferredRegion,
        use_case: useCase,
        expected_monthly_messages: expectedMonthlyMessages,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        status: "requested",
        metadata: {
          source: "self_serve_app",
          official_onboarding_model: "assisted_request",
        },
      })
      .select(
        "id, business_name, country, preferred_region, use_case, expected_monthly_messages, contact_name, contact_email, contact_phone, status, admin_notes, created_at, updated_at",
      )
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, request: data });
  } catch (err: any) {
    console.error("[whatsapp/number-requests] Create error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to submit number request" });
  }
}

export async function getAccounts(req: any, res: Response) {
  const orgId = req.organization_id;

  try {
    if (!orgId) throw new Error("No organization found");

    const { data, error } = await supabase
      .from("w_wa_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "disconnected")
      .order("created_at", { ascending: false });

    if (error) throw error;
    const safeData = (data || []).map((acc: any) => toSafeWhatsappAccount(acc));
    res.json(safeData);
  } catch (err: any) {
    console.error("Error fetching accounts:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getAccountMessagingLimits(req: any, res: Response) {
  const orgId = req.organization_id;

  try {
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const account = await getOrgWhatsappAccount(req.params.id, orgId);
    if (!account.phone_number_id || !account.access_token_encrypted) {
      return res.status(400).json({ error: "This account is not connected through Meta Cloud API" });
    }

    const token = decryptToken(account.access_token_encrypted);
    const fields = "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status";
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(account.phone_number_id)}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data: any = await response.json();

    if (!response.ok || data.error) {
      return res.status(response.status || 502).json({
        error: data.error?.message || "Meta could not load messaging limits",
      });
    }

    res.json({
      messaging_limit_tier: data.messaging_limit_tier || null,
      quality_rating: data.quality_rating || null,
      code_verification_status: data.code_verification_status || null,
      verified_name: data.verified_name || null,
      display_phone_number: data.display_phone_number || null,
      fetched_at: new Date().toISOString(),
      source: "meta_live",
    });
  } catch (err: any) {
    console.error("[whatsapp/messaging-limits] Error:", err);
    res.status(/not found/i.test(err.message) ? 404 : 500).json({
      error: err.message || "Failed to load messaging limits",
    });
  }
}

export async function addMetaAccount(req: any, res: Response) {
  const { phone_number_id, waba_id, access_token, display_phone_number, name } =
    req.body;
  const orgId = req.organization_id;

  if (!phone_number_id || !access_token) {
    return res
      .status(400)
      .json({ error: "phone_number_id and access_token are required" });
  }

  try {
    if (!orgId)
      throw new Error(
        "No organization found. Make sure your Supabase is configured correctly.",
      );

    const verifyUrl = `https://graph.facebook.com/v21.0/${String(phone_number_id).trim()}?fields=id,display_phone_number,verified_name&access_token=${String(access_token).trim()}`;
    const verifyRes = await fetch(verifyUrl);
    const verifyData: any = await verifyRes.json();
    if (verifyData.error) {
      return res
        .status(400)
        .json({ error: `Meta API error: ${verifyData.error.message}` });
    }

    const tokenInspection = await inspectMetaTokenPermissions(
      String(access_token).trim(),
    );
    if (tokenInspection.checked && tokenInspection.missingScopes.length > 0) {
      return res.status(400).json({
        error: `This Meta token can access the phone number but cannot be used for sending. Missing permission(s): ${tokenInspection.missingScopes.join(", ")}. Generate a System User token with whatsapp_business_messaging and whatsapp_business_management.`,
      });
    }
    if (tokenInspection.error) {
      console.warn(
        "[whatsapp/accounts/meta] Could not inspect Meta token permissions:",
        tokenInspection.error,
      );
    }

    const resolvedDisplayPhone =
      verifyData.display_phone_number || display_phone_number || null;
    const resolvedName =
      verifyData.verified_name || name || "WhatsApp Business API";
    const normalizedPhoneNumberId = String(phone_number_id).trim();

    await enforceWhatsAppCloudNumberLimit(orgId, normalizedPhoneNumberId);

    const { data, error } = await supabase
      .from("w_wa_accounts")
      .upsert(
        {
          organization_id: orgId,
          phone_number_id: normalizedPhoneNumberId,
          whatsapp_business_account_id: waba_id ? String(waba_id).trim() : null,
          access_token_encrypted: encryptToken(String(access_token).trim()),
          display_phone_number: resolvedDisplayPhone,
          name: resolvedName,
          status: "connected",
        },
        { onConflict: "phone_number_id" },
      )
      .select("*")
      .single();

    if (error) {
      console.error("Supabase upsert error:", error);
      throw new Error(error.message);
    }
    res.json({ success: true, account: toSafeWhatsappAccount(data) });
  } catch (err: any) {
    console.error("Error saving Meta account:", err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.message, limit: err.limit });
  }
}

export async function deleteAccount(req: any, res: Response) {
  const { id } = req.params;
  const orgId = req.organization_id;
  try {
    await AccountHealthService.updateHealth(id, {
      connection_status: 'DISCONNECTED',
      token_status: 'MISSING',
    });

    const { error } = await supabase
      .from("w_wa_accounts")
      .update({ status: "disconnected", connection_status: "DISCONNECTED", access_token_encrypted: null })
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAccountDiagnostics(req: any, res: Response) {
  const { id } = req.params;
  const orgId = req.organization_id;

  try {
    const { data: account, error } = await supabase
      .from("w_wa_accounts")
      .select(
        "id, organization_id, phone_number_id, whatsapp_business_account_id, access_token_encrypted, display_phone_number, name, status, connection_status, health_version",
      )
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) throw error;
    if (!account?.id)
      return res.status(404).json({ error: "WhatsApp account not found" });

    const diag = await getMetaAccountDiagnostics(account);

    // Persist health updates asynchronously via AccountHealthService with exact Meta Graph API values
    const tokenStatus = diag.reconnect_required || diag.issue_codes?.includes('token_expired')
      ? 'EXPIRED'
      : (diag.issue_codes?.includes('token_missing') ? 'MISSING' : 'VALID');

    const bizStatus = diag.business_verification?.status
      ? String(diag.business_verification.status).toUpperCase()
      : 'UNKNOWN';

    const qualityRating = diag.phone_number_access?.quality_rating
      ? String(diag.phone_number_access.quality_rating).toUpperCase()
      : 'UNKNOWN';

    await AccountHealthService.updateHealth(account.id, {
      connection_status: tokenStatus === 'EXPIRED' ? 'TOKEN_INVALID' : 'CONNECTED',
      token_status: tokenStatus,
      business_verification_status: bizStatus as any,
      business_name: diag.business_verification?.business_name || null,
      business_id: diag.business_verification?.business_id || null,
      quality_rating: qualityRating as any,
      diagnostics_json: diag,
    }).catch(err => console.error('[Diagnostics] Failed to persist health update:', err.message));

    res.json(diag);
  } catch (err: any) {
    console.error("WhatsApp account diagnostics error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to inspect WhatsApp account" });
  }
}

export async function getBusinessProfile(req: any, res: Response) {
  const orgId = req.organization_id;
  const { id } = req.params;

  try {
    const account = await getOrgWhatsappAccount(id, orgId);
    if (!account?.id)
      return res.status(404).json({ error: "WhatsApp account not found" });

    const { access_token_encrypted, ...safeAccount } = account;
    let profile: any = {};
    let profileError: string | null = null;

    try {
      profile = await fetchMetaBusinessProfile(account);
    } catch (err: any) {
      profileError = err.message || "Failed to fetch profile from Meta";
    }

    res.json({
      account: safeAccount,
      profile,
      profile_error: profileError,
    });
  } catch (err: any) {
    console.error("Business profile fetch error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to fetch business profile" });
  }
}

export async function updateBusinessProfile(req: any, res: Response) {
  const orgId = req.organization_id;
  const { id } = req.params;

  try {
    const account = await getOrgWhatsappAccount(id, orgId);
    if (!account?.id)
      return res.status(404).json({ error: "WhatsApp account not found" });

    const token = account.access_token_encrypted
      ? decryptToken(account.access_token_encrypted)
      : "";
    if (!token)
      return res
        .status(400)
        .json({ error: "Selected account is missing a Meta access token" });

    const localName = String(req.body.local_name || "").trim();
    if (localName && localName !== account.name) {
      const { error: nameErr } = await supabase
        .from("w_wa_accounts")
        .update({ name: localName })
        .eq("id", id)
        .eq("organization_id", orgId);
      if (nameErr) throw nameErr;
    }

    let profilePictureHandle: string | null = null;
    if (req.file) {
      if (
        !["image/jpeg", "image/png"].includes(String(req.file.mimetype || ""))
      ) {
        return res
          .status(400)
          .json({
            error:
              "Profile picture must be a JPG or PNG image. WEBP is not accepted by Meta for WhatsApp profile pictures.",
          });
      }
      profilePictureHandle = await uploadMetaProfilePicture(req.file, token);
    }

    await updateMetaBusinessProfile(account, req.body, profilePictureHandle);

    const refreshedAccount = await getOrgWhatsappAccount(id, orgId);
    const profile = await fetchMetaBusinessProfile(refreshedAccount);
    const { access_token_encrypted, ...safeAccount } = refreshedAccount;

    res.json({
      success: true,
      account: safeAccount,
      profile,
    });
  } catch (err: any) {
    console.error("Business profile update error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to update business profile" });
  }
}

export function normalizeMetaTemplateStatus(status: any) {
  const value = String(status || "PENDING").toUpperCase();
  if (
    value.includes("APPROVED") ||
    value === "ACTIVE" ||
    value === "ACTIVE - QUALITY PENDING"
  )
    return "APPROVED";
  if (value.includes("REJECT")) return "REJECTED";
  if (value.includes("PAUSE")) return "PAUSED";
  if (value.includes("DISABLE")) return "DISABLED";
  if (value.includes("PENDING") || value.includes("IN_APPEAL"))
    return "PENDING";
  return value;
}

function mergeTemplateRows(metaRows: any[], localRows: any[]) {
  const byKey = new Map<string, any>();
  for (const row of localRows || []) {
    const key = `${String(row.name || "").toLowerCase()}::${String(row.language || "en_US")}`;
    byKey.set(key, {
      id: row.template_id || row.id,
      local_id: row.id,
      name: row.name,
      language: row.language,
      category: row.category,
      status: normalizeMetaTemplateStatus(row.status),
      quality_score: row.quality_score,
      rejected_reason: row.rejection_reason,
      components: row.components || row.normalized_payload?.components || [],
      validation_issues: row.validation_issues || [],
      risk_score: row.risk_score || 0,
      submitted_at: row.submitted_at,
      approved_at: row.approved_at,
      rejected_at: row.rejected_at,
      last_synced_at: row.last_synced_at,
      last_updated: row.updated_at,
      source: "local",
    });
  }
  for (const row of metaRows || []) {
    const key = `${String(row.name || "").toLowerCase()}::${String(row.language || "en_US")}`;
    const local = byKey.get(key) || {};
    byKey.set(key, {
      ...local,
      ...row,
      id: row.id || local.id,
      status: normalizeMetaTemplateStatus(row.status),
      quality_score: row.quality_score || row.quality || local.quality_score,
      rejected_reason:
        row.rejected_reason || row.reason || local.rejected_reason,
      source: local.local_id ? "meta+local" : "meta",
    });
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
}

export function findStaleMetaTemplateIds(metaRows: any[], localRows: any[]) {
  const metaKeys = new Set(
    metaRows.map(
      (row) =>
        `${String(row.name || "").trim().toLowerCase()}::${String(row.language || "en_US").trim().toLowerCase()}`,
    ),
  );

  return localRows
    .filter((row) => {
      const key = `${String(row.name || "").trim().toLowerCase()}::${String(row.language || "en_US").trim().toLowerCase()}`;
      return row.template_id && row.status !== "DRAFT" && !metaKeys.has(key);
    })
    .map((row) => row.id);
}

export async function upsertLocalTemplateSubmission(params: {
  organization_id: string;
  wa_account_id?: string | null;
  waba_id?: string | null;
  template_id?: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  quality_score?: string | null;
  rejection_reason?: string | null;
  components?: any[];
  normalized_payload?: any;
  validation_issues?: TemplateValidationIssue[];
  risk_score?: number;
  meta_response?: any;
  submitted_by?: string | null;
  submitted_at?: string | null;
}) {
  const status = normalizeMetaTemplateStatus(params.status);
  const now = new Date().toISOString();

  // Fetch existing submission if it exists, to preserve timestamps
  const { data: existing } = await supabase
    .from("w_template_submissions")
    .select("status, submitted_at, approved_at, rejected_at")
    .eq("organization_id", params.organization_id)
    .eq("name", params.name)
    .eq("language", params.language || "en_US")
    .maybeSingle();

  let submitted_at = params.submitted_at || existing?.submitted_at || null;
  if (status === "PENDING" && (!submitted_at || existing?.status !== "PENDING")) {
    submitted_at = now;
  }

  let approved_at = existing?.approved_at || null;
  if (status === "APPROVED" && (!approved_at || existing?.status !== "APPROVED")) {
    approved_at = now;
  }

  let rejected_at = existing?.rejected_at || null;
  if (status === "REJECTED" && (!rejected_at || existing?.status !== "REJECTED")) {
    rejected_at = now;
  }

  const payload: any = {
    organization_id: params.organization_id,
    wa_account_id: params.wa_account_id || null,
    waba_id: params.waba_id || null,
    template_id: params.template_id || null,
    name: params.name,
    language: params.language || "en_US",
    category: String(params.category || "MARKETING").toUpperCase(),
    status,
    quality_score: params.quality_score || null,
    rejection_reason: params.rejection_reason || null,
    components:
      params.components || params.normalized_payload?.components || [],
    normalized_payload: params.normalized_payload || {},
    validation_issues: params.validation_issues || [],
    risk_score: Number(params.risk_score || 0),
    meta_response: params.meta_response || {},
    submitted_by: params.submitted_by || null,
    submitted_at,
    approved_at,
    rejected_at,
    last_synced_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("w_template_submissions")
    .upsert(payload, {
      onConflict: "organization_id,wa_account_id,name,language",
    });
  if (error)
    console.warn("[Templates] Local cache upsert failed:", error.message);
}

export async function bulkUpsertLocalTemplateSubmissions(
  orgId: string,
  waAccountId: string,
  wabaId: string,
  metaTemplates: any[]
) {
  const now = new Date().toISOString();

  // Filter out templates that were recently deleted to prevent them from being re-inserted
  // when Meta API still returns them briefly after a deletion request
  const filteredMetaTemplates = (metaTemplates || []).filter(
    (t: any) => !isTemplateRecentlyDeleted(orgId, t.name)
  );
  // Fetch existing records for this account, including the primary key ID
  const { data: existingRows } = await supabase
    .from('w_template_submissions')
    .select('id, template_id, name, language, status, submitted_at, approved_at, rejected_at, submitted_by')
    .eq('organization_id', orgId)
    .eq('wa_account_id', waAccountId);

  const existingMap = new Map<string, any>();
  for (const r of existingRows || []) {
    const key = `${String(r.name).toLowerCase()}::${String(r.language || 'en_US')}`;
    existingMap.set(key, r);
  }

  // Identify and delete local templates that no longer exist in Meta (ignoring DRAFTs)
  const metaKeys = new Set((filteredMetaTemplates).map((t: any) => `${String(t.name).trim().toLowerCase()}::${String(t.language || 'en_US').trim().toLowerCase()}`))
  const metaIds = new Set((filteredMetaTemplates).map((t: any) => String(t.id || '').trim()).filter(Boolean));
  const toDeleteIds = (existingRows || [])
    .filter((r: any) => {
      if (r.status === 'DRAFT') return false;
      const key = `${String(r.name).trim().toLowerCase()}::${String(r.language || 'en_US').trim().toLowerCase()}`;
      const templateId = String(r.template_id || '').trim();
      return (templateId ? !metaIds.has(templateId) : true) && !metaKeys.has(key);
    })
    .map((r: any) => r.id);

  if (toDeleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from('w_template_submissions')
      .delete()
      .in('id', toDeleteIds);
    if (delErr) {
      console.warn('[Templates] Local cache delete of removed templates failed:', delErr.message);
    } else {
      console.log(`[Templates] Deleted ${toDeleteIds.length} obsolete templates from local cache.`);
    }
  }

  // If there are no templates returned from Meta, we are done
  if (!filteredMetaTemplates || filteredMetaTemplates.length === 0) return;

  const payloads = filteredMetaTemplates.map((template: any) => {
    const status = normalizeMetaTemplateStatus(template.status);
    const key = `${String(template.name).toLowerCase()}::${String(template.language || 'en_US')}`;
    const existing = existingMap.get(key);

    let submitted_at = existing?.submitted_at || null;
    if (status === 'PENDING' && (!submitted_at || existing?.status !== 'PENDING')) {
      submitted_at = now;
    }

    let approved_at = existing?.approved_at || null;
    if (status === 'APPROVED' && (!approved_at || existing?.status !== 'APPROVED')) {
      approved_at = now;
    }

    let rejected_at = existing?.rejected_at || null;
    if (status === 'REJECTED' && (!rejected_at || existing?.status !== 'REJECTED')) {
      rejected_at = now;
    }

    return {
      organization_id: orgId,
      wa_account_id: waAccountId,
      waba_id: wabaId,
      template_id: template.id || null,
      name: template.name,
      language: template.language || 'en_US',
      category: String(template.category || 'MARKETING').toUpperCase(),
      status,
      quality_score: template.quality_score || null,
      rejection_reason: template.rejected_reason || template.reason || null,
      components: template.components || [],
      normalized_payload: template,
      validation_issues: [],
      risk_score: 0,
      meta_response: template,
      submitted_by: existing?.submitted_by || null,
      submitted_at,
      approved_at,
      rejected_at,
      last_synced_at: now,
      updated_at: now,
    };
  });

  const { error } = await supabase
    .from('w_template_submissions')
    .upsert(payloads, { onConflict: 'organization_id,wa_account_id,name,language' });
  if (error) console.warn('[Templates] Local cache bulk upsert failed:', error.message);
}

export async function getTemplates(req: any, res: Response) {
  const orgId = req.organization_id;

  try {
    if (!orgId) throw new Error("No organization found");

    const { data: accounts } = await supabase
      .from("w_wa_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "disconnected")
      .not("whatsapp_business_account_id", "is", null)
      .order("created_at", { ascending: false });

    if (!accounts || accounts.length === 0) {
      return res.json([]);
    }

    const account = accounts.find((a: any) => Boolean(decryptToken(a.access_token_encrypted))) || accounts[0];
    const token = decryptToken(account.access_token_encrypted);
    if (!token) {
      return res.status(400).json({ error: "No valid Meta access token found. Please click Connect Meta to link your WhatsApp account." });
    }

    const waba_id = account.whatsapp_business_account_id;

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/message_templates?fields=id,name,language,status,category,components,quality_score,rejected_reason&limit=250`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await response.json();

    if (!response.ok) {
      console.error('Meta API Error:', json);
      return res.status(response.status).json({ error: json.error?.message || 'Failed to fetch templates from Meta' });
    }
    const metaTemplates = json.data || [];
    // Filter out recently deleted templates before syncing and merging
    const activeMetaTemplates = metaTemplates.filter((t: any) => !isTemplateRecentlyDeleted(orgId, t.name));
    await bulkUpsertLocalTemplateSubmissions(orgId, account.id, waba_id, activeMetaTemplates);

    const { data: localRows, error: localErr } = await supabase
      .from('w_template_submissions')
      .select('*')
      .eq('organization_id', orgId)
      .eq('wa_account_id', account.id);
    if (localErr) console.warn('[Templates] Local cache read failed:', localErr.message);

    res.json(mergeTemplateRows(activeMetaTemplates, localRows || []));
  } catch (err: any) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getTemplateContext(req: any, res: Response) {
  const orgId = req.organization_id;
  try {
    if (!orgId) return res.status(400).json({ error: 'No organization found' });
    const { data: accounts } = await supabase
      .from('w_wa_accounts')
      .select('id, phone_number_id, display_phone_number, whatsapp_business_account_id, access_token_encrypted, status')
      .eq('organization_id', orgId)
      .neq('status', 'disconnected')
      .not('whatsapp_business_account_id', 'is', null)
      .order('created_at', { ascending: false });

    const account = accounts?.find((a: any) => Boolean(decryptToken(a.access_token_encrypted))) || accounts?.[0];
    if (!account) return res.status(400).json({ error: 'No connected Meta account found' });

    const token = decryptToken(account.access_token_encrypted);
    if (!token) return res.status(400).json({ error: 'No valid Meta access token found. Please click Connect Meta to link your account.' });
    const headers = { Authorization: `Bearer ${token}` };
    const base = `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.whatsapp_business_account_id}`;
    const [catalogResponse, flowResponse] = await Promise.all([
      fetch(`${base}/product_catalogs?fields=id,name&limit=100`, { headers }),
      fetch(`${base}/flows?fields=id,name,status,categories,validation_errors,json_version&limit=100`, { headers }),
    ]);
    const [catalogJson, flowJson] = await Promise.all([
      catalogResponse.json().catch(() => ({})),
      flowResponse.json().catch(() => ({})),
    ]);
    const catalogs = catalogResponse.ok ? (catalogJson.data || []) : [];
    const publishedFlows = flowResponse.ok
      ? (flowJson.data || []).filter((flow: any) => String(flow.status).toUpperCase() === 'PUBLISHED')
      : [];
    const flows = await Promise.all(publishedFlows.map(async (flow: any) => {
      try {
        const assetsResponse = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${flow.id}/assets`, { headers });
        const assetsJson: any = await assetsResponse.json();
        const flowAsset = assetsJson.data?.find((asset: any) => asset.asset_type === 'FLOW_JSON' || asset.name === 'flow.json');
        if (!assetsResponse.ok || !flowAsset?.download_url) return { ...flow, screens: [] };
        const definitionResponse = await fetch(flowAsset.download_url, { headers });
        const definition: any = await definitionResponse.json();
        return {
          ...flow,
          screens: Array.isArray(definition.screens)
            ? definition.screens.map((screen: any) => ({ id: screen.id, title: screen.title || screen.id }))
            : [],
        };
      } catch {
        return { ...flow, screens: [] };
      }
    }));
    const callingEnabled = process.env.META_WHATSAPP_CALLING_ENABLED === 'true';

    res.json({
      account: {
        id: account.id,
        waba_id: account.whatsapp_business_account_id,
        phone_number_id: account.phone_number_id,
        display_phone_number: account.display_phone_number,
      },
      catalogs,
      flows,
      capabilities: {
        DEFAULT: { enabled: true },
        AUTHENTICATION: { enabled: true },
        CATALOG: { enabled: catalogs.length > 0, reason: catalogs.length ? null : 'Connect a Meta commerce catalog to this WhatsApp account first.' },
        FLOW: { enabled: flows.length > 0, reason: flows.length ? null : 'Publish a Meta WhatsApp Flow before creating this template.' },
        CALL_PERMISSION_REQUEST: {
          enabled: callingEnabled,
          reason: callingEnabled ? null : 'WhatsApp Calling eligibility has not been enabled for this business number.',
        },
      },
      discovery_warnings: [
        ...(!catalogResponse.ok ? ['Meta catalog discovery is unavailable for this account.'] : []),
        ...(!flowResponse.ok ? ['Meta Flow discovery is unavailable for this account.'] : []),
      ],
    });
  } catch (err: any) {
    console.error('[Templates] Context error:', err);
    res.status(500).json({ error: err.message || 'Failed to load template setup data' });
  }
}

export async function validateTemplate(req: any, res: Response) {
  try {
    const result = req.body?.template_type
      ? buildMetaTemplatePayload({
          name: req.body.name,
          category: req.body.category,
          language: req.body.language,
          templateType: req.body.template_type,
          components: req.body.components,
          typeConfig: req.body.type_config,
        })
      : validateWhatsappTemplatePayload(req.body || {});
    res.json(result);
  } catch (err: any) {
    console.error("Validate Template Error:", err);
    res
      .status(500)
      .json({ error: err.message || "Template validation failed" });
  }
}

export async function createTemplate(req: any, res: Response) {
  const orgId = req.organization_id;
  const { name, category, language, components } = req.body;
  const templateType = String(req.body.template_type || 'DEFAULT').toUpperCase();
  const file = req.file;

  try {
    if (!orgId) throw new Error("No organization found");

    const { data: accounts } = await supabase
      .from("w_wa_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "disconnected")
      .not("whatsapp_business_account_id", "is", null)
      .order("created_at", { ascending: false });

    if (!accounts || accounts.length === 0) {
      return res.status(400).json({ error: 'No connected Meta account found' });
    }

    const account = accounts[0];
    const token = decryptToken(account.access_token_encrypted);
    const waba_id = account.whatsapp_business_account_id;

    let parsedComponents = [];
    let typeConfig: Record<string, any> = {};
    try {
      parsedComponents = JSON.parse(components || '[]');
      typeConfig = req.body.type_config ? JSON.parse(req.body.type_config) : {};
    } catch (e) {
      return res.status(400).json({ error: 'Invalid template components or type configuration.' });
    }

    // Enrich template variables with realistic sample values before Meta validation.
    parsedComponents = enrichTemplateExamplesWithRealisticSamples(parsedComponents);

    if (file) {
      const headerFormat = parsedComponents.find((component: any) => component?.type === 'HEADER')?.format;
      const mediaRules: Record<string, { max: number; types: RegExp }> = {
        IMAGE: { max: 5 * 1024 * 1024, types: /^image\/(jpeg|png)$/ },
        VIDEO: { max: 16 * 1024 * 1024, types: /^video\/mp4$/ },
        DOCUMENT: { max: 100 * 1024 * 1024, types: /^(application\/pdf|application\/msword|application\/vnd\.|application\/octet-stream)/ },
      };
      const rule = mediaRules[headerFormat];
      if (!rule || file.size > rule.max || !rule.types.test(file.mimetype)) {
        return res.status(400).json({ error: 'Uploaded header file type or size is not supported by Meta.' });
      }
      const appId = process.env.META_APP_ID;
      if (!appId) throw new Error('META_APP_ID is not configured. Cannot upload media for templates.');

      const initUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads`);
      initUrl.searchParams.set('file_length', String(file.size));
      initUrl.searchParams.set('file_type', file.mimetype);
      initUrl.searchParams.set('access_token', token);

      const initRes = await fetch(initUrl, { method: 'POST' });
      const initJson = await initRes.json();
      if (!initRes.ok) throw new Error(initJson.error?.message || 'Upload initialization failed');

      const uploadSessionId = initJson.id;

      const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${uploadSessionId}`, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: '0',
          'Content-Type': file.mimetype || 'application/octet-stream'
        },
        body: file.buffer as any
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error?.message || 'File upload failed');

      const handle = uploadJson.h;

      const headerObj = parsedComponents.find((c: any) => c.type === 'HEADER');
      if (headerObj && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerObj.format)) {
        headerObj.example = { header_handle: [handle] };
      }
    }

    const built = buildMetaTemplatePayload({
      name,
      category: String(category || '').toUpperCase(),
      language,
      templateType,
      components: parsedComponents,
      typeConfig: {
        ...typeConfig,
        calling_enabled: process.env.META_WHATSAPP_CALLING_ENABLED === 'true',
      },
    });
    if (!built.canSubmit) {
      return res.status(400).json({
        error: 'Template has approval-risk issues. Fix the highlighted fields before submitting to Meta.',
        validation: built,
      });
    }
    if (templateType === 'CATALOG' || templateType === 'FLOW') {
      const assetUrl = templateType === 'CATALOG'
        ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/product_catalogs?fields=id&limit=100`
        : `https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/flows?fields=id,status&limit=100`;
      const assetResponse = await fetch(assetUrl, { headers: { Authorization: `Bearer ${token}` } });
      const assetJson: any = await assetResponse.json().catch(() => ({}));
      const requestedId = String(templateType === 'CATALOG' ? typeConfig.catalog_id : typeConfig.flow_id);
      const asset = assetJson.data?.find((item: any) => String(item.id) === requestedId);
      const valid = assetResponse.ok && asset && (templateType !== 'FLOW' || String(asset.status).toUpperCase() === 'PUBLISHED');
      if (!valid) {
        return res.status(400).json({
          error: templateType === 'CATALOG'
            ? 'The selected catalog is not connected to this WhatsApp account.'
            : 'The selected Meta Flow is not published for this WhatsApp account.',
        });
      }
    }
    const validation = templateType === 'AUTHENTICATION'
      ? { normalized: built.payload, issues: built.issues, riskScore: 0 }
      : validateWhatsappTemplatePayload(built.payload);

    const existingRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/message_templates?name=${encodeURIComponent(built.payload.name)}&fields=id,name,language,status&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const existingJson = await existingRes.json().catch(() => ({}));
    if (existingRes.ok && Array.isArray(existingJson.data) && existingJson.data.some((tpl: any) => tpl.name === built.payload.name && tpl.language === built.payload.language)) {
      return res.status(409).json({
        error: `Template "${built.payload.name}" already exists for ${built.payload.language}. Use a new template name before submitting.`,
        code: 'DUPLICATE_TEMPLATE_NAME',
        suggested_name: `${built.payload.name}_${Date.now().toString().slice(-6)}`,
      });
    }

    const metaPayload = built.payload;

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metaPayload)
    });
    const json = await response.json();

    if (!response.ok) {
      const errMsg = json.error?.error_user_msg || json.error?.message || 'Template creation failed';
      const errSubcode = json.error?.error_subcode || json.error?.code || null;
      const errData = json.error?.error_data || null;
      await upsertLocalTemplateSubmission({
        organization_id: orgId,
        wa_account_id: account.id,
        waba_id,
        name: validation.normalized.name,
        language: validation.normalized.language,
        category: validation.normalized.category,
        status: 'REJECTED',
        rejection_reason: errMsg,
        components: validation.normalized.components,
        normalized_payload: validation.normalized,
        validation_issues: validation.issues,
        risk_score: validation.riskScore,
        meta_response: json,
        submitted_by: req.user?.id || null,
      });
      return res.status(response.status).json({
        error: errMsg,
        code: /already exists|duplicate/i.test(errMsg) ? 'DUPLICATE_TEMPLATE_NAME' : 'META_TEMPLATE_CREATE_FAILED',
        suggested_name: /already exists|duplicate/i.test(errMsg) ? `${validation.normalized.name}_${Date.now().toString().slice(-6)}` : undefined,
        error_subcode: errSubcode,
        error_data: errData,
        validation,
        meta_error: json.error
      });
    }
    await upsertLocalTemplateSubmission({
      organization_id: orgId,
      wa_account_id: account.id,
      waba_id,
      template_id: json.id || json.data?.id || null,
      name: validation.normalized.name,
      language: validation.normalized.language,
      category: validation.normalized.category,
      status: json.status || 'PENDING',
      components: validation.normalized.components,
      normalized_payload: validation.normalized,
      validation_issues: validation.issues,
      risk_score: validation.riskScore,
      meta_response: json,
      submitted_by: req.user?.id || null,
      submitted_at: new Date().toISOString(),
    });
    res.json({ success: true, data: json });
  } catch (err: any) {
    console.error('Create Template Error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function deleteTemplate(req: any, res: Response) {
  const orgId = req.organization_id;
  const name = String(req.params.name || "").trim();

  try {
    if (!orgId) throw new Error("No organization found");

    const { data: accounts } = await supabase
      .from("w_wa_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "disconnected")
      .not("whatsapp_business_account_id", "is", null)
      .order("created_at", { ascending: false });

    if (!accounts || accounts.length === 0) {
      return res.status(400).json({ error: "No connected Meta account found" });
    }

    const account = accounts[0];
    const token = decryptToken(account.access_token_encrypted);
    const waba_id = account.whatsapp_business_account_id;

    // 1. Fetch local template first to check if it's a pure local DRAFT (never sent to Meta)
    const { data: localTemplate } = await supabase
      .from("w_template_submissions")
      .select("template_id, status")
      .eq("organization_id", orgId)
      .eq("wa_account_id", account.id)
      .ilike("name", name)
      .maybeSingle();

    // Only skip Meta API if the template is explicitly a DRAFT (never submitted to Meta)
    // If localTemplate is missing or has no template_id, we still attempt Meta deletion by name
    // because the template may exist on Meta even if our local cache doesn't have the ID
    const isLocalOnlyDraft = localTemplate?.status === 'DRAFT' && !localTemplate?.template_id;
    if (isLocalOnlyDraft) {
      // Pure local draft — clean up local cache only, Meta was never contacted
      await supabase
        .from("w_template_submissions")
        .delete()
        .eq("organization_id", orgId)
        .eq("wa_account_id", account.id)
        .ilike("name", name);
      markTemplateDeleted(orgId, name);
      return res.json({ success: true });
    }

    // Meta deletes by name across languages unless an hsm_id is explicitly supplied.
    // Use name-only deletion here so every language variant stays in sync with Meta.
    const deleteUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/message_templates?name=${encodeURIComponent(name)}`;

    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await response.json();

    if (!response.ok) {
      const errMsg = json.error?.message || "Template deletion failed";
      const errCode = json.error?.code;

      // Check if the error indicates that the template was already deleted or doesn't exist on Meta
      const errDetails = json.error?.error_data?.details || "";
      const isNotFound =
        errCode === 100 &&
        (errMsg.includes("does not exist") ||
          errMsg.includes("not found") ||
          errMsg.includes("unknown") ||
          errMsg.includes("matching") ||
          errMsg.includes("cannot find") ||
          errMsg.includes("parameter") ||
          errDetails.includes("does not exist") ||
          errDetails.includes("not found") ||
          errDetails.includes("unknown") ||
          errDetails.includes("cannot find"));

      if (isNotFound) {
        // If not found on Meta, delete the local cache record anyway so the UI stays in sync
        await supabase
          .from("w_template_submissions")
          .delete()
          .eq("organization_id", orgId)
          .eq("wa_account_id", account.id)
          .ilike("name", name);

        // Mark as recently deleted so the next sync doesn't re-insert it
        markTemplateDeleted(orgId, name);
        return res.json({ success: true });
      }

      let userFriendlyMsg = errMsg;
      if (
        errMsg.includes("permission") ||
        errMsg.includes("access") ||
        errCode === 200 ||
        errCode === 10
      ) {
        userFriendlyMsg =
          "Permission denied by Meta. Your connected account needs WhatsApp Business Management admin access to delete templates. You can delete it directly from Meta Business Manager.";
      }
      return res.status(response.status).json({ error: userFriendlyMsg });
    }

    // Delete local cache record
    const deleteQuery = supabase
      .from("w_template_submissions")
      .delete()
      .eq("organization_id", orgId)
      .eq("wa_account_id", account.id)
      .ilike("name", name);
    await deleteQuery;

    // Mark template as recently deleted so the next sync doesn't re-insert it
    markTemplateDeleted(orgId, name);

    try {
      io?.emit("template_deleted", {
        organization_id: orgId,
        wa_account_id: account.id,
        name,
        template_id: localTemplate?.template_id || null,
      });
    } catch (emitErr) {
      console.warn("[Templates] Failed to emit template_deleted event:", emitErr);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete Template Error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getTemplateLibrary(req: any, res: Response) {
  const orgId = req.organization_id;

  try {
    if (!orgId) throw new Error("No organization found");

    const { data: accounts } = await supabase
      .from("w_wa_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "disconnected")
      .not("whatsapp_business_account_id", "is", null)
      .order("created_at", { ascending: false });

    if (!accounts || accounts.length === 0) {
      return res.status(400).json({ error: "No connected Meta account found" });
    }

    const account = accounts[0];
    const token = decryptToken(account.access_token_encrypted);

    const allowedParams = ["search", "topic", "usecase", "industry", "language", "name", "limit", "after", "before"];
    const queryParams = new URLSearchParams();

    for (const key of allowedParams) {
      if (req.query[key]) {
        queryParams.set(key, String(req.query[key]));
      }
    }

    if (!queryParams.has("limit")) {
      queryParams.set("limit", "250");
    }

    if (!queryParams.has("fields")) {
      queryParams.set("fields", "name,category,language,status,components,format,text,body,content,template,message_send_ttl_seconds");
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/message_template_library?${queryParams.toString()}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await response.json();
    try { fs.writeFileSync("debug_library_output.json", JSON.stringify(json, null, 2)); } catch(e) {}

    if (json.data && json.data.length > 0) {
      console.log("META API DEBUG: First template components:", JSON.stringify(json.data[0].components, null, 2));
    }

    if (!response.ok) {
      console.error("Meta Template Library API Error:", json);
      return res
        .status(response.status)
        .json({ error: json.error?.message || "Failed to fetch template library from Meta" });
    }

    res.json({ success: true, data: json.data || [], paging: json.paging });
  } catch (err: any) {
    console.error("Error fetching template library:", err);
    res.status(500).json({ error: err.message });
  }
}
