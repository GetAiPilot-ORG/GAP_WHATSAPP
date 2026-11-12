import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_KEY_ROLE = 'test';
const { supabase } = await import('../../config/supabase.js');
const { getBotAgentReply, invalidateFlowsCache } = await import('../ai.service.js');

async function scenario(mode = 'success') {
  const previous = { fetch: globalThis.fetch, from: supabase.from, key: process.env.OPENAI_API_KEY };
  process.env.OPENAI_API_KEY = mode === 'no-key' ? '' : 'synthetic-key';
  const agent = { id: 'synthetic-agent', name: 'Test Assistant', model: 'gpt-4o-mini', knowledge_base_content: [{ type: '__agent_settings', settings: { use_buttons: mode !== 'buttons-off' }, calendar: { enabled: mode !== 'disabled', calendar_id: 'public-sessions', timezone: 'Asia/Kolkata' } }] };
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
    if (mode === 'buttons-off') assert.ok(request.messages.some((m: any) => m.role === 'system' && m.content.includes('AGENT PREFERENCE OVERRIDE: Buttons are OFF')));
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
    return new Response(JSON.stringify({ choices: [{ message: { content: mode === 'buttons-off' ? JSON.stringify({ text: 'Workshop registration', buttons: [{ id: 'register', text: 'Register', type: 'url', url: 'https://example.com/workshop' }] }) : mode === 'failure' ? 'Schedule unverified.' : mode === 'empty' ? 'No sessions found.' : 'Synthetic Workshop: 5–6 PM.' } }] }));
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
test('live agent reply enforces buttons OFF even when the model emits URL button JSON', async () => {
  const r = await scenario('buttons-off');
  assert.match(r.result!.reply, /https:\/\/example.com\/workshop/);
  assert.ok(!r.result!.reply.includes('"buttons"'));
});
test('missing platform key does not masquerade as an introduction', async () => {
  const r = await scenario('no-key'); assert.equal(r.calls, 0); assert.match(r.result!.reply, /temporarily unavailable/);
});

test('DB-synced upcoming dance class answers with date/time, supports preset=upcoming, deduplicates KB, and survives Google error via cache', async () => {
  const { testBotAgentReply } = await import('../ai.service.js');
  const previous = { fetch: globalThis.fetch, from: supabase.from, key: process.env.OPENAI_API_KEY };
  process.env.OPENAI_API_KEY = 'synthetic-key';

  const syncedEvent = {
    id: 'dance-2',
    title: 'DANCE CLASS 2',
    start: { dateTime: '2026-11-12T15:00:00+05:30' },
    end: { dateTime: '2026-11-12T16:00:00+05:30' },
    location: 'Studio 1',
    description: 'Trainer: Priya | Fee: Rs 500',
    timezone: 'Asia/Kolkata',
    is_all_day: false,
    local_date: '2026-11-12',
    local_weekday: 'Thursday',
    local_date_label: '12 Nov 2026',
    local_start: '3:00 PM',
    local_end: '4:00 PM',
  };

  const agent = {
    id: 'dance-agent',
    name: 'Dance Academy Assistant',
    model: 'gpt-4o-mini',
    temperature: 0,
    is_active: true,
    knowledge_base_content: [
      {
        id: 'doc-1',
        name: 'Studio FAQ',
        source: 'workspace_knowledge_base',
        content: 'UNIQUE_STUDIO_PARKING_NOTE: Free scooter parking behind Studio 1.',
      },
      {
        type: '__agent_settings',
        selected_knowledge_document_ids: ['doc-1'],
        calendar: {
          enabled: true,
          calendar_id: 'priyansh.metabull@gmail.com',
          timezone: 'Asia/Kolkata',
          synced_events: [syncedEvent],
          last_synced_at: '2026-11-11T09:00:00.000Z',
        },
      },
    ],
  };

  supabase.from = (table: string) => {
    const fixtures: any = {
      bot_agents: agent,
      organizations: {
        settings: {
          knowledge_base_documents: [
            {
              id: 'doc-1',
              name: 'Studio FAQ',
              status: 'INDEXED',
              content: 'UNIQUE_STUDIO_PARKING_NOTE: Free scooter parking behind Studio 1.',
            },
          ],
        },
      },
      openai_settings: null,
      w_flows: [],
      w_integrations: {
        refresh_token_encrypted: 'fake',
        access_token_encrypted: 'fake',
        token_expiry: '2099-01-01',
      },
    };
    const response = { data: fixtures[table], error: null };
    const chain: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) chain[method] = () => chain;
    chain.single = chain.maybeSingle = async () => response;
    chain.then = (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject);
    return chain;
  };

  let googleFails = false;
  let capturedSystem = '';
  let callCount = 0;

  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (url.includes('googleapis.com/calendar')) {
      if (googleFails) return new Response('{}', { status: 503 });
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'dance-2',
              summary: 'DANCE CLASS 2',
              location: 'Studio 1',
              description: 'Trainer: Priya | Fee: Rs 500',
              start: { dateTime: '2026-11-12T15:00:00+05:30' },
              end: { dateTime: '2026-11-12T16:00:00+05:30' },
            },
          ],
        }),
      );
    }

    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    const req = JSON.parse(init.body);
    callCount++;
    if (callCount === 1) {
      assert.equal(req.temperature, 0);
      assert.ok(req.max_tokens >= 900);
      capturedSystem = req.messages.filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n');
      assert.match(capturedSystem, /Saved Agent Schedule Database/);
      assert.match(capturedSystem, /DANCE CLASS 2/);
      assert.match(capturedSystem, /CALENDAR & SCHEDULE EXEMPTION/);
      // Selected workspace doc should appear exactly once (not duplicated)
      const occurrences = capturedSystem.split('UNIQUE_STUDIO_PARKING_NOTE').length - 1;
      assert.equal(occurrences, 1);

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'preset-call',
                    type: 'function',
                    function: {
                      name: 'get_upcoming_sessions',
                      arguments: JSON.stringify({ preset: 'upcoming' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    const toolMsg = req.messages.find((m: any) => m.role === 'tool');
    const parsedTool = JSON.parse(toolMsg.content);
    assert.equal(parsedTool.events.length, 1);
    assert.equal(parsedTool.events[0].title, 'DANCE CLASS 2');
    assert.equal(parsedTool.events[0].local_date_label, '12 Nov 2026');
    assert.equal(parsedTool.events[0].local_start, '3:00 PM');
    if (googleFails) {
      assert.equal(parsedTool.source, 'database_cache');
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '**DANCE CLASS 2** is scheduled on Thursday, 12 Nov 2026 from 3:00 PM to 4:00 PM.',
            },
          },
        ],
      }),
    );
  }) as any;

  try {
    invalidateFlowsCache('synthetic-org');
    // 1. Live Google Calendar + synced DB test
    const liveRes = await testBotAgentReply({
      organization_id: 'synthetic-org',
      agent_id: 'dance-agent',
      text: 'When is the upcoming dance class?',
    });
    assert.equal(liveRes.is_fallback, false);
    assert.equal(liveRes.used_calendar_tool, true);
    assert.equal(liveRes.schedule_source, 'live');
    assert.equal(liveRes.synced_event_count, 1);
    assert.match(liveRes.reply, /\*DANCE CLASS 2\*/);
    assert.match(liveRes.reply, /12 Nov 2026/);

    // 2. Google API 503 failure falls back cleanly to DB-synced events
    callCount = 0;
    googleFails = true;
    const cachedRes = await testBotAgentReply({
      organization_id: 'synthetic-org',
      agent_id: 'dance-agent',
      text: 'When is the upcoming dance class?',
    });
    assert.equal(cachedRes.is_fallback, false);
    assert.equal(cachedRes.used_calendar_tool, true);
    assert.equal(cachedRes.schedule_source, 'database_cache');
    assert.match(cachedRes.reply, /12 Nov 2026/);
  } finally {
    globalThis.fetch = previous.fetch;
    supabase.from = previous.from;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
  }
});
