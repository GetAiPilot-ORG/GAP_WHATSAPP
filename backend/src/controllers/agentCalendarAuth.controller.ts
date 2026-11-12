import crypto from 'node:crypto';
import { getGoogleOAuthUrl, handleGoogleOAuthCallback } from '../services/googleCalendar.service.js';

function secret() {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error('Google OAuth is not configured on the server');
  return value;
}
function redirect() {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (!configured) throw new Error('GOOGLE_REDIRECT_URI must be configured');
  return configured;
}
export function createAgentCalendarAuthUrl(req: any, res: any) {
  try {
    const payload = Buffer.from(JSON.stringify({ org: req.organization_id, expires: Date.now() + 600000, nonce: crypto.randomUUID() })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    res.json({ url: getGoogleOAuthUrl(`agent.${payload}.${signature}`, redirect()) });
  } catch (e: any) { res.status(503).json({ error: e.message }); }
}
export async function completeAgentCalendarAuth(code: string, state: string) {
  const [prefix, payload, signature] = state.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload || '').digest('base64url');
  if (prefix !== 'agent' || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid calendar connection state');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!data.org || !Number.isFinite(data.expires) || data.expires < Date.now()) throw new Error('Calendar connection expired. Try connecting again.');
  return handleGoogleOAuthCallback(code, data.org, redirect());
}
