import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { encryptToken } from '../utils/crypto.js';
import { AccountHealthService } from '../services/accountHealth.service.js';
import { getMetaErrorMessage, getMetaAccountDiagnostics, toSafeWhatsappAccount, buildAccountReadinessSummary, subscribeMetaAppToWaba, normalizeMessagingLimitTier } from '../services/meta.service.js';
import { enforceWhatsAppCloudNumberLimit } from '../services/billing.service.js';
import { sessions } from '../services/whatsapp.service.js';
import * as fs from 'fs';
import path from 'path';

const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const META_EMBEDDED_SIGNUP_VERSION = process.env.META_EMBEDDED_SIGNUP_VERSION || 'v4';
const META_EMBEDDED_SESSION_INFO_VERSION = process.env.META_EMBEDDED_SESSION_INFO_VERSION || '3';

function buildMetaEmbeddedSignupUrl() {
    if (process.env.META_EMBEDDED_SIGNUP_URL) return process.env.META_EMBEDDED_SIGNUP_URL;
    const appId = process.env.META_APP_ID || '';
    const configId = process.env.META_CONFIG_ID || '';
    const extras = {
        sessionInfoVersion: META_EMBEDDED_SESSION_INFO_VERSION,
        version: META_EMBEDDED_SIGNUP_VERSION,
    };
    const url = new URL('https://business.facebook.com/messaging/whatsapp/onboard/');
    if (appId) url.searchParams.set('app_id', appId);
    if (configId) url.searchParams.set('config_id', configId);
    url.searchParams.set('extras', JSON.stringify(extras));
    return url.toString();
}

export async function connectStart(req: any, res: Response) {
    const appId = process.env.META_APP_ID;
    const configId = process.env.META_CONFIG_ID;
    const redirectUri = process.env.META_REDIRECT_URI || "https://wb.getaipilot.in/wa-callback";
    const scope = "whatsapp_business_management,whatsapp_business_messaging";

    res.json({
        appId,
        configId,
        redirectUri,
        scope,
        hostedSignupUrl: buildMetaEmbeddedSignupUrl(),
        sessionInfoVersion: META_EMBEDDED_SESSION_INFO_VERSION,
        version: META_EMBEDDED_SIGNUP_VERSION
    });
}

export async function connectCallback(req: any, res: Response) {
    const { code, waba_id } = req.body;

    if (!code) return res.status(400).json({ error: "Missing code" });

    try {
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        const redirectUri = req.body.redirect_uri || '';
        const targetOrgId = req.organization_id;

        if (!targetOrgId) return res.status(400).json({ error: 'No organization found for this user.' });
        if (!appId || !appSecret) {
            return res.status(500).json({ error: 'Meta app configuration is missing. Set META_APP_ID and META_APP_SECRET.' });
        }

        const tokenUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
            `?client_id=${appId}` +
            `&client_secret=${appSecret}` +
            `&code=${code}` +
            (redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : '');
        const tokenRes = await fetch(tokenUrl);
        const tokenData: any = await tokenRes.json();

        if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
            return res.status(400).json({
                error: getMetaErrorMessage(tokenData, 'Meta could not exchange the signup code. Please retry Connect with Meta.')
            });
        }

        const shortToken = tokenData.access_token;
        const longTokenUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
        const longRes = await fetch(longTokenUrl);
        const longData: any = await longRes.json();

        const finalToken = longData.access_token || shortToken;
        const insertedAccounts = [];
        const discoveryErrors: string[] = [];

        const wabaDiscoveryUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/assigned_whatsapp_business_accounts?access_token=${encodeURIComponent(finalToken)}`;
        const wabaRes = await fetch(wabaDiscoveryUrl);
        const wabaData: any = await wabaRes.json();

        if (!wabaRes.ok || wabaData.error) {
            return res.status(400).json({
                error: getMetaErrorMessage(wabaData, 'Meta could not list WhatsApp Business Accounts. Make sure the logged-in admin granted WhatsApp permissions.')
            });
        }

        const discoveredWabaIds = Array.isArray(wabaData.data) && wabaData.data.length
            ? wabaData.data
            : (waba_id ? [{ id: waba_id }] : []);

        if (discoveredWabaIds.length === 0) {
            return res.status(400).json({
                error: 'No WhatsApp Business Account was found. Select/create a WABA during Meta onboarding, add a phone number, then try again.'
            });
        }

        for (const waba of discoveredWabaIds) {
            const currentWabaId = waba.id;
            try {
                await subscribeMetaAppToWaba(currentWabaId, finalToken);
            } catch (error: any) {
                discoveryErrors.push(`Could not enable inbound webhooks for WABA ${currentWabaId}: ${error.message}`);
                continue;
            }
            const numbersUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${currentWabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status&access_token=${encodeURIComponent(finalToken)}`;
            const numRes = await fetch(numbersUrl);
            const numData: any = await numRes.json();

            if (!numRes.ok || numData.error) {
                discoveryErrors.push(getMetaErrorMessage(numData, `Could not fetch phone numbers for WABA ${currentWabaId}`));
                continue;
            }

            if (numData.data?.length) {
                for (const item of numData.data) {
                    const phone_number_id = item.id;
                    const display_phone_number = item.display_phone_number;

                    await enforceWhatsAppCloudNumberLimit(targetOrgId, phone_number_id);

                    // Register the phone number
                    try {
                        const registerUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phone_number_id}/register`;
                        const registerRes = await fetch(registerUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${finalToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                messaging_product: 'whatsapp',
                                pin: '123456'
                            })
                        });
                        const registerData: any = await registerRes.json();
                        if (!registerRes.ok || registerData.error) {
                            console.warn(`Registration API failed for ${phone_number_id}:`, registerData.error);
                        } else {
                            console.log(`Successfully registered phone number ${phone_number_id}`);
                        }
                    } catch (regErr) {
                        console.error(`Registration API exception for ${phone_number_id}:`, regErr);
                    }

                    const now = new Date().toISOString();
                    const { data, error } = await supabase.from('w_wa_accounts').upsert({
                        organization_id: targetOrgId,
                        whatsapp_business_account_id: currentWabaId,
                        phone_number_id,
                        display_phone_number,
                        name: item.verified_name || display_phone_number || 'WhatsApp Business',
                        access_token_encrypted: encryptToken(finalToken),
                        status: 'connected',
                        connection_status: 'CONNECTED',
                        token_status: 'VALID',
                        has_access_token: true,
                        last_health_check_at: now
                    }, { onConflict: 'phone_number_id' }).select();

                    if (error) {
                        console.error(`DB Save Error for phone ${phone_number_id}:`, error);
                        discoveryErrors.push(`Could not save phone ${display_phone_number || phone_number_id}: ${error.message}`);
                    } else if (data && data[0]) {
                        const diagnostics = await getMetaAccountDiagnostics(data[0]);

                        const tokenStatus = diagnostics.reconnect_required || diagnostics.issue_codes?.includes('token_expired')
                            ? 'EXPIRED'
                            : (diagnostics.issue_codes?.includes('token_missing') ? 'MISSING' : 'VALID');

                        const bizStatus = diagnostics.business_verification?.status
                            ? String(diagnostics.business_verification.status).toUpperCase()
                            : 'UNKNOWN';

                        const qualityRating = diagnostics.phone_number_access?.quality_rating
                            ? String(diagnostics.phone_number_access.quality_rating).toUpperCase()
                            : 'UNKNOWN';

                        const rawLimit = diagnostics.phone_number_access?.messaging_limit_tier || diagnostics.phone_number_access?.messaging_limit;
                        const messagingLimit = rawLimit ? normalizeMessagingLimitTier(rawLimit) : null;
                        const webhookStatus = diagnostics.webhook_subscription && !diagnostics.webhook_subscription.error ? 'SUBSCRIBED' : 'NOT_SUBSCRIBED';

                        const updatedAccount = await AccountHealthService.updateHealth(data[0].id, {
                            connection_status: tokenStatus === 'EXPIRED' ? 'TOKEN_INVALID' : 'CONNECTED',
                            token_status: tokenStatus as any,
                            business_verification_status: bizStatus as any,
                            business_name: diagnostics.business_verification?.business_name || null,
                            business_id: diagnostics.business_verification?.business_id || null,
                            quality_rating: qualityRating as any,
                            messaging_limit: messagingLimit,
                            webhook_status: webhookStatus,
                            diagnostics_json: diagnostics,
                        }).catch(err => {
                            console.error('[ConnectCallback] Failed to persist initial health update:', err.message);
                            return data[0];
                        }) || data[0];

                        insertedAccounts.push({
                            ...toSafeWhatsappAccount(updatedAccount),
                            ...buildAccountReadinessSummary(updatedAccount),
                            send_ready: diagnostics.send_ready,
                            diagnostics_summary: diagnostics.send_ready ? 'Cloud API send access verified.' : diagnostics.issues.join(', '),
                            diagnostics
                        });
                    }
                }
            } else {
                discoveryErrors.push(`No phone numbers found in WABA ${currentWabaId}. Add/verify a dedicated number in Meta onboarding first.`);
            }
        }

        if (insertedAccounts.length === 0) {
            return res.status(400).json({
                error: discoveryErrors[0] || 'No WhatsApp phone number could be connected. Add a dedicated number and complete OTP verification in Meta.',
                details: discoveryErrors
            });
        }

        res.json({ success: true, accounts: insertedAccounts, warnings: discoveryErrors });

    } catch (e: any) {
        console.error("Connect Error:", e.message);
        res.status(e.statusCode || 500).json({ error: e.message, limit: e.limit });
    }
}

export async function logout(req: any, res: Response) {
    const { sessionId, phone_number_id } = req.body;
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    try {
        console.log(`Logout requested for session ${sessionId}`);
        const sock = sessions.get(sessionId);
        if (sock) {
            try {
                await sock.logout();
                sock.end(undefined);
            } catch (e) {
                console.error("Baileys logout error:", e);
            }
            sessions.delete(sessionId);
        }

        const sessionPath = path.join("baileys_auth_info", sessionId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        if (phone_number_id) {
            const { error: dbErr } = await supabase
                .from('w_wa_accounts')
                .update({ status: 'disconnected', is_active: false })
                .eq('phone_number_id', phone_number_id);

            if (dbErr) console.error(`DB Update Error for ${phone_number_id}:`, dbErr);
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error("Logout error:", err);
        res.status(500).json({ error: err.message || "Failed to logout" });
    }
}
