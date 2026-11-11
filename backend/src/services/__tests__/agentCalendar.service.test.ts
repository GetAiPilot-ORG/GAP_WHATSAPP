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
