import { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { getGoogleOAuthUrl, handleGoogleOAuthCallback } from "../services/googleCalendar.service.js";

/**
 * Resolve organization_id from param, header, or query user_id fallback
 */
async function resolveOrganizationId(inputOrgId?: string): Promise<string | null> {
  if (inputOrgId && inputOrgId.trim().length > 0) {
    // Check if input is a valid organization ID
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", inputOrgId)
      .maybeSingle();

    if (org?.id) return org.id;

    // Check if input is a user_id in organization_members
    const { data: member } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", inputOrgId)
      .maybeSingle();

    if (member?.organization_id) return member.organization_id;
  }

  // Global fallback: return first active organization ID
  const { data: firstOrg } = await supabase
    .from("organizations")
    .select("id")
    .limit(1)
    .maybeSingle();

  return firstOrg?.id || null;
}

/**
 * GET /api/integrations/google/status?organization_id=...
 */
export async function getGoogleStatus(req: Request, res: Response) {
  try {
    const rawOrgId = String(req.query.organization_id || req.headers["x-organization-id"] || "");
    const orgId = await resolveOrganizationId(rawOrgId);

    if (!orgId) {
      return res.json({ connected: false });
    }

    const { data: integration } = await supabase
      .from("w_integrations")
      .select("connected_email, updated_at")
      .eq("organization_id", orgId)
      .eq("provider", "google_calendar")
      .maybeSingle();

    if (!integration) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      connectedEmail: integration.connected_email || "Google Account",
      updatedAt: integration.updated_at,
    });
  } catch (error: any) {
    console.error("Error in getGoogleStatus:", error);
    return res.status(500).json({ error: error.message || "Failed to check Google status" });
  }
}

/**
 * GET /api/integrations/google/auth-url?organization_id=...
 */
export async function getGoogleAuthUrlController(req: Request, res: Response) {
  try {
    const rawOrgId = String(req.query.organization_id || req.headers["x-organization-id"] || "");
    const orgId = await resolveOrganizationId(rawOrgId);

    if (!orgId) {
      return res.status(400).json({ error: "Could not resolve an active Organization ID" });
    }

    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const dynamicRedirectUri = process.env.GOOGLE_REDIRECT_URI || (host ? `${protocol}://${host}/api/integrations/google/callback` : undefined);

    const url = getGoogleOAuthUrl(orgId, dynamicRedirectUri);
    return res.json({ url });
  } catch (error: any) {
    console.error("Error in getGoogleAuthUrlController:", error);
    return res.status(500).json({ error: error.message || "Failed to generate OAuth URL" });
  }
}

/**
 * GET /api/integrations/google/callback?code=...&state=...
 */
export async function handleGoogleCallbackController(req: Request, res: Response) {
  try {
    const code = String(req.query.code || "");
    const rawOrgId = String(req.query.state || "");
    const orgId = await resolveOrganizationId(rawOrgId);

    if (!code || !orgId) {
      return res.status(400).send("Invalid callback parameters or missing organization");
    }

    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const dynamicRedirectUri = process.env.GOOGLE_REDIRECT_URI || (host ? `${protocol}://${host}/api/integrations/google/callback` : undefined);

    const { connectedEmail } = await handleGoogleOAuthCallback(code, orgId, dynamicRedirectUri);

    res.setHeader("Content-Type", "text/html");
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Calendar Connected</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; text-align: center; }
            .card { background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
            .icon { font-size: 3rem; margin-bottom: 1rem; }
            h2 { margin: 0 0 0.5rem 0; color: #4ade80; }
            p { color: #94a3b8; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h2>Google Calendar Connected!</h2>
            <p>Account: <strong>${connectedEmail}</strong></p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                connectedEmail: '${connectedEmail}'
              }, '*');
            }
            setTimeout(function() {
              window.close();
            }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Error handling Google OAuth callback:", error);
    return res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f87171;">
          <h2>OAuth Connection Failed</h2>
          <p>${error.message || 'An error occurred during authentication.'}</p>
        </body>
      </html>
    `);
  }
}
