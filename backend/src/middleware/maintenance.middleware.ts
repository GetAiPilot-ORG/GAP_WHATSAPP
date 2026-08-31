import { Request, Response, NextFunction } from "express";

let statusCache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const PRODUCT_KEY = "whatsapp_pilot";

async function fetchMaintenanceStatus() {
  if (statusCache && Date.now() < statusCache.expiresAt) {
    return statusCache.data;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.warn("Supabase env vars missing for maintenance check.");
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/system-status/${PRODUCT_KEY}`, {
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey
      }
    });

    if (!res.ok) {
      throw new Error("Failed to fetch status");
    }

    const data = await res.json();
    statusCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  } catch (err) {
    console.error("Maintenance check failed:", err);
    return null; // Fail-open
  }
}

export const maintenanceGuard = async (req: Request, res: Response, next: NextFunction) => {
  // Exclude health endpoints or webhooks
  const path = req.path;
  if (path === "/" || path.startsWith("/api/health") || path.startsWith("/api/webhook") || path.startsWith("/api/whatsapp/webhook")) {
    return next();
  }

  const status = await fetchMaintenanceStatus();

  if (status?.maintenance && status?.blockApi) {
    // Basic Admin bypass check based on headers (in a real app, verify the JWT properly)
    const isAdmin = req.headers['x-admin-bypass'] === 'true' || req.headers['x-user-role'] === 'admin';
    if (!status.allowAdminBypass || !isAdmin) {
      res.set('Retry-After', '300'); // 5 minutes
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: status.message || `${status.productName || 'Service'} is currently under maintenance.`,
        expectedBackAt: status.expectedBackAt
      });
    }
  }

  next();
};
