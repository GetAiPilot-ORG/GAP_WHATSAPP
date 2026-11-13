import { test } from 'node:test';
import assert from 'node:assert/strict';
// Prevent the existing Supabase module from attempting storage setup during tests.
process.env.SUPABASE_KEY_ROLE = 'test';
const { calendarSettings, validateCalendarSettings, validateSessionRange, publicSession, getUpcomingSessions } = await import('../agentCalendar.service.js');
const { supabase } = await import('../../config/supabase.js');

test('existing agents opt out and enabled settings require explicit calendar and valid timezone', () => {
  assert.equal(calendarSettings({}).enabled, false);
  assert.throws(() => validateCalendarSettings({ enabled: true }));
  assert.throws(() => validateCalendarSettings({ enabled: true, calendar_id: 'sessions', timezone: 'invalid' }));
  assert.equal(validateCalendarSettings({ enabled: true, calendar_id: 'sessions', timezone: 'Asia/Kolkata' }).calendar_id, 'sessions');
});
test('ranges require explicit timezone and ordered dates within 62 days', () => {
  assert.throws(() => validateSessionRange('2026-11-10', '2026-11-11'));
  assert.throws(() => validateSessionRange('invalid', '2026-11-11T00:00:00Z'));
  assert.throws(() => validateSessionRange('2026-11-11T00:00:00Z', '2026-11-10T00:00:00Z'));
  assert.throws(() => validateSessionRange('2026-01-01T00:00:00Z', '2026-11-10T00:00:00Z'));
  assert.equal(validateSessionRange('2026-11-10T00:00:00+05:30', '2026-11-11T00:00:00+05:30').timeMin, '2026-11-09T18:30:00.000Z');
});
test('private/cancelled events excluded; attendee details never exposed', () => {
  assert.equal(publicSession({ visibility: 'private' }), null);
  assert.equal(publicSession({ status: 'cancelled' }), null);
  const session = publicSession({ summary: 'Workshop', attendees: [{ email: 'secret@example.com' }], start: { date: '2026-11-10' } });
  assert.equal(session?.title, 'Workshop');
  assert.equal('attendees' in session!, false);
});
test('reader paginates recurring occurrences and distinguishes empty results from API failure', async () => {
  const originalFetch = globalThis.fetch;
  const originalFrom = supabase.from;
  (supabase as any).from = () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { refresh_token_encrypted: 'test-refresh', access_token_encrypted: 'test-access', token_expiry: '2099-01-01' } }) }) }) }) });
  let calls = 0;
  globalThis.fetch = (async (url: URL) => {
    calls++;
    assert.equal(url.searchParams.get('singleEvents'), 'true');
    assert.equal(url.searchParams.get('pageToken'), calls === 1 ? null : 'next');
    assert.equal(url.pathname.includes('sessions%40example.com'), true);
    return new Response(JSON.stringify(calls === 1 ? { items: [{ id: '1', summary: 'First' }, { visibility: 'private' }], nextPageToken: 'next' } : { items: [{ id: '2', summary: 'Second' }] }), { status: 200 });
  }) as any;
  try {
    const args = ['org', 'sessions@example.com', '2026-11-10T00:00:00Z', '2026-11-20T00:00:00Z'] as const;
    const result = await getUpcomingSessions(...args);
    assert.equal(calls, 2); assert.equal(result.events.length, 2); assert.equal(result.truncated, false);
    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [] }))) as any;
    assert.equal((await getUpcomingSessions(...args)).events.length, 0);
    globalThis.fetch = (async () => new Response('{}', { status: 403 })) as any;
    await assert.rejects(getUpcomingSessions(...args), /could not be read/);
  } finally { globalThis.fetch = originalFetch; supabase.from = originalFrom; }
});

test('agent connection state binds organization, rejects tampering and expiry', async () => {
  const { createAgentCalendarAuthUrl, completeAgentCalendarAuth } = await import('../../controllers/agentCalendarAuth.controller.js');
  const { createHmac } = await import('node:crypto');
  const oldSecret = process.env.GOOGLE_CLIENT_SECRET;
  const oldRedirect = process.env.GOOGLE_REDIRECT_URI;
  process.env.GOOGLE_CLIENT_SECRET = 'unit-test-secret';
  process.env.GOOGLE_REDIRECT_URI = 'https://example.test/api/integrations/google/callback';
  try {
    let output: any;
    createAgentCalendarAuthUrl({ organization_id: 'tenant-a' }, { json: (value: any) => { output = value; } });
    const state = new URL(output.url).searchParams.get('state')!;
    const payload = JSON.parse(Buffer.from(state.split('.')[1], 'base64url').toString());
    assert.equal(payload.org, 'tenant-a');
    await assert.rejects(completeAgentCalendarAuth('fake-code', state + 'x'), /Invalid/);
    const expired = Buffer.from(JSON.stringify({ org: 'tenant-a', expires: Date.now() - 1000 })).toString('base64url');
    const signature = createHmac('sha256', 'unit-test-secret').update(expired).digest('base64url');
    await assert.rejects(completeAgentCalendarAuth('fake-code', `agent.${expired}.${signature}`), /expired/);
  } finally {
    if (oldSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = oldSecret;
    if (oldRedirect === undefined) delete process.env.GOOGLE_REDIRECT_URI; else process.env.GOOGLE_REDIRECT_URI = oldRedirect;
  }
});

test('publicSession computes local Asia/Kolkata date, weekday, time, and safe all-day dates', () => {
  const timed = publicSession(
    {
      id: 'dance-2',
      summary: 'DANCE CLASS 2',
      description: 'Fee: Rs 500 | Studio B',
      location: 'Indiranagar Studio',
      start: { dateTime: '2026-11-12T09:30:00Z' },
      end: { dateTime: '2026-11-12T10:30:00Z' },
    },
    'Asia/Kolkata',
  );
  assert.equal(timed?.local_date, '2026-11-12');
  assert.equal(timed?.local_weekday, 'Thursday');
  assert.equal(timed?.local_date_label, '12 Nov 2026');
  assert.equal(timed?.local_start, '3:00 PM');
  assert.equal(timed?.local_end, '4:00 PM');
  assert.equal(timed?.is_all_day, false);

  // Check US Pacific timezone to verify all-day date never shifts to previous day
  const allDay = publicSession(
    {
      id: 'holiday',
      summary: 'Annual Recital',
      start: { date: '2026-11-12' },
      end: { date: '2026-11-13' },
    },
    'America/Los_Angeles',
  );
  assert.equal(allDay?.local_date, '2026-11-12');
  assert.equal(allDay?.local_date_label, '12 Nov 2026');
  assert.equal(allDay?.local_weekday, 'Thursday');
  assert.equal(allDay?.local_start, 'All day');
  assert.equal(allDay?.is_all_day, true);
});

test('resolvePresetRange handles IST day boundary and Monday-Sunday weeks within 62 days', async () => {
  const { resolvePresetRange } = await import('../agentCalendar.service.js');
  // 2026-11-11 20:00 UTC is 2026-11-12 01:30 AM IST (Thursday)
  const istEarlyMorning = new Date('2026-11-11T20:00:00.000Z');
  const today = resolvePresetRange('today', 'Asia/Kolkata', istEarlyMorning);
  assert.equal(today.from, '2026-11-12T00:00:00+05:30');
  assert.equal(today.to, '2026-11-13T00:00:00+05:30');

  const thisWeek = resolvePresetRange('this_week', 'Asia/Kolkata', istEarlyMorning);
  assert.equal(thisWeek.from, '2026-11-09T00:00:00+05:30'); // Monday
  assert.equal(thisWeek.to, '2026-11-16T00:00:00+05:30');

  const upcoming = resolvePresetRange('upcoming', 'Asia/Kolkata', istEarlyMorning);
  assert.doesNotThrow(() => validateSessionRange(upcoming.from, upcoming.to));
});

test('formatSyncedScheduleForPrompt & filterSyncedEventsInRange preserve schedule details and filter stale past events', async () => {
  const { formatSyncedScheduleForPrompt, filterSyncedEventsInRange } = await import('../agentCalendar.service.js');
  const now = new Date('2026-11-11T10:00:00+05:30');
  const events = [
    {
      id: 'past',
      summary: 'Old Class',
      start: { dateTime: '2026-11-10T15:00:00+05:30' },
      end: { dateTime: '2026-11-10T16:00:00+05:30' },
    },
    {
      id: 'dance-2',
      summary: 'DANCE CLASS 2',
      description: 'Bring water bottle',
      location: 'Studio 1',
      start: { dateTime: '2026-11-12T15:00:00+05:30' },
      end: { dateTime: '2026-11-12T16:00:00+05:30' },
    },
  ];
  const promptText = formatSyncedScheduleForPrompt(
    {
      enabled: true,
      calendar_id: 'primary',
      timezone: 'Asia/Kolkata',
      synced_events: events,
      last_synced_at: now.toISOString(),
    },
    now,
  );
  assert.match(promptText, /DANCE CLASS 2/);
  assert.match(promptText, /12 Nov 2026/);
  assert.match(promptText, /3:00 PM/);
  assert.doesNotMatch(promptText, /Old Class/);

  const filteredToday = filterSyncedEventsInRange(events, '2026-11-11T00:00:00+05:30', '2026-11-12T00:00:00+05:30', 'Asia/Kolkata');
  assert.equal(filteredToday.events.length, 0);
  const filteredTomorrow = filterSyncedEventsInRange(events, '2026-11-12T00:00:00+05:30', '2026-11-13T00:00:00+05:30', 'Asia/Kolkata');
  assert.equal(filteredTomorrow.events.length, 1);
  assert.equal(filteredTomorrow.events[0]?.title, 'DANCE CLASS 2');
});

test('syncCalendarEventsIntoAgent persists events into bot_agents DB and keeps prior cache if Google errors', async () => {
  const { syncCalendarEventsIntoAgent } = await import('../agentCalendar.service.js');
  const originalFetch = globalThis.fetch;
  const originalFrom = supabase.from;

  let persistedContent: any = null;
  (supabase as any).from = (table: string) => {
    if (table === 'w_integrations') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  refresh_token_encrypted: 'test-refresh',
                  access_token_encrypted: 'test-access',
                  token_expiry: '2099-01-01',
                },
              }),
            }),
          }),
        }),
      };
    }
    assert.equal(table, 'bot_agents');
    return {
      update: (payload: any) => {
        persistedContent = payload.knowledge_base_content;
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'agent-1',
                    organization_id: 'org-1',
                    knowledge_base_content: persistedContent,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    };
  };

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        items: [
          {
            id: 'dance-2',
            summary: 'DANCE CLASS 2',
            start: { dateTime: '2026-11-12T15:00:00+05:30' },
            end: { dateTime: '2026-11-12T16:00:00+05:30' },
          },
        ],
      }),
      { status: 200 },
    )) as any;

  try {
    const initialAgent = {
      id: 'agent-1',
      organization_id: 'org-1',
      knowledge_base_content: [
        {
          type: '__agent_settings',
          calendar: { enabled: true, calendar_id: 'primary', timezone: 'Asia/Kolkata' },
        },
      ],
    };
    const res1 = await syncCalendarEventsIntoAgent(initialAgent);
    assert.equal(res1.synced, true);
    assert.equal(res1.event_count, 1);
    const calMeta1 = calendarSettings(res1.agent);
    assert.equal(calMeta1.synced_events.length, 1);
    assert.equal(calMeta1.synced_events[0].title, 'DANCE CLASS 2');
    assert.equal(calMeta1.synced_events[0].local_date_label, '12 Nov 2026');
    assert.ok(calMeta1.last_synced_at);

    // Subsequent Google failure preserves previous synced_events and stores sync_error
    globalThis.fetch = (async () => new Response('{}', { status: 500 })) as any;
    const res2 = await syncCalendarEventsIntoAgent(res1.agent);
    assert.equal(res2.synced, false);
    assert.equal(res2.event_count, 1);
    assert.ok(res2.error);
    const calMeta2 = calendarSettings(res2.agent);
    assert.equal(calMeta2.synced_events.length, 1);
    assert.ok(calMeta2.sync_error);
  } finally {
    globalThis.fetch = originalFetch;
    supabase.from = originalFrom;
  }
});

test('syncAllEnabledAgentCalendars skips agents synced within 4 minutes and syncs agents synced 5 minutes ago', async () => {
  const { syncAllEnabledAgentCalendars } = await import('../agentCalendar.service.js');
  const originalFetch = globalThis.fetch;
  const originalFrom = supabase.from;

  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const mockAgents = [
    {
      id: 'agent-fresh',
      organization_id: 'org-1',
      is_active: true,
      knowledge_base_content: [
        {
          type: '__agent_settings',
          calendar: { enabled: true, calendar_id: 'primary', timezone: 'Asia/Kolkata', last_synced_at: twoMinsAgo, sync_error: null },
        },
      ],
    },
    {
      id: 'agent-due',
      organization_id: 'org-1',
      is_active: true,
      knowledge_base_content: [
        {
          type: '__agent_settings',
          calendar: { enabled: true, calendar_id: 'primary', timezone: 'Asia/Kolkata', last_synced_at: fiveMinsAgo, sync_error: null },
        },
      ],
    },
  ];

  (supabase as any).from = (table: string) => {
    if (table === 'w_integrations') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  refresh_token_encrypted: 'test-refresh',
                  access_token_encrypted: 'test-access',
                  token_expiry: '2099-01-01',
                },
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: async () => ({ data: mockAgents, error: null }),
      }),
      update: (payload: any) => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: { id: 'agent-due', organization_id: 'org-1', knowledge_base_content: payload.knowledge_base_content },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
  };

  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  }) as any;

  try {
    const summary = await syncAllEnabledAgentCalendars();
    assert.equal(summary.skipped, 1);
    assert.equal(summary.synced, 1);
    assert.equal(summary.failed, 0);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    supabase.from = originalFrom;
  }
});
