import { supabase } from '../config/supabase.js';

export async function checkSubscription(orgId: string): Promise<boolean> {
    if (!supabase) return true; // Debug mode fallback
    try {
        const { data: ownerMember, error: ownerErr } = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', orgId)
            .eq('role', 'owner')
            .maybeSingle();

        if (ownerErr || !ownerMember) {
            console.warn(`[Subscription Check] No owner found for org ${orgId}`);
            return false;
        }

        const { data: sub, error: subErr } = await supabase
            .from('app_user_subscriptions')
            .select('plan_id, expires_at')
            .eq('user_id', ownerMember.user_id)
            .maybeSingle();

        if (subErr || !sub) {
            console.warn(`[Subscription Check] No subscription found for user ${ownerMember.user_id}`);
            return false;
        }

        const expiresAt = sub.expires_at ? new Date(sub.expires_at).getTime() : 0;
        const isActive = expiresAt > Date.now();
        if (!isActive) return false;

        const plan = String(sub.plan_id || '').toLowerCase();
        const isWhatsAppPlan = plan.includes('whatsapp') || plan.includes('all_in_one') || plan.includes('bundle') || plan.includes('ultimate') || plan.includes('starter') || plan.includes('growth') || plan.includes('pro');
        return isWhatsAppPlan;
    } catch (err: any) {
        console.error(`[Subscription Check] Error checking subscription for org ${orgId}:`, err.message);
        return false;
    }
}

export async function authMiddleware(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized - missing token' });

    if (!supabase) return res.status(503).json({ error: 'Service unavailable - Supabase not configured' });

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            console.error("Supabase Auth Error:", error?.message || error);
            return res.status(401).json({ error: 'Unauthorized - invalid or expired token' });
        }

        req.user = user;

        const { data: member } = await supabase
            .from('organization_members')
            .select('role, organization_id, is_active')
            .eq('user_id', user.id)
            .maybeSingle();

        const portal = req.headers['x-auth-portal'] || 'owner';
        const dbRole = member?.role;

        if (portal === 'agent') {
            if (!member) {
                return res.status(403).json({ error: 'Forbidden - Agent profile was not found' });
            }
            if (dbRole !== 'agent') {
                return res.status(403).json({ error: 'Forbidden - This login page is only for team agents' });
            }
            if (member.is_active === false) {
                return res.status(403).json({ error: 'Forbidden - Agent invitation is pending or expired' });
            }
            req.role = 'agent';
        } else {
            req.role = dbRole || 'owner';
        }

        let orgId = member?.organization_id || user.user_metadata?.organization_id || null;

        if (!orgId && req.role !== 'agent') {
            console.log(`[Auth] Auto-provisioning organization for: ${user.email}`);
            try {
                const { data: checkAgain } = await supabase
                    .from('organization_members')
                    .select('organization_id')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (checkAgain?.organization_id) {
                    orgId = checkAgain.organization_id;
                } else {
                    const orgName = `${user.email.split('@')[0]}'s Workspace`;
                    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const { data: newOrg, error: orgErr } = await supabase
                        .from('organizations')
                        .insert({
                            name: orgName,
                            slug: slug,
                            plan_id: 'starter',
                            plan_status: 'trial',
                            is_active: true
                        })
                        .select()
                        .single();

                    if (orgErr) throw orgErr;

                    const { error: memberErr } = await supabase
                        .from('organization_members')
                        .insert({
                            user_id: user.id,
                            organization_id: newOrg.id,
                            role: 'owner',
                            name: user.user_metadata?.full_name || user.email.split('@')[0],
                            email: user.email
                        });

                    if (memberErr) throw memberErr;

                    await supabase.auth.admin.updateUserById(user.id, {
                        user_metadata: { ...user.user_metadata, organization_id: newOrg.id }
                    });

                    orgId = newOrg.id;
                    console.log(`[Auth] Successfully provisioned org ${orgId} for ${user.email}`);
                }
            } catch (err: any) {
                console.error(`[Auth] Provisioning failed for ${user.email}:`, err.message);
            }
        }

        if (!orgId) {
            console.warn(`⚠️ User ${user.email} (${user.id}) has no organization_id.`);
            return res.status(403).json({ error: 'Forbidden - User does not belong to any organization' });
        }

        req.organization_id = orgId;

        const bypassPaths = [
            '/api/team/my-profile',
            '/api/wa/logout'
        ];
        if (!bypassPaths.includes(req.path)) {
            const hasSub = await checkSubscription(orgId);
            if (!hasSub) {
                return res.status(403).json({ error: 'Subscription expired or plan does not include GAP WhatsApp access. Please upgrade.' });
            }
        }

        next();
    } catch (err: any) {
        console.error("Auth Middleware Exception:", err.message);
        return res.status(500).json({ error: 'Internal server error during authentication' });
    }
}
