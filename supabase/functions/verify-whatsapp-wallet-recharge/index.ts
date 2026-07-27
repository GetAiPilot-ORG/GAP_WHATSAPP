import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    console.warn(`[verify-whatsapp-wallet-recharge] Razorpay ${pair.label} credentials could not read this link: ${lastError}`);
  }

  throw new Error(lastError);
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
    const organizationId = rzpData.notes?.organization_id;
    const userId = rzpData.notes?.user_id;
    const amount = Number(rzpData.amount || rzpData.notes?.amount_paise || 0);
    if (!organizationId || !userId) throw new Error("Payment link is missing wallet metadata");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { data: existingTx } = await supabase
      .from("whatsapp_wallet_transactions")
      .select("id, status, amount_paise, balance_after_paise")
      .eq("reference_type", "razorpay_payment_link")
      .eq("reference_id", razorpayPaymentLinkId)
      .maybeSingle();

    if (existingTx?.status === "completed") {
      return new Response(
        JSON.stringify({ success: true, status, already_verified: true, balance_after_paise: existingTx.balance_after_paise }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (status !== "paid") {
      await supabase
        .from("whatsapp_wallet_transactions")
        .update({ status: status === "cancelled" ? "cancelled" : "pending" })
        .eq("reference_type", "razorpay_payment_link")
        .eq("reference_id", razorpayPaymentLinkId);

      return new Response(
        JSON.stringify({ success: true, status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (existingTx?.id) {
      // ATOMIC LOCK: Try to update the transaction from pending to completed.
      const { data: updatedTx, error: updateTxErr } = await supabase
        .from("whatsapp_wallet_transactions")
        .update({
          status: "completed",
          description: "Wallet recharge completed",
          metadata: { ...(rzpData.notes || {}), razorpay_status: status },
        })
        .eq("id", existingTx.id)
        .eq("status", "pending")
        .select()
        .maybeSingle();

      if (!updatedTx) {
        // This transaction was already marked as completed by another concurrent webhook!
        return new Response(
          JSON.stringify({ success: true, status, already_verified: true, note: "Race condition prevented" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    await supabase.from("whatsapp_wallets").upsert(
      { organization_id: organizationId, currency: "INR" },
      { onConflict: "organization_id" },
    );

    const { data: wallet, error: walletErr } = await supabase
      .from("whatsapp_wallets")
      .select("balance_paise")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (walletErr) throw walletErr;

    const nextBalance = Number(wallet?.balance_paise || 0) + amount;
    const { error: updateWalletErr } = await supabase
      .from("whatsapp_wallets")
      .update({ balance_paise: nextBalance, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
    if (updateWalletErr) throw updateWalletErr;

    if (existingTx?.id) {
      // Update the balance_after_paise now that we have incremented the wallet
      await supabase
        .from("whatsapp_wallet_transactions")
        .update({ balance_after_paise: nextBalance })
        .eq("id", existingTx.id);
    } else {
      await supabase.from("whatsapp_wallet_transactions").insert({
        organization_id: organizationId,
        user_id: userId,
        type: "recharge",
        amount_paise: amount,
        balance_after_paise: nextBalance,
        currency: "INR",
        status: "completed",
        reference_type: "razorpay_payment_link",
        reference_id: razorpayPaymentLinkId,
        description: "Wallet recharge completed",
        metadata: { ...(rzpData.notes || {}), razorpay_status: status },
      });
    }

    return new Response(
      JSON.stringify({ success: true, status, amount_paise: amount, balance_after_paise: nextBalance }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[verify-whatsapp-wallet-recharge] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
