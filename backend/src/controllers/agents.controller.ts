import {
  calendarSettings,
  syncAgentCalendarById,
  syncCalendarEventsIntoAgent,
  validateCalendarSettings,
} from '../services/agentCalendar.service.js';
import { testBotAgentReply } from '../services/ai.service.js';
import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { enforcePlanResourceLimit } from '../services/billing.service.js';
import { getKnowledgeDocuments } from '../services/settings.service.js';
import { getIO } from '../config/socket.js';
import { isNonIndividualThreadContact } from '../utils/format.js';

const AGENT_SETTINGS_ITEM_TYPE = "__agent_settings";

function stripAgentMetadataItems(items: any[]) {
  return (Array.isArray(items) ? items : []).filter(
    (entry: any) => entry?.type !== AGENT_SETTINGS_ITEM_TYPE,
  );
}

async function buildAgentKnowledgePayload(organizationId: string, params: any) {
  const docs = await getKnowledgeDocuments(organizationId);
  const selectedIds = Array.isArray(params.selected_knowledge_document_ids)
    ? params.selected_knowledge_document_ids.map((id: any) => String(id))
    : null;
  const selectedDocs = selectedIds
    ? docs.filter((doc: any) => selectedIds.includes(String(doc.id)))
    : docs.filter((doc: any) =>
        (Array.isArray(params.knowledge_base)
          ? params.knowledge_base
          : []
        ).includes(doc.name),
      );

  const uploadedContent = stripAgentMetadataItems(
    params.knowledge_base_content || [],
  );
  const docContent = selectedDocs.map((doc: any) => ({
    id: doc.id,
    name: doc.name,
    size: doc.size,
    size_label: doc.size_label,
    status: doc.status,
    content: doc.content,
    source: "workspace_knowledge_base",
    updated_at: doc.updated_at,
  }));

  const automationSettings = {
    use_buttons: params.automation_settings?.use_buttons !== false,
    reply_on_keywords: params.automation_settings?.reply_on_keywords !== false,
    auto_reply_unknown: params.automation_settings?.auto_reply_unknown === true,
    default_for_new_chats:
      params.automation_settings?.default_for_new_chats === true,
    handoff_on_human_reply:
      params.automation_settings?.handoff_on_human_reply !== false,
  };

  const knowledgeBaseContent = [
    ...docContent,
    ...uploadedContent,
    {
      type: AGENT_SETTINGS_ITEM_TYPE,
      settings: automationSettings,
      calendar: validateCalendarSettings(
        params.calendar_settings || { enabled: false },
        params.existing_calendar,
      ),
      selected_knowledge_document_ids: selectedDocs.map((doc: any) => doc.id),
      trained_at: new Date().toISOString(),
      training: {
        document_count: selectedDocs.length + uploadedContent.length,
        character_count: [...docContent, ...uploadedContent].reduce(
          (sum: number, item: any) => sum + String(item?.content || "").length,
          0,
        ),
      },
    },
  ];

  return {
    knowledge_base: [
      ...selectedDocs.map((doc: any) => doc.name),
      ...uploadedContent.map((item: any) => item?.name).filter(Boolean),
    ],
    knowledge_base_content: knowledgeBaseContent,
  };
}

export const getAgents = async (req: any, res: Response) => {
  const organization_id = req.organization_id;
  try {
    let query = supabase
      .from("bot_agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    const { data, error } = await query;
    if (error) {
      if (
        error.message?.includes("relation") &&
        error.message?.includes("does not exist")
      ) {
        return res.status(500).json({
          error:
            'Database table "bot_agents" not found. Please run the migration: supabase/migrations/20260127100000_add_bot_agents_and_conversation_bot_settings.sql',
        });
      }
      throw error;
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch agents" });
  }
};

export const createAgent = async (req: any, res: Response) => {
  const organization_id = req.organization_id;
  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const {
      name,
      description,
      model = "gpt-4o-mini",
      temperature = 0.7,
      trigger_keywords = [],
      system_prompt,
      is_active = true,
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Agent name is required" });
    }

    await enforcePlanResourceLimit({
      organization_id,
      resource: "ai_agents",
      table: "bot_agents",
      label: "AI agent",
    });

    const knowledgePayload = await buildAgentKnowledgePayload(
      organization_id,
      req.body || {},
    );

    const { data, error } = await supabase
      .from("bot_agents")
      .insert({
        organization_id,
        name,
        description,
        model,
        temperature,
        trigger_keywords,
        system_prompt,
        knowledge_base: knowledgePayload.knowledge_base,
        knowledge_base_content: knowledgePayload.knowledge_base_content,
        is_active,
      })
      .select()
      .single();

    if (error) throw error;

    const cal = calendarSettings(data);
    if (cal.enabled && cal.calendar_id) {
      const syncResult = await syncCalendarEventsIntoAgent(data);
      return res.status(201).json(syncResult.agent || data);
    }

    res.status(201).json(data);
  } catch (err: any) {
    console.error("Error creating agent:", err);
    res.status(err.statusCode || 500).json({ 
      error: err.message || "Failed to create agent",
      limit: err.limit
    });
  }
};

export const updateAgent = async (req: any, res: Response) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    const updateData: any = {};
    const allowedFields = [
      "name",
      "description",
      "model",
      "temperature",
      "trigger_keywords",
      "system_prompt",
      "is_active",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (
      req.body.selected_knowledge_document_ids !== undefined ||
      req.body.knowledge_base !== undefined ||
      req.body.knowledge_base_content !== undefined ||
      req.body.calendar_settings !== undefined ||
      req.body.automation_settings !== undefined
    ) {
      const { data: existing, error: readError } = await supabase.from("bot_agents").select("*").eq("id", id).eq("organization_id", organization_id).single();
      if (readError || !existing) return res.status(404).json({ error: "Agent not found" });
      const meta = (existing.knowledge_base_content || []).find((i: any) => i?.type === AGENT_SETTINGS_ITEM_TYPE) || {};
      const knowledgePayload = await buildAgentKnowledgePayload(organization_id, {
        knowledge_base: existing.knowledge_base,
        knowledge_base_content: (existing.knowledge_base_content || []).filter((i: any) => i?.source !== "workspace_knowledge_base"),
        selected_knowledge_document_ids: meta.selected_knowledge_document_ids,
        calendar_settings: meta.calendar,
        existing_calendar: meta.calendar,
        ...req.body,
        automation_settings: { ...meta.settings, ...req.body.automation_settings },
      });
      updateData.knowledge_base = knowledgePayload.knowledge_base;
      updateData.knowledge_base_content = knowledgePayload.knowledge_base_content;
    }

    let query = supabase.from("bot_agents").update(updateData).eq("id", id);

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Agent not found" });

    const cal = calendarSettings(data);
    const shouldSyncCalendar =
      cal.enabled &&
      cal.calendar_id &&
      (req.body.calendar_settings !== undefined || !cal.last_synced_at);

    if (shouldSyncCalendar) {
      const syncResult = await syncCalendarEventsIntoAgent(data);
      return res.json(syncResult.agent || data);
    }

    res.json(data);
  } catch (err: any) {
    console.error("Error updating agent:", err);
    res.status(500).json({ error: err.message || "Failed to update agent" });
  }
};

export const deleteAgent = async (req: any, res: Response) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    const { error } = await supabase
      .from("bot_agents")
      .delete()
      .eq("id", id)
      .eq("organization_id", organization_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete agent" });
  }
};

export const updateConversationBot = async (req: any, res: Response) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    const { bot_enabled, assigned_bot_id } = req.body;
    const updates: any = {};
    
    if (typeof bot_enabled === "boolean") {
      updates.bot_enabled = bot_enabled;
    }
    if (assigned_bot_id !== undefined) {
      updates.assigned_bot_id = assigned_bot_id || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data: existingConv, error: convLookupErr } = await supabase
      .from("w_conversations")
      .select("id, contact:w_contacts(contact_type, wa_id)")
      .eq("id", id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (convLookupErr) throw convLookupErr;
    if (!existingConv) return res.status(404).json({ error: "Conversation not found" });

    const contactRow = Array.isArray((existingConv as any).contact)
      ? (existingConv as any).contact[0]
      : (existingConv as any).contact;

    if (isNonIndividualThreadContact(contactRow) && (bot_enabled === true || Boolean(assigned_bot_id))) {
      return res.status(400).json({
        error: "AI Agent automation is disabled for WhatsApp groups and channels.",
      });
    }

    const { data, error } = await supabase
      .from("w_conversations")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organization_id)
      .select("id, bot_enabled, assigned_bot_id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Conversation not found" });

    try {
      getIO().to(`org:${organization_id}`).emit("conversation_bot_updated", {
        conversation_id: id,
        ...data,
      });
    } catch (e) {
      console.error("Socket emit failed in updateConversationBot:", e);
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update bot settings" });
  }
};

export const syncAgentCalendar = async (req: any, res: Response) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const hasOverride = req.body && req.body.calendar_id !== undefined;
    const result = await syncAgentCalendarById(
      organization_id,
      id,
      hasOverride
        ? {
            calendar_id: req.body.calendar_id,
            timezone: req.body.timezone,
            enabled: req.body.enabled,
          }
        : undefined,
    );

    if (!result.synced && result.error) {
      return res.status(502).json({
        error: result.error,
        agent: result.agent,
        synced: false,
        event_count: result.event_count,
        last_synced_at: result.last_synced_at,
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      error: err.message || "Failed to sync agent calendar",
    });
  }
};

export const testAgentChat = async (req: any, res: Response) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "Test message is required" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Test message is too long (max 2000 characters)" });
    }

    const result = await testBotAgentReply({
      organization_id,
      agent_id: id,
      text: message,
      history: req.body?.history,
    });

    res.json(result);
  } catch (err: any) {
    console.error("testAgentChat error:", err);
    res.status(err.statusCode || 500).json({
      error: err.message || "Failed to generate test reply",
    });
  }
};
