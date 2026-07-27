import { supabase } from '../config/supabase.js';

const PLAN_RANKS: Record<string, number> = {
    free: 0,
    starter: 10,
    growth: 20,
    pro: 30,
    enterprise: 40,
};

export function normalizeWhatsappPlanId(planId: any): string | null {
    const value = String(planId || '').toLowerCase();
    if (value.includes('enterprise') || value.includes('all_in_one') || value.includes('ultimate')) return 'enterprise';
    if (value.includes('pro') || value.includes('premium')) return 'pro';
    if (value.includes('growth')) return 'growth';
    if (value.includes('starter')) return 'starter';
    if (value === 'free') return 'free';
    return null;
}

export async function getOrganizationPlanLimits(organizationId: string) {
    const { data: org } = await supabase
        .from('organizations')
        .select('plan_id')
        .eq('id', organizationId)
        .maybeSingle();

    const { data: owner } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId)
        .eq('role', 'owner')
        .maybeSingle();

    const { data: subscription } = owner?.user_id
        ? await supabase
            .from('app_user_subscriptions')
            .select('plan_id, status, expires_at')
            .eq('user_id', owner.user_id)
            .maybeSingle()
        : { data: null };

    const subscriptionActive = subscription
        && subscription.status === 'active'
        && (!subscription.expires_at || new Date(subscription.expires_at).getTime() > Date.now());
    const planId = [org?.plan_id, subscriptionActive ? subscription.plan_id : null]
        .map(normalizeWhatsappPlanId)
        .filter((id): id is string => !!id)
        .sort((a, b) => PLAN_RANKS[b] - PLAN_RANKS[a])[0] || null;
    const { data: plan } = planId
        ? await supabase
            .from('whatsapp_subscription_plans')
            .select('id, name, limits')
            .eq('id', planId)
            .maybeSingle()
        : { data: null };

    return {
        plan_id: plan?.id || planId,
        plan_name: plan?.name || 'No active plan',
        limits: plan?.limits || {},
    };
}

export async function enforcePlanResourceLimit(params: {
    organization_id: string;
    resource: 'contacts' | 'flows' | 'ai_agents' | 'agents' | 'numbers';
    table: string;
    countColumn?: string;
    filters?: Record<string, any>;
    label: string;
}) {
    const planInfo = await getOrganizationPlanLimits(params.organization_id);
    const limit = Number(planInfo.limits?.[params.resource] ?? -1);
    if (limit < 0) return { allowed: true, limit, used: 0, plan: planInfo };

    let query = supabase
        .from(params.table)
        .select(params.countColumn || 'id', { count: 'exact', head: true })
        .eq('organization_id', params.organization_id);

    for (const [key, value] of Object.entries(params.filters || {})) {
        if (Array.isArray(value)) query = query.in(key, value);
        else query = query.eq(key, value);
    }

    const { count, error } = await query;
    if (error) throw error;
    const used = Number(count || 0);

    if (used >= limit) {
        const err: any = new Error(`${params.label} limit reached for ${planInfo.plan_name} plan (${used}/${limit}). Upgrade your plan to add more.`);
        err.statusCode = 402;
        err.limit = { resource: params.resource, used, limit, plan: planInfo };
        throw err;
    }

    return { allowed: true, limit, used, plan: planInfo };
}

export async function enforceWhatsAppCloudNumberLimit(organizationId: string, phoneNumberId: string) {
    const { data: existingAccount, error: existingAccountErr } = await supabase
        .from('w_wa_accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();
    if (existingAccountErr) throw existingAccountErr;
    if (existingAccount?.id) return existingAccount;

    const planInfo = await getOrganizationPlanLimits(organizationId);
    const limit = Number(planInfo.limits?.numbers ?? -1);
    if (limit < 0) return null;

    const { count, error } = await supabase
        .from('w_wa_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('status', ['connected', 'active'])
        .not('whatsapp_business_account_id', 'is', null);
    if (error) throw error;

    const used = Number(count || 0);
    if (used >= limit) {
        const err: any = new Error(`WhatsApp number limit reached for ${planInfo.plan_name} plan (${used}/${limit}). Upgrade your plan to add more.`);
        err.statusCode = 402;
        err.limit = { resource: 'numbers', used, limit, plan: planInfo };
        throw err;
    }

    return null;
}
