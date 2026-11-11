import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_KEY_ROLE = 'test';
const { supabase } = await import('../../config/supabase.js');
const { getBotAgentReply, invalidateFlowsCache } = await import('../ai.service.js');

async function scenario(mode = 'success') {
  const previous = { fetch: globalThis.fetch, from: supabase.from, key: process.env.OPENAI_API_KEY };
  process.env.OPENAI_API_KEY = mode === 'no-key' ? '' : 'synthetic-key';
  const agent = { id: 'synthetic-agent', name: 'Test Assistant', model: 'gpt-4o-mini', knowledge_base_content: [{ type: '__agent_settings', calendar: { enabled: mode !== 'disabled', calendar_id: 'public-sessions', timezone: 'Asia/Kolkata' } }] };
  supabase.from = (table: string) => {
    const fixtures: any = {
      w_conversations: { bot_enabled: true, assigned_bot_id: agent.id }, bot_agents: agent,
      organizations: { settings: {} }, openai_settings: null, w_flows: [],
      w_messages: [{ direction: 'outbound', automation_source: 'ai_agent', content: { text: "Hi! I'm Test Assistant." } }],
      w_integrations: { refresh_token_encrypted: 'fake', access_token_encrypted: 'fake', token_expiry: '2099-01-01' },
    };
    const response = { data: fixtures[table], error: null };
    const chain: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) chain[method] = () => chain;
    chain.single = chain.maybeSingle = async () => response;
    chain.then = (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject);
    return chain;
  };
  let calls = 0, calendarReads = 0;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (url.includes('googleapis.com/calendar')) {
      calendarReads++;
      assert.ok(url.includes('public-sessions'));
      if (mode === 'failure') return new Response('{}', { status: 403 });
      return new Response(JSON.stringify({ items: mode === 'empty' ? [] : [{ id: 'session', summary: 'Synthetic Workshop', start: { dateTime: '2026-11-11T17:00:00+05:30' }, end: { dateTime: '2026-11-11T18:00:00+05:30' } }] }));
    }
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    const request = JSON.parse(init.body); calls++;
    if (calls === 1 && mode !== 'disabled') {
      assert.equal(request.tools[0].function.name, 'get_upcoming_sessions');
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'lookup', type: 'function', function: { name: 'get_upcoming_sessions', arguments: JSON.stringify({ from: '2026-11-11T00:00:00+05:30', to: '2026-11-12T00:00:00+05:30' }) } }] } }] }));
    }
    if (mode !== 'disabled') {
      const tool = request.messages.find((m: any) => m.role === 'tool');
      assert.equal(tool.tool_call_id, 'lookup');
      const data = JSON.parse(tool.content);
      if (mode === 'failure') assert.ok(data.error);
      else assert.equal(data.events.length, mode === 'empty' ? 0 : 1);
      assert.ok(request.messages.some((m: any) => m.role === 'assistant' && m.tool_calls?.[0]?.id === 'lookup'));
    } else assert.equal(request.tools, undefined);
    return new Response(JSON.stringify({ choices: [{ message: { content: mode === 'failure' ? 'Schedule unverified.' : mode === 'empty' ? 'No sessions found.' : 'Synthetic Workshop: 5–6 PM.' } }] }));
  }) as any;
  try {
    invalidateFlowsCache('synthetic-org');
    const result = await getBotAgentReply({ organization_id: 'synthetic-org', conversation_id: 'synthetic-conversation', text: 'Aaj workshop kitne baje hai?' });
    return { result, calls, calendarReads };
  } finally {
    globalThis.fetch = previous.fetch; supabase.from = previous.from;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
  }
}

test('zero-doc agent reads calendar and returns time rather than repeated introduction', async () => {
  const r = await scenario(); assert.equal(r.calls, 2); assert.equal(r.calendarReads, 1); assert.match(r.result!.reply, /5–6 PM/);
});
test('calendar failure is sent as an error to the model', async () => {
  const r = await scenario('failure'); assert.match(r.result!.reply, /unverified/);
});
test('successful empty calendar differs from API failure', async () => {
  const r = await scenario('empty'); assert.match(r.result!.reply, /No sessions/);
});
test('disabled agent does not read calendar or receive tools', async () => {
  const r = await scenario('disabled'); assert.equal(r.calendarReads, 0); assert.equal(r.calls, 1);
});
test('missing platform key does not masquerade as an introduction', async () => {
  const r = await scenario('no-key'); assert.equal(r.calls, 0); assert.match(r.result!.reply, /temporarily unavailable/);
});
