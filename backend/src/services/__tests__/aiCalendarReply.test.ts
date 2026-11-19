import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_KEY_ROLE = 'test';
const { supabase } = await import('../../config/supabase.js');
const { getBotAgentReply, invalidateFlowsCache } = await import('../ai.service.js');

async function scenario(mode = 'success', latest?: string, history?: any[]) {
  const previous = { fetch: globalThis.fetch, from: supabase.from, key: process.env.OPENAI_API_KEY };
  process.env.OPENAI_API_KEY = mode === 'no-key' ? '' : 'synthetic-key';
  const agent = { id: 'synthetic-agent', name: 'Test Assistant', model: 'gpt-4o-mini', knowledge_base_content: [{ type: '__agent_settings', settings: { use_buttons: mode !== 'buttons-off' }, calendar: { enabled: mode !== 'disabled', calendar_id: 'public-sessions', timezone: 'Asia/Kolkata' } }] };
  supabase.from = (table: string) => {
    const fixtures: any = {
      w_conversations: { bot_enabled: true, assigned_bot_id: agent.id }, bot_agents: agent,
      organizations: { settings: {} }, openai_settings: null, w_flows: [],
      w_messages: history ? [...history].reverse() : mode === 'greeting'
        ? [{ direction: 'inbound', content: { text: 'I want to book a workshop' } }]
        : [{ direction: 'outbound', automation_source: 'ai_agent', content: { text: "Hi! I'm Test Assistant." } }],
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
    if (mode === 'greeting') {
      assert.equal(request.tools, undefined);
      assert.equal(request.response_format, undefined);
      return Response.json({ choices: [{ message: { content: 'Hi! How can I help?' } }] });
    }
    if (mode === 'registration') {
      if (request.response_format) return Response.json({ choices: [{ message: { content: JSON.stringify({ kind: 'student', action: 'review', event_id: null }) } }] });
      assert.ok(request.messages.some((m: any) => m.content.includes('could not verify an exact session')));
      return Response.json({ choices: [{ message: { content: 'Which workshop and date?' } }] });
    }
    if (mode === 'booking-timeout') {
      if (request.response_format) throw new DOMException('Request timed out', 'TimeoutError');
      assert.ok(request.messages.some((m: any) => m.content.includes('could not verify the request details')));
      return Response.json({ choices: [{ message: { content: 'Please share the workshop and date.' } }] });
    }
    if (mode === 'booking-history') {
      assert.equal(request.response_format, undefined);
      assert.equal(request.messages.filter((m: any) => m.role === 'user').at(-1).content, latest);
      assert.ok(request.messages.some((m: any) => m.content.includes('Answer the latest user message')));
      return Response.json({ choices: [{ message: { content: `Answer for ${latest}` } }] });
    }
    if (mode === 'openai-timeout') throw new DOMException('Request timed out', 'TimeoutError');
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
      else assert.equal(data.events.length, ['empty', 'trainer'].includes(mode) ? 0 : 1);
      if (mode === 'trainer') {
        assert.equal(data.trainer, 'Vaibhav');
        return Response.json({ choices: [{ message: { content: 'No upcoming workshops found for Vaibhav.' } }] });
      }
      assert.ok(request.messages.some((m: any) => m.role === 'assistant' && m.tool_calls?.[0]?.id === 'lookup'));
    } else assert.equal(request.tools, undefined);
    if (mode === 'empty-completion') return Response.json({ choices: [{ finish_reason: 'stop', message: { content: ' ' } }] });
    return new Response(JSON.stringify({ choices: [{ message: { content: mode === 'buttons-off' ? JSON.stringify({ text: 'Workshop registration', buttons: [{ id: 'register', text: 'Register', type: 'url', url: 'https://example.com/workshop' }] }) : mode === 'failure' ? 'Schedule unverified.' : mode === 'empty' ? 'No sessions found.' : 'Synthetic Workshop: 5–6 PM.' } }] }));
  }) as any;
  try {
    invalidateFlowsCache('synthetic-org');
    const text = latest ?? (mode === 'greeting' ? 'Hi!' : ['registration', 'booking-timeout'].includes(mode) ? 'I want to register for upcoming workshop' : 'Aaj workshop kitne baje hai?');
    const result = await getBotAgentReply({ organization_id: 'synthetic-org', conversation_id: 'synthetic-conversation', text });
    return { result, calls, calendarReads };
  } finally {
    globalThis.fetch = previous.fetch; supabase.from = previous.from;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
  }
}

test('zero-doc agent reads calendar and returns time rather than repeated introduction', async () => {
  const r = await scenario(); assert.equal(r.calls, 2); assert.equal(r.calendarReads, 1); assert.match(r.result!.reply, /5–6 PM/);
});
test('a greeting after booking history needs one completion and no calendar lookup', async () => {
  const r = await scenario('greeting');
  assert.equal(r.calls, 1);
  assert.equal(r.calendarReads, 0);
  assert.equal(r.result!.reply, 'Hi! How can I help?');
});
test('workshop registration asks for the session when the request is ambiguous', async () => {
  const r = await scenario('registration');
  assert.equal(r.calendarReads, 1);
  assert.equal(r.calls, 2);
  assert.match(r.result!.reply, /Which workshop and date/);
});
test('booking history cannot intercept the reported followup sequence', async () => {
  const history = [
    { direction: 'inbound', content: { text: 'I want to book a workshop' } },
    { direction: 'outbound', content: { text: 'Booking request review\nWorkshop: Synthetic Workshop' } },
    { direction: 'inbound', content: { text: 'Confirm booking request' } },
    { direction: 'outbound', content: { text: 'Final booking abhi pending hai.' } },
  ];
  for (const latest of ['Regular classes information', 'Contact details', 'I want qr for payment', 'What about Saturday and Sunday Are there fixed schedules ?', 'Hey tell me one thing can you provide me the schedule of regular classes as well as the classes which are not regular according to days', 'Share me the payment qr']) {
    history.push({ direction: 'inbound', content: { text: latest } });
    const r = await scenario('booking-history', latest, history);
    assert.equal(r.calendarReads, 0);
    assert.equal(r.calls, 1);
    assert.equal(r.result!.reply, `Answer for ${latest}`);
    history.push({ direction: 'outbound', content: { text: r.result!.reply } });
  }
});
test('booking extraction timeout reaches standard completion', async () => {
  const r = await scenario('booking-timeout');
  assert.equal(r.calls, 2);
  assert.equal(r.result!.reply, 'Please share the workshop and date.');
});
test('named trainer lookup filters out unrelated calendar events even without a trainer tool argument', async () => {
  const r = await scenario('trainer', 'Share me the workshop for Vaibhav');
  assert.equal(r.calls, 2);
  assert.equal(r.result!.reply, 'No upcoming workshops found for Vaibhav.');
});
test('empty completion after calendar lookup and OpenAI timeout both produce a reply', async () => {
  for (const mode of ['empty-completion', 'openai-timeout']) {
    const r = await scenario(mode);
    assert.match(r.result!.reply, /having trouble processing/);
  }
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

test('DB-synced upcoming dance class answers with date/time, supports preset=upcoming, deduplicates KB, and survives Google error via cache', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T09:00:00Z') });
  const { testBotAgentReply } = await import('../ai.service.js');
  const previous = { fetch: globalThis.fetch, from: supabase.from, key: process.env.OPENAI_API_KEY };
  process.env.OPENAI_API_KEY = 'synthetic-key';

  const futureDate = new Date(Date.now() + 7 * 86400000);
  const local_date = futureDate.toISOString().slice(0, 10);
  const local_date_label = futureDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const local_weekday = futureDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });

  const syncedEvent = {
    id: 'dance-2',
    title: 'DANCE CLASS 2',
    start: { dateTime: `${local_date}T15:00:00+05:30` },
    end: { dateTime: `${local_date}T16:00:00+05:30` },
    location: 'Studio 1',
    description: 'Trainer: Priya | Fee: Rs 500',
    timezone: 'Asia/Kolkata',
    is_all_day: false,
    local_date,
    local_weekday,
    local_date_label,
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
              start: { dateTime: `${local_date}T15:00:00+05:30` },
              end: { dateTime: `${local_date}T16:00:00+05:30` },
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
    assert.equal(parsedTool.events[0].local_date_label, local_date_label);
    assert.equal(parsedTool.events[0].local_start, '3:00 PM');
    if (googleFails) {
      assert.equal(parsedTool.source, 'database_cache');
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: `**DANCE CLASS 2** is scheduled on ${local_weekday}, ${local_date_label} from 3:00 PM to 4:00 PM.`,
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
    assert.match(liveRes.reply, new RegExp(local_date_label));

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
    assert.match(cachedRes.reply, new RegExp(local_date_label));
  } finally {
    globalThis.fetch = previous.fetch;
    supabase.from = previous.from;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
  }
});
