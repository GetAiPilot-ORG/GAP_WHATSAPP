import { supabase } from '../config/supabase.js';

const N8N_HANDOFF_WEBHOOK_URL = process.env.N8N_HANDOFF_WEBHOOK_URL || null;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || null;
const N8N_WEBHOOK_TIMEOUT_MS = Number(process.env.N8N_WEBHOOK_TIMEOUT_MS) || 10000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';

export async function triggerHandoffWebhook(params: {
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  event?: string;
  flow_id?: string | null;
  flow_version_id?: string | null;
  flow_session_id?: string | null;
  flow_run_id?: string | null;
  flow_node_id?: string | null;
  handoff_reason?: string | null;
  requested_by_user_id?: string | null;
  summary_required?: boolean;
  state_data?: any;
  selected_text?: string | null;
  trigger_message_id?: string | null;
}) {
  if (!N8N_HANDOFF_WEBHOOK_URL || params.summary_required === false) return;

  try {
    const { data: conversation } = await supabase
      .from("w_conversations")
      .select(
        "id, assigned_agent_id, assigned_to, handoff_status, summary_status, last_message_at",
      )
      .eq("id", params.conversation_id)
      .eq("organization_id", params.organization_id)
      .maybeSingle();

    const { data: contact } = await supabase
      .from("w_contacts")
      .select("id, name, custom_name, phone, wa_id, custom_fields")
      .eq("id", params.contact_id)
      .eq("organization_id", params.organization_id)
      .maybeSingle();

    const { data: recentRows } = await supabase
      .from("w_messages")
      .select(
        "id, direction, sender_type, automation_source, text_body, content, created_at",
      )
      .eq("organization_id", params.organization_id)
      .eq("conversation_id", params.conversation_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const messages = (recentRows || []).reverse().map((message: any) => ({
      id: message.id,
      direction: message.direction,
      sender_type: message.sender_type,
      automation_source: message.automation_source,
      text:
        message.text_body ||
        message.content?.text ||
        message.content?.body ||
        "",
      created_at: message.created_at,
    }));

    const payload = {
      event: params.event || "manual_summary_requested",
      organization_id: params.organization_id,
      conversation_id: params.conversation_id,
      contact_id: params.contact_id,
      flow_id: params.flow_id || null,
      flow_version_id: params.flow_version_id || null,
      flow_session_id: params.flow_session_id || null,
      flow_run_id: params.flow_run_id || null,
      flow_node_id: params.flow_node_id || null,
      trigger_message_id: params.trigger_message_id || null,
      selected_text: params.selected_text || null,
      requested_by_user_id: params.requested_by_user_id || null,
      handoff_reason: params.handoff_reason || "Manual summary requested",
      state_data: params.state_data || {},
      summary_required: true,
      callback_url: `${PUBLIC_BASE_URL}/api/n8n/conversations/${params.conversation_id}/summary`,
      contact,
      conversation,
      messages,
      created_at: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      N8N_WEBHOOK_TIMEOUT_MS,
    );

    const response = await fetch(N8N_HANDOFF_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(N8N_WEBHOOK_SECRET ? { "X-N8N-Secret": N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${body}`.trim());
    }
  } catch (err: any) {
    console.error("[n8n] Handoff webhook failed:", err?.message || err);
    await supabase
      .from("w_conversations")
      .update({
        summary_status: "failed",
      })
      .eq("id", params.conversation_id)
      .eq("organization_id", params.organization_id);
  }
}
