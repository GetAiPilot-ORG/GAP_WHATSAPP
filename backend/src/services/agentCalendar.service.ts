import { supabase } from '../config/supabase.js';
import { getValidAccessToken } from './googleCalendar.service.js';

const AGENT_SETTINGS_ITEM_TYPE = '__agent_settings';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const MAX_RANGE_MS = 62 * 86400000;
const MAX_SYNCED_EVENTS = 100;

export function normalizeTimeZone(timezone?: string): string {
  const candidate = String(timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getZonedParts(date: Date, timeZone: string) {
  const tz = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour) === 24 ? 0 : Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    ymd: `${lookup.year}-${lookup.month}-${lookup.day}`,
  };
}

export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const wallAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const utcWholeSecondsMs = date.getTime() - (date.getTime() % 1000);
  return Math.round((wallAsUtcMs - utcWholeSecondsMs) / 60000) * 60000;
}

export function formatOffsetString(offsetMs: number): string {
  const sign = offsetMs >= 0 ? '+' : '-';
  const absMinutes = Math.round(Math.abs(offsetMs) / 60000);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
  const mins = String(absMinutes % 60).padStart(2, '0');
  return `${sign}${hours}:${mins}`;
}

export function zonedMidnightToDate(ymd: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error(`Invalid calendar date: ${ymd}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const approxUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset1 = getTimeZoneOffsetMs(new Date(approxUtcMs), timeZone);
  const candidate1 = approxUtcMs - offset1;
  const offset2 = getTimeZoneOffsetMs(new Date(candidate1), timeZone);
  return new Date(approxUtcMs - offset2);
}

export function zonedMidnightRfc3339(ymd: string, timeZone: string): string {
  const tz = normalizeTimeZone(timeZone);
  const date = zonedMidnightToDate(ymd, tz);
  const offsetStr = formatOffsetString(getTimeZoneOffsetMs(date, tz));
  return `${ymd}T00:00:00${offsetStr}`;
}

export function addDaysToYmd(ymd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error(`Invalid calendar date: ${ymd}`);
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const y = String(next.getUTCFullYear()).padStart(4, '0');
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabelParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  return {
    weekday: map.weekday || '',
    dateLabel: [map.day, map.month, map.year].filter(Boolean).join(' '),
  };
}

function formatDateLabelFromYmd(ymd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return { weekday: '', dateLabel: ymd };
  const utcDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return formatDateLabelParts(utcDate, 'UTC');
}

function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function getLocalNowInfo(timeZone = DEFAULT_TIMEZONE, now = new Date()) {
  const tz = normalizeTimeZone(timeZone);
  const parts = getZonedParts(now, tz);
  const { weekday, dateLabel } = formatDateLabelFromYmd(parts.ymd);
  const offset = formatOffsetString(getTimeZoneOffsetMs(now, tz));
  const localTime = formatLocalTime(now, tz);
  const startOfTodayRfc3339 = zonedMidnightRfc3339(parts.ymd, tz);
  const startOfTodayDate = zonedMidnightToDate(parts.ymd, tz);

  return {
    timezone: tz,
    nowIso: now.toISOString(),
    offset,
    localDate: parts.ymd,
    localWeekday: weekday,
    localDateLabel: dateLabel,
    localTime,
    startOfTodayIso: startOfTodayDate.toISOString(),
    startOfTodayRfc3339,
  };
}

export type SchedulePreset =
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'next_week'
  | 'next_14_days'
  | 'upcoming';

export function resolvePresetRange(
  preset: SchedulePreset,
  timeZone = DEFAULT_TIMEZONE,
  now = new Date(),
): { from: string; to: string; timezone: string; preset: SchedulePreset } {
  const tz = normalizeTimeZone(timeZone);
  const todayYmd = getZonedParts(now, tz).ymd;
  const [y, m, d] = todayYmd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const mondayYmd = addDaysToYmd(todayYmd, -daysSinceMonday);

  let fromYmd = todayYmd;
  let toYmd = addDaysToYmd(todayYmd, 14);

  switch (preset) {
    case 'today':
      fromYmd = todayYmd;
      toYmd = addDaysToYmd(todayYmd, 1);
      break;
    case 'tomorrow':
      fromYmd = addDaysToYmd(todayYmd, 1);
      toYmd = addDaysToYmd(todayYmd, 2);
      break;
    case 'this_week':
      fromYmd = mondayYmd;
      toYmd = addDaysToYmd(mondayYmd, 7);
      break;
    case 'next_week':
      fromYmd = addDaysToYmd(mondayYmd, 7);
      toYmd = addDaysToYmd(mondayYmd, 14);
      break;
    case 'next_14_days':
      fromYmd = todayYmd;
      toYmd = addDaysToYmd(todayYmd, 14);
      break;
    case 'upcoming':
      fromYmd = todayYmd;
      toYmd = addDaysToYmd(todayYmd, 62);
      break;
    default:
      throw new Error(`Unsupported schedule preset: ${preset}`);
  }

  const from = zonedMidnightRfc3339(fromYmd, tz);
  let to = zonedMidnightRfc3339(toYmd, tz);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  // Clamp DST-extended 62-day range so validateSessionRange never rejects by 1 hour.
  if (toMs - fromMs > MAX_RANGE_MS) {
    to = new Date(fromMs + MAX_RANGE_MS).toISOString();
  }

  return { from, to, timezone: tz, preset };
}

export function calendarSettings(agent: any) {
  const meta = (agent?.knowledge_base_content || []).find((i: any) => i?.type === AGENT_SETTINGS_ITEM_TYPE);
  return meta?.calendar || { enabled: false, calendar_id: '', timezone: DEFAULT_TIMEZONE };
}

export function validateCalendarSettings(value: any, existingCalendar?: any) {
  if (!value || typeof value.enabled !== 'boolean') throw new Error('Invalid calendar settings');
  const calendar_id = String(value.calendar_id || '').trim();
  const timezone = String(value.timezone || DEFAULT_TIMEZONE);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { throw new Error('Invalid calendar timezone'); }
  if (calendar_id.length > 1024 || (value.enabled && !calendar_id)) throw new Error('Select a sessions calendar');

  const base: any = { enabled: value.enabled, calendar_id, timezone };
  if (
    existingCalendar &&
    base.enabled &&
    calendar_id &&
    existingCalendar.calendar_id === calendar_id
  ) {
    if (Array.isArray(existingCalendar.synced_events)) {
      base.synced_events = existingCalendar.synced_events;
    }
    if (existingCalendar.last_synced_at) {
      base.last_synced_at = existingCalendar.last_synced_at;
    }
    if (existingCalendar.sync_error !== undefined) {
      base.sync_error = existingCalendar.sync_error;
    }
  }
  return base;
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
    calendars.push(...(data.items || []).filter((c: any) => ['reader', 'writer', 'owner'].includes(c.accessRole)).map((c: any) => ({ id: c.id, name: c.summaryOverride || c.summary, timezone: c.timeZone || DEFAULT_TIMEZONE, primary: c.primary === true })));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return calendars;
}

export function validateSessionRange(from: string, to: string) {
  const start = Date.parse(from), end = Date.parse(to);
  if (typeof from !== 'string' || typeof to !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(from) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(to) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_RANGE_MS) {
    throw new Error('Choose a valid date range of at most 62 days');
  }
  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() };
}

export function publicSession(event: any, timezone = DEFAULT_TIMEZONE) {
  if (!event || event.status === 'cancelled' || event.visibility === 'private' || event.visibility === 'confidential') return null;

  const tz = normalizeTimeZone(timezone);
  const startObj = event.start || undefined;
  const endObj = event.end || undefined;

  let is_all_day = false;
  let local_date: string | null = null;
  let local_end_date: string | null = null;
  let local_weekday: string | null = null;
  let local_date_label: string | null = null;
  let local_start: string | null = null;
  let local_end: string | null = null;

  if (startObj?.date && !startObj?.dateTime) {
    is_all_day = true;
    local_date = String(startObj.date);
    const labels = formatDateLabelFromYmd(local_date);
    local_weekday = labels.weekday;
    local_date_label = labels.dateLabel;
    local_start = 'All day';
    if (endObj?.date) {
      const inclusiveEnd = addDaysToYmd(String(endObj.date), -1);
      local_end_date = inclusiveEnd >= local_date ? inclusiveEnd : local_date;
      if (local_end_date !== local_date) {
        local_end = formatDateLabelFromYmd(local_end_date).dateLabel;
      }
    }
  } else if (startObj?.dateTime) {
    const startMs = Date.parse(startObj.dateTime);
    if (Number.isFinite(startMs)) {
      const startDate = new Date(startMs);
      const startParts = getZonedParts(startDate, tz);
      local_date = startParts.ymd;
      const labels = formatDateLabelFromYmd(local_date);
      local_weekday = labels.weekday;
      local_date_label = labels.dateLabel;
      local_start = formatLocalTime(startDate, tz);

      if (endObj?.dateTime) {
        const endMs = Date.parse(endObj.dateTime);
        if (Number.isFinite(endMs)) {
          const endDate = new Date(endMs);
          const endParts = getZonedParts(endDate, tz);
          local_end_date = endParts.ymd;
          const endTime = formatLocalTime(endDate, tz);
          local_end =
            local_end_date !== local_date
              ? `${formatDateLabelFromYmd(local_end_date).dateLabel}, ${endTime}`
              : endTime;
        }
      }
    }
  }

  const videoEntryLink = Array.isArray(event.conferenceData?.entryPoints)
    ? event.conferenceData.entryPoints.find((entry: any) => entry?.entryPointType === 'video')?.uri || ''
    : '';

  return {
    id: event.id,
    title: String(event.summary || event.title || 'Untitled session').slice(0, 300),
    start: startObj,
    end: endObj,
    description: String(event.description || '').slice(0, 5000),
    location: String(event.location || '').slice(0, 1000),
    meeting_link: event.hangoutLink || event.meeting_link || videoEntryLink || '',
    timezone: tz,
    is_all_day,
    local_date,
    local_end_date,
    local_weekday,
    local_date_label,
    local_start,
    local_end,
  };
}

export async function getUpcomingSessions(
  organizationId: string,
  calendarId: string,
  from: string,
  to: string,
  timezone = DEFAULT_TIMEZONE,
) {
  if (!calendarId) throw new Error('No sessions calendar selected');
  const tz = normalizeTimeZone(timezone);
  const range = validateSessionRange(from, to);
  const events: any[] = [];
  let pages = 0;
  let pageToken = '';
  do {
    const data = await googleRead(organizationId, `calendars/${encodeURIComponent(calendarId)}/events`, {
      ...range,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    events.push(...(data.items || []).map((item: any) => publicSession(item, tz)).filter(Boolean));
    pageToken = data.nextPageToken || '';
    if (++pages >= 20 || events.length >= 200) {
      return { events: events.slice(0, 200), truncated: Boolean(pageToken) || events.length > 200, ...range, timezone: tz };
    }
  } while (pageToken);
  return { events, truncated: false, ...range, timezone: tz };
}

function getEventBoundsMs(event: any, timeZone: string): { startMs: number; endMs: number } | null {
  const tz = normalizeTimeZone(timeZone);
  if (event?.start?.dateTime) {
    const startMs = Date.parse(event.start.dateTime);
    if (!Number.isFinite(startMs)) return null;
    const parsedEnd = event?.end?.dateTime ? Date.parse(event.end.dateTime) : NaN;
    const endMs = Number.isFinite(parsedEnd) ? parsedEnd : startMs + 3600000;
    return { startMs, endMs };
  }
  if (event?.start?.date) {
    try {
      const startMs = zonedMidnightToDate(String(event.start.date), tz).getTime();
      const endYmd = event?.end?.date ? String(event.end.date) : addDaysToYmd(String(event.start.date), 1);
      const endMs = zonedMidnightToDate(endYmd, tz).getTime();
      return { startMs, endMs };
    } catch {
      return null;
    }
  }
  return null;
}

export function filterSyncedEventsInRange(
  syncedEvents: any[],
  from: string,
  to: string,
  timezone = DEFAULT_TIMEZONE,
) {
  const tz = normalizeTimeZone(timezone);
  const range = validateSessionRange(from, to);
  const fromMs = Date.parse(range.timeMin);
  const toMs = Date.parse(range.timeMax);

  const filtered = (Array.isArray(syncedEvents) ? syncedEvents : [])
    .filter((event) => {
      const bounds = getEventBoundsMs(event, tz);
      if (!bounds) return false;
      return bounds.endMs > fromMs && bounds.startMs < toMs;
    })
    .map((event) => publicSession(event, tz))
    .filter(Boolean);

  return {
    events: filtered.slice(0, 200),
    truncated: filtered.length > 200,
    ...range,
    timezone: tz,
  };
}

export function formatSyncedScheduleForPrompt(
  calendar: any,
  now = new Date(),
  maxChars = 4500,
): string {
  if (!calendar?.enabled || !calendar?.calendar_id) return '';
  const tz = normalizeTimeZone(calendar.timezone);
  const nowInfo = getLocalNowInfo(tz, now);

  if (!Array.isArray(calendar.synced_events)) {
    return `Calendar Status: Enabled (${tz}), not yet synced to database. Always call get_upcoming_sessions for schedule queries.`;
  }

  const startOfTodayMs = Date.parse(nowInfo.startOfTodayIso);
  const upcomingEvents = calendar.synced_events.filter((event: any) => {
    const bounds = getEventBoundsMs(event, tz);
    if (!bounds) return false;
    return bounds.endMs >= startOfTodayMs;
  });

  const syncedNote = calendar.last_synced_at
    ? `last synced ${getLocalNowInfo(tz, new Date(calendar.last_synced_at)).localDateLabel} at ${getLocalNowInfo(tz, new Date(calendar.last_synced_at)).localTime} ${tz}`
    : tz;

  if (upcomingEvents.length === 0) {
    return `Saved Agent Schedule Database (${syncedNote}): 0 events stored for ${nowInfo.localDateLabel} onward (next 62 days). Call get_upcoming_sessions to verify live updates from Google Calendar.`;
  }

  const lines: string[] = [
    `Saved Agent Schedule Database (${upcomingEvents.length} event(s), ${syncedNote}):`,
  ];

  let totalLen = lines[0].length;
  const maxDescPerEvent = upcomingEvents.length <= 5 ? 600 : 220;

  for (const rawEvent of upcomingEvents) {
    const event =
      rawEvent?.local_date && rawEvent?.timezone === tz
        ? rawEvent
        : publicSession(rawEvent, tz);
    if (!event) continue;

    const whenDate = [event.local_weekday, event.local_date_label].filter(Boolean).join(', ') || event.local_date || 'Date TBA';
    const whenTime = event.is_all_day
      ? event.local_end
        ? `All day through ${event.local_end}`
        : 'All day'
      : [event.local_start, event.local_end].filter(Boolean).join(' – ') || 'Time TBA';

    const parts = [`- ${event.title} | ${whenDate} | ${whenTime} (${tz})`];
    if (event.location) parts.push(`Location: ${event.location}`);
    if (event.meeting_link) parts.push(`Link: ${event.meeting_link}`);
    if (event.description) {
      const compactDesc = String(event.description).replace(/\s+/g, ' ').trim();
      if (compactDesc) {
        parts.push(
          `Details: ${compactDesc.slice(0, maxDescPerEvent)}${compactDesc.length > maxDescPerEvent ? '…' : ''}`,
        );
      }
    }

    const line = parts.join(' | ');
    if (totalLen + line.length + 1 > maxChars) {
      lines.push('- ...additional later events omitted for brevity; use get_upcoming_sessions to inspect full range.');
      break;
    }
    lines.push(line);
    totalLen += line.length + 1;
  }

  return lines.join('\n');
}

function buildCompactSyncedEvent(event: any) {
  return {
    ...event,
    description: String(event?.description || '').slice(0, 1500),
    location: String(event?.location || '').slice(0, 500),
  };
}

function upsertCalendarInKnowledgeContent(knowledgeBaseContent: any[], nextCalendar: any) {
  const items = Array.isArray(knowledgeBaseContent) ? [...knowledgeBaseContent] : [];
  const metaIndex = items.findIndex((item: any) => item?.type === AGENT_SETTINGS_ITEM_TYPE);

  if (metaIndex >= 0) {
    items[metaIndex] = {
      ...items[metaIndex],
      calendar: nextCalendar,
    };
  } else {
    items.push({
      type: AGENT_SETTINGS_ITEM_TYPE,
      settings: {
        reply_on_keywords: true,
        auto_reply_unknown: false,
        default_for_new_chats: false,
        handoff_on_human_reply: true,
      },
      calendar: nextCalendar,
      selected_knowledge_document_ids: [],
      trained_at: new Date().toISOString(),
    });
  }

  return items;
}

export async function syncCalendarEventsIntoAgent(agent: any): Promise<{
  agent: any;
  synced: boolean;
  event_count: number;
  last_synced_at: string | null;
  error?: string;
}> {
  const cal = calendarSettings(agent);
  if (!cal?.enabled || !cal?.calendar_id) {
    return {
      agent,
      synced: false,
      event_count: 0,
      last_synced_at: cal?.last_synced_at || null,
    };
  }

  const tz = normalizeTimeZone(cal.timezone);
  const previousEvents = Array.isArray(cal.synced_events) ? cal.synced_events : [];

  try {
    const range = resolvePresetRange('upcoming', tz);
    const result = await getUpcomingSessions(
      agent.organization_id,
      cal.calendar_id,
      range.from,
      range.to,
      tz,
    );

    const compactEvents = result.events.slice(0, MAX_SYNCED_EVENTS).map(buildCompactSyncedEvent);
    const lastSyncedAt = new Date().toISOString();
    const nextCalendar = {
      enabled: true,
      calendar_id: cal.calendar_id,
      timezone: tz,
      synced_events: compactEvents,
      last_synced_at: lastSyncedAt,
      sync_error: null,
    };

    const nextKnowledgeContent = upsertCalendarInKnowledgeContent(
      agent.knowledge_base_content,
      nextCalendar,
    );

    const { data, error } = await supabase
      .from('bot_agents')
      .update({ knowledge_base_content: nextKnowledgeContent })
      .eq('id', agent.id)
      .eq('organization_id', agent.organization_id)
      .select()
      .single();

    if (error) throw error;

    return {
      agent: data || { ...agent, knowledge_base_content: nextKnowledgeContent },
      synced: true,
      event_count: compactEvents.length,
      last_synced_at: lastSyncedAt,
    };
  } catch (err: any) {
    const errorMessage = err?.message || 'Calendar sync failed';
    const nextCalendar = {
      enabled: true,
      calendar_id: cal.calendar_id,
      timezone: tz,
      synced_events: previousEvents,
      last_synced_at: cal.last_synced_at || null,
      sync_error: errorMessage,
    };

    let updatedAgent = agent;
    try {
      const nextKnowledgeContent = upsertCalendarInKnowledgeContent(
        agent.knowledge_base_content,
        nextCalendar,
      );
      const { data } = await supabase
        .from('bot_agents')
        .update({ knowledge_base_content: nextKnowledgeContent })
        .eq('id', agent.id)
        .eq('organization_id', agent.organization_id)
        .select()
        .single();
      if (data) updatedAgent = data;
    } catch {
      // Preserve in-memory agent object if DB error write also fails.
    }

    return {
      agent: updatedAgent,
      synced: false,
      event_count: previousEvents.length,
      last_synced_at: cal.last_synced_at || null,
      error: errorMessage,
    };
  }
}

export async function syncAgentCalendarById(
  organizationId: string,
  agentId: string,
  overrideCalendar?: { calendar_id?: string; timezone?: string; enabled?: boolean },
) {
  const { data: agent, error } = await supabase
    .from('bot_agents')
    .select('*')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !agent) {
    const notFound: any = new Error('Agent not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  let targetAgent = agent;
  const existingCal = calendarSettings(agent);

  if (overrideCalendar?.calendar_id !== undefined) {
    const validated = validateCalendarSettings(
      {
        enabled: overrideCalendar.enabled !== undefined ? Boolean(overrideCalendar.enabled) : true,
        calendar_id: overrideCalendar.calendar_id,
        timezone: overrideCalendar.timezone || existingCal.timezone || DEFAULT_TIMEZONE,
      },
      existingCal,
    );
    const updatedContent = upsertCalendarInKnowledgeContent(agent.knowledge_base_content, validated);
    const { data: savedAgent, error: saveErr } = await supabase
      .from('bot_agents')
      .update({ knowledge_base_content: updatedContent })
      .eq('id', agent.id)
      .eq('organization_id', organizationId)
      .select()
      .single();
    if (saveErr) throw saveErr;
    targetAgent = savedAgent || { ...agent, knowledge_base_content: updatedContent };
  }

  const effectiveCal = calendarSettings(targetAgent);
  if (!effectiveCal?.enabled || !effectiveCal?.calendar_id) {
    const badReq: any = new Error('Enable calendar answers and select a sessions calendar before syncing.');
    badReq.statusCode = 400;
    throw badReq;
  }

  return syncCalendarEventsIntoAgent(targetAgent);
}

export async function syncAllEnabledAgentCalendars() {
  const { data: agents, error } = await supabase
    .from('bot_agents')
    .select('*')
    .eq('is_active', true);

  if (error || !agents) return { synced: 0, failed: 0, skipped: 0 };

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const agent of agents) {
    const cal = calendarSettings(agent);
    if (!cal?.enabled || !cal?.calendar_id) continue;

    // Multi-instance guard: skip if synced cleanly within the last 4 minutes
    const lastSyncMs = cal.last_synced_at ? Date.parse(cal.last_synced_at) : 0;
    if (lastSyncMs && !cal.sync_error && Date.now() - lastSyncMs < 4 * 60 * 1000) {
      skipped++;
      continue;
    }

    const result = await syncCalendarEventsIntoAgent(agent);
    if (result.synced) synced++;
    else failed++;
  }

  return { synced, failed, skipped };
}
