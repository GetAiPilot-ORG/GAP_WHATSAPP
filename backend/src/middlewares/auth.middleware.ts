import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import {
  resolveUserOrganizationContext,
  checkOrganizationSubscription,
} from '../services/organizationContext.service.js';

/**
 * Express Authentication and Tenant Context Middleware.
 * Verifies Bearer JWT tokens and delegates tenant resolution and subscription
 * gating to the deep Organization Context module.
 */
export async function authMiddleware(req: any, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized - missing token' });

  if (!supabase) return res.status(503).json({ error: 'Service unavailable - Supabase not configured' });

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized - invalid or expired token' });
    }

    req.user = user;

    const portal = (req.headers['x-auth-portal'] as string) || 'owner';
    const targetOrgId =
      (req.headers['x-organization-id'] as string) ||
      user.user_metadata?.organization_id ||
      null;

    const context = await resolveUserOrganizationContext({
      user,
      portal,
      targetOrgId,
    });

    req.role = context.role;
    req.organization_id = context.organizationId;

    const bypassPaths = ['/api/team/my-profile', '/api/wa/logout'];
    if (!bypassPaths.includes(req.path)) {
      const hasSub = await checkOrganizationSubscription(context.organizationId);
      if (!hasSub) {
        return res.status(403).json({
          error:
            'Subscription expired or plan does not include GAP WhatsApp access. Please upgrade.',
        });
      }
    }

    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] Error:', err.message);
    const statusCode =
      err.message?.includes('Forbidden') ||
      err.message?.includes('Agent') ||
      err.message?.includes('invitation')
        ? 403
        : 500;
    return res.status(statusCode).json({ error: err.message || 'Authentication error' });
  }
}
