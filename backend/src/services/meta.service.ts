import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export async function inspectMetaTokenPermissions(token: string) {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret || !token) {
        return { checked: false, is_valid: null, expires_at: null, missingScopes: [], scopes: [], error: null };
    }

    try {
        const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
        const response = await fetch(debugUrl);
        const data: any = await response.json();
        if (!response.ok || data.error) {
            return {
                checked: true,
                is_valid: false,
                expires_at: null,
                missingScopes: [],
                scopes: [],
                error: data.error?.message || 'Unable to inspect Meta token'
            };
        }

        const scopes = Array.isArray(data.data?.scopes) ? data.data.scopes : [];
        const requiredScopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
        const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
        return {
            checked: true,
            is_valid: data.data?.is_valid ?? null,
            expires_at: data.data?.expires_at || null,
            missingScopes,
            scopes,
            error: data.data?.is_valid === false ? 'Meta access token is no longer valid.' : null
        };
    } catch (err: any) {
        return { checked: true, is_valid: null, expires_at: null, missingScopes: [], scopes: [], error: err.message || 'Unable to inspect Meta token' };
    }
}

export function getMetaIssueCode(error: any) {
    const message = String(error?.message || error?.error_user_msg || '').toLowerCase();
    const code = Number(error?.code);
    const subcode = Number(error?.error_subcode);

    if (
        code === 190 ||
        subcode === 463 ||
        subcode === 467 ||
        message.includes('session has expired') ||
        message.includes('error validating access token') ||
        message.includes('access token has expired')
    ) {
        return 'token_expired';
    }

    if (code === 10 || code === 200 || message.includes('permission')) return 'permission_missing';
    return 'meta_access_error';
}

export function addDiagnosticIssue(diagnostics: any, code: string, message: string, metaError?: any) {
    diagnostics.issue_codes = Array.isArray(diagnostics.issue_codes) ? diagnostics.issue_codes : [];
    diagnostics.issues = Array.isArray(diagnostics.issues) ? diagnostics.issues : [];

    if (!diagnostics.issue_codes.includes(code)) diagnostics.issue_codes.push(code);
    if (!diagnostics.issues.includes(message)) diagnostics.issues.push(message);

    if (code === 'token_expired') diagnostics.reconnect_required = true;
    if (metaError) diagnostics.meta_errors.push({
        code: metaError.code || null,
        subcode: metaError.error_subcode || null,
        type: metaError.type || null,
        fbtrace_id: metaError.fbtrace_id || null
    });
}

export function getMetaSendErrorMessage(error: any) {
    const code = error?.code;
    const details = error?.error_data?.details || error?.message || '';
    if (code === 131005) {
        return `(#131005) Access denied: selected WhatsApp account token cannot send messages with this phone number. Reconnect the account using a token with whatsapp_business_messaging permission, and make sure the phone number belongs to the same WABA/token. Meta details: ${details}`;
    }
    const parts = [
        error?.message,
        details && details !== error?.message ? details : '',
        error?.error_subcode ? `subcode ${error.error_subcode}` : '',
        error?.fbtrace_id ? `trace ${error.fbtrace_id}` : ''
    ].filter(Boolean);
    return parts.join(' | ') || 'API Error';
}

export function getMetaErrorMessage(data: any, fallback: string) {
    const error = data?.error || data;
    if (!error) return fallback;
    const parts = [
        error.message,
        error.error_user_msg,
        error.error_data?.details,
        error.error_subcode ? `subcode ${error.error_subcode}` : '',
        error.fbtrace_id ? `trace ${error.fbtrace_id}` : ''
    ].filter(Boolean);
    return parts.join(' | ') || fallback;
}

export async function subscribeMetaAppToWaba(wabaId: string, token: string) {
    if (!wabaId || !token) throw new Error('WABA ID and access token are required to enable webhooks.');

    const response = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        }
    );
    const data: any = await response.json();
    if (!response.ok || data.error || data.success !== true) {
        throw new Error(getMetaErrorMessage(data, `Meta could not enable webhooks for WABA ${wabaId}.`));
    }
}

export function buildAccountReadinessSummary(account: any) {
    const isMeta = Boolean(account?.whatsapp_business_account_id || account?.access_token_encrypted);
    if (!isMeta) {
        return {
            connection_type: 'qr_session',
            send_ready: account?.status === 'connected' || account?.status === 'active',
            diagnostics_summary: account?.status === 'connected' || account?.status === 'active'
                ? 'QR testing session connected.'
                : 'QR testing session is not connected.'
        };
    }

    const issues = [];
    if (!account?.phone_number_id) issues.push('Missing phone number ID');
    if (!account?.whatsapp_business_account_id) issues.push('Missing WABA ID');
    if (!account?.access_token_encrypted) issues.push('Missing Meta access token');
    if (account?.status === 'disconnected') issues.push('Account disconnected');

    return {
        connection_type: 'meta_cloud_api',
        send_ready: issues.length === 0,
        diagnostics_summary: issues.length === 0
            ? 'Cloud API account has required saved credentials. Run diagnostics for live Meta permission check.'
            : issues.join(', ')
    };
}

export function toSafeWhatsappAccount(account: any) {
    if (!account) return account;
    const { access_token_encrypted, ...safe } = account;
    return {
        ...safe,
        ...buildAccountReadinessSummary(account)
    };
}

export async function getMetaAccountDiagnostics(account: any) {
    const token = account?.access_token_encrypted ? decryptToken(account.access_token_encrypted) : '';
    const diagnostics: any = {
        account_id: account?.id || null,
        phone_number_id: account?.phone_number_id || null,
        whatsapp_business_account_id: account?.whatsapp_business_account_id || null,
        has_access_token: !!token,
        token_permissions: null,
        phone_number_access: null,
        waba_access: null,
        business_verification: null,
        webhook_subscription: null,
        issue_codes: [],
        reconnect_required: false,
        meta_errors: [],
        send_ready: false,
        issues: []
    };

    if (!token) {
        addDiagnosticIssue(diagnostics, 'token_missing', 'Meta API permissions are not linked to this WhatsApp number. Click Connect Meta to link account.');
        return diagnostics;
    }

    diagnostics.token_permissions = await inspectMetaTokenPermissions(token);
    if (diagnostics.token_permissions?.is_valid === false) {
        addDiagnosticIssue(
            diagnostics,
            'token_expired',
            'Meta access token expired. Reconnect this WhatsApp number from Connect with Meta to restore sending, templates, and profile access.'
        );
    }
    if (diagnostics.token_permissions?.missingScopes?.length) {
        addDiagnosticIssue(
            diagnostics,
            'permission_missing',
            `Token missing permission(s): ${diagnostics.token_permissions.missingScopes.join(', ')}`
        );
    }

    if (account?.phone_number_id) {
        try {
            const phoneRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status&access_token=${encodeURIComponent(token)}`);
            const phoneJson: any = await phoneRes.json();
            diagnostics.phone_number_access = phoneJson;
            if (!phoneRes.ok || phoneJson.error) {
                const issueCode = getMetaIssueCode(phoneJson.error);
                addDiagnosticIssue(
                    diagnostics,
                    issueCode === 'token_expired' ? issueCode : 'phone_access_denied',
                    issueCode === 'token_expired'
                        ? 'Meta access token expired. Reconnect this WhatsApp number from Connect with Meta to restore sending, templates, and profile access.'
                        : `Token cannot access phone number ${account.phone_number_id}: ${phoneJson.error?.message || 'Unknown Meta error'}`,
                    phoneJson.error
                );
            }
        } catch (err: any) {
            addDiagnosticIssue(diagnostics, 'phone_access_check_failed', `Could not validate phone number access: ${err.message}`);
        }
    } else {
        addDiagnosticIssue(diagnostics, 'phone_number_missing', 'Missing phone_number_id on this account.');
    }

    if (account?.whatsapp_business_account_id) {
        try {
            const businessRes = await fetch(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.whatsapp_business_account_id}?fields=id,name,account_review_status,business_verification_status,owner_business_info&access_token=${encodeURIComponent(token)}`
            );
            const businessJson: any = await businessRes.json();
            if (businessRes.ok && !businessJson.error) {
                diagnostics.business_verification = {
                    status: businessJson.business_verification_status || 'unknown',
                    account_review_status: businessJson.account_review_status || null,
                    business_name: businessJson.owner_business_info?.name || businessJson.name || null,
                    business_id: businessJson.owner_business_info?.id || null,
                };
            }
        } catch (err: any) {
            console.warn('[Meta diagnostics] Business verification check failed:', err.message);
        }

        try {
            const wabaRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${account.whatsapp_business_account_id}/phone_numbers?access_token=${encodeURIComponent(token)}`);
            const wabaJson: any = await wabaRes.json();
            diagnostics.waba_access = wabaJson;
            if (!wabaRes.ok || wabaJson.error) {
                const issueCode = getMetaIssueCode(wabaJson.error);
                addDiagnosticIssue(
                    diagnostics,
                    issueCode === 'token_expired' ? issueCode : 'waba_access_denied',
                    issueCode === 'token_expired'
                        ? 'Meta access token expired. Reconnect this WhatsApp number from Connect with Meta to restore sending, templates, and profile access.'
                        : `Token cannot access WABA ${account.whatsapp_business_account_id}: ${wabaJson.error?.message || 'Unknown Meta error'}`,
                    wabaJson.error
                );
            } else if (account?.phone_number_id && !wabaJson.data?.some((phone: any) => String(phone.id) === String(account.phone_number_id))) {
                addDiagnosticIssue(diagnostics, 'phone_not_in_waba', `Phone number ${account.phone_number_id} was not found inside WABA ${account.whatsapp_business_account_id} for this token.`);
            }
        } catch (err: any) {
            addDiagnosticIssue(diagnostics, 'waba_access_check_failed', `Could not validate WABA phone list: ${err.message}`);
        }

        try {
            const subscriptionRes = await fetch(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.whatsapp_business_account_id}/subscribed_apps?access_token=${encodeURIComponent(token)}`
            );
            const subscriptionJson: any = await subscriptionRes.json();
            diagnostics.webhook_subscription = subscriptionJson;
            const appId = process.env.META_APP_ID;
            const isSubscribed = subscriptionRes.ok &&
                !subscriptionJson.error &&
                Array.isArray(subscriptionJson.data) &&
                subscriptionJson.data.some((app: any) => !appId || String(app.id) === String(appId));
            if (!isSubscribed) {
                addDiagnosticIssue(
                    diagnostics,
                    'webhook_not_subscribed',
                    subscriptionJson.error?.message || 'This Meta app is not subscribed to the WABA. Reconnect the account to restore inbound webhooks.',
                    subscriptionJson.error
                );
            }
        } catch (err: any) {
            addDiagnosticIssue(diagnostics, 'webhook_subscription_check_failed', `Could not validate webhook subscription: ${err.message}`);
        }
    } else {
        addDiagnosticIssue(diagnostics, 'waba_missing', 'Missing whatsapp_business_account_id on this account.');
    }

    diagnostics.send_ready = diagnostics.issues.length === 0;
    return diagnostics;
}

export async function getOrgWhatsappAccount(accountId: string, orgId: string) {
    const { data: account, error } = await supabase
        .from('w_wa_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (error) throw error;
    return account;
}

export function formatMetaApiError(error: any, fallback: string) {
    if (!error) return fallback;
    const parts = [
        error.message,
        error.error_user_msg,
        error.error_data?.details,
        error.code ? `code ${error.code}` : '',
        error.error_subcode ? `subcode ${error.error_subcode}` : '',
        error.fbtrace_id ? `trace ${error.fbtrace_id}` : ''
    ].filter(Boolean);

    return parts.length ? parts.join(' | ') : fallback;
}

export async function fetchMetaBusinessProfile(account: any) {
    const token = account?.access_token_encrypted ? decryptToken(account.access_token_encrypted) : '';
    if (!account?.phone_number_id || !token) throw new Error('Selected account is missing phone number ID or access token');

    const fields = 'about,address,description,email,profile_picture_url,websites,vertical';
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phone_number_id}/whatsapp_business_profile?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    const json: any = await response.json();
    if (!response.ok || json.error) throw new Error(json.error?.message || 'Failed to fetch WhatsApp business profile');

    return Array.isArray(json.data) ? (json.data[0] || {}) : json;
}

export async function updateMetaBusinessProfile(account: any, body: any, profilePictureHandle?: string | null) {
    const token = account?.access_token_encrypted ? decryptToken(account.access_token_encrypted) : '';
    if (!account?.phone_number_id || !token) throw new Error('Selected account is missing phone number ID or access token');

    const payload: any = {
        messaging_product: 'whatsapp'
    };

    for (const key of ['about', 'address', 'description', 'email', 'vertical']) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
            const val = String(body[key] || '');
            if (!val.trim() && ['about', 'address', 'vertical'].includes(key)) continue;
            payload[key] = val;
        }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'websites')) {
        const raw = body.websites;
        const sites = Array.isArray(raw)
            ? raw.filter(Boolean)
            : String(raw || '').split('\n').map((item) => item.trim()).filter(Boolean);
        if (sites.length > 0) {
            payload.websites = sites;
        } else if (body.websites === "") {
            payload.websites = [];
        }
    }

    if (profilePictureHandle) payload.profile_picture_handle = profilePictureHandle;

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phone_number_id}/whatsapp_business_profile`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const json: any = await response.json();
    if (!response.ok || json.error) throw new Error(formatMetaApiError(json.error, 'Failed to update WhatsApp business profile'));
    return json;
}

export async function uploadMetaProfilePicture(file: any, token: string) {
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error('META_APP_ID is required to upload a profile picture');
    if (!file?.buffer?.length) throw new Error('Profile picture file is required');
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
        throw new Error('Profile picture must be a JPG or PNG image. WEBP is not accepted by Meta for WhatsApp profile pictures.');
    }

    const createUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads`);
    createUrl.searchParams.set('file_name', file.originalname || 'profile.jpg');
    createUrl.searchParams.set('file_length', String(file.buffer.length));
    createUrl.searchParams.set('file_type', file.mimetype || 'image/jpeg');
    createUrl.searchParams.set('access_token', token);

    const createRes = await fetch(createUrl.toString(), { method: 'POST' });
    const createJson: any = await createRes.json();
    if (!createRes.ok || createJson.error || !createJson.id) {
        throw new Error(formatMetaApiError(createJson.error, 'Failed to create Meta upload session'));
    }

    const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${createJson.id}`, {
        method: 'POST',
        headers: {
            Authorization: `OAuth ${token}`,
            file_offset: '0',
            'Content-Type': file.mimetype || 'application/octet-stream'
        },
        body: file.buffer as any
    });
    const uploadJson: any = await uploadRes.json();
    if (!uploadRes.ok || uploadJson.error || !uploadJson.h) {
        throw new Error(formatMetaApiError(uploadJson.error, 'Failed to upload profile picture to Meta'));
    }

    return uploadJson.h;
}
