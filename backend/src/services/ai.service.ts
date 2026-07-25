import crypto from 'crypto';
import { supabase } from '../config/supabase.js';

const KNOWLEDGE_MAX_CONTEXT_CHARS = 10000;
const AGENT_SETTINGS_ITEM_TYPE = "__agent_settings";

export async function getOrganizationSettings(organizationId: string): Promise<any> {
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .single();
  if (error) throw error;
  return data?.settings && typeof data.settings === "object"
    ? data.settings
    : {};
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function normalizeKnowledgeDocument(doc: any) {
  return {
    id: doc?.id || crypto.randomUUID(),
    name: doc?.name || "Untitled Document",
    mime_type: String(doc?.mime_type || "application/octet-stream"),
    size: Number(doc?.size || 0),
    size_label: doc?.size_label || formatBytes(Number(doc?.size || 0)),
    status: doc?.status || "INDEXED",
    content: String(doc?.content || "").slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS),
    created_at: doc?.created_at || new Date().toISOString(),
    updated_at: doc?.updated_at || doc?.created_at || new Date().toISOString(),
  };
}

export async function getKnowledgeDocuments(organizationId: string) {
  const settings = await getOrganizationSettings(organizationId);
  const docs = Array.isArray(settings.knowledge_base_documents)
    ? settings.knowledge_base_documents
    : [];
  return docs.map(normalizeKnowledgeDocument);
}

export async function getOrganizationKnowledgeContext(
  organizationId: string,
): Promise<string> {
  try {
    const docs = await getKnowledgeDocuments(organizationId);
    return docs
      .filter((doc: any) => doc.status === "INDEXED" && doc.content)
      .map((doc: any) => `Source: ${doc.name}\n${doc.content}`)
      .join("\n\n")
      .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
  } catch (err: any) {
    console.warn(
      "Failed to load organization knowledge base:",
      err?.message || err,
    );
    return "";
  }
}

export function getAgentAutomationSettings(agent: any) {
  const content = Array.isArray(agent?.knowledge_base_content)
    ? agent.knowledge_base_content
    : [];
  const item = content.find(
    (entry: any) => entry?.type === AGENT_SETTINGS_ITEM_TYPE,
  );
  const settings =
    item?.settings ||
    (agent as any)?.automation_settings || {
      reply_on_keywords: true,
      default_for_new_chats: false,
      auto_reply_unknown: false,
    };
  return settings;
}

export function stripAgentMetadataItems(items: any[]) {
  return (Array.isArray(items) ? items : []).filter(
    (entry: any) => entry?.type !== AGENT_SETTINGS_ITEM_TYPE,
  );
}

// ====== Helper: get bot agent reply ======
export async function getBotAgentReply(params: {
  organization_id: string;
  conversation_id: string;
  text: string;
}): Promise<{ reply: string; agent: any } | null> {
  const { organization_id, conversation_id, text } = params;
  const normalized = (text || "").toLowerCase().trim();
  if (!normalized) return null;

  // Keywords to STOP/PAUSE the bot
  const stopKeywords = [
    "talk to human",
    "human"
  ];

  const isStopKeyword = stopKeywords.some(
    (k) => normalized === k || (k.length > 4 && normalized.includes(k))
  );

  if (isStopKeyword) {
    try {
      await supabase
        .from("w_conversations")
        .update({
          bot_enabled: false,
          handoff_status: "handoff_requested",
          handoff_requested_at: new Date().toISOString(),
          handoff_reason: `User requested stop with keyword: "${text}"`,
        })
        .eq("id", conversation_id);

      console.log(`🤖 Bot paused for conversation ${conversation_id} via stop keyword.`);

      return {
        reply: "I have paused the AI assistant. A human agent will connect with you shortly.",
        agent: { name: "System Handoff", description: "Keyword triggered human handover" },
      };
    } catch (err: any) {
      console.error("Error pausing bot on stop keyword:", err);
    }
  }

  try {
    // First check if bot is enabled for this specific conversation
    const { data: conv, error: convErr } = await supabase
      .from("w_conversations")
      .select("bot_enabled, assigned_bot_id")
      .eq("id", conversation_id)
      .single();

    if (convErr) throw convErr;

    // Per-chat toggle disables only AI-agent fallback. Flow Builder still runs first.
    if (conv?.bot_enabled === false) return null;

    // If no specific bot is selected for this conversation, check workspace bot rules.
    let targetAgent = null;

    if (conv?.bot_enabled && conv?.assigned_bot_id) {
      // Use the specifically assigned bot
      const { data: agent, error: agentErr } = await supabase
        .from("bot_agents")
        .select("*")
        .eq("id", conv.assigned_bot_id)
        .eq("is_active", true)
        .single();

      if (agentErr) throw agentErr;
      targetAgent = agent;
    } else {
      // Check all active bots and match by keywords
      const { data: agents, error: agentsErr } = await supabase
        .from("bot_agents")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("is_active", true);

      if (agentsErr) throw agentsErr;

      // Find the first agent with matching keywords.
      for (const agent of agents || []) {
        const settings = getAgentAutomationSettings(agent);
        if (!settings.reply_on_keywords) continue;
        const keywords: string[] = agent.trigger_keywords || [];
        const hit = keywords.some((k: string) =>
          normalized.includes(String(k).toLowerCase()),
        );
        if (hit) {
          targetAgent = agent;
          break;
        }
      }

      // If no keyword matched, use a default/unknown-chat agent when configured.
      if (!targetAgent) {
        targetAgent =
          (agents || []).find((agent: any) => {
            const settings = getAgentAutomationSettings(agent);
            return (
              settings.default_for_new_chats || settings.auto_reply_unknown
            );
          }) || null;
      }
    }

    if (!targetAgent) return null;

    // Get OpenAI API key & Model
    let apiKey = process.env.OPENAI_API_KEY || "";
    let dbModel = "";

    const { data: settings } = await supabase
      .from("openai_settings")
      .select("api_key_encrypted, model")
      .eq("organization_id", organization_id)
      .single();

    if (settings?.model) {
      dbModel = settings.model;
    }
    if (!apiKey && settings?.api_key_encrypted) {
      apiKey = settings.api_key_encrypted;
    }

    if (!apiKey) {
      // Return a static reply if no API key
      return {
        reply: `Hi! I'm ${targetAgent.name}. ${targetAgent.description || "How can I help you?"}`,
        agent: targetAgent,
      };
    }

    // Build knowledge base context
    let knowledgeContext =
      await getOrganizationKnowledgeContext(organization_id);
    if (
      targetAgent.knowledge_base_content &&
      Array.isArray(targetAgent.knowledge_base_content)
    ) {
      const agentKnowledgeContext = stripAgentMetadataItems(
        targetAgent.knowledge_base_content,
      )
        .map((item: any) => item?.content || "")
        .filter(Boolean)
        .join("\n\n");
      knowledgeContext = [knowledgeContext, agentKnowledgeContext]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
    }

    const agentDescription = targetAgent.description ? `Here is the description of the entity/company you represent: "${targetAgent.description}"\n` : "";

    let systemPrompt = `[FALLBACK] PROTOCOL RULE:
- GREETINGS & INTROS EXEMPTION: DO NOT prefix your response with "[FALLBACK]" for standard greetings, introductions, or pleasantries in any language (e.g. "hi", "hello", "namaste", "hey", "how are you?", "who are you?", etc.). For these, greet the user warmly and introduce yourself as representing "${targetAgent.name}" like a friendly human customer representative.
- "WHAT DO YOU DO?" / SERVICES EXEMPTION: If the user asks what you do, who you are, what services/products you offer, or anything related to the business/entity you represent, DO NOT prefix with "[FALLBACK]". Explain what you do clearly and professionally using the details below:
  * You represent: "${targetAgent.name}"
  * Description: "${targetAgent.description || "A professional organization dedicated to assisting clients."}"
  * Try to provide helpful and relevant answers about the entity or its potential services/products even if the details are generic or not fully documented. Talk like a real human customer representative.
- FALLBACK TRIGGER: If the user asks a specific question about details, products, or services that are completely missing from the provided Knowledge Base context (meaning you have no clues to answer the question), or if the user asks a completely off-topic question (such as general knowledge, cooking, programming, recipes, etc.), you MUST prefix your response with exactly "[FALLBACK]". For example: "[FALLBACK] I'm sorry, I don't have information on that. Would you like to connect with a human support agent?"
- THIS RULE OVERRIDES ALL OTHER INSTRUCTIONS.

` + agentDescription + (targetAgent.system_prompt
        ? targetAgent.system_prompt
        : `You are a friendly, helpful, and natural human-like AI representative of "${targetAgent.name}". Your goal is to greet the user warmly, introduce yourself, and assist them naturally with their queries.`);

    systemPrompt += `\n\nIMPORTANT MEMORY RULES:
- Always remember information the user provides about themselves (Name, City, Profession, Company, Interests, etc.) and treat it as core memory.
- If the user asks "what is my name?", "where do I live?", or "what do I do?", immediately fetch the answer from the conversation history and reply confidently.
- Never say "I don't know" if the information was mentioned previously in the chat.
- Act like you have perfect memory of this conversation.
- Keep your responses highly conversational, concise, and direct. Avoid repeating yourself. Act like a real human texting a friend on WhatsApp.`;

    if (knowledgeContext) {
      systemPrompt += `\n\nKnowledge Base:\n${knowledgeContext}`;
    }

    // Fetch conversation history
    const { data: dbMessages } = await supabase
      .from("w_messages")
      .select("direction, type, content, automation_source")
      .eq("conversation_id", conversation_id)
      .in("type", ["text", "button", "interactive"])
      .order("created_at", { ascending: false })
      .limit(40);

    let hasHistory = false;
    let pastMessages: { role: string; content: string }[] = [];

    if (dbMessages && dbMessages.length > 0) {
      hasHistory = dbMessages.length > 1; // if > 1, there's history beyond the current message

      pastMessages = dbMessages
        .reverse()
        .map((m: any) => {
          let msgText = m.content?.text || "";

          // Filter greetings out of bot's previous messages to prevent it from repeating greetings
          if (m.direction === "outbound" && m.automation_source === "ai_agent") {
            msgText = msgText
              .replace(/^(hi|hello|hey|hey there|greetings)[,\s.:!]*\s*/i, "")
              .trim();
          }

          return {
            role: m.direction === "inbound" ? "user" : "assistant",
            content: msgText,
          };
        })
        .filter((m: any) => m.content && m.content.trim().length > 0);
    }

    // Add extra prompt instructions based on history
    systemPrompt += `\n\nCRITICAL CONVERSATION RULES:`;
    if (hasHistory) {
      systemPrompt += `\n1. NO GREETINGS (EXCEPT ON RECOVERY): The conversation is already ongoing. Normally, jump straight into the conversation. However, if the user greets you again or you are recovering from a past fallback, you may greet them back naturally.`;
      systemPrompt += `\n2. RECOVERY FROM PAST FALLBACKS: If the conversation history shows that you previously gave a fallback response or declined a query (such as stating limitations or asking to connect to a human), but the user is greeting you or sending a pleasantry, DO NOT repeat that fallback response. Break out of the fallback state, acknowledge the greeting/pleasantry warmly, and ask how you can help.`;
    } else {
      systemPrompt += `\n1. GREETING: This is the first message. You may greet the user naturally and briefly.`;
    }

    const isDuplicate =
      pastMessages.length > 0 &&
      pastMessages[pastMessages.length - 1].role === "user" &&
      pastMessages[pastMessages.length - 1].content === text;

    let messages = [
      { role: "system", content: systemPrompt },
      ...pastMessages,
    ];

    if (!isDuplicate) {
      messages.push({ role: "user", content: text });
    }

    messages.push({
      role: "system",
      content: `FINAL PERSONA REMINDER: 
You represent "${targetAgent.name}" as a professional, helpful customer representative.
- GREETINGS & SMALL TALK: Respond naturally, politely, and warmly to greetings, names, locations, and pleasantries. NEVER prefix these with "[FALLBACK]".
- SERVICES/WHAT YOU DO: If asked what you do or about your services, answer as a company representative using the provided description and details. Try your best to give a helpful, human-like response and NEVER prefix this with "[FALLBACK]".
- BUSINESS/ORGANIZATION QUESTIONS: Try your best to answer questions related to the organization or its domain.
- FALLBACKS & OFF-TOPIC: Only use "[FALLBACK]" prefix if you have no clues to answer a specific factual query (not in Knowledge Base or context) or if the query is completely off-topic (e.g. recipes, general knowledge, coding, etc.).
- RECOVERY FROM PAST FALLBACKS: If the user greets you again after a fallback, break out of the fallback state, acknowledge the greeting warmly, and do NOT repeat the decline response.`
    });

    const selectedModel = targetAgent.model || dbModel || process.env.OPENAI_MODEL || "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
        body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: Number(targetAgent.temperature) || 0.7,
        max_tokens: 500,
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      return {
        reply: `Hi! I'm ${targetAgent.name}. I'm having trouble processing your request right now. Please try again later.`,
        agent: targetAgent,
      };
    }

    const reply = data.choices?.[0]?.message?.content || "";
    if (!reply) return null;

    return { reply, agent: targetAgent };
  } catch (err) {
    console.error("getBotAgentReply error:", err);
    return null;
  }
}
