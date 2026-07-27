// verify-whatsapp-subscription/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_RANKS: Record<string, number> = {
  starter: 10,
  growth: 20,
  pro: 30,
  all_in_one: 40,
};

function normalizePlanId(planId: string | null | undefined): string {
  const value = String(planId || "").toLowerCase();
  if (value.includes("starter")) return "starter";
  if (value.includes("growth")) return "growth";
  if (value === "pro" || value.includes("pro") || value.includes("premium")) return "pro";
  if (value.includes("all_in_one") || value.includes("ultimate")) return "all_in_one";
  return value || "growth";
}

function getHighestRankedPlanId(...planIds: Array<string | null | undefined>): string | null {
  return planIds
    .map(normalizePlanId)
    .filter((planId) => !!planId && !!PLAN_RANKS[planId])
    .sort((a, b) => PLAN_RANKS[b] - PLAN_RANKS[a])[0] || null;
}

function getPlanName(planId: string): string {
  const plan = normalizePlanId(planId);
  if (plan === "starter") return "Starter";
  if (plan === "growth") return "Growth";
  if (plan === "pro") return "Pro";
  if (plan === "all_in_one") return "GAP Ultimate Ecosystem";
  return "Growth";
}

async function getOrganizationId(supabase: any, userId: string, authUser: any, noteOrganizationId: string | null): Promise<string | null> {
  if (noteOrganizationId) return noteOrganizationId;
  if (authUser?.user?.user_metadata?.organization_id) return authUser.user.user_metadata.organization_id;

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  return member?.organization_id || null;
}

async function scheduleDowngrade(params: {
  supabase: any;
  userId: string;
  organizationId: string | null;
  currentPlanId: string;
  targetPlanId: string;
  intervalMonths: number;
  periodEnd?: string | null;
}) {
  const { supabase, userId, organizationId, currentPlanId, targetPlanId, intervalMonths, periodEnd } = params;
  const nowIso = new Date().toISOString();
  const effectiveAt = toDate(periodEnd)?.toISOString() || addMonths(new Date(), intervalMonths).toISOString();
  const metadata = {
    from_plan_id: currentPlanId,
    to_plan_id: targetPlanId,
    requested_interval_months: intervalMonths,
    requested_at: nowIso,
    source: "payment_verification_guard",
  };

  await supabase
    .from("app_user_subscriptions")
    .update({
      status: "scheduled_downgrade",
      scheduled_plan_id: targetPlanId,
      scheduled_change_type: "downgrade",
      scheduled_effective_at: effectiveAt,
      scheduled_change_requested_at: nowIso,
      scheduled_change_metadata: metadata,
      updated_at: nowIso,
    })
    .eq("user_id", userId);

  if (organizationId) {
    await supabase
      .from("organizations")
      .update({
        scheduled_plan_id: targetPlanId,
        scheduled_change_type: "downgrade",
        scheduled_effective_at: effectiveAt,
        scheduled_change_requested_at: nowIso,
        scheduled_change_metadata: metadata,
        updated_at: nowIso,
      })
      .eq("id", organizationId);
  }

  return effectiveAt;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRazorpayCredentialPairs() {
  const mode = (Deno.env.get("RAZORPAY_MODE") || "live").toLowerCase();
  const pairs = [
    {
      label: "live",
      keyId: Deno.env.get("RAZORPAY_LIVE_KEY_ID"),
      keySecret: Deno.env.get("RAZORPAY_LIVE_KEY_SECRET"),
    },
    {
      label: "test",
      keyId: Deno.env.get("RAZORPAY_TEST_KEY_ID"),
      keySecret: Deno.env.get("RAZORPAY_TEST_KEY_SECRET"),
    },
    {
      label: "default",
      keyId: Deno.env.get("RAZORPAY_KEY_ID"),
      keySecret: Deno.env.get("RAZORPAY_KEY_SECRET"),
    },
  ].filter((pair) => pair.keyId && pair.keySecret);

  if (mode === "test") return pairs.sort((a, b) => Number(b.label === "test") - Number(a.label === "test"));
  if (mode === "live") return pairs.sort((a, b) => Number(b.label === "live") - Number(a.label === "live"));
  return pairs;
}

async function fetchRazorpayPaymentLink(paymentLinkId: string) {
  const credentialPairs = getRazorpayCredentialPairs();
  if (!credentialPairs.length) throw new Error("Razorpay is not configured");

  let lastError = "Failed to fetch Razorpay status";
  for (const pair of credentialPairs) {
    const auth = btoa(`${pair.keyId}:${pair.keySecret}`);
    const response = await fetch(
      `https://api.razorpay.com/v1/payment_links/${paymentLinkId}`,
      { headers: { "Authorization": `Basic ${auth}` } },
    );
    const data = await response.json();
    if (response.ok) return data;

    lastError = data.error?.description || data.error?.reason || lastError;
    const canTryNextPair = /auth/i.test(lastError) || /does not exist/i.test(lastError);
    if (!canTryNextPair) throw new Error(lastError);
    console.warn(`[verify-whatsapp-subscription] Razorpay ${pair.label} credentials could not read this link: ${lastError}`);
  }

  throw new Error(lastError);
}

async function activatePlan(params: {
  supabase: any;
  userId: string;
  organizationId: string | null;
  planId: string;
  planName: string;
  intervalMonths: number;
  planPricePaise: number;
  paymentLinkId: string;
  raw: Record<string, unknown>;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const { supabase, userId, organizationId, planId, planName, intervalMonths, planPricePaise, paymentLinkId, raw } = params;
  const now = new Date();
  const startsAt = toDate(params.periodStart) || now;
  const expiresAt = toDate(params.periodEnd) || addMonths(now, intervalMonths);
  const billingCycle = intervalMonths >= 12 ? "yearly" : "monthly";

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const existingMetadata = authUser?.user?.user_metadata || {};
  const email = authUser?.user?.email;
  const resolvedOrganizationId = organizationId || existingMetadata.organization_id || null;

  const { error: authErr } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMetadata,
      plan: planName,
      subscription_status: "active",
      ...(resolvedOrganizationId ? { organization_id: resolvedOrganizationId } : {}),
    },
  });
  if (authErr) throw new Error("Payment verified but failed to update user plan. Contact support.");

  const { error: subErr } = await supabase
    .from("app_user_subscriptions")
    .upsert(
      {
        user_id: userId,
        plan_id: planId,
        plan_label: planName,
        plan_price_paise: planPricePaise,
        plan_duration_days: intervalMonths * 30,
        last_payment_id: paymentLinkId,
        last_payment_status: "paid",
        last_payment_verified_at: now.toISOString(),
        started_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
        total_cycles: intervalMonths,
        raw,
        status: "active",
        billing_interval: billingCycle,
        scheduled_plan_id: null,
        scheduled_change_type: null,
        scheduled_effective_at: null,
        scheduled_change_requested_at: null,
        scheduled_change_metadata: {},
      },
      { onConflict: "user_id" },
    );
  if (subErr) console.warn("app_user_subscriptions upsert error:", subErr.message);

  if (resolvedOrganizationId) {
    const { error: orgErr } = await supabase
      .from("organizations")
      .update({
        plan_id: planId,
        plan_status: "active",
        plan_start_date: startsAt.toISOString(),
        plan_end_date: expiresAt.toISOString(),
        billing_cycle: billingCycle,
        scheduled_plan_id: null,
        scheduled_change_type: null,
        scheduled_effective_at: null,
        scheduled_change_requested_at: null,
        scheduled_change_metadata: {},
        updated_at: now.toISOString(),
      })
      .eq("id", resolvedOrganizationId);
    if (orgErr) console.warn("organizations plan update error:", orgErr.message);
  }

  if (email) {
    const { error: hubErr } = await supabase
      .from("hub_subscriptions")
      .upsert(
        {
          email,
          plan: planName,
          plan_id: planId,
          subscription_status: "active",
          updated_at: now.toISOString(),
          synced_at: now.toISOString(),
        },
        { onConflict: "email" },
      );
    if (hubErr) console.warn("hub_subscriptions upsert error:", hubErr.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { razorpayPaymentLinkId } = await req.json();
    if (!razorpayPaymentLinkId) throw new Error("razorpayPaymentLinkId is required");

    const rzpData = await fetchRazorpayPaymentLink(razorpayPaymentLinkId);
    const status = rzpData.status;
    const userId = rzpData.notes?.user_id;
    let organizationId = rzpData.notes?.organization_id || null;
    const planId = normalizePlanId(rzpData.notes?.plan);
    const intervalMonths = Number(rzpData.notes?.interval || 1);
    const invoiceId = rzpData.notes?.invoice_id || null;
    const amount = Number(rzpData.amount || 0);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const nowIso = new Date().toISOString();

    const { data: authUser } = userId
      ? await supabase.auth.admin.getUserById(userId)
      : { data: null };
    if (userId) {
      organizationId = await getOrganizationId(supabase, userId, authUser, organizationId);
    }

    const { data: invoice } = invoiceId
      ? await supabase.from("subscription_invoices").select("*").eq("id", invoiceId).maybeSingle()
      : await supabase
          .from("subscription_invoices")
          .select("*")
          .eq("gateway_payment_link_id", razorpayPaymentLinkId)
          .maybeSingle();

    await Promise.all([
      supabase
        .from("whatsapp_payments")
        .update({ status, updated_at: nowIso })
        .eq("razorpay_payment_link_id", razorpayPaymentLinkId),
      supabase
        .from("subscription_payment_transactions")
        .upsert(
          {
            invoice_id: invoice?.id || null,
            user_id: userId,
            organization_id: organizationId,
            gateway: "razorpay",
            gateway_payment_link_id: razorpayPaymentLinkId,
            gateway_payment_id: rzpData.payments?.[0]?.payment_id || rzpData.payment_id || null,
            status: status === "paid" ? "paid" : status === "cancelled" ? "cancelled" : "failed",
            amount_paise: amount,
            idempotency_key: `verify:${razorpayPaymentLinkId}`,
            raw_payload: rzpData,
            updated_at: nowIso,
          },
          { onConflict: "idempotency_key" },
        ),
    ]);

    if (invoice?.status === "paid") {
      return new Response(
        JSON.stringify({ success: true, status, plan: getPlanName(invoice.target_plan_id), invoice_id: invoice.id, already_processed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (invoice?.id) {
      await supabase
        .from("subscription_invoices")
        .update({
          status: status === "paid" ? "paid" : status === "cancelled" ? "void" : "failed",
          updated_at: nowIso,
          paid_at: status === "paid" ? nowIso : null,
        })
        .eq("id", invoice.id);
    }

    if (status === "paid" && userId && planId) {
      const planName = getPlanName(planId);
      const months = Number.isFinite(intervalMonths) && intervalMonths > 0 ? intervalMonths : 1;
      const proration = invoice?.metadata?.proration || {};

      const [{ data: existingSub }, { data: org }] = await Promise.all([
        supabase
          .from("app_user_subscriptions")
          .select("plan_id, started_at, expires_at")
          .eq("user_id", userId)
          .maybeSingle(),
        organizationId
          ? supabase
              .from("organizations")
              .select("plan_id, plan_start_date, plan_end_date")
              .eq("id", organizationId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const currentPlanId = getHighestRankedPlanId(invoice?.current_plan_id, org?.plan_id, existingSub?.plan_id, authUser?.user?.user_metadata?.plan);
      const targetRank = PLAN_RANKS[planId] || 0;
      const currentRank = currentPlanId ? PLAN_RANKS[currentPlanId] || 0 : 0;
      const isDowngradePayment = currentRank > targetRank;

      if (isDowngradePayment && currentPlanId) {
        const effectiveAt = await scheduleDowngrade({
          supabase,
          userId,
          organizationId,
          currentPlanId,
          targetPlanId: planId,
          intervalMonths: months,
          periodEnd: existingSub?.expires_at || org?.plan_end_date || null,
        });

        return new Response(
          JSON.stringify({
            success: true,
            status,
            scheduled_downgrade: true,
            plan: planName,
            effective_at: effectiveAt,
            message: `${planName} is scheduled for your next billing cycle.`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (invoice?.id && Number(proration.unused_current_credit_paise || 0) > 0) {
        const { data: existingCreditRows } = await supabase
          .from("subscription_credit_ledger")
          .select("id")
          .eq("invoice_id", invoice.id)
          .limit(1);

        if (!existingCreditRows?.length) {
          await supabase.from("subscription_credit_ledger").insert([
            {
              user_id: userId,
              organization_id: organizationId,
              invoice_id: invoice.id,
              type: "unused_plan_credit",
              amount_paise: Number(proration.unused_current_credit_paise || 0),
              balance_after_paise: Number(proration.unused_current_credit_paise || 0),
              description: "Unused current plan value",
              metadata: { from_plan_id: invoice.current_plan_id, to_plan_id: invoice.target_plan_id },
            },
            {
              user_id: userId,
              organization_id: organizationId,
              invoice_id: invoice.id,
              type: "applied_to_invoice",
              amount_paise: -Math.min(
                Number(proration.unused_current_credit_paise || 0),
                Number(proration.prorated_target_cost_paise || 0),
              ),
              balance_after_paise: Number(proration.carry_forward_credit_paise || 0),
              description: `Credit applied to ${planName} upgrade`,
              metadata: { invoice_id: invoice.id },
            },
          ]);
        }
      }

      await activatePlan({
        supabase,
        userId,
        organizationId,
        planId,
        planName,
        intervalMonths: months,
        planPricePaise: Number(proration.target_full_price_paise || amount),
        paymentLinkId: razorpayPaymentLinkId,
        raw: { ...rzpData, invoice_id: invoice?.id || null },
        periodStart: proration.period_start || null,
        periodEnd: proration.period_end || null,
      });

      return new Response(
        JSON.stringify({ success: true, status, plan: planName, invoice_id: invoice?.id || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, status, invoice_id: invoice?.id || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[verify-whatsapp-subscription] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
