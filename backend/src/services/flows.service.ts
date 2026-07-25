import { supabase } from '../config/supabase.js';
import { isUuid } from '../utils/format.js';
import { getBotAgentReply } from './ai.service.js';
import { encryptFormToken } from '../utils/crypto.js';
import { fetchGoogleBusySlots, createGoogleCalendarEvent, deleteGoogleCalendarEvent, getValidAccessToken } from './googleCalendar.service.js';
import crypto from 'crypto';

function extractFormSlug(urlStr: string): string {
  if (!urlStr) return '';
  let cleanUrl = urlStr.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'https://' + cleanUrl;
  }
  try {
    const parsed = new URL(cleanUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  } catch {
    return cleanUrl.split('/').filter(Boolean).pop() || '';
  }
  return '';
}

function appendFormToken(urlStr: string, token: string): string {
  if (!urlStr) return '';
  let hasProtocol = /^https?:\/\//i.test(urlStr.trim());
  let cleanUrl = urlStr.trim();
  if (!hasProtocol) {
    cleanUrl = 'https://' + cleanUrl;
  }
  try {
    const parsed = new URL(cleanUrl);
    parsed.searchParams.set('token', token);
    return parsed.toString();
  } catch {
    const separator = urlStr.includes('?') ? '&' : '?';
    if (!hasProtocol) {
      return `https://${urlStr}${separator}token=${encodeURIComponent(token)}`;
    }
    return `${urlStr}${separator}token=${encodeURIComponent(token)}`;
  }
}

function processButtonConfig(
  b: any,
  session_id: string,
  conversation_id: string,
  contact_id: string,
  organization_id: string,
  assigned_bot_id: string | null
): { id: string; text: string; type: 'reply' | 'url' | 'phone'; url?: string; phone?: string } {
  let btnUrl = b.url || undefined;
  let btnType: 'reply' | 'url' | 'phone' = b.type === 'phone' ? 'phone' : b.type === 'url' ? 'url' : 'reply';

  if (b.type === 'form') {
    try {
      const form_slug = extractFormSlug(b.url);
      const payload = {
        nonce: crypto.randomUUID(),
        session_id,
        conversation_id,
        contact_id,
        organization_id,
        bot_id: assigned_bot_id,
        form_slug,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

      const token = encryptFormToken(JSON.stringify(payload));
      btnUrl = appendFormToken(b.url || '', token);
      btnType = 'url';
    } catch (err: any) {
      console.error('[Flow] Secure URL generation failed:', err?.message || err);
      btnUrl = ''; // Fail securely
      btnType = 'url';
    }
  }

  return {
    id: b.id || b.text,
    text: b.text,
    type: btnType,
    url: btnUrl,
    phone: b.phone || undefined
  };
}



export type FlowEngineResult = {
  consumed: boolean;
  output?: string | null;
  media?: Array<{
    type: 'image' | 'video' | 'audio' | 'document';
    url: string;
    caption?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
  }>;
  interactive?: {
    type: 'button' | 'cta_url' | 'list';
    body: string;
    footer?: string;
    buttons?: Array<{ id: string; text: string; type?: 'reply' | 'url' | 'phone'; url?: string; phone?: string }>;
    buttonText?: string;
    sections?: any[];
  };
  handoff?: boolean;
  flow_id?: string | null;
  flow_version_id?: string | null;
  flow_session_id?: string | null;
  flow_run_id?: string | null;
  flow_node_id?: string | null;
};

export const SUPPORTED_FLOW_NODE_TYPES = new Set([
  'startBotFlow',
  'textMessage',
  'template',
  'button',
  'interactive',
  'userInput',
  'condition',
  'image',
  'video',
  'audio',
  'file',
  'location',
  'whatsappFlow',
  'ai',
  'httpApi',
  'googleSheets',
  'appointment',
  'product',
  'handoff',
  'end',
]);

export function parseFlowKeywords(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

export function getFlowTriggerKeywords(flow: any, nodesOverride?: any[]): string[] {
  const nodes = Array.isArray(nodesOverride) ? nodesOverride : (Array.isArray(flow?.nodes) ? flow.nodes : []);
  const startNode = nodes.find((n: any) => n?.type === 'startBotFlow');
  return [...new Set([
    ...parseFlowKeywords(flow?.trigger_keywords),
    ...parseFlowKeywords(flow?.triggers),
    ...parseFlowKeywords(startNode?.data?.config?.keywords),
  ])];
}

async function logFlowStep(params: {
  organization_id: string;
  run_id?: string | null;
  node_id: string;
  node_type: string;
  input_data?: any;
  output_data?: any;
  status?: 'success' | 'failed' | 'skipped' | 'waiting';
  error_message?: string | null;
}) {
  if (!params.run_id) return;
  try {
    await supabase.from('w_flow_run_steps').insert({
      organization_id: params.organization_id,
      run_id: params.run_id,
      node_id: params.node_id,
      node_type: params.node_type,
      input_data: params.input_data || {},
      output_data: params.output_data || {},
      status: params.status || 'success',
      error_message: params.error_message || null,
    });
  } catch (err: any) {
    console.warn('[Flow] Step log failed:', err?.message || err);
  }
}

export function normalizeFlowAccountScope(value: any) {
  return value === 'selected' ? 'selected' : 'all';
}

export function normalizeFlowAccountIds(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(isUuid);
}

export function isMissingFlowVersionAccountColumnsError(error: any) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  const code = String(error?.code || '');
  return (code === 'PGRST204' || code === '42703') &&
    message.includes('w_flow_versions') &&
    (message.includes('wa_account_scope') || message.includes('wa_account_ids'));
}

export async function insertFlowVersionWithSchemaFallback(payload: any) {
  const insertPayload = {
    ...payload,
    wa_account_scope: normalizeFlowAccountScope(payload?.wa_account_scope),
    wa_account_ids: normalizeFlowAccountIds(payload?.wa_account_ids),
  };

  const firstAttempt = await supabase
    .from('w_flow_versions')
    .insert(insertPayload)
    .select()
    .single();

  if (!firstAttempt.error || !isMissingFlowVersionAccountColumnsError(firstAttempt.error)) {
    return firstAttempt;
  }

  const legacyPayload = { ...insertPayload };
  delete legacyPayload.wa_account_scope;
  delete legacyPayload.wa_account_ids;

  console.warn(
    '[Flow] w_flow_versions account scope columns are missing. ' +
    'Retrying publish with legacy schema; run supabase/migrations/20260523_flow_versions_account_scope_fix.sql.'
  );

  return supabase
    .from('w_flow_versions')
    .insert(legacyPayload)
    .select()
    .single();
}

export function flowAppliesToAccount(flow: any, waAccountId?: string | null) {
  const scope = normalizeFlowAccountScope(flow?.wa_account_scope);
  if (scope !== 'selected') return true;
  const ids = normalizeFlowAccountIds(flow?.wa_account_ids);
  if (ids.length === 0) return false;
  return Boolean(waAccountId && ids.includes(String(waAccountId)));
}

export function flowAccountScopesOverlap(a: any, b: any) {
  const aScope = normalizeFlowAccountScope(a?.wa_account_scope);
  const bScope = normalizeFlowAccountScope(b?.wa_account_scope);
  if (aScope === 'all' || bScope === 'all') return true;
  const aIds = new Set(normalizeFlowAccountIds(a?.wa_account_ids));
  return normalizeFlowAccountIds(b?.wa_account_ids).some((id) => aIds.has(id));
}

export async function findFlowTriggerConflicts(orgId: string, flow: any, triggerKeywords: string[]) {
  const keywords = new Set((triggerKeywords || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  if (keywords.size === 0) return [];

  const { data, error } = await supabase
    .from('w_flows')
    .select('id, name, status, trigger_keywords, triggers, wa_account_scope, wa_account_ids')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .neq('id', flow.id);
  if (error) throw error;

  return (data || [])
    .filter((other: any) => flowAccountScopesOverlap(flow, other))
    .map((other: any) => {
      const otherKeywords = getFlowTriggerKeywords(other);
      const overlap = otherKeywords.filter((item) => keywords.has(String(item).trim().toLowerCase()));
      return overlap.length > 0 ? { flow: other, triggers: overlap } : null;
    })
    .filter(Boolean);
}

export function normalizeFlowVariableKey(value: any) {
  return String(value || '')
    .trim()
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function renderFlowTemplate(value: any, state: any = {}) {
  return String(value || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawKey) => {
    const key = normalizeFlowVariableKey(rawKey);
    const foundKey = Object.keys(state || {}).find((candidate) => normalizeFlowVariableKey(candidate) === key);
    const replacement = foundKey ? state[foundKey] : state?.[key];
    return replacement == null ? '' : String(replacement);
  });
}

export function validateFlowDefinition(flow: any) {
  const errors: string[] = [];
  const nodes: any[] = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges: any[] = Array.isArray(flow?.edges) ? flow.edges : [];
  const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean));
  const startNodes = nodes.filter((n) => n?.type === 'startBotFlow');
  const reachable = new Set<string>();

  if (startNodes.length !== 1) errors.push('Flow must have exactly one Start Bot Flow node.');
  if (nodes.length === 0) errors.push('Flow must contain at least one node.');

  for (const edge of edges) {
    if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) {
      errors.push('Flow has a broken connection.');
      break;
    }
  }

  if (startNodes.length === 1) {
    const stack = [startNodes[0].id];
    while (stack.length) {
      const id = stack.pop();
      if (!id || reachable.has(id)) continue;
      reachable.add(id);
      edges.filter((e) => e.source === id).forEach((e) => stack.push(e.target));
    }
  }

  const nodesToValidate = reachable.size > 0
    ? nodes.filter((n) => n?.id && reachable.has(n.id))
    : nodes;

  for (const node of nodesToValidate) {
    if (!SUPPORTED_FLOW_NODE_TYPES.has(node?.type)) {
      errors.push(`Unsupported node "${node?.type || 'unknown'}" is not available in this flow builder.`);
    }
    const config = node?.data?.config || {};
    if (node?.type === 'textMessage' && !String(config.message || config.text || '').trim()) {
      errors.push('Text Message node must have message text.');
    }
    if (node?.type === 'button') {
      const buttons = Array.isArray(config.buttons) ? config.buttons.filter((b: any) => String(b?.text || '').trim()) : [];
      if (buttons.length === 0) errors.push('Button node must have at least one button.');
      if (buttons.length > 3) errors.push('Button node can have maximum 3 WhatsApp buttons.');
    }
    if (node?.type === 'userInput' && !String(config.saveToField || '').trim()) {
      errors.push('User Input node must save the answer to a field.');
    }
    if (node?.type === 'condition' && (
      !String(config.variable || '').trim()
      || !String(config.operator || '').trim()
      || !String(config.value || '').trim()
    )) {
      errors.push('Condition node must have variable, operator, and value.');
    }
  }

  if (startNodes.length === 1) {
    const keywords = getFlowTriggerKeywords(flow, nodes);
    if ((flow?.trigger_type || 'keyword') === 'keyword' && keywords.length === 0) {
      errors.push('Start node must have trigger keywords.');
    }
  }

  if (normalizeFlowAccountScope(flow?.wa_account_scope) === 'selected' && normalizeFlowAccountIds(flow?.wa_account_ids).length === 0) {
    errors.push('Select at least one WhatsApp account or switch the flow to all connected numbers.');
  }

  return { valid: errors.length === 0, errors };
}

function generateDateSections(slotsConfigStr: string = "") {
  const sections = [];
  const rows = [];
  const slotsConfig = String(slotsConfigStr).toLowerCase();
  const excludeWeekends = slotsConfig.includes("mon-fri") || slotsConfig.includes("weekday");

  let count = 0;
  let dayOffset = 0;

  while (count < 7 && dayOffset < 15) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (excludeWeekends && isWeekend) {
      dayOffset++;
      continue;
    }

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayName = days[dayOfWeek];
    const monthName = months[d.getMonth()];

    rows.push({
      id: `date_${dateStr}`,
      title: `${dayName.slice(0, 3)}, ${monthName} ${d.getDate()}`,
      description: `Select ${dayName}`,
    });

    count++;
    dayOffset++;
  }

  sections.push({
    title: "Available Dates",
    rows,
  });

  return sections;
}

async function generateTimeSections(
  dateStr: string,
  slotsConfigStr: string = "",
  organizationId?: string,
  nodeConfig?: any
) {
  const rows = [];
  const slotsConfig = String(slotsConfigStr).toLowerCase();

  let startHour = 10;
  let endHour = 18;

  const timeRegex = /(\d+)\s*(am|pm)\s*-\s*(\d+)\s*(am|pm)/i;
  const match = slotsConfig.match(timeRegex);
  if (match) {
    let sH = parseInt(match[1]);
    const sM = match[2].toLowerCase();
    let eH = parseInt(match[3]);
    const eM = match[4].toLowerCase();

    if (sM === "pm" && sH < 12) sH += 12;
    if (sM === "am" && sH === 12) sH = 0;
    if (eM === "pm" && eH < 12) eH += 12;
    if (eM === "am" && eH === 12) eH = 0;

    startHour = sH;
    endHour = eH;
  }

  // Fetch Database Booked Slots for this Organization on dateStr
  const bookedSlotIds = new Set<string>();
  if (organizationId) {
    const { data: existingSessions } = await supabase
      .from("w_flow_sessions")
      .select("state_data")
      .eq("organization_id", organizationId);

    if (existingSessions) {
      for (const sessionRecord of existingSessions) {
        const sData = sessionRecord.state_data || {};
        if (
          sData.appointment_date === dateStr &&
          (sData.appointment_time || sData.selected_time_raw) &&
          sData.appointment_status !== "cancelled"
        ) {
          bookedSlotIds.add(sData.appointment_time || sData.selected_time_raw);
        }
      }
    }
  }

  // Fetch Google Busy Slots if enabled
  let busySlots: { start: string; end: string }[] = [];
  if (organizationId && (nodeConfig?.googleSyncEnabled === true || String(nodeConfig?.googleSyncEnabled) === "true")) {
    const timeMin = `${dateStr}T00:00:00Z`;
    const timeMax = `${dateStr}T23:59:59Z`;
    busySlots = await fetchGoogleBusySlots(organizationId, timeMin, timeMax);
  }

  const selectedDate = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const isToday = selectedDate.toDateString() === today.toDateString();

  // Dynamic Slot Step & Buffer Padding from Flow Node Configuration
  const stepMins = parseInt(String(nodeConfig?.slotDurationMinutes || nodeConfig?.googleSlotDurationMinutes || 60), 10) || 60;
  const bufferMins = parseInt(String(nodeConfig?.googleBufferMinutes || nodeConfig?.bufferMinutes || 30), 10) || 0;
  const bufferMs = bufferMins * 60 * 1000;

  const totalMinStart = startHour * 60;
  const totalMinEnd = endHour * 60;

  for (let currentMin = totalMinStart; currentMin < totalMinEnd; currentMin += stepMins) {
    const hr = Math.floor(currentMin / 60);
    const min = currentMin % 60;
    const idStr = `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

    // 1. Exclude if already booked by another user in Database
    if (bookedSlotIds.has(idStr)) {
      continue;
    }

    // Dynamic slot start and end timestamp in milliseconds
    const slotStartTime = new Date(`${dateStr}T${idStr}:00Z`).getTime();
    const slotEndTime = slotStartTime + stepMins * 60 * 1000;

    if (isToday) {
      const slotTimeLocal = new Date(`${dateStr}T${idStr}:00`);
      const minAllowed = new Date(today.getTime() + 15 * 60 * 1000);
      if (slotTimeLocal < minAllowed) {
        continue;
      }
    }

    // 2. Exclude if Google Busy Conflict (using dynamic buffer padding from flow node config)
    if (busySlots.length > 0) {
      const hasConflict = busySlots.some((b) => {
        const bStart = new Date(b.start).getTime() - bufferMs;
        const bEnd = new Date(b.end).getTime() + bufferMs;
        return slotStartTime < bEnd && slotEndTime > bStart;
      });

      if (hasConflict) {
        continue;
      }
    }

    const displayHr = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    const ampm = hr >= 12 ? "PM" : "AM";
    const minStr = String(min).padStart(2, "0");
    const timeStr = `${String(displayHr).padStart(2, "0")}:${minStr} ${ampm}`;

    const endCurrentMin = currentMin + stepMins;
    const endHr = Math.floor(endCurrentMin / 60);
    const endMin = endCurrentMin % 60;
    const displayEndHr = endHr > 12 ? endHr - 12 : endHr === 0 ? 12 : endHr;
    const endAmpm = endHr >= 12 ? "PM" : "AM";
    const endMinStr = String(endMin).padStart(2, "0");
    const endTimeStr = `${String(displayEndHr).padStart(2, "0")}:${endMinStr} ${endAmpm}`;

    const labelDuration = stepMins >= 60 ? `${stepMins / 60} hr` : `${stepMins} min`;

    rows.push({
      id: `time_${idStr}`,
      title: timeStr,
      description: `${labelDuration} slot (${timeStr} - ${endTimeStr})`,
    });
  }

  // Cap at 10 rows maximum to comply with WhatsApp Cloud API interactive list limits
  const limitedRows = rows.slice(0, 10);

  return [{
    title: "Available Time Slots",
    rows: limitedRows,
  }];
}

export async function processFlowEngine(
  organization_id: string,
  contact_id: string,
  conversation_id: string,
  text: string,
  triggerMessageId?: string | null,
  incomingWaAccountId?: string | null,
): Promise<FlowEngineResult> {
  const normalized = text.toLowerCase().trim();

  // Load conversation to get assigned_bot_id
  const { data: convData } = await supabase
    .from("w_conversations")
    .select("assigned_bot_id")
    .eq("id", conversation_id)
    .maybeSingle();
  const assigned_bot_id = convData?.assigned_bot_id || null;


  // Flow Builder has priority and is independent from the per-chat AI-agent toggle.

  // 1. Check for active session by contact_id
  const { data: session } = await supabase
    .from("w_flow_sessions")
    .select("*, w_flows(status)")
    .eq("organization_id", organization_id)
    .eq("contact_id", contact_id)
    .in("status", ["active", "waiting"])
    .maybeSingle();

  let currentFlowId: string | null = null;
  let currentNodeId: string | null = null;
  let session_id: string | null = null;
  let currentFlowVersionId: string | null = null;
  let run_id: string | null = null;
  let isResuming = false;

  if (session) {
    if (session.conversation_id !== conversation_id) {
      // The session is tied to a different conversation (e.g. deleted/recreated).
      // Discard/abandon it to allow new sessions to be created for this contact.
      await supabase
        .from("w_flow_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      if (session.active_run_id) {
        await supabase
          .from("w_flow_runs")
          .update({
            status: "completed",
            ended_at: new Date().toISOString(),
          })
          .eq("id", session.active_run_id);
      }
      console.log(`[Flow] Abandoned orphaned session ${session.id} for contact ${contact_id} due to conversation mismatch (old: ${session.conversation_id}, new: ${conversation_id})`);
    } else {
      const flowObj = (session as any).w_flows;
      const flowStatus = Array.isArray(flowObj) ? flowObj[0]?.status : flowObj?.status;

      if (!flowStatus || flowStatus !== "active") {
        // Flow is archived, draft, or deleted; ignore/abandon the stale session
        await supabase
          .from("w_flow_sessions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", session.id);

        if (session.active_run_id) {
          await supabase
            .from("w_flow_runs")
            .update({
              status: "completed",
              ended_at: new Date().toISOString(),
            })
            .eq("id", session.active_run_id);
        }
        console.log(`[Flow] Abandoned stale session ${session.id} for inactive flow ${session.flow_id} (status: ${flowStatus || "deleted"})`);
      } else {
        currentFlowId = session.flow_id;
        currentFlowVersionId = session.flow_version_id || null;
        currentNodeId = session.current_node_id;
        session_id = session.id;
        run_id = session.active_run_id || null;
        isResuming = true;
      }
    }
  }

  if (!isResuming) {
    // 2. Check for trigger matches in active flows
    const { data: activeFlows } = await supabase
      .from("w_flows")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("status", "active");

    const accountEligibleFlows = (activeFlows || []).filter((flow: any) =>
      flowAppliesToAccount(flow, incomingWaAccountId),
    );

    let matchedFlow = null;
    let matchedVersion = null;
    for (const flow of accountEligibleFlows) {
      let version = null;
      if (flow.current_version_id) {
        const { data } = await supabase
          .from("w_flow_versions")
          .select("*")
          .eq("id", flow.current_version_id)
          .maybeSingle();
        version = data;
      }
      const nodes = version?.nodes || flow.nodes || [];
      const allTriggers = getFlowTriggerKeywords(version || flow, nodes);

      const isMatch = allTriggers.some((t: string) => {
        const keyword = t.toLowerCase().trim();
        if (!keyword) return false;
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        return regex.test(normalized);
      });

      if (isMatch) {
        matchedFlow = flow;
        matchedVersion = version;
        break;
      }
    }

    if (!matchedFlow) {
      console.log("[Flow] No active flow matched; AI fallback may run", {
        organization_id,
        conversation_id,
        text: normalized,
        active_flow_count: activeFlows?.length || 0,
        account_eligible_flow_count: accountEligibleFlows.length,
        incoming_wa_account_id: incomingWaAccountId || null,
        triggers: accountEligibleFlows.map((flow: any) => ({
          id: flow.id,
          name: flow.name,
          trigger_keywords: flow.trigger_keywords,
          triggers: flow.triggers,
          wa_account_scope: flow.wa_account_scope || "all",
          wa_account_ids: flow.wa_account_ids || [],
        })),
      });
      return { consumed: false, output: null };
    }

    console.log("[Flow] Matched active flow", {
      organization_id,
      conversation_id,
      flow_id: matchedFlow.id,
      flow_name: matchedFlow.name,
      flow_version_id:
        matchedVersion?.id || matchedFlow.current_version_id || null,
      incoming_wa_account_id: incomingWaAccountId || null,
    });

    currentFlowId = matchedFlow.id;
    currentFlowVersionId =
      matchedVersion?.id || matchedFlow.current_version_id || null;
    // Find start node
    const nodes = matchedVersion?.nodes || matchedFlow.nodes || [];
    const startNode = nodes.find((n: any) => n.type === "startBotFlow");
    if (!startNode) return { consumed: false, output: null };

    currentNodeId = startNode.id;

    // Create or find active session
    const { data: newSession, error: sessErr } = await supabase
      .from("w_flow_sessions")
      .insert({
        organization_id,
        conversation_id,
        contact_id,
        flow_id: currentFlowId,
        flow_version_id: currentFlowVersionId,
        current_node_id: currentNodeId,
        status: "active",
        state_data: {},
      })
      .select()
      .single();

    if (sessErr) {
      console.error("Session create error:", sessErr);
      // Agar duplicate error hai toh existing session use karo
      if (sessErr.code === "23505") {
        const { data: existingSession } = await supabase
          .from("w_flow_sessions")
          .select("*")
          .eq("organization_id", organization_id)
          .eq("conversation_id", conversation_id)
          .in("status", ["active", "waiting"])
          .maybeSingle();
        if (existingSession) {
          currentFlowId = existingSession.flow_id;
          currentFlowVersionId =
            existingSession.flow_version_id || currentFlowVersionId;
          currentNodeId = existingSession.current_node_id;
          session_id = existingSession.id;
          run_id = existingSession.active_run_id || null;
          isResuming = true;
        }
      }
    } else if (newSession) {
      session_id = newSession.id;
    }

    if (!run_id) {
      const { data: newRun } = await supabase
        .from("w_flow_runs")
        .insert({
          organization_id,
          conversation_id,
          contact_id,
          flow_id: currentFlowId,
          flow_version_id: currentFlowVersionId,
          session_id,
          trigger_message_id: triggerMessageId || null,
          status: "running",
        })
        .select("id")
        .maybeSingle();
      run_id = newRun?.id || null;
      if (session_id && run_id) {
        await supabase
          .from("w_flow_sessions")
          .update({ active_run_id: run_id })
          .eq("id", session_id);
      }
    }

    console.log(
      `🆕 New flow session created: ${session_id}, starting at node: ${currentNodeId}`,
    );
  }

  if (!currentFlowId || !currentNodeId || !session_id) {
    return { consumed: false, output: null };
  }

  // Flow data load karo
  let flowData = null;
  if (currentFlowVersionId) {
    const { data } = await supabase
      .from("w_flow_versions")
      .select("nodes, edges")
      .eq("id", currentFlowVersionId)
      .maybeSingle();
    flowData = data;
  }
  if (!flowData) {
    const { data } = await supabase
      .from("w_flows")
      .select("nodes, edges")
      .eq("id", currentFlowId)
      .single();
    flowData = data;
  }

  if (!flowData) return { consumed: true, output: null };

  const nodes: any[] = flowData.nodes || [];
  const edges: any[] = flowData.edges || [];
  const { data: latestSessionState } = await supabase
    .from("w_flow_sessions")
    .select("state_data")
    .eq("id", session_id)
    .maybeSingle();
  let flowState = latestSessionState?.state_data || session?.state_data || {};
  const flowMeta = {
    flow_id: currentFlowId,
    flow_version_id: currentFlowVersionId,
    flow_session_id: session_id,
    flow_run_id: run_id,
  };

  let activeNode = nodes.find((n: any) => n.id === currentNodeId);
  const outputText: string[] = [];
  const mediaOutput: NonNullable<FlowEngineResult["media"]> = [];
  let steps = 0;

  if (isResuming) {
    const currentNode = nodes.find((n: any) => n.id === currentNodeId);

    if (currentNode?.type === "appointment") {
      let listReplyId = "";
      if (triggerMessageId) {
        const { data: triggerMsg } = await supabase
          .from("w_messages")
          .select("content")
          .eq("id", triggerMessageId)
          .maybeSingle();
        listReplyId = triggerMsg?.content?.raw?.interactive?.list_reply?.id || "";
      }

      const appointmentStep = String(flowState?.appointment_step || "select_date");
      const config = currentNode.data?.config || {};

      if (appointmentStep === "select_date") {
        if (!listReplyId || !listReplyId.startsWith("date_")) {
          const sections = generateDateSections(config.slots);
          const body = renderFlowTemplate(config.message || "Please select a date for your appointment:", flowState);
          return {
            consumed: true,
            output: null,
            ...flowMeta,
            flow_node_id: currentNode.id,
            interactive: {
              type: "list",
              body,
              buttonText: "Select Date",
              sections,
            },
          };
        }

        const selectedDate = listReplyId.replace("date_", "");
        const nextState = {
          ...flowState,
          appointment_date: selectedDate,
          appointment_step: "select_time",
        };

        await supabase
          .from("w_flow_sessions")
          .update({ state_data: nextState })
          .eq("id", session_id);
        flowState = nextState;

        const timeSections = await generateTimeSections(selectedDate, config.slots, organization_id, config);
        if (timeSections.length === 0 || timeSections[0].rows.length === 0) {
          const resetState = {
            ...nextState,
            appointment_step: "select_date",
          };
          await supabase
            .from("w_flow_sessions")
            .update({ state_data: resetState })
            .eq("id", session_id);
          flowState = resetState;

          const dateSections = generateDateSections(config.slots);
          return {
            consumed: true,
            output: "No time slots are available for today. Please pick another date.",
            ...flowMeta,
            flow_node_id: currentNode.id,
            interactive: {
              type: "list",
              body: renderFlowTemplate(config.message || "Please select a date for your appointment:", flowState),
              buttonText: "Select Date",
              sections: dateSections,
            },
          };
        }

        return {
          consumed: true,
          output: null,
          ...flowMeta,
          flow_node_id: currentNode.id,
          interactive: {
            type: "list",
            body: `Choose a time slot for ${selectedDate}:`,
            buttonText: "Select Time",
            sections: timeSections,
          },
        };
      }

      else if (appointmentStep === "select_time") {
        if (!listReplyId || !listReplyId.startsWith("time_")) {
          const timeSections = await generateTimeSections(flowState.appointment_date, config.slots, organization_id, config);
          return {
            consumed: true,
            output: null,
            ...flowMeta,
            flow_node_id: currentNode.id,
            interactive: {
              type: "list",
              body: `Choose a time slot for ${flowState.appointment_date}:`,
              buttonText: "Select Time",
              sections: timeSections,
            },
          };
        }

        const selectedTimeRaw = listReplyId.replace("time_", "");
        const [hoursStr, minutesStr] = selectedTimeRaw.split(":");
        let hr = parseInt(hoursStr);
        const ampm = hr >= 12 ? "PM" : "AM";
        const displayHr = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
        const displayTime = `${displayHr}:${minutesStr} ${ampm}`;

        const friendlyDateTime = `${flowState.appointment_date} at ${displayTime}`;
        const nextState = {
          ...flowState,
          selected_time_raw: selectedTimeRaw,
          appointment_time: displayTime,
          appointment_datetime: friendlyDateTime,
          appointment_step: null,
        };

        // Check Max 2 Slots limit per contact across organization using w_flow_sessions
        if (organization_id && contact_id) {
          const { data: existingSessions } = await supabase
            .from("w_flow_sessions")
            .select("id, state_data, created_at")
            .eq("organization_id", organization_id)
            .eq("contact_id", contact_id)
            .order("created_at", { ascending: true });

          const confirmedSessions = (existingSessions || []).filter((s: any) => {
            const sd = s.state_data || {};
            return sd.appointment_date && (sd.appointment_time || sd.selected_time_raw) && sd.appointment_status !== "cancelled";
          });

          if (confirmedSessions.length >= 2) {
            const oldestSession = confirmedSessions[0];
            const oldState = oldestSession.state_data || {};
            const oldGEventId = oldState.google_event_id;

            await supabase
              .from("w_flow_sessions")
              .update({
                state_data: { ...oldState, appointment_status: "cancelled" },
              })
              .eq("id", oldestSession.id);

            if (oldGEventId && organization_id) {
              deleteGoogleCalendarEvent(organization_id, oldGEventId).catch((err: any) =>
                console.error("Error deleting old Google Calendar event:", err)
              );
            }
            console.log(`🗑️ Max 2 slots limit reached for contact ${contact_id}. Cancelled oldest flow session ${oldestSession.id}`);
          }
        }

        // Create Google Calendar Event if enabled (15-minute slot)
        let googleEventId: string | null = null;
        const validGToken = await getValidAccessToken(organization_id).catch(() => null);
        const isGoogleSyncOn = !!validGToken || config.googleSyncEnabled === true || String(config.googleSyncEnabled) === "true";
        if (isGoogleSyncOn && organization_id) {
          // 15-minute slot end time calculation
          const totalMin = parseInt(hoursStr) * 60 + parseInt(minutesStr) + 15;
          const endH = Math.floor(totalMin / 60) % 24;
          const endM = totalMin % 60;
          const endRaw = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

          const startISO = `${flowState.appointment_date}T${selectedTimeRaw}:00`;
          const endISO = `${flowState.appointment_date}T${endRaw}:00`;

          // Fetch contact name/phone if available
          let cName = flowState.name || "";
          let cPhone = flowState.phone || "";
          if (contact_id && (!cName || !cPhone)) {
            const { data: contactRow } = await supabase
              .from("w_contacts")
              .select("name, custom_name, phone, wa_id")
              .eq("id", contact_id)
              .maybeSingle();
            if (contactRow) {
              cName = cName || contactRow.custom_name || contactRow.name || "";
              cPhone = cPhone || contactRow.phone || contactRow.wa_id || "";
            }
          }

          const clientTitle = cName ? `${cName} (${cPhone})` : cPhone || "WhatsApp Client";

          const gRes = await createGoogleCalendarEvent(organization_id, {
            summary: `Appointment: ${clientTitle}`,
            description: `WhatsApp Booking Flow\nClient: ${clientTitle}\nDate: ${flowState.appointment_date}\nTime: ${displayTime}`,
            startDateTimeISO: startISO,
            endDateTimeISO: endISO,
          }).catch((err: any) => {
            console.error("Google Calendar event creation error:", err);
            return { success: false, eventId: undefined };
          });

          if (gRes && gRes.success && gRes.eventId) {
            googleEventId = gRes.eventId;
            console.log(`🗓️ Google Calendar Event created with ID: ${googleEventId}`);
          }
        }

        nextState.google_event_id = googleEventId || null;
        nextState.appointment_status = "confirmed";

        await supabase
          .from("w_flow_sessions")
          .update({ state_data: nextState })
          .eq("id", session_id);

        flowState = nextState;

        const confirmationText = renderFlowTemplate(
          config.confirmationMessage || "Thanks {{name}}. Your appointment for {{appointment_datetime}} has been confirmed.",
          flowState
        );
        outputText.push(confirmationText);

        const outEdges = edges.filter((e: any) => e.source === currentNodeId);
        const nextEdge = outEdges[0];
        if (nextEdge) {
          currentNodeId = nextEdge.target;
          await supabase
            .from("w_flow_sessions")
            .update({ current_node_id: currentNodeId })
            .eq("id", session_id);

          activeNode = nodes.find((n: any) => n.id === currentNodeId);
          isResuming = false;
          console.log(`➡️ Advancing to next node after appointment confirmation: ${currentNodeId}`);
        } else {
          await supabase
            .from("w_flow_sessions")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", session_id);
          if (run_id) {
            await supabase
              .from("w_flow_runs")
              .update({ status: "completed", ended_at: new Date().toISOString() })
              .eq("id", run_id);
          }
          return {
            consumed: true,
            output: outputText.join("\n\n"),
            ...flowMeta,
            flow_node_id: currentNode.id,
          };
        }
      }
    } else if (currentNode?.type === "button" || currentNode?.type === "userInput") {
      if (currentNode.type === "userInput") {
        const saveToField = normalizeFlowVariableKey(
          currentNode.data?.config?.saveToField,
        );
        if (saveToField) {
          const nextState = {
            ...(session?.state_data || {}),
            [saveToField]: text,
          };
          await supabase
            .from("w_flow_sessions")
            .update({ state_data: nextState })
            .eq("id", session_id);
          flowState = nextState;
        }
      }
      // User ka response match karo outgoing edges se
      const outEdges = edges.filter((e: any) => e.source === currentNodeId);
      let nextEdge: any = null;

      if (outEdges.length === 1) {
        nextEdge = outEdges[0];
      } else if (outEdges.length > 1) {
        const buttons = currentNode?.data?.config?.buttons || [];
        const matchedButtonIndex = buttons.findIndex(
          (b: any) =>
            String(b?.text || "")
              .trim()
              .toLowerCase() === normalized,
        );
        if (matchedButtonIndex >= 0) {
          nextEdge = outEdges.find(
            (e: any) => e.sourceHandle === `button-${matchedButtonIndex}`,
          );
        }
        // Button ID, title, ya label se match karo
        nextEdge =
          nextEdge ||
          outEdges.find((e: any) => {
            const handle = (e.sourceHandle || "").toLowerCase();
            const label = (e.label || "").toLowerCase();
            return (
              handle === normalized ||
              label === normalized ||
              normalized.includes(handle)
            );
          }) ||
          outEdges.find((e: any) => {
            // Fallback to sourceHandle comparison if label fails
            return (
              e.sourceHandle &&
              normalized.includes(e.sourceHandle.toLowerCase())
            );
          });

        if (!nextEdge) {
          // User input didn't match any button option.
          // ALWAYS consume the message when a flow session is active — never let AI bot take over.
          // Re-send the button question so the user picks a valid option.
          console.log(`[Flow] Resumed at button node but input "${text}" did not match any buttons. Re-asking button question.`);
          const body = renderFlowTemplate(
            currentNode.data?.config?.text || currentNode.data?.config?.headerText || "Please choose an option:",
            flowState,
          );
          const footer = renderFlowTemplate(currentNode.data?.config?.footerText || "", flowState);
          const buttons = (currentNode.data?.config?.buttons || []).filter((b: any) => b.text).slice(0, 3);
          if (buttons.length > 0) {
            return {
              consumed: true,
              output: null,
              ...flowMeta,
              flow_node_id: currentNode.id,
              interactive: {
                type: "button",
                body,
                footer,
                buttons: buttons.map((b: any) => processButtonConfig(b, session_id, conversation_id, contact_id, organization_id, assigned_bot_id)),

              },
            };
          }
          // No buttons configured — re-ask as plain text
          return {
            consumed: true,
            output: body || "Please reply with a valid option.",
            ...flowMeta,
            flow_node_id: currentNode.id,
          };
        }
      }

      if (nextEdge) {
        currentNodeId = nextEdge.target;
        await supabase
          .from("w_flow_sessions")
          .update({ current_node_id: currentNodeId })
          .eq("id", session_id);
        console.log(`➡️ Advancing to node: ${currentNodeId}`);
      } else {
        // Koi edge nahi — flow complete
        await supabase
          .from("w_flow_sessions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", session_id);
        if (run_id)
          await supabase
            .from("w_flow_runs")
            .update({ status: "completed", ended_at: new Date().toISOString() })
            .eq("id", run_id);
        return { consumed: true, output: null, ...flowMeta };
      }
    }
  }

  // ----------------------------------------------------------------
  // Node execution loop — current node se chalo
  // ----------------------------------------------------------------
  activeNode = nodes.find((n: any) => n.id === currentNodeId);

  while (activeNode && steps < 15) {
    steps++;
    const nodeType = activeNode.type;
    const config = activeNode.data?.config || {};

    console.log(`⚙️ Executing node: ${nodeType} (${activeNode.id})`);
    await logFlowStep({
      organization_id,
      run_id,
      node_id: activeNode.id,
      node_type: nodeType,
      input_data: { text },
      status:
        nodeType === "button" || nodeType === "userInput"
          ? "waiting"
          : "success",
    });

    // --- TEXT MESSAGE ---
    if (nodeType === "textMessage") {
      const msg = config.message || config.text || activeNode.data?.label || "";
      if (msg) outputText.push(renderFlowTemplate(msg, flowState));
    }

    // --- BUTTON NODE ---
    else if (nodeType === "button") {
      const body = renderFlowTemplate(
        config.text || config.headerText || "Choose an option:",
        flowState,
      );
      const footer = renderFlowTemplate(config.footerText || "", flowState);
      const buttons = (config.buttons || [])
        .filter((b: any) => b.text)
        .slice(0, 3);

      // Session mein current_node_id save karo — next message yahan se resume hoga
      await supabase
        .from("w_flow_sessions")
        .update({ current_node_id: activeNode.id })
        .eq("id", session_id);

      if (buttons.length > 0) {
        return {
          consumed: true,
          output: outputText.length > 0 ? outputText.join("\n\n") : null,
          media: mediaOutput.length > 0 ? mediaOutput : undefined,
          ...flowMeta,
          flow_node_id: activeNode.id,
          interactive: {
            type: "button",
            body,
            footer,
            buttons: buttons.map((b: any) => processButtonConfig(b, session_id, conversation_id, contact_id, organization_id, assigned_bot_id)),

          },
        };
      } else {
        // Buttons nahi hain toh text fallback
        outputText.push(body);
        return {
          consumed: true,
          output: outputText.join("\n\n"),
          media: mediaOutput.length > 0 ? mediaOutput : undefined,
          ...flowMeta,
          flow_node_id: activeNode.id,
        };
      }
    }

    // --- INTERACTIVE LIST NODE ---
    else if (nodeType === "interactive") {
      const body = renderFlowTemplate(
        config.headerText || config.text || "Choose an option:",
        flowState,
      );
      const items = (config.items || [])
        .filter((item: any) => item.title)
        .map(
          (item: any, index: number) =>
            `${index + 1}. ${item.title}${item.description ? ` - ${item.description}` : ""}`,
        );

      outputText.push(items.length > 0 ? `${body}\n${items.join("\n")}` : body);
    }

    // --- USER INPUT NODE ---
    else if (nodeType === "userInput") {
      const question = renderFlowTemplate(
        config.question || config.text || "",
        flowState,
      );
      if (question) outputText.push(question);
      // Session save karo
      await supabase
        .from("w_flow_sessions")
        .update({ current_node_id: activeNode.id })
        .eq("id", session_id);
      return {
        consumed: true,
        output: outputText.join("\n\n"),
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    // --- CONDITION NODE ---
    else if (nodeType === "condition") {
      const variableKey = normalizeFlowVariableKey(config.variable || "");
      const operator = config.operator || "contains";
      const actualValue = String(
        variableKey ? (flowState?.[variableKey] ?? "") : text,
      ).toLowerCase();
      const expectedValue = renderFlowTemplate(
        config.value || "",
        flowState,
      ).toLowerCase();

      let conditionMet = false;
      if (operator === "contains")
        conditionMet = actualValue.includes(expectedValue);
      else if (operator === "equals")
        conditionMet = actualValue === expectedValue;
      else if (operator === "notEquals")
        conditionMet = actualValue !== expectedValue;
      else if (operator === "starts_with")
        conditionMet = actualValue.startsWith(expectedValue);
      else if (operator === "ends_with")
        conditionMet = actualValue.endsWith(expectedValue);
      else if (operator === "greaterThan")
        conditionMet = Number(actualValue) > Number(expectedValue);
      else if (operator === "lessThan")
        conditionMet = Number(actualValue) < Number(expectedValue);
      else conditionMet = true;

      // Condition ke hisaab se sahi edge dhundo
      const outEdges = edges.filter((e: any) => e.source === activeNode.id);
      const matchEdge =
        outEdges.find((e: any) => {
          const h = (e.sourceHandle || "").toLowerCase();
          return conditionMet
            ? h === "yes" || h === "true"
            : h === "no" || h === "false";
        }) || outEdges[0];

      if (matchEdge) {
        activeNode = nodes.find((n: any) => n.id === matchEdge.target);
        continue;
      } else {
        break;
      }
    }

    // --- MEDIA NODES (image, video, audio, file) ---
    else if (["image", "video", "audio", "file"].includes(nodeType)) {
      const url = config.url || config.mediaUrl || "";
      const caption = renderFlowTemplate(
        config.caption || config.message || "",
        flowState,
      );
      if (url) {
        mediaOutput.push({
          type: nodeType === "file" ? "document" : nodeType,
          url: renderFlowTemplate(url, flowState),
          caption: caption || undefined,
          fileName: config.fileName || config.displayName || undefined,
          mimeType: config.mimeType || undefined,
        });
      }
    }

    // --- LOCATION NODE ---
    else if (nodeType === "location") {
      const lat = config.latitude;
      const lng = config.longitude;
      const name = config.name || "";
      if (lat && lng) {
        outputText.push(`📍 ${name}\nhttps://maps.google.com/?q=${lat},${lng}`);
      }
    }

    // --- TEMPLATE NODE ---
    else if (nodeType === "template") {
      const source = config.templateSource || "whatsapp";
      if (source === "flow") {
        const flowName =
          config.template || config.flowTemplateId || "Flow template";
        if (flowName) outputText.push(`[Flow Template: ${flowName}]`);
      } else {
        const tplName = config.templateName || config.template;
        if (tplName) outputText.push(`[Template: ${tplName}]`);
      }
    }

    // --- WHATSAPP FLOW NODE ---
    else if (nodeType === "whatsappFlow") {
      const message =
        config.message ||
        config.text ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (message) outputText.push(renderFlowTemplate(message, flowState));
    }

    // --- AI NODE ---
    else if (nodeType === "ai") {
      const botResult = await getBotAgentReply({
        organization_id,
        conversation_id,
        text,
      });
      const prompt =
        config.prompt ||
        config.systemPrompt ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (botResult?.reply) outputText.push(botResult.reply);
      else if (config.fallbackMessage)
        outputText.push(renderFlowTemplate(config.fallbackMessage, flowState));
      else if (prompt) outputText.push(renderFlowTemplate(prompt, flowState));
    }

    // --- HTTP/API + DATA NODES ---
    else if (nodeType === "httpApi") {
      const url = renderFlowTemplate(config.url || "", flowState);
      if (url) {
        console.log(
          "[Flow] HTTP API node configured; publish/runtime pass-through enabled",
          {
            node_id: activeNode.id,
            method: config.method || "GET",
            url,
          },
        );
      }
    } else if (nodeType === "googleSheets") {
      console.log(
        "[Flow] Google Sheets node configured; publish/runtime pass-through enabled",
        {
          node_id: activeNode.id,
          action: config.action || null,
          spreadsheet: config.spreadsheet || null,
        },
      );
    } else if (nodeType === "appointment") {
      const inviteMsg = renderFlowTemplate(
        config.message || "Please select a date for your appointment from the options below:",
        flowState
      );
      const sections = generateDateSections(config.slots);

      const nextState = {
        ...flowState,
        appointment_step: "select_date",
      };

      await supabase
        .from("w_flow_sessions")
        .update({
          current_node_id: activeNode.id,
          state_data: nextState,
        })
        .eq("id", session_id);

      return {
        consumed: true,
        output: outputText.length > 0 ? outputText.join("\n\n") : null,
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        ...flowMeta,
        flow_node_id: activeNode.id,
        interactive: {
          type: "list",
          body: inviteMsg,
          buttonText: "Select Date",
          sections,
        },
      };
    } else if (nodeType === "product") {
      const productText =
        config.message ||
        config.description ||
        config.productName ||
        config.product ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (productText)
        outputText.push(renderFlowTemplate(productText, flowState));
    }

    // Automatic advance — next edge dhundo
    if (nodeType === "handoff") {
      const handoffMessage =
        config.message || config.label || activeNode.data?.label || "";
      const conversationPatch: any = {
        handoff_status: "handoff_requested",
        handoff_reason: config.reason || "Flow requested human handoff",
        handoff_requested_at: new Date().toISOString(),
        summary_status: "not_started",
      };
      if (config.disableBotAfterHandoff !== false)
        conversationPatch.bot_enabled = false;
      await supabase
        .from("w_conversations")
        .update(conversationPatch)
        .eq("id", conversation_id);
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      return {
        consumed: true,
        output: renderFlowTemplate(handoffMessage, flowState) || null,
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        handoff: true,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    if (nodeType === "end") {
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      const finalMessage = config.message
        ? renderFlowTemplate(config.message, flowState)
        : null;
      return {
        consumed: true,
        output:
          finalMessage ||
          (outputText.length > 0 ? outputText.join("\n\n") : null),
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    const nextEdge = edges.find((e: any) => e.source === activeNode.id);
    if (nextEdge) {
      activeNode = nodes.find((n: any) => n.id === nextEdge.target);
    } else {
      // Flow khatam
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      console.log(`✅ Flow completed for session ${session_id}`);
      activeNode = null;
    }
  }

  return {
    consumed: true,
    output: outputText.length > 0 ? outputText.join("\n\n") : null,
    media: mediaOutput.length > 0 ? mediaOutput : undefined,
    ...flowMeta,
  };
}

