import test from 'node:test';
import assert from 'node:assert/strict';

// Never contact production services from these regression tests.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_KEY_ROLE = 'anon';
process.env.META_APP_ID = 'test-app';
process.env.META_APP_SECRET = 'test-secret';
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
        assert.ok(init?.signal, 'Meta calls must carry a timeout signal');
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
            connectCallback({ organization_id: 'org-1', body: { code: 'code', waba_id: 'waba-1', phone_number_id: 'phone-1' } }, res as any),
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
