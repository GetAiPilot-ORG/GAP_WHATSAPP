import test from 'node:test';
import assert from 'node:assert/strict';

// Never contact production services from these regression tests.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_KEY_ROLE = 'anon';
process.env.META_APP_ID = 'test-app';
process.env.META_APP_SECRET = 'test-secret';
process.env.META_REDIRECT_URI = 'https://example.com/legacy-callback';
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(32);
const { connectCallback } = await import('../wa.controller.js');
const { supabase } = await import('../../config/supabase.js');
const { AccountHealthService } = await import('../../services/accountHealth.service.js');

function response() {
    return {
        statusCode: 200,
        body: null as any,
        status(code: number) { this.statusCode = code; return this; },
        json(body: any) { this.body = body; return this; }
    };
}

test('signup responds while diagnostics are blocked and fetches only the selected number', async () => {
    const originalFetch = globalThis.fetch;
    const originalFrom = supabase.from;
    const originalUpdate = AccountHealthService.updateHealth;
    const calls: string[] = [];
    let finishDiagnostics!: (response: Response) => void;
    let finishExtension!: (response: Response) => void;
    let finishHealth!: () => void;
    const healthFinished = new Promise<void>(resolve => { finishHealth = resolve; });
    let saved: any;
    supabase.from = () => ({
        select: () => {
            const chain: any = { eq: () => chain, maybeSingle: async () => ({ data: { id: 'account-1' }, error: null }) };
            return chain;
        },
        upsert: (row: any) => {
            saved = { ...row, id: 'account-1' };
            return { select: async () => ({ data: [saved], error: null }) };
        }
    });
    AccountHealthService.updateHealth = async () => { finishHealth(); return saved; };
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/oauth/access_token') && !url.includes('grant_type=')) {
            const params = new URL(url).searchParams;
            assert.equal(params.get('code'), 'code+with&reserved=characters');
            assert.equal(params.has('redirect_uri'), false, 'SDK flow must not inherit META_REDIRECT_URI');
        }
        assert.ok(init?.signal, 'Meta calls must carry a timeout signal');
        if (url.includes('grant_type=fb_exchange_token')) {
            return new Promise<Response>(resolve => { finishExtension = resolve; });
        }
        if (url.endsWith('/register')) {
            assert.ok(calls.some(call => call.includes('/phone-1?')), 'Number lookup must run before token extension completes');
            finishExtension(new Response(JSON.stringify({ access_token: 'extended-token' })));
        }
        if (url.includes('/debug_token?')) return new Promise<Response>(resolve => { finishDiagnostics = resolve; });
        const payload = url.includes('/oauth/access_token') ? { access_token: 'signup-token' }
            : url.includes('/subscribed_apps') ? { success: true, data: [{ id: 'test-app' }] }
            : url.includes('/message_templates') ? {} // No template persistence needed in this test.
            : url.endsWith('/register') ? { success: true }
            : { id: 'phone-1', display_phone_number: '+911234567890', verified_name: 'Test' };
        return new Response(JSON.stringify(payload));
    }) as typeof fetch;
    try {
        const res = response();
        await Promise.race([
            connectCallback({ organization_id: 'org-1', body: { code: 'code+with&reserved=characters', waba_id: 'waba-1', phone_number_id: 'phone-1' } }, res as any),
            new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Signup waited for diagnostics')), 1000); timer.unref(); })
        ]);
        assert.equal(res.body.success, true);
        assert.equal(res.body.accounts[0].diagnostics_pending, true);
        assert.equal(res.body.accounts[0].access_token_encrypted, undefined);
        assert.equal(calls.some(url => url.includes('/waba-1/phone_numbers?')), false);
        assert.equal(saved.phone_number_id, 'phone-1');
        finishDiagnostics(new Response(JSON.stringify({ data: { is_valid: true, scopes: ['whatsapp_business_messaging', 'whatsapp_business_management'] } })));
        await healthFinished;
    } finally {
        globalThis.fetch = originalFetch;
        supabase.from = originalFrom;
        AccountHealthService.updateHealth = originalUpdate;
    }
});

test('a timed out code exchange returns a retryable error instead of hanging', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new DOMException('Timed out', 'TimeoutError'); }) as typeof fetch;
    try {
        const res = response();
        await connectCallback({ organization_id: 'org-1', body: { code: 'code' } }, res as any);
        assert.equal(res.statusCode, 504);
        assert.match(res.body.error, /Refresh your accounts/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('registration failure never saves an account as connected', async () => {
    const originalFetch = globalThis.fetch;
    const originalFrom = supabase.from;
    let saved = false;
    supabase.from = () => {
        const chain: any = { eq: () => chain, maybeSingle: async () => ({ data: { id: 'existing-account' }, error: null }) };
        return { select: () => chain, upsert: () => { saved = true; throw new Error('Must not save'); } };
    };
    globalThis.fetch = (async (input: any) => {
        const url = String(input);
        const payload = url.includes('/oauth/access_token') ? { access_token: 'signup-token' }
            : url.endsWith('/register') ? { error: { message: 'Registration denied' } }
            : url.includes('/subscribed_apps') ? { success: true }
            : { id: 'phone-1' };
        return new Response(JSON.stringify(payload), { status: url.endsWith('/register') ? 400 : 200 });
    }) as typeof fetch;
    try {
        const res = response();
        await connectCallback({ organization_id: 'org-1', body: { code: 'code', waba_id: 'waba-1', phone_number_id: 'phone-1' } }, res as any);
        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /Registration denied/);
        assert.equal(saved, false);
    } finally {
        globalThis.fetch = originalFetch;
        supabase.from = originalFrom;
    }
});

test('redirect mismatch identifies token exchange and preserves an explicit OAuth URI exactly', async () => {
    const originalFetch = globalThis.fetch;
    const redirectUri = 'https://example.com/oauth/callback?source=wa&next=%2Faccounts';
    globalThis.fetch = (async (input: any) => {
        const params = new URL(String(input)).searchParams;
        assert.equal(params.get('redirect_uri'), redirectUri);
        return new Response(JSON.stringify({ error: { code: 100, error_subcode: 36008, message: 'Redirect URI mismatch' } }), { status: 400 });
    }) as typeof fetch;
    try {
        const res = response();
        await connectCallback({ organization_id: 'org-1', body: { code: 'new-code', redirect_uri: redirectUri } }, res as any);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.stage, 'token_exchange');
        assert.equal(res.body.error_subcode, 36008);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('signed onboarding account updates are acknowledged without a phone mapping error', async () => {
    const { handleWebhook } = await import('../webhook.controller.js');
    const { createHmac } = await import('node:crypto');
    const originalFrom = supabase.from;
    const originalError = console.error;
    const errors: unknown[][] = [];
    let databaseCalls = 0;
    let statusCode = 0;
    supabase.from = () => { databaseCalls++; throw new Error('Account updates must not query phone mappings'); };
    console.error = (...args: unknown[]) => { errors.push(args); };
    const body = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'entry-1', changes: [
            { field: 'account_update', value: { event: 'PARTNER_APP_INSTALLED', waba_info: { waba_id: 'waba-1' } } },
            { field: 'account_update', value: { event: 'MM_LITE_TERMS_SIGNED', waba_info: { waba_id: 'waba-1' } } }
        ] }]
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!).update(rawBody).digest('hex');
    try {
        await handleWebhook({
            body, rawBody, method: 'POST', path: '/webhook',
            get: (name: string) => name.toLowerCase() === 'x-hub-signature-256' ? signature : 'application/json'
        }, { sendStatus: (code: number) => { statusCode = code; } } as any);
        assert.equal(statusCode, 200);
        assert.equal(databaseCalls, 0);
        assert.deepEqual(errors, []);
    } finally {
        supabase.from = originalFrom;
        console.error = originalError;
    }
});
