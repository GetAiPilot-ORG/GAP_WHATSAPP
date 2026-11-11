import { getValidAccessToken } from './googleCalendar.service.js';

export function calendarSettings(agent: any) {
  const meta = (agent?.knowledge_base_content || []).find((i: any) => i?.type === '__agent_settings');
  return meta?.calendar || { enabled: false, calendar_id: '', timezone: 'Asia/Kolkata' };
}

export function validateCalendarSettings(value: any) {
  if (!value || typeof value.enabled !== 'boolean') throw new Error('Invalid calendar settings');
  const calendar_id = String(value.calendar_id || '').trim();
  const timezone = String(value.timezone || 'Asia/Kolkata');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { throw new Error('Invalid calendar timezone'); }
  if (calendar_id.length > 1024 || (value.enabled && !calendar_id)) throw new Error('Select a sessions calendar');
  return { enabled: value.enabled, calendar_id, timezone };
}

async function googleRead(organizationId: string, path: string, params: Record<string, string>) {
  const token = await getValidAccessToken(organizationId);
  if (!token) throw new Error('Google Calendar disconnected. Reconnect Google and try again.');
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Google Calendar could not be read. Check the connection and calendar access.');
  return response.json();
}

export async function listSessionCalendars(organizationId: string) {
  const calendars: any[] = [];
  let pageToken = '';
  do {
    const data = await googleRead(organizationId, 'users/me/calendarList', { maxResults: '250', ...(pageToken ? { pageToken } : {}) });
    calendars.push(...(data.items || []).filter((c: any) => ['reader', 'writer', 'owner'].includes(c.accessRole)).map((c: any) => ({ id: c.id, name: c.summaryOverride || c.summary, timezone: c.timeZone || 'Asia/Kolkata', primary: c.primary === true })));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return calendars;
}

export function validateSessionRange(from: string, to: string) {
  const start = Date.parse(from), end = Date.parse(to);
  if (typeof from !== 'string' || typeof to !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(from) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(to) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 62 * 86400000) {
    throw new Error('Choose a valid date range of at most 62 days');
  }
  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() };
}

export function publicSession(event: any) {
  if (event.status === 'cancelled' || event.visibility === 'private' || event.visibility === 'confidential') return null;
  return {
    id: event.id, title: String(event.summary || 'Untitled session').slice(0, 300),
    start: event.start, end: event.end,
    description: String(event.description || '').slice(0, 5000),
    location: String(event.location || '').slice(0, 1000),
    meeting_link: event.hangoutLink || '',
  };
}

export async function getUpcomingSessions(organizationId: string, calendarId: string, from: string, to: string) {
  if (!calendarId) throw new Error('No sessions calendar selected');
  const range = validateSessionRange(from, to);
  const events: any[] = [];
  let pages = 0;
  let pageToken = '';
  do {
    const data = await googleRead(organizationId, `calendars/${encodeURIComponent(calendarId)}/events`, {
      ...range, singleEvents: 'true', orderBy: 'startTime', maxResults: '100', ...(pageToken ? { pageToken } : {}),
    });
    events.push(...(data.items || []).map(publicSession).filter(Boolean));
    pageToken = data.nextPageToken || '';
    if (++pages >= 20 || events.length >= 200) return { events: events.slice(0, 200), truncated: Boolean(pageToken) || events.length > 200, ...range };
  } while (pageToken);
  return { events, truncated: false, ...range };
}
