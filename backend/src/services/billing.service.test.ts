import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWhatsappPlanId } from './billing.service.js';

test('normalizes active subscription product ids to billing plan ids', () => {
    assert.equal(normalizeWhatsappPlanId('wa_growth_(30_days)'), 'growth');
    assert.equal(normalizeWhatsappPlanId('WA Starter'), 'starter');
    assert.equal(normalizeWhatsappPlanId(null), null);
});
