import assert from 'node:assert/strict';
import test from 'node:test';
import { getPendingReviewInfo } from './templateReview.js';

test('flags overdue testing templates with a useful review hint', () => {
    const result = getPendingReviewInfo({
        submitted_at: '2026-07-01T00:00:00.000Z',
        components: [{ type: 'BODY', text: 'testing only ignore it' }],
    }, Date.parse('2026-07-03T00:00:00.000Z'));

    assert.equal(result.hours, 48);
    assert.equal(result.overdue, true);
    assert.match(result.hint, /testing/i);
});
