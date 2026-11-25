import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_KEY_ROLE = 'anon';

const { supabase } = await import('../../config/supabase.js');
const { assertWhatsAppSendingAllowed, WhatsAppOffboardedError } = await import('../../services/whatsappOffboarding.service.js');
const { requireWhatsAppAdmin, confirmWhatsAppMetaRemoval, listWhatsAppOffboarding } = await import('../whatsappOffboarding.controller.js');

function response(): any {
    return {
        statusCode: 200,
        body: null as any,
        status(code: number) { this.statusCode = code; return this; },
        json(body: any) { this.body = body; return this; },
    };
}

test('offboarding requires owner or admin access', () => {
    for (const role of ['owner', 'admin']) {
        let allowed = false;
        requireWhatsAppAdmin({ role }, response(), () => { allowed = true; });
        assert.equal(allowed, true);
    }
    const res = response();
    requireWhatsAppAdmin({ role: 'agent' }, res, () => assert.fail('Agent gained access'));
    assert.equal(res.statusCode, 403);
});

test('sending blocks offboarded numbers and fails closed on a lookup error', async t => {
    const original = supabase.from;
    t.after(() => { supabase.from = original; });
    let result: any = { data: { offboarding_started_at: '2026-11-25T12:00:00Z' } };
    const query = {
        select: () => query,
        eq: (column: string, value: string) => {
            assert.equal(column, 'phone_number_id');
            assert.equal(value, '123');
            return query;
        },
        maybeSingle: async () => result,
    };
    supabase.from = () => query;
    await assert.rejects(assertWhatsAppSendingAllowed('123'), WhatsAppOffboardedError);
    result = { error: new Error('database unavailable') };
    await assert.rejects(assertWhatsAppSendingAllowed('123'), /Could not verify WhatsApp sending status/);
    result = { data: { offboarding_started_at: null } };
    await assertWhatsAppSendingAllowed('123');
});

test('Meta confirmation requires an explicit attestation for the current workspace and offboarding attempt', async t => {
    const startedAt = '2026-11-25T12:00:00Z';
    const req = {
        params: { id: 'account-1' },
        organization_id: 'workspace-1',
        user: { id: 'admin-1' },
        body: { confirmed: false, started_at: startedAt },
    };
    const invalid = response();
    await confirmWhatsAppMetaRemoval(req, invalid);
    assert.equal(invalid.statusCode, 400);

    const original = supabase.from;
    t.after(() => { supabase.from = original; });
    const filters: Record<string, unknown> = {};
    let saved: any;
    const query = {
        update: (record: any) => { saved = record; return query; },
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        is: (column: string, value: unknown) => { filters[column] = value; return query; },
        select: () => query,
        maybeSingle: async () => ({ data: { id: req.params.id, meta_removal_confirmed_at: saved.meta_removal_confirmed_at } }),
    };
    supabase.from = () => query;
    const res = response();
    await confirmWhatsAppMetaRemoval({ ...req, body: { ...req.body, confirmed: true } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(filters, {
        id: 'account-1',
        organization_id: 'workspace-1',
        offboarding_started_at: startedAt,
        meta_removal_confirmed_at: null,
    });
    assert.equal(saved.meta_removal_confirmed_by, 'admin-1');
    assert.ok(res.body.meta_removal_confirmed_at);
});


test('offboarding lists legacy Meta accounts and reports a pending schema update', async t => {
    const original = supabase.from;
    t.after(() => { supabase.from = original; });
    const account = { id: 'account-1', name: 'Example', whatsapp_business_account_id: 'waba-1' };
    let queries = 0;
    supabase.from = () => {
        const queryNumber = ++queries;
        const query = {
            select(columns: string) {
                assert.doesNotMatch(columns, /connection_type/);
                if (queryNumber === 2) assert.doesNotMatch(columns, /offboarding_started_at/);
                return query;
            },
            eq(column: string, value: string) {
                assert.equal(column, 'organization_id');
                assert.equal(value, 'workspace-1');
                return query;
            },
            or(filter: string) {
                assert.doesNotMatch(filter, /connection_type/);
                return queryNumber === 1 ? query : Promise.resolve({ data: [account] });
            },
            order: async () => ({ error: { code: '42703' } }),
        };
        return query;
    };
    const res = response();
    await listWhatsAppOffboarding({ organization_id: 'workspace-1' }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { records: [account], migration_required: true });
});
