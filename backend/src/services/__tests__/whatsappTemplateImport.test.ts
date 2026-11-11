import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemplate } from '../../controllers/whatsapp.controller.js';
import { supabase } from '../../config/supabase.js';
import { encryptToken } from '../../utils/crypto.js';

function createMockRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
}

test('createTemplate includes name in Meta library lookup fields and imports fraud_alert_2 cleanly', async () => {
  const originalFetch = globalThis.fetch;
  const originalFrom = supabase.from;
  const calls: Array<{ url: string; method: string; body?: any }> = [];

  (supabase as any).from = (table: string) => {
    if (table === 'w_wa_accounts') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              not: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [
                      {
                        id: 'acc-meta-1',
                        organization_id: 'org-1',
                        whatsapp_business_account_id: 'waba-1',
                        status: 'connected',
                        access_token_encrypted: encryptToken('test-meta-token'),
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }

    if (table === 'w_template_submissions') {
      const chain: any = {
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return {
        select: () => chain,
        upsert: async () => ({ error: null }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  };

  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (url.includes('/message_templates?name=')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }

    if (url.includes('/message_template_library?')) {
      const parsed = new URL(url);
      const fields = parsed.searchParams.get('fields') || '';
      assert.ok(fields.split(',').includes('name'), `Expected library lookup fields to include "name", got "${fields}"`);
      return new Response(
        JSON.stringify({
          data: [
            {
              id: '25486794957631980',
              name: 'fraud_alert_2',
              category: 'UTILITY',
              buttons: [
                { type: 'QUICK_REPLY', text: 'Yes' },
                { type: 'QUICK_REPLY', text: 'No' },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }

    if (url.endsWith('/waba-1/message_templates') && method === 'POST') {
      return new Response(JSON.stringify({ id: 'tpl-123', status: 'APPROVED', category: 'UTILITY' }), { status: 200 });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as any;

  try {
    const req: any = {
      organization_id: 'org-1',
      user: { id: 'user-1' },
      body: {
        name: 'fraud_alert_2',
        category: 'UTILITY',
        language: 'en_US',
        wa_account_id: 'acc-meta-1',
        library_template_name: 'fraud_alert_2',
      },
    };
    const res = createMockRes();
    await createTemplate(req, res as any);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.id, 'tpl-123');

    const postCall = calls.find((c) => c.method === 'POST');
    assert.deepEqual(postCall?.body, {
      name: 'fraud_alert_2',
      category: 'UTILITY',
      language: 'en_US',
      library_template_name: 'fraud_alert_2',
    });
  } finally {
    globalThis.fetch = originalFetch;
    supabase.from = originalFrom;
  }
});
