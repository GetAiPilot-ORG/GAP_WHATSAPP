import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_KEY_ROLE = 'test';
const { supabase } = await import('../../config/supabase.js');
const { getFlowTriggerKeywords, processFlowEngine, validateFlowDefinition } = await import('../flows.service.js');
const { getQuickReplyRegistry } = await import('../../controllers/quickReplies.controller.js');
const nodes = [
  { id: 'start', type: 'startBotFlow', data: { config: { keywords: 'custom, hello', quickReplyKeywords: ['Join, please'], matchType: 'exact' } } },
  { id: 'reply', type: 'textMessage', data: { config: { message: 'Welcome to registration' } } },
  { id: 'end', type: 'end', data: { config: {} } },
];
const edges = [{ source: 'start', target: 'reply' }, { source: 'reply', target: 'end' }];
const live = { id: 'version-a', nodes, edges, trigger_keywords: ['custom', 'hello', 'Join, please'] };
const flow = { id: 'flow-a', name: 'Registration', status: 'active', current_version_id: live.id, wa_account_scope: 'selected', wa_account_ids: ['11111111-1111-4111-8111-111111111111'], nodes, edges };
test('selected quick replies preserve commas and coexist with custom keywords through validation', () => {
  assert.deepEqual(getFlowTriggerKeywords({ nodes }), ['custom', 'hello', 'Join, please']);
  assert.equal(validateFlowDefinition(flow).valid, true, JSON.stringify(validateFlowDefinition(flow).errors));
});
test('saved quick reply triggers route incoming clicks through the published flow', async () => {
  const original = supabase.from;
  supabase.from = (table: string) => {
    let operation = 'read';
    let selected = '';
    const chain: any = {};
    const result = () => {
      let data: any = null;
      if (table === 'w_conversations') data = { assigned_bot_id: null, contact: { contact_type: 'individual' } };
      if (table === 'w_flows') data = [flow];
      if (table === 'w_flow_versions') data = live;
      if (table === 'w_flow_sessions' && operation === 'insert') data = { id: 'session-a' };
      if (table === 'w_flow_sessions' && selected === 'state_data') data = { state_data: {} };
      if (table === 'w_flow_runs' && operation === 'insert') data = { id: 'run-a' };
      return { data, error: null };
    };
    chain.select = (value: string) => { selected = value; return chain; };
    chain.insert = () => { operation = 'insert'; return chain; };
    chain.update = () => { operation = 'update'; return chain; };
    for (const method of ['eq', 'in', 'order', 'limit']) chain[method] = () => chain;
    chain.single = chain.maybeSingle = async () => result();
    chain.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  try {
    const routed = await processFlowEngine('org-a', 'contact-a', 'conversation-a', 'Join, please', null, '11111111-1111-4111-8111-111111111111');
    assert.equal(routed.consumed, true);
    assert.match(routed.output || '', /Welcome to registration/);
    assert.equal((await processFlowEngine('org-a', 'contact-a', 'conversation-a', 'Join, please', null, '22222222-2222-4222-8222-222222222222')).consumed, false);
  } finally { supabase.from = original; }
});
test('registry endpoint scopes all data reads to the authenticated organization', async () => {
  const original = supabase.from;
  const reads: Array<[string, string, string]> = [];
  supabase.from = (table: string) => {
    const chain: any = {};
    for (const method of ['select', 'order', 'range', 'in']) chain[method] = () => chain;
    chain.eq = (key: string, value: string) => { reads.push([table, key, value]); return chain; };
    const data = table === 'w_flows' ? [flow] : table === 'w_flow_versions' ? [live] : [{ id: 'template-a', name: 'Invite', status: 'APPROVED', wa_account_id: '11111111-1111-4111-8111-111111111111', components: [{ type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Join, please' }] }] }];
    chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject);
    return chain;
  };
  let body: any;
  const response: any = { json: (value: any) => { body = value; return response; }, status: () => response };
  try {
    await getQuickReplyRegistry({ organization_id: 'org-a' }, response);
    assert.equal(body.quick_replies[0].status, 'ready');
    for (const table of ['w_template_submissions', 'w_flows', 'w_flow_versions']) assert.ok(reads.some(([name, key, value]) => name === table && key === 'organization_id' && value === 'org-a'));
  } finally { supabase.from = original; }
});
