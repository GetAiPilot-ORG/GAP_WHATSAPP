import assert from 'node:assert/strict';
import test from 'node:test';
import { subscribeMetaAppToWaba } from '../meta.service.js';

test('subscribes the Meta app to the WABA', async () => {
    const originalFetch = globalThis.fetch;
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (url, init) => {
        request = { url: String(url), init };
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    try {
        await subscribeMetaAppToWaba('waba/123', 'secret-token');
        assert.match(request?.url || '', /waba%2F123\/subscribed_apps$/);
        assert.equal(request?.init?.method, 'POST');
        assert.equal((request?.init?.headers as Record<string, string>).Authorization, 'Bearer secret-token');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('rejects a failed Meta subscription', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
        JSON.stringify({ error: { message: 'Permission denied' } }),
        { status: 403 },
    );

    try {
        await assert.rejects(
            subscribeMetaAppToWaba('123', 'token'),
            /Permission denied/,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});
