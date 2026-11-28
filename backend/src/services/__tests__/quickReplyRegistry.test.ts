import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickReplyRegistry, QuickReplyFlow } from '../quickReplyRegistry.js';
const template = (account = 'number-a', name = 'invite') => ({ id: `${name}-${account}`, name, wa_account_id: account, language: 'en_US', status: 'APPROVED', components: [{ type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Join, please' }, { type: 'URL', text: 'Website', url: 'https://example.com' }] }] });
const flow = (extra: Partial<QuickReplyFlow> = {}): QuickReplyFlow => ({ id: 'flow-a', name: 'Workshop registration', status: 'draft', saved_keywords: ['Join, please'], live_keywords: [], saved_match_type: 'exact', live_match_type: 'exact', wa_account_scope: 'all', wa_account_ids: [], ...extra });
test('quick replies deduplicate per account and retain template sources', () => {
  const rows = buildQuickReplyRegistry([template(), template('number-a', 'reminder'), template('number-b')], []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].keyword, 'Join, please');
  assert.equal(rows.find(row => row.wa_account_id === 'number-a').sources.length, 2);
  assert.ok(rows.every(row => row.status === 'unassigned'));
});
test('draft and paused assignments are not live handlers', () => {
  assert.equal(buildQuickReplyRegistry([template()], [flow()])[0].status, 'not_live');
  assert.equal(buildQuickReplyRegistry([template()], [flow({ status: 'active', live_keywords: ['Join, please'] })])[0].status, 'ready');
  assert.equal(buildQuickReplyRegistry([template()], [flow({ status: 'paused', live_keywords: ['Join, please'] })])[0].status, 'not_live');
});
test('published snapshot wins over newer unsent edits', () => {
  const rows = buildQuickReplyRegistry([template()], [flow({ status: 'active', saved_keywords: ['Different'], live_keywords: ['Join, please'] })]);
  assert.equal(rows[0].status, 'ready');
  assert.equal(rows[0].routes[0].saved, false);
  assert.equal(buildQuickReplyRegistry([template()], [flow({ status: 'active', live_keywords: ['Different'] })])[0].status, 'not_live');
});
test('receiving number and overlapping string handlers are checked', () => {
  const restricted = flow({ status: 'active', live_keywords: ['Join, please'], wa_account_scope: 'selected', wa_account_ids: ['number-b'] });
  assert.equal(buildQuickReplyRegistry([template()], [restricted])[0].status, 'unassigned');
  const exact = flow({ status: 'active', live_keywords: ['Join, please'] });
  const broad = flow({ id: 'flow-b', status: 'active', saved_keywords: ['join'], live_keywords: ['join'], live_match_type: 'string' });
  assert.equal(buildQuickReplyRegistry([template()], [exact, broad])[0].status, 'conflict');
});
test('deleted templates and archived flows do not reserve triggers', () => {
  assert.equal(buildQuickReplyRegistry([{ ...template(), status: 'DELETED' }], []).length, 0);
  assert.equal(buildQuickReplyRegistry([template()], [flow({ status: 'archived' })])[0].status, 'unassigned');
});
