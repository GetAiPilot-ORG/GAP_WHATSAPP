import { supabase } from '../config/supabase.js';

export interface ResolvedOrganizationContext {
  organizationId: string;
  role: string;
  memberId?: string;
  isActive: boolean;
}

/**
 * Checks whether an organization possesses an active, valid subscription for GAP WhatsApp.
 */
export async function checkOrganizationSubscription(orgId: string): Promise<boolean> {
  if (!supabase) return true;

  try {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, is_active, plan_id, plan_status, created_at')
      .eq('id', orgId)
      .maybeSingle();

    if (orgErr || !org) return false;
    if (org.is_active === false) return false;

    // Check organization members for owner user ID
    const { data: ownerMember } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();

    const targetUserId = ownerMember?.user_id;
    let sub: any = null;

    if (targetUserId) {
      const { data: s } = await supabase
        .from('subscriptions')
        .select('plan_id, plan_label, expires_at, status')
        .eq('user_id', targetUserId)
        .maybeSingle();
      sub = s;
    }

    if (!sub) {
      // Fallback: If org is active or no subscription explicitly restricting, allow access
      return org.is_active ?? true;
    }

    const expiresAt = sub.expires_at ? new Date(sub.expires_at).getTime() : 0;
    const isActive = sub.status === 'active' || !sub.expires_at || expiresAt > Date.now();
    if (!isActive) return false;

    const plan = `${sub.plan_id || ''} ${sub.plan_label || ''}`.toLowerCase();
    const isWhatsAppPlan =
      plan.includes('whatsapp') ||
      plan.includes('all_in_one') ||
      plan.includes('bundle') ||
      plan.includes('ultimate') ||
      plan.includes('starter') ||
      plan.includes('growth') ||
      plan.includes('pro') ||
      plan.includes('gap') ||
      plan.includes('max') ||
      plan.includes('core') ||
      plan.includes('trial') ||
      plan.includes('enterprise');

    return isWhatsAppPlan;
  } catch (err: any) {
    console.error(`[Subscription Check] Error checking subscription for org ${orgId}:`, err.message);
    return true;
  }
}

/**
 * Automatically provisions a default organization and owner membership for a newly registered user.
 */
export async function provisionOrganizationForUser(user: any): Promise<string> {
  const orgName = `${(user.email || 'user').split('@')[0]}'s Workspace`;
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const { data: newOrg, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: orgName,
      slug: slug,
      plan_id: 'starter',
      plan_status: 'trial',
      is_active: true,
    })
    .select()
    .single();

  if (orgErr) throw orgErr;

  const { error: memberErr } = await supabase.from('organization_members').insert({
    user_id: user.id,
    organization_id: newOrg.id,
    role: 'owner',
    name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Owner',
    email: user.email,
  });

  if (memberErr) throw memberErr;

  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, organization_id: newOrg.id },
  });

  console.log(`[OrganizationContext] Successfully provisioned org ${newOrg.id} for ${user.email}`);
  return newOrg.id;
}

/**
 * Resolves user organization membership, handles email auto-healing,
 * portal role matching, and lazy workspace auto-provisioning.
 */
export async function resolveUserOrganizationContext(params: {
  user: any;
  portal?: string;
  targetOrgId?: string | null;
}): Promise<ResolvedOrganizationContext> {
  const { user, portal = 'owner', targetOrgId } = params;

  if (!supabase) throw new Error('Supabase client is not initialized');

  // 1. Fetch all memberships for this user ID
  let { data: memberRows } = await supabase
    .from('organization_members')
    .select('id, user_id, role, organization_id, is_active')
    .eq('user_id', user.id);

  // 2. Fallback: If no rows found by user.id, check by verified email and auto-heal
  const isEmailVerified = Boolean(
    user.email_confirmed_at ||
      user.user_metadata?.email_verified ||
      user.app_metadata?.provider === 'google'
  );

  if ((!memberRows || memberRows.length === 0) && user.email && isEmailVerified) {
    const { data: byEmail } = await supabase
      .from('organization_members')
      .select('id, user_id, role, organization_id, is_active')
      .ilike('email', user.email);

    if (byEmail && byEmail.length > 0) {
      memberRows = byEmail;
      const unlinked = byEmail.some((m: any) => m.user_id !== user.id);
      if (unlinked) {
        await supabase
          .from('organization_members')
          .update({ user_id: user.id })
          .ilike('email', user.email);
      }
    }
  }

  // 3. Select the most relevant membership
  let member: any = null;
  if (memberRows && memberRows.length > 0) {
    if (targetOrgId) {
      member = memberRows.find((m: any) => m.organization_id === targetOrgId);
    }
    if (!member && portal === 'agent') {
      member =
        memberRows.find((m: any) => m.role === 'agent' && m.is_active) ||
        memberRows.find((m: any) => m.role === 'agent') ||
        memberRows[0];
    } else if (!member) {
      member =
        memberRows.find((m: any) => m.role === 'owner' || m.role === 'admin') ||
        memberRows[0];
    }
  }

  const dbRole = member?.role;

  // 4. Portal-specific validation
  if (portal === 'agent') {
    if (!member) {
      throw new Error('Agent profile was not found');
    }
    if (dbRole !== 'agent') {
      throw new Error('This portal is only for team agents');
    }
    if (member.is_active === false) {
      throw new Error('Agent invitation is pending or expired');
    }
  }

  const effectiveRole = portal === 'agent' ? 'agent' : dbRole || 'owner';
  let orgId = member?.organization_id || targetOrgId || null;

  // 5. Lazy auto-provisioning for owners without an organization
  if (!orgId && effectiveRole !== 'agent') {
    orgId = await provisionOrganizationForUser(user);
  }

  if (!orgId) {
    throw new Error('User does not belong to any organization');
  }

  return {
    organizationId: orgId,
    role: effectiveRole,
    memberId: member?.id,
    isActive: member?.is_active ?? true,
  };
}
