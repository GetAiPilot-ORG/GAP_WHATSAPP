import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { enforcePlanResourceLimit } from '../services/billing.service.js';
import { getKnowledgeDocuments } from '../services/settings.service.js';
import { getIO } from '../config/socket.js';

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
      req.body.automation_settings !== undefined
    ) {
      const knowledgePayload = await buildAgentKnowledgePayload(
        organization_id,
        req.body || {},
      );
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
