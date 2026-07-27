import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_RECHARGE_PAISE = 10000;
const MAX_RECHARGE_PAISE = 100000000;

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
    console.warn(`[create-whatsapp-wallet-recharge-link] Razorpay ${pair.label} credentials failed authentication`);
  }

  throw new Error(lastError);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { organizationId, userId, amountPaise, customerName, customerEmail, customerContact } = await req.json();
    const amount = Number(amountPaise);

    if (!organizationId || !userId) throw new Error("organizationId and userId are required");
    if (!Number.isFinite(amount) || amount < MIN_RECHARGE_PAISE || amount > MAX_RECHARGE_PAISE) {
      throw new Error("Recharge amount must be between ₹100 and ₹10,00,000");
    }
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    await supabase.from("whatsapp_wallets").upsert(
      { organization_id: organizationId, currency: "INR" },
      { onConflict: "organization_id" },
    );

    const razorpayData = await createRazorpayPaymentLink({
      amount,
      currency: "INR",
      accept_partial: false,
      description: `WhatsApp Message Wallet Recharge (${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount / 100)})`,
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
        product: "whatsapp_wallet",
        amount_paise: String(amount),
      },
      callback_url: `${req.headers.get("origin") || "https://wb.getaipilot.in"}/payment-success?kind=wallet`,
      callback_method: "get",
    });

    await supabase.from("whatsapp_wallet_transactions").insert({
      organization_id: organizationId,
      user_id: userId,
      type: "recharge",
      amount_paise: amount,
      currency: "INR",
      status: "pending",
      reference_type: "razorpay_payment_link",
      reference_id: razorpayData.id,
      description: "Wallet recharge initiated",
      metadata: { razorpay_payment_link_id: razorpayData.id, short_url: razorpayData.short_url },
    });

    return new Response(
      JSON.stringify({ success: true, payment_link: razorpayData.short_url, razorpay_payment_link_id: razorpayData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[create-whatsapp-wallet-recharge-link] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
