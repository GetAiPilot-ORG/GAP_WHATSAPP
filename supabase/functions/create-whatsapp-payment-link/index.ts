// create-whatsapp-payment-link/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BillingInterval = "monthly" | "yearly";

type PlanConfig = {
  id: string;
  label: string;
  rank: number;
  prices: Record<number, number>;
};

const PLANS: Record<string, PlanConfig> = {
  starter: { id: "starter", label: "Starter", rank: 10, prices: { 1: 99900, 12: 999000 } },
  growth: { id: "growth", label: "Growth", rank: 20, prices: { 1: 199900, 12: 1999000 } },
  pro: { id: "pro", label: "Pro", rank: 30, prices: { 1: 349900, 12: 3499000 } },
};

function normalizePlanId(planId: string | null | undefined): string | null {
  const value = String(planId || "").toLowerCase();
  if (!value) return null;
  if (value.includes("starter")) return "starter";
  if (value.includes("growth")) return "growth";
  if (value === "pro" || value.includes("pro") || value.includes("premium")) return "pro";
  return value in PLANS ? value : null;
}

function getPlanName(planId: string): string {
  return PLANS[normalizePlanId(planId) || "growth"]?.label || "Growth";
}

function getHighestRankedPlanId(...planIds: Array<string | null | undefined>): string | null {
  return planIds
    .map(normalizePlanId)
    .filter((planId): planId is string => !!planId && !!PLANS[planId])
    .sort((a, b) => PLANS[b].rank - PLANS[a].rank)[0] || null;
}

function getPlanAmount(planId: string, interval: number): number {
  const plan = PLANS[normalizePlanId(planId) || ""];
  if (!plan) throw new Error(`Invalid planId: ${planId}`);
  return plan.prices[interval] ?? plan.prices[1];
}

function getBillingInterval(interval: number): BillingInterval {
  return interval >= 12 ? "yearly" : "monthly";
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

function calculateProration(params: {
  currentPlanId: string | null;
  targetPlanId: string;
  interval: number;
  currentPlanPricePaise?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const now = new Date();
  const periodStart = toDate(params.periodStart) || now;
  const periodEnd = toDate(params.periodEnd) || addMonths(now, params.interval);
  const fullPeriodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
  const remainingRatio = Math.min(1, remainingMs / fullPeriodMs);

  const targetFullPricePaise = getPlanAmount(params.targetPlanId, params.interval);
  const currentFullPricePaise = params.currentPlanId
    ? Number(params.currentPlanPricePaise || getPlanAmount(params.currentPlanId, params.interval))
    : 0;

  const unusedCurrentCreditPaise = Math.round(currentFullPricePaise * remainingRatio);
  const proratedTargetCostPaise = Math.round(targetFullPricePaise * remainingRatio);
  const totalPayablePaise = Math.max(0, proratedTargetCostPaise - unusedCurrentCreditPaise);
  const carryForwardCreditPaise = Math.max(0, unusedCurrentCreditPaise - proratedTargetCostPaise);

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    remaining_ratio: remainingRatio,
    current_full_price_paise: currentFullPricePaise,
    target_full_price_paise: targetFullPricePaise,
    unused_current_credit_paise: unusedCurrentCreditPaise,
    prorated_target_cost_paise: proratedTargetCostPaise,
    total_payable_paise: totalPayablePaise,
    carry_forward_credit_paise: carryForwardCreditPaise,
  };
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

async function createRazorpayPaymentLink(payload: Record<string, unknown>) {
  const credentialPairs = getRazorpayCredentialPairs();
  if (!credentialPairs.length) throw new Error("Razorpay is not configured");

  let lastError = "Failed to create Razorpay payment link";
  for (const pair of credentialPairs) {
    const auth = btoa(`${pair.keyId}:${pair.keySecret}`);
    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (response.ok) return data;

    lastError = data.error?.description || data.error?.reason || lastError;
    if (!/auth/i.test(lastError)) throw new Error(lastError);
    console.warn(`[create-whatsapp-payment-link] Razorpay ${pair.label} credentials failed authentication`);
  }

  throw new Error(lastError);
}

async function getOrganizationId(supabase: any, userId: string, authUser: any): Promise<string | null> {
  const metadataOrgId = authUser?.user_metadata?.organization_id;
  if (metadataOrgId) return metadataOrgId;

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  return member?.organization_id || null;
}

async function activatePlan(params: {
  supabase: any;
  userId: string;
  organizationId: string | null;
  planId: string;
  interval: number;
  amount: number;
  paymentLinkId: string;
  raw: Record<string, unknown>;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const { supabase, userId, organizationId, planId, interval, amount, paymentLinkId, raw } = params;
  const now = new Date();
  const planName = getPlanName(planId);
  const startsAt = toDate(params.periodStart) || now;
  const expiresAt = toDate(params.periodEnd) || addMonths(now, interval);
  const billingInterval = getBillingInterval(interval);

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const existingMetadata = authUser?.user?.user_metadata || {};

  const { error: authErr } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMetadata,
      plan: planName,
      subscription_status: "active",
      ...(organizationId ? { organization_id: organizationId } : {}),
    },
  });
  if (authErr) throw new Error("Plan payment succeeded but user profile update failed. Contact support.");

  const { error: subErr } = await supabase
    .from("app_user_subscriptions")
    .upsert(
      {
        user_id: userId,
        plan_id: planId,
        plan_label: planName,
        plan_price_paise: amount,
        plan_duration_days: interval * 30,
        last_payment_id: paymentLinkId,
        last_payment_status: "paid",
        last_payment_verified_at: now.toISOString(),
        started_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
        total_cycles: interval,
        raw,
        status: "active",
        billing_interval: billingInterval,
        scheduled_plan_id: null,
        scheduled_change_type: null,
        scheduled_effective_at: null,
        scheduled_change_requested_at: null,
        scheduled_change_metadata: {},
      },
      { onConflict: "user_id" },
    );
  if (subErr) console.warn("app_user_subscriptions upsert error:", subErr.message);

  if (organizationId) {
    const { error: orgErr } = await supabase
      .from("organizations")
      .update({
        plan_id: planId,
        plan_status: "active",
        plan_start_date: startsAt.toISOString(),
        plan_end_date: expiresAt.toISOString(),
        billing_cycle: billingInterval,
        scheduled_plan_id: null,
        scheduled_change_type: null,
        scheduled_effective_at: null,
        scheduled_change_requested_at: null,
        scheduled_change_metadata: {},
        updated_at: now.toISOString(),
      })
      .eq("id", organizationId);
    if (orgErr) console.warn("organizations plan update error:", orgErr.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { planId, interval = 1, userId, customerName, customerEmail, customerContact, currentPlanId } = await req.json();

    if (!userId || !planId) throw new Error("userId and planId are required");

    const targetPlanId = normalizePlanId(planId);
    if (!targetPlanId || !PLANS[targetPlanId]) throw new Error(`Invalid planId: ${planId}`);

    const months = Number(interval) >= 12 ? 12 : 1;
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { data: authUserResult } = await supabase.auth.admin.getUserById(userId);
    const authUser = authUserResult?.user;
    const organizationId = await getOrganizationId(supabase, userId, authUser);

    const [{ data: existingSub }, { data: org }] = await Promise.all([
      supabase
        .from("app_user_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      organizationId
        ? supabase
            .from("organizations")
            .select("id, plan_id, plan_start_date, plan_end_date, billing_cycle")
            .eq("id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const resolvedCurrentPlanId = getHighestRankedPlanId(currentPlanId, org?.plan_id, existingSub?.plan_id, authUser?.user_metadata?.plan);
    const currentPlan = resolvedCurrentPlanId ? PLANS[resolvedCurrentPlanId] : null;
    const targetPlan = PLANS[targetPlanId];
    const nowIso = new Date().toISOString();

    if (currentPlan?.id === targetPlan.id) {
      return new Response(
        JSON.stringify({ success: true, no_change: true, message: "You are already on this plan." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const periodStart = existingSub?.started_at || org?.plan_start_date || null;
    const periodEnd = existingSub?.expires_at || org?.plan_end_date || null;

    if (currentPlan && targetPlan.rank < currentPlan.rank) {
      const effectiveAt = toDate(periodEnd)?.toISOString() || addMonths(new Date(), months).toISOString();
      const metadata = {
        from_plan_id: currentPlan.id,
        to_plan_id: targetPlan.id,
        requested_interval_months: months,
        requested_at: nowIso,
      };

      await supabase
        .from("app_user_subscriptions")
        .update({
          status: "scheduled_downgrade",
          scheduled_plan_id: targetPlan.id,
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
            scheduled_plan_id: targetPlan.id,
            scheduled_change_type: "downgrade",
            scheduled_effective_at: effectiveAt,
            scheduled_change_requested_at: nowIso,
            scheduled_change_metadata: metadata,
            updated_at: nowIso,
          })
          .eq("id", organizationId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          scheduled_downgrade: true,
          plan: targetPlan.label,
          effective_at: effectiveAt,
          message: `${targetPlan.label} will start from your next billing cycle.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const proration = currentPlan && targetPlan.rank > currentPlan.rank
      ? calculateProration({
          currentPlanId: currentPlan.id,
          targetPlanId: targetPlan.id,
          interval: months,
          currentPlanPricePaise: Number(existingSub?.plan_price_paise || 0),
          periodStart,
          periodEnd,
        })
      : {
          period_start: new Date().toISOString(),
          period_end: addMonths(new Date(), months).toISOString(),
          remaining_ratio: 1,
          current_full_price_paise: 0,
          target_full_price_paise: getPlanAmount(targetPlan.id, months),
          unused_current_credit_paise: 0,
          prorated_target_cost_paise: getPlanAmount(targetPlan.id, months),
          total_payable_paise: getPlanAmount(targetPlan.id, months),
          carry_forward_credit_paise: 0,
        };

    const changeType = currentPlan ? "upgrade" : "new_subscription";
    const idempotencyKey = `${changeType}:${userId}:${currentPlan?.id || "none"}:${targetPlan.id}:${months}:${proration.period_end}`;

    const { data: existingInvoice } = await supabase
      .from("subscription_invoices")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingInvoice?.metadata?.short_url && existingInvoice.status === "pending_payment") {
      return new Response(
        JSON.stringify({
          success: true,
          payment_link: existingInvoice.metadata.short_url,
          invoice_id: existingInvoice.id,
          invoice_preview: existingInvoice.metadata?.proration,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invoicePayload = {
      user_id: userId,
      organization_id: organizationId,
      subscription_user_id: existingSub?.user_id || null,
      type: changeType,
      status: proration.total_payable_paise > 0 ? "draft" : "paid",
      current_plan_id: currentPlan?.id || null,
      target_plan_id: targetPlan.id,
      billing_interval: getBillingInterval(months),
      period_start: proration.period_start,
      period_end: proration.period_end,
      subtotal_paise: proration.prorated_target_cost_paise,
      credit_applied_paise: proration.unused_current_credit_paise,
      total_paise: proration.total_payable_paise,
      currency: "INR",
      idempotency_key: idempotencyKey,
      gateway: proration.total_payable_paise > 0 ? "razorpay" : null,
      metadata: { proration },
      paid_at: proration.total_payable_paise === 0 ? nowIso : null,
    };

    const { data: invoice, error: invoiceErr } = await supabase
      .from("subscription_invoices")
      .insert(invoicePayload)
      .select()
      .single();

    if (invoiceErr) throw invoiceErr;

    if (proration.total_payable_paise === 0) {
      if (proration.unused_current_credit_paise > 0) {
        await supabase.from("subscription_credit_ledger").insert([
          {
            user_id: userId,
            organization_id: organizationId,
            invoice_id: invoice.id,
            type: "unused_plan_credit",
            amount_paise: proration.unused_current_credit_paise,
            balance_after_paise: proration.unused_current_credit_paise,
            description: `Unused ${currentPlan?.label || "current"} plan value`,
            metadata: { from_plan_id: currentPlan?.id, to_plan_id: targetPlan.id },
          },
          {
            user_id: userId,
            organization_id: organizationId,
            invoice_id: invoice.id,
            type: "applied_to_invoice",
            amount_paise: -Math.min(proration.unused_current_credit_paise, proration.prorated_target_cost_paise),
            balance_after_paise: proration.carry_forward_credit_paise,
            description: `Credit applied to ${targetPlan.label} ${changeType}`,
            metadata: { invoice_id: invoice.id },
          },
        ]);
      }

      await activatePlan({
        supabase,
        userId,
        organizationId,
        planId: targetPlan.id,
        interval: months,
        amount: proration.target_full_price_paise,
        paymentLinkId: `credit:${invoice.id}`,
        raw: { invoice_id: invoice.id, proration },
        periodStart: proration.period_start,
        periodEnd: proration.period_end,
      });

      return new Response(
        JSON.stringify({ success: true, activated: true, plan: targetPlan.label, invoice_id: invoice.id, invoice_preview: proration }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const description = currentPlan
      ? `WhatsApp ${currentPlan.label} to ${targetPlan.label} prorated upgrade`
      : `WhatsApp ${targetPlan.label} Subscription (${months} Month${months > 1 ? "s" : ""})`;

    const razorpayData = await createRazorpayPaymentLink({
      amount: proration.total_payable_paise,
      currency: "INR",
      accept_partial: false,
      description,
      customer: {
        name: customerName || "Customer",
        email: customerEmail,
        contact: customerContact,
      },
      notify: { sms: false, email: true },
      reminder_enable: true,
      notes: {
        user_id: userId,
        organization_id: organizationId,
        plan: targetPlan.id,
        interval: months.toString(),
        product: "whatsapp",
        change_type: changeType,
        invoice_id: invoice.id,
      },
      callback_url: `${req.headers.get("origin") || "https://wb.getaipilot.in"}/payment-success`,
      callback_method: "get",
    });

    await Promise.all([
      supabase
        .from("subscription_invoices")
        .update({
          status: "pending_payment",
          gateway_payment_link_id: razorpayData.id,
          metadata: { proration, short_url: razorpayData.short_url },
          updated_at: nowIso,
        })
        .eq("id", invoice.id),
      supabase.from("subscription_payment_transactions").insert({
        invoice_id: invoice.id,
        user_id: userId,
        organization_id: organizationId,
        gateway: "razorpay",
        gateway_payment_link_id: razorpayData.id,
        status: "pending",
        amount_paise: proration.total_payable_paise,
        idempotency_key: `payment-link:${razorpayData.id}`,
        raw_payload: razorpayData,
      }),
      supabase.from("whatsapp_payments").insert({
        user_id: userId,
        razorpay_payment_link_id: razorpayData.id,
        plan: targetPlan.label,
        plan_id: targetPlan.id,
        amount: proration.total_payable_paise,
        interval_months: months,
        status: "pending",
        invoice_id: invoice.id,
        change_type: changeType,
        idempotency_key: idempotencyKey,
      }),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        payment_link: razorpayData.short_url,
        invoice_id: invoice.id,
        invoice_preview: proration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[create-whatsapp-payment-link] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
