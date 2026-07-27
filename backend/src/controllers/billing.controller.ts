import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { 
    DEFAULT_WHATSAPP_RATE_CARD, 
    DEFAULT_BILLING_MARKET, 
    DEFAULT_BILLING_CURRENCY 
} from '../utils/billing.js';

const PLAN_RANKS: Record<string, number> = {
    starter: 10,
    growth: 20,
    pro: 30,
    enterprise: 40,
    all_in_one: 40,
};

const PLAN_PRICES: Record<string, { label: string; prices: Record<number, number> }> = {
    starter: { label: 'Starter', prices: { 1: 99900, 12: 999000 } },
    growth: { label: 'Growth', prices: { 1: 199900, 12: 1999000 } },
    pro: { label: 'Pro', prices: { 1: 349900, 12: 3499000 } },
};

function normalizePlanId(planId: any): string | null {
    const value = String(planId || '').toLowerCase();
    if (!value) return null;
    
    const isWhatsApp = value.startsWith('whatsapp_') || value.startsWith('wa_') || value.startsWith('wa ') || ['starter', 'growth', 'pro', 'enterprise'].includes(value);
    
    if (isWhatsApp) {
        if (value.includes('starter')) return 'starter';
        if (value.includes('growth')) return 'growth';
        if (value.includes('pro') || value.includes('premium')) return 'pro';
        if (value.includes('enterprise')) return 'enterprise';
    }
    
    if (value.includes('enterprise')) return 'enterprise';
    if (value.includes('all_in_one') || value.includes('ultimate')) return 'all_in_one';
    return PLAN_RANKS[value] ? value : null;
}

function getHighestRankedPlanId(...planIds: any[]): string | null {
    return planIds
        .map(normalizePlanId)
        .filter((planId): planId is string => !!planId && !!PLAN_RANKS[planId])
        .sort((a, b) => PLAN_RANKS[b] - PLAN_RANKS[a])[0] || null;
}

function addMonths(date: Date, months: number): Date {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}

function toValidDate(value: any): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getPlanAmount(planId: string, interval: number): number {
    const plan = PLAN_PRICES[planId];
    if (!plan) return 0;
    return plan.prices[interval] ?? plan.prices[1] ?? 0;
}

function getBillingInterval(interval: number): 'monthly' | 'yearly' {
    return interval >= 12 ? 'yearly' : 'monthly';
}

function calculateProration(params: {
    currentPlanId: string;
    targetPlanId: string;
    interval: number;
    currentPlanPricePaise?: number;
    periodStart?: string | null;
    periodEnd?: string | null;
}) {
    const now = new Date();
    const periodStart = toValidDate(params.periodStart) || now;
    const periodEnd = toValidDate(params.periodEnd) || addMonths(now, params.interval);
    const fullPeriodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
    const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
    const remainingRatio = Math.min(1, remainingMs / fullPeriodMs);
    const currentFullPricePaise = Number(params.currentPlanPricePaise || getPlanAmount(params.currentPlanId, params.interval));
    const targetFullPricePaise = getPlanAmount(params.targetPlanId, params.interval);
    const unusedCurrentCreditPaise = Math.round(currentFullPricePaise * remainingRatio);
    const proratedTargetCostPaise = Math.round(targetFullPricePaise * remainingRatio);

    return {
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        remaining_ratio: remainingRatio,
        current_full_price_paise: currentFullPricePaise,
        target_full_price_paise: targetFullPricePaise,
        unused_current_credit_paise: unusedCurrentCreditPaise,
        prorated_target_cost_paise: proratedTargetCostPaise,
        total_payable_paise: Math.max(0, proratedTargetCostPaise - unusedCurrentCreditPaise),
        carry_forward_credit_paise: Math.max(0, unusedCurrentCreditPaise - proratedTargetCostPaise),
    };
}

function getRazorpayCredentialPairs() {
    const mode = (process.env.RAZORPAY_MODE || 'live').toLowerCase();
    const pairs = [
        {
            label: 'live',
            keyId: process.env.RAZORPAY_LIVE_KEY_ID,
            keySecret: process.env.RAZORPAY_LIVE_KEY_SECRET,
        },
        {
            label: 'test',
            keyId: process.env.RAZORPAY_TEST_KEY_ID,
            keySecret: process.env.RAZORPAY_TEST_KEY_SECRET,
        },
        {
            label: 'default',
            keyId: process.env.RAZORPAY_KEY_ID,
            keySecret: process.env.RAZORPAY_KEY_SECRET,
        },
    ].filter(pair => pair.keyId && pair.keySecret);

    if (mode === 'test') return pairs.sort((a, b) => Number(b.label === 'test') - Number(a.label === 'test'));
    if (mode === 'live') return pairs.sort((a, b) => Number(b.label === 'live') - Number(a.label === 'live'));
    return pairs;
}

async function createRazorpayPaymentLink(payload: Record<string, any>) {
    const credentialPairs = getRazorpayCredentialPairs();
    if (!credentialPairs.length) throw new Error('Razorpay is not configured');

    let lastError = 'Failed to create Razorpay payment link';
    for (const pair of credentialPairs) {
        const auth = Buffer.from(`${pair.keyId}:${pair.keySecret}`).toString('base64');
        const response = await fetch('https://api.razorpay.com/v1/payment_links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${auth}`,
            },
            body: JSON.stringify(payload),
        });
        const data: any = await response.json();
        if (response.ok) return data;

        lastError = data.error?.description || data.error?.reason || lastError;
        if (!/auth/i.test(lastError)) throw new Error(lastError);
        console.warn(`[billing/change-plan] Razorpay ${pair.label} credentials failed authentication`);
    }

    throw new Error(lastError);
}

export const getBillingOverview = async (req: any, res: Response) => {
    const orgId = req.organization_id;
    const userId = req.user?.id;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    const fallbackRateCards = Object.values(DEFAULT_WHATSAPP_RATE_CARD).map(rate => ({
        market: DEFAULT_BILLING_MARKET,
        currency: DEFAULT_BILLING_CURRENCY,
        category: rate.category,
        label: rate.label,
        rate_paise: rate.rate_paise,
        pass_through_rate_paise: rate.rate_paise,
        markup_paise: 0,
        description: rate.description,
        notes: 'Fallback rate. Run the billing migration to manage rates from Supabase.'
    }));

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });

        const [
            orgResult,
            plansResult,
            walletResult,
            rateCardsResult,
            monthUsageResult,
            todayUsageResult,
            walletTransactionsResult,
            messageDebitTransactionsResult,
            messageChargesResult,
            legacyMonthSpendResult,
            legacyTodaySpendResult
        ] = await Promise.all([
            supabase
                .from('organizations')
                .select('id, name, plan_id, plan_status, plan_start_date, plan_end_date, billing_cycle, max_users, max_contacts, scheduled_plan_id, scheduled_change_type, scheduled_effective_at, scheduled_change_requested_at, scheduled_change_metadata')
                .eq('id', orgId)
                .maybeSingle(),
            supabase
                .from('whatsapp_subscription_plans')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
            supabase
                .from('whatsapp_wallets')
                .select('*')
                .eq('organization_id', orgId)
                .maybeSingle(),
            supabase
                .from('whatsapp_rate_cards')
                .select('market, currency, category, rate_paise, pass_through_rate_paise, markup_paise, notes, effective_from')
                .eq('market', DEFAULT_BILLING_MARKET)
                .eq('currency', DEFAULT_BILLING_CURRENCY)
                .eq('is_active', true)
                .order('effective_from', { ascending: false }),
            supabase
                .from('whatsapp_message_usage_logs')
                .select('category, charged_amount_paise, meta_cost_paise, billable, billing_status')
                .eq('organization_id', orgId)
                .gte('created_at', monthStart),
            supabase
                .from('whatsapp_message_usage_logs')
                .select('category, charged_amount_paise')
                .eq('organization_id', orgId)
                .gte('created_at', todayStart),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('id, type, amount_paise, balance_after_paise, currency, status, description, reference_type, reference_id, created_at')
                .eq('organization_id', orgId)
                .filter('type', 'not.in', '("message_debit","failed_debit")')
                .order('created_at', { ascending: false })
                .limit(20),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('id, type, amount_paise, balance_after_paise, currency, status, description, reference_type, reference_id, created_at, metadata')
                .eq('organization_id', orgId)
                .filter('type', 'in', '("message_debit","failed_debit")')
                .order('created_at', { ascending: false })
                .limit(20),
            supabase
                .from('whatsapp_message_usage_logs')
                .select('id, source, category, template_name, campaign_id, wa_message_id, charged_amount_paise, billing_status, delivery_status, created_at')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(12),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('amount_paise, metadata')
                .eq('organization_id', orgId)
                .filter('type', 'in', '("message_debit","failed_debit")')
                .gte('created_at', monthStart),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('amount_paise')
                .eq('organization_id', orgId)
                .filter('type', 'in', '("message_debit","failed_debit")')
                .gte('created_at', todayStart)
        ]);

        let walletData = walletResult.data;
        if (!walletData && !walletResult.error && userId) {
            const { data: createdWallet, error: createWalletError } = await supabase
                .from('whatsapp_wallets')
                .insert({ organization_id: orgId, currency: DEFAULT_BILLING_CURRENCY })
                .select()
                .maybeSingle();
            if (!createWalletError && createdWallet) walletData = createdWallet;
        }

        const plans = plansResult.error ? [] : (plansResult.data || []);
        const rateCardsFromDb = rateCardsResult.error
            ? fallbackRateCards
            : (rateCardsResult.data || []).reduce((acc: any[], row: any) => {
                if (!acc.some(item => item.category === row.category)) {
                    acc.push({
                        ...row,
                        label: DEFAULT_WHATSAPP_RATE_CARD[row.category]?.label || row.category,
                        description: DEFAULT_WHATSAPP_RATE_CARD[row.category]?.description || ''
                    });
                }
                return acc;
            }, []);

        const rateCards = rateCardsFromDb.length ? rateCardsFromDb : fallbackRateCards;
        const monthUsageRows = monthUsageResult.error ? [] : (monthUsageResult.data || []);
        const todayUsageRows = todayUsageResult.error ? [] : (todayUsageResult.data || []);

        const emptyCategoryStats = Object.keys(DEFAULT_WHATSAPP_RATE_CARD).reduce((acc: any, category) => {
            acc[category] = {
                category,
                label: DEFAULT_WHATSAPP_RATE_CARD[category].label,
                message_count: 0,
                charged_amount_paise: 0,
                meta_cost_paise: 0
            };
            return acc;
        }, {});

        const categoryStats = monthUsageRows.reduce((acc: any, row: any) => {
            const category = row.category || 'service';
            if (!acc[category]) {
                acc[category] = {
                    category,
                    label: DEFAULT_WHATSAPP_RATE_CARD[category]?.label || category,
                    message_count: 0,
                    charged_amount_paise: 0,
                    meta_cost_paise: 0
                };
            }
            acc[category].message_count += 1;
            acc[category].charged_amount_paise += Number(row.charged_amount_paise || 0);
            acc[category].meta_cost_paise += Number(row.meta_cost_paise || 0);
            return acc;
        }, emptyCategoryStats);

        // Include legacy wallet transactions in category stats
        const legacyMonthRows = legacyMonthSpendResult.error ? [] : (legacyMonthSpendResult.data || []);
        legacyMonthRows.forEach((row: any) => {
            const category = row.metadata?.category || 'marketing';
            if (!categoryStats[category]) {
                categoryStats[category] = {
                    category,
                    label: DEFAULT_WHATSAPP_RATE_CARD[category]?.label || category,
                    message_count: 0,
                    charged_amount_paise: 0,
                    meta_cost_paise: 0
                };
            }
            categoryStats[category].message_count += 1;
            categoryStats[category].charged_amount_paise += Math.abs(Number(row.amount_paise || 0));
        });

        const monthSpendPaise = Object.values(categoryStats).reduce((sum: number, item: any) => sum + Number(item.charged_amount_paise || 0), 0);
        
        const legacyTodayRows = legacyTodaySpendResult.error ? [] : (legacyTodaySpendResult.data || []);
        const legacyTodaySpend = legacyTodayRows.reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_paise || 0)), 0);
        const todaySpendPaise = todayUsageRows.reduce((sum: number, row: any) => sum + Number(row.charged_amount_paise || 0), 0) + legacyTodaySpend;
        const walletTransactions = walletTransactionsResult.error ? [] : (walletTransactionsResult.data || []);
        const usageLogCharges = messageChargesResult.error ? [] : (messageChargesResult.data || []);
        const legacyMessageDebitCharges = messageDebitTransactionsResult.error
            ? []
            : (messageDebitTransactionsResult.data || []).map((tx: any) => ({
                id: tx.id,
                source: tx.reference_type || 'message',
                category: tx.metadata?.category || null,
                template_name: tx.metadata?.template_name || null,
                campaign_id: tx.metadata?.campaign_id || (tx.reference_type === 'broadcast' ? tx.reference_id : null),
                wa_message_id: tx.reference_id || null,
                charged_amount_paise: Math.abs(Number(tx.amount_paise || 0)),
                billing_status: tx.status === 'completed' ? 'charged' : tx.status,
                delivery_status: null,
                created_at: tx.created_at,
            }));
        const messageCharges = usageLogCharges.length ? usageLogCharges : legacyMessageDebitCharges;

        const orgData = orgResult.data ? { ...orgResult.data } : { id: orgId, plan_id: null, plan_status: 'inactive' };
        try {
            if (orgResult.data) {
                const { data: ownerMember } = await supabase
                    .from('organization_members')
                    .select('user_id')
                    .eq('organization_id', orgId)
                    .eq('role', 'owner')
                    .maybeSingle();

                if (ownerMember?.user_id) {
                    const { data: sub } = await supabase
                        .from('app_user_subscriptions')
                        .select('started_at, expires_at')
                        .eq('user_id', ownerMember.user_id)
                        .maybeSingle();

                    if (sub) {
                        if (!orgData.plan_start_date) orgData.plan_start_date = sub.started_at;
                        if (!orgData.plan_end_date) orgData.plan_end_date = sub.expires_at;
                    }
                }
            }
        } catch (subErr) {
            console.error('[billing/overview] Failed to fetch owner subscription dates:', subErr);
        }

        let subscription: any = null;
        let subscriptionInvoices: any[] = [];
        let subscriptionCreditBalancePaise = 0;

        try {
            const ownerUserId = userId || (await supabase
                .from('organization_members')
                .select('user_id')
                .eq('organization_id', orgId)
                .eq('role', 'owner')
                .maybeSingle()).data?.user_id;

            if (ownerUserId) {
                const [
                    subscriptionResult,
                    invoicesResult,
                    creditLedgerResult
                ] = await Promise.all([
                    supabase
                        .from('app_user_subscriptions')
                        .select('user_id, plan_id, plan_label, plan_price_paise, plan_duration_days, started_at, expires_at, status, billing_interval, scheduled_plan_id, scheduled_change_type, scheduled_effective_at, scheduled_change_requested_at, scheduled_change_metadata, updated_at')
                        .eq('user_id', ownerUserId)
                        .maybeSingle(),
                    supabase
                        .from('subscription_invoices')
                        .select('id, type, status, current_plan_id, target_plan_id, billing_interval, subtotal_paise, credit_applied_paise, total_paise, currency, period_start, period_end, gateway_payment_link_id, metadata, created_at, paid_at')
                        .eq('user_id', ownerUserId)
                        .order('created_at', { ascending: false })
                        .limit(10),
                    supabase
                        .from('subscription_credit_ledger')
                        .select('amount_paise')
                        .eq('user_id', ownerUserId)
                ]);

                if (!subscriptionResult.error) subscription = subscriptionResult.data;
                if (!invoicesResult.error) subscriptionInvoices = invoicesResult.data || [];
                if (!creditLedgerResult.error) {
                    subscriptionCreditBalancePaise = (creditLedgerResult.data || []).reduce(
                        (sum: number, row: any) => sum + Number(row.amount_paise || 0),
                        0
                    );
                }
            }
        } catch (subscriptionErr) {
            console.error('[billing/overview] Failed to fetch subscription plan-change state:', subscriptionErr);
        }

        const actualPlanId = getHighestRankedPlanId(orgData.plan_id, subscription?.plan_id, req.user?.user_metadata?.plan);
        const currentPlan = actualPlanId ? plans.find((plan: any) => plan.id === actualPlanId) || null : null;

        res.json({
            organization: orgData,
            current_plan: currentPlan,
            subscription,
            subscription_credit_balance_paise: subscriptionCreditBalancePaise,
            recent_subscription_invoices: subscriptionInvoices,
            plans,
            wallet: walletData || {
                organization_id: orgId,
                balance_paise: 0,
                currency: DEFAULT_BILLING_CURRENCY,
                low_balance_threshold_paise: 10000
            },
            spend: {
                month_start: monthStart,
                today_start: todayStart,
                month_spend_paise: monthSpendPaise,
                today_spend_paise: todaySpendPaise,
                categories: Object.values(categoryStats)
            },
            rate_cards: rateCards,
            recent_transactions: walletTransactions,
            recent_wallet_transactions: walletTransactions,
            recent_message_charges: messageCharges,
            warnings: {
                plans_table_missing: !!plansResult.error,
                wallet_table_missing: !!walletResult.error,
                usage_table_missing: !!monthUsageResult.error,
                rate_card_table_missing: !!rateCardsResult.error
            }
        });
    } catch (err: any) {
        console.error('[billing/overview] Error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch billing overview' });
    }
};

export const changeSubscriptionPlan = async (req: any, res: Response) => {
    const orgId = req.organization_id;
    const userId = req.user?.id;
    const { planId, currentPlanId, interval = 1, customerName, customerEmail, customerContact } = req.body || {};
    const targetPlanId = normalizePlanId(planId);

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });
        if (!userId) return res.status(401).json({ error: 'Authenticated user is required' });
        if (!targetPlanId || !PLAN_RANKS[targetPlanId]) {
            return res.status(400).json({ error: 'Invalid target plan' });
        }

        const [{ data: org }, { data: sub }, { data: targetPlan }] = await Promise.all([
            supabase
                .from('organizations')
                .select('id, plan_id, plan_start_date, plan_end_date, billing_cycle')
                .eq('id', orgId)
                .maybeSingle(),
            supabase
                .from('app_user_subscriptions')
                .select('user_id, plan_id, plan_price_paise, started_at, expires_at')
                .eq('user_id', userId)
                .maybeSingle(),
            supabase
                .from('whatsapp_subscription_plans')
                .select('id, name')
                .eq('id', targetPlanId)
                .maybeSingle()
        ]);

        const activePlanId = getHighestRankedPlanId(currentPlanId, org?.plan_id, sub?.plan_id, req.user?.user_metadata?.plan);
        const activeRank = activePlanId ? PLAN_RANKS[activePlanId] || 0 : 0;
        const targetRank = PLAN_RANKS[targetPlanId] || 0;

        if (activePlanId === targetPlanId) {
            return res.json({ success: true, no_change: true, message: 'You are already on this plan.' });
        }

        const nowIso = new Date().toISOString();
        const months = Number(interval) >= 12 ? 12 : 1;

        if (targetRank > activeRank && activePlanId) {
            const proration = calculateProration({
                currentPlanId: activePlanId,
                targetPlanId,
                interval: months,
                currentPlanPricePaise: Number(sub?.plan_price_paise || 0),
                periodStart: org?.plan_start_date || sub?.started_at || null,
                periodEnd: org?.plan_end_date || sub?.expires_at || null,
            });
            const idempotencyKey = `upgrade:${userId}:${activePlanId}:${targetPlanId}:${months}:${proration.period_end}`;

            const { data: existingInvoice } = await supabase
                .from('subscription_invoices')
                .select('*')
                .eq('idempotency_key', idempotencyKey)
                .maybeSingle();

            if (existingInvoice?.metadata?.short_url && existingInvoice.status === 'pending_payment') {
                return res.json({
                    success: true,
                    payment_link: existingInvoice.metadata.short_url,
                    invoice_id: existingInvoice.id,
                    invoice_preview: existingInvoice.metadata?.proration,
                });
            }

            const { data: invoice, error: invoiceErr } = await supabase
                .from('subscription_invoices')
                .insert({
                    user_id: userId,
                    organization_id: orgId,
                    subscription_user_id: sub?.user_id || null,
                    type: 'upgrade',
                    status: 'draft',
                    current_plan_id: activePlanId,
                    target_plan_id: targetPlanId,
                    billing_interval: getBillingInterval(months),
                    period_start: proration.period_start,
                    period_end: proration.period_end,
                    subtotal_paise: proration.prorated_target_cost_paise,
                    credit_applied_paise: proration.unused_current_credit_paise,
                    total_paise: proration.total_payable_paise,
                    currency: 'INR',
                    idempotency_key: idempotencyKey,
                    gateway: 'razorpay',
                    metadata: { proration },
                })
                .select()
                .single();

            if (invoiceErr) throw invoiceErr;

            const targetLabel = targetPlan?.name || PLAN_PRICES[targetPlanId]?.label || targetPlanId;
            const activeLabel = PLAN_PRICES[activePlanId]?.label || activePlanId;
            const origin = req.headers.origin || 'https://wb.getaipilot.in';
            const razorpayData = await createRazorpayPaymentLink({
                amount: proration.total_payable_paise,
                currency: 'INR',
                accept_partial: false,
                description: `WhatsApp ${activeLabel} to ${targetLabel} prorated upgrade`,
                customer: {
                    name: customerName || req.user?.user_metadata?.full_name || 'Customer',
                    email: customerEmail || req.user?.email,
                    contact: customerContact,
                },
                notify: { sms: false, email: true },
                reminder_enable: true,
                notes: {
                    user_id: userId,
                    organization_id: orgId,
                    plan: targetPlanId,
                    interval: String(months),
                    product: 'whatsapp',
                    change_type: 'upgrade',
                    invoice_id: invoice.id,
                },
                callback_url: `${origin}/payment-success`,
                callback_method: 'get',
            });

            await Promise.all([
                supabase
                    .from('subscription_invoices')
                    .update({
                        status: 'pending_payment',
                        gateway_payment_link_id: razorpayData.id,
                        metadata: { proration, short_url: razorpayData.short_url },
                        updated_at: nowIso,
                    })
                    .eq('id', invoice.id),
                supabase
                    .from('subscription_payment_transactions')
                    .insert({
                        invoice_id: invoice.id,
                        user_id: userId,
                        organization_id: orgId,
                        gateway: 'razorpay',
                        gateway_payment_link_id: razorpayData.id,
                        status: 'pending',
                        amount_paise: proration.total_payable_paise,
                        idempotency_key: `payment-link:${razorpayData.id}`,
                        raw_payload: razorpayData,
                    }),
                supabase
                    .from('whatsapp_payments')
                    .insert({
                        user_id: userId,
                        razorpay_payment_link_id: razorpayData.id,
                        plan: targetLabel,
                        plan_id: targetPlanId,
                        amount: proration.total_payable_paise,
                        interval_months: months,
                        status: 'pending',
                        invoice_id: invoice.id,
                        change_type: 'upgrade',
                        idempotency_key: idempotencyKey,
                    })
            ]);

            return res.json({
                success: true,
                payment_link: razorpayData.short_url,
                invoice_id: invoice.id,
                invoice_preview: proration,
            });
        }

        if (targetRank >= activeRank) {
            return res.status(409).json({ error: 'Unable to determine an active lower plan for upgrade proration.' });
        }

        const effectiveAt = (toValidDate(sub?.expires_at || org?.plan_end_date) || addMonths(new Date(), months)).toISOString();
        const metadata = {
            from_plan_id: activePlanId,
            to_plan_id: targetPlanId,
            requested_interval_months: months,
            requested_at: nowIso,
            source: 'billing_api',
        };

        await Promise.all([
            supabase
                .from('app_user_subscriptions')
                .update({
                    status: 'scheduled_downgrade',
                    scheduled_plan_id: targetPlanId,
                    scheduled_change_type: 'downgrade',
                    scheduled_effective_at: effectiveAt,
                    scheduled_change_requested_at: nowIso,
                    scheduled_change_metadata: metadata,
                    updated_at: nowIso,
                })
                .eq('user_id', userId),
            supabase
                .from('organizations')
                .update({
                    scheduled_plan_id: targetPlanId,
                    scheduled_change_type: 'downgrade',
                    scheduled_effective_at: effectiveAt,
                    scheduled_change_requested_at: nowIso,
                    scheduled_change_metadata: metadata,
                    updated_at: nowIso,
                })
                .eq('id', orgId)
        ]);

        res.json({
            success: true,
            scheduled_downgrade: true,
            plan: targetPlan?.name || targetPlanId,
            effective_at: effectiveAt,
            message: `${targetPlan?.name || targetPlanId} will start from your next billing cycle.`,
        });
    } catch (err: any) {
        console.error('[billing/change-plan] Error:', err);
        res.status(500).json({ error: err.message || 'Failed to change subscription plan' });
    }
};

export const cancelScheduledPlanChange = async (req: any, res: Response) => {
    const orgId = req.organization_id;
    const userId = req.user?.id;

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });
        if (!userId) return res.status(401).json({ error: 'Authenticated user is required' });

        const nowIso = new Date().toISOString();

        await Promise.all([
            supabase
                .from('app_user_subscriptions')
                .update({
                    status: 'active',
                    scheduled_plan_id: null,
                    scheduled_change_type: null,
                    scheduled_effective_at: null,
                    scheduled_change_requested_at: null,
                    scheduled_change_metadata: {},
                    updated_at: nowIso,
                })
                .eq('user_id', userId)
                .eq('scheduled_change_type', 'downgrade'),
            supabase
                .from('organizations')
                .update({
                    scheduled_plan_id: null,
                    scheduled_change_type: null,
                    scheduled_effective_at: null,
                    scheduled_change_requested_at: null,
                    scheduled_change_metadata: {},
                    updated_at: nowIso,
                })
                .eq('id', orgId)
                .eq('scheduled_change_type', 'downgrade')
        ]);

        res.json({
            success: true,
            canceled: true,
            message: 'Scheduled downgrade has been cancelled. Your current plan will continue.',
        });
    } catch (err: any) {
        console.error('[billing/cancel-scheduled-change] Error:', err);
        res.status(500).json({ error: err.message || 'Failed to cancel scheduled plan change' });
    }
};

export const getWallet = async (req: any, res: Response) => {
  const orgId = req.organization_id;
  try {
    const { data: wallet, error } = await supabase
      .from('whatsapp_wallets')
      .select('balance_paise, currency')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) throw error;

    res.json({
      wallet: wallet || { balance_paise: 0, currency: "INR" }
    });
  } catch (err: any) {
    console.error('Error fetching wallet:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch wallet' });
  }
};

export const getNotifications = async (req: any, res: Response) => {
  const orgId = req.organization_id;
  try {
    if (!orgId) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    const { data: transactions, error } = await supabase
      .from('whatsapp_wallet_transactions')
      .select('id, type, amount_paise, status, description, created_at')
      .eq('organization_id', orgId)
      .eq('type', 'recharge')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) throw error;

    const notifications = (transactions || []).map((t: any) => {
      const amountRupees = (t.amount_paise / 100).toFixed(2);
      let type = 'info';
      let title = 'Payment Update';
      let message = t.description || `Wallet transaction of ₹${amountRupees}`;

      if (t.status === 'completed') {
        type = 'success';
        title = 'Payment Successful';
        message = `Your wallet recharge of ₹${amountRupees} was completed successfully.`;
      } else if (t.status === 'failed') {
        type = 'error';
        title = 'Payment Failed';
        message = `Your wallet recharge of ₹${amountRupees} failed. Please try again.`;
      } else if (t.status === 'pending') {
        type = 'warning';
        title = 'Payment Pending';
        message = `Your wallet recharge of ₹${amountRupees} is currently pending.`;
      } else if (t.status === 'cancelled') {
        type = 'warning';
        title = 'Payment Cancelled';
        message = `Your wallet recharge of ₹${amountRupees} was cancelled.`;
      }

      return {
        id: t.id,
        type,
        title,
        message,
        time: t.created_at,
        link: '/billing'
      };
    });

    res.json({ notifications });
  } catch (err: any) {
    console.error('[billing/notifications] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch notifications' });
  }
};
