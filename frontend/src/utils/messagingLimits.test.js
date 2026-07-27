import assert from 'node:assert/strict';
import test from 'node:test';
import { getMessagingTierLabel } from './messagingLimits.js';

test('formats live Meta messaging tiers without inventing a fallback limit', () => {
    assert.equal(getMessagingTierLabel('TIER_250'), '250');
    assert.equal(getMessagingTierLabel('TIER_2K'), '2,000');
    assert.equal(getMessagingTierLabel(null), 'Unavailable');
});
