import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';
import { io } from '../socket.js';

interface SummaryResult {
  summary_text: string;
  customer_intent: string;
  customer_stage: string;
  lead_quality: string;
  next_best_action: string;
  open_questions: string[];
  important_facts: string[];
  objections: string[];
  products_discussed: string[];
  captured_data?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    budget?: string | null;
    follow_up_time?: string | null;
  };
}

/**
 * Retrieve a valid OpenAI API key and model:
 * 1. Specific to the organization
 * 2. Environment variable OPENAI_API_KEY
 * 3. Any active key stored in openai_settings across the workspace
 */
async function getOpenAiConfig(organizationId: string): Promise<{ apiKey: string; model: string }> {
  try {
    // 1. Organization specific
    const { data: settings } = await supabase
      .from('openai_settings')
      .select('api_key_encrypted, model')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settings?.api_key_encrypted) {
      const decrypted = decryptToken(settings.api_key_encrypted);
      if (decrypted && decrypted.startsWith('sk-')) {
        return { apiKey: decrypted, model: settings.model || 'gpt-4o-mini' };
      }
    }
  } catch (err) {
    console.warn('[SummaryService] Failed to load org-specific OpenAI settings:', err);
  }

  // 2. Env variable
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
    return { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
  }

  // 3. Fallback to any valid key in openai_settings
  try {
    const { data: allSettings } = await supabase
      .from('openai_settings')
      .select('api_key_encrypted, model')
      .order('updated_at', { ascending: false });

    for (const row of allSettings || []) {
      if (row.api_key_encrypted) {
        const decrypted = decryptToken(row.api_key_encrypted);
        if (decrypted && decrypted.startsWith('sk-')) {
          return { apiKey: decrypted, model: row.model || 'gpt-4o-mini' };
        }
      }
    }
  } catch (err) {
    console.warn('[SummaryService] Failed to search fallback OpenAI keys:', err);
  }

  return { apiKey: '', model: 'gpt-4o-mini' };
}

/**
 * Intelligent rule-based fallback analyzer if OpenAI API is unavailable
 */
function buildRuleBasedSummary(messages: any[], contact: any): SummaryResult {
  const texts = messages.map(m => {
    let t = '';
    if (typeof m.content?.text === 'string') t = m.content.text;
    else if (typeof m.content?.body === 'string') t = m.content.body;
    else if (m.content?.template?.body) t = m.content.template.body;
    return {
      text: t.trim(),
      incoming: m.direction === 'inbound'
    };
  }).filter(m => m.text.length > 0);

  const inboundTexts = texts.filter(t => t.incoming).map(t => t.text);
  const allText = texts.map(t => t.text).join(' \n ');
  const clientText = inboundTexts.join(' \n ');
  const lowerAll = allText.toLowerCase();
  const lowerClient = clientText.toLowerCase();

  // Extract budget / amounts
  const budgetMatch = allText.match(/(?:budget\s*(?:is|of|:)?\s*|₹\s*|rs\.?\s*)([0-9,]{3,8})/i) ||
                      allText.match(/[₹]\s*([0-9,]+)/i);
  const budget = budgetMatch ? `₹${budgetMatch[1].replace(/,/g, '')}` : null;

  // Extract follow up mentions
  const followUpMatch = allText.match(/\b(tomorrow|today|morning|evening|afternoon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(?:am|pm))\b/i);
  const followUpTime = followUpMatch ? followUpMatch[0] : null;

  // Identify services
  const products: string[] = [];
  if (/ecommerce|e-commerce|online store|shop/i.test(lowerAll)) products.push('E-commerce Website');
  if (/website|web design|landing page/i.test(lowerAll)) products.push('Website Development');
  if (/crm|lead management|pipeline/i.test(lowerAll)) products.push('WhatsApp CRM');
  if (/marketing|meta ads|facebook ads/i.test(lowerAll)) products.push('Digital Marketing & Ads');
  if (/payment gateway|payment|razorpay/i.test(lowerAll)) products.push('Payment Gateway');
  if (/bot|automation|ai agent/i.test(lowerAll)) products.push('AI WhatsApp Bot');
  if (products.length === 0) products.push('General Services Inquiry');

  // Lead quality
  let score = 20;
  if (budget) score += 35;
  if (inboundTexts.length >= 2) score += 20;
  if (/need|want|interested|price|quotation|cost/i.test(lowerClient)) score += 25;
  if (/not interested|stop|cancel/i.test(lowerClient)) score = 10;

  const quality = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold';
  const stage = score >= 70 ? 'proposal' : score >= 40 ? 'qualification' : 'discovery';

  // Customer Intent
  let intent = 'Inquiring about available services and pricing';
  if (products.includes('E-commerce Website') && budget) {
    intent = `Interested in E-commerce Website development with ${budget} budget`;
  } else if (products.length > 0) {
    intent = `Interested in ${products.join(', ')}`;
  }

  // Next Best Action
  let nextAction = 'Follow up with customer to understand requirements and share brochure.';
  if (budget && products.length > 0) {
    nextAction = `Prepare and send a customized proposal for ${products.join(' & ')} tailored to ${budget} budget.`;
  } else if (followUpTime) {
    nextAction = `Schedule a follow-up call around ${followUpTime} to discuss project scope.`;
  } else if (quality === 'Hot') {
    nextAction = 'Call or message immediately to finalize requirements and share quotation.';
  }

  const facts: string[] = [];
  if (contact?.name) facts.push(`Customer Name: ${contact.name}`);
  if (contact?.phone) facts.push(`Phone: ${contact.phone}`);
  if (budget) facts.push(`Budget: ${budget}`);
  if (products.length > 0) facts.push(`Requirements: ${products.join(', ')}`);
  if (followUpTime) facts.push(`Preferred Follow-up: ${followUpTime}`);

  return {
    summary_text: `Customer inquired about ${products.join(', ')}${budget ? ` with an estimated budget of ${budget}` : ''}. The lead demonstrates ${quality.toLowerCase()} interest and is currently in the ${stage} stage.`,
    customer_intent: intent,
    customer_stage: stage,
    lead_quality: quality,
    next_best_action: nextAction,
    open_questions: budget ? ['Confirm payment terms and feature requirements'] : ['Confirm requirements and budget'],
    important_facts: facts,
    objections: /expensive|high price|discount/i.test(lowerClient) ? ['Pricing or budget concern'] : [],
    products_discussed: products,
    captured_data: {
      budget: budget || null,
      follow_up_time: followUpTime || null,
      name: contact?.name || null,
      phone: contact?.phone || null,
    }
  };
}

/**
 * Generate AI Summary directly without relying on external n8n workflows
 */
export async function generateConversationSummaryDirect(
  conversationId: string,
  organizationId: string,
  requestedByUserId?: string | null
): Promise<{ success: boolean; summary: any; conversation: any }> {
  console.log(`[SummaryService] Starting direct AI summary for conversation ${conversationId} (org: ${organizationId})`);

  // 1. Fetch conversation
  const { data: conversation, error: convErr } = await supabase
    .from('w_conversations')
    .select('id, organization_id, contact_id, bot_enabled, assigned_bot_id, handoff_status')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (convErr) throw convErr;
  if (!conversation) throw new Error('Conversation not found');

  // Update status to pending
  await supabase
    .from('w_conversations')
    .update({ summary_status: 'pending' })
    .eq('id', conversationId);

  // 2. Fetch contact info
  let contact: any = null;
  if (conversation.contact_id) {
    const { data: contactData } = await supabase
      .from('w_contacts')
      .select('*')
      .eq('id', conversation.contact_id)
      .maybeSingle();
    contact = contactData;
  }

  // 3. Fetch conversation messages
  const { data: messages, error: msgErr } = await supabase
    .from('w_messages')
    .select('id, direction, type, content, created_at, status, automation_source')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(80);

  if (msgErr) throw msgErr;

  if (!messages || messages.length === 0) {
    console.warn(`[SummaryService] No messages found for conversation ${conversationId}`);
    const emptyResult: SummaryResult = {
      summary_text: 'No conversation messages recorded yet.',
      customer_intent: 'New Conversation',
      customer_stage: 'discovery',
      lead_quality: 'Cold',
      next_best_action: 'Initiate contact or send an introduction message.',
      open_questions: [],
      important_facts: [],
      objections: [],
      products_discussed: [],
      captured_data: {}
    };

    const { data: inserted } = await supabase
      .from('w_conversation_summaries')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        summary_text: emptyResult.summary_text,
        customer_intent: emptyResult.customer_intent,
        customer_stage: emptyResult.customer_stage,
        lead_quality: emptyResult.lead_quality,
        next_best_action: emptyResult.next_best_action,
        open_questions: [],
        important_facts: [],
        objections: [],
        products_discussed: [],
        generated_by: 'ai_assistant',
        metadata: { source: 'empty_chat' }
      })
      .select()
      .single();

    await supabase
      .from('w_conversations')
      .update({ latest_summary_id: inserted?.id, summary_status: 'ready' })
      .eq('id', conversationId);

    return { success: true, summary: inserted, conversation: { ...conversation, summary_status: 'ready', latest_summary_id: inserted?.id } };
  }

  // 4. Format transcript
  const customerName = contact?.custom_name || contact?.name || contact?.phone || 'Customer';
  const transcriptLines = messages.map(m => {
    const isClient = m.direction === 'inbound';
    const role = isClient ? `${customerName} (Customer)` : 'Agent/AI Assistant';
    let text = '';
    if (typeof m.content?.text === 'string') text = m.content.text;
    else if (typeof m.content?.body === 'string') text = m.content.body;
    else if (m.content?.template?.body) text = m.content.template.body;
    else if (m.content?.template?.name) text = `[Template message: ${m.content.template.name}]`;
    else if (typeof m.content === 'string') text = m.content;
    else text = `[${m.type || 'message'}]`;
    return `${role}: ${text.trim()}`;
  }).filter(line => line.length > 0);

  const transcript = transcriptLines.join('\n');

  // 5. Check OpenAI configuration
  const { apiKey, model } = await getOpenAiConfig(organizationId);
  let summaryResult: SummaryResult;
  let modelUsed = model || 'gpt-4o-mini';

  if (apiKey) {
    try {
      console.log(`[SummaryService] Calling OpenAI API (${modelUsed}) with ${messages.length} messages...`);
      const systemPrompt = `You are an expert Sales Intelligence & CRM Assistant for GetAiPilot WhatsApp CRM.
Analyze the following WhatsApp customer conversation and extract actionable sales insights.
You MUST output ONLY valid JSON matching this schema:
{
  "summary_text": "A concise executive summary of the conversation (2-3 sentences)",
  "customer_intent": "Core intent and interest of the customer (e.g. 'Interested in E-commerce Website development with ₹26k budget')",
  "customer_stage": "Stage: one of 'discovery', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost', 'unqualified'",
  "lead_quality": "Overall temperature: 'Hot', 'Warm', or 'Cold'",
  "next_best_action": "Specific recommended next follow-up action for the sales or support agent (e.g. 'Send custom e-commerce proposal with payment gateway breakdown and call tomorrow')",
  "open_questions": ["Any unanswered customer questions or pending details required from them"],
  "important_facts": ["Extracted key facts, e.g. 'Budget: ₹26,000', 'Requirements: E-commerce platform', 'Location: ...'"],
  "objections": ["Any pricing, trust, or hesitation objections raised"],
  "products_discussed": ["List of products or services mentioned or requested"],
  "captured_data": {
    "name": "Customer name if mentioned or known",
    "email": "Customer email if mentioned",
    "phone": "Customer phone if mentioned",
    "budget": "Customer budget or quoted amount (e.g. ₹26,000)",
    "follow_up_time": "Preferred follow-up time if mentioned"
  }
}`;

      const userPrompt = `Here is the WhatsApp conversation between the business and ${customerName}:
${transcript}

Analyze the customer's interest, services needed, follow-up required, and lead quality. Return valid JSON only.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelUsed,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 800
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SummaryService] OpenAI API error (${response.status}):`, errorText);
        summaryResult = buildRuleBasedSummary(messages, contact);
      } else {
        const resData: any = await response.json();
        const content = resData.choices?.[0]?.message?.content;
        const parsed = JSON.parse(content);
        summaryResult = {
          summary_text: parsed.summary_text || 'Conversation analyzed successfully.',
          customer_intent: parsed.customer_intent || 'General Inquiry',
          customer_stage: parsed.customer_stage || 'qualification',
          lead_quality: parsed.lead_quality || 'Warm',
          next_best_action: parsed.next_best_action || 'Follow up with customer regarding requirements.',
          open_questions: Array.isArray(parsed.open_questions) ? parsed.open_questions : [],
          important_facts: Array.isArray(parsed.important_facts) ? parsed.important_facts : [],
          objections: Array.isArray(parsed.objections) ? parsed.objections : [],
          products_discussed: Array.isArray(parsed.products_discussed) ? parsed.products_discussed : [],
          captured_data: parsed.captured_data || {}
        };
      }
    } catch (llmErr) {
      console.error('[SummaryService] LLM processing error, falling back to rule engine:', llmErr);
      summaryResult = buildRuleBasedSummary(messages, contact);
    }
  } else {
    console.warn('[SummaryService] No OpenAI API key available — using rule-based extraction engine');
    summaryResult = buildRuleBasedSummary(messages, contact);
    modelUsed = 'rule-engine-v1';
  }

  // 6. Insert into w_conversation_summaries
  const { data: insertedSummary, error: insertErr } = await supabase
    .from('w_conversation_summaries')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      summary_text: summaryResult.summary_text,
      customer_intent: summaryResult.customer_intent,
      customer_stage: summaryResult.customer_stage,
      lead_quality: summaryResult.lead_quality,
      next_best_action: summaryResult.next_best_action,
      open_questions: summaryResult.open_questions,
      important_facts: summaryResult.important_facts,
      objections: summaryResult.objections,
      products_discussed: summaryResult.products_discussed,
      summary_from_message_id: messages[0]?.id || null,
      summary_to_message_id: messages[messages.length - 1]?.id || null,
      generated_by: 'ai_assistant',
      model: modelUsed,
      metadata: {
        source: 'direct_ai',
        requested_by_user_id: requestedByUserId || null,
        captured_data: summaryResult.captured_data || {},
        generated_at: new Date().toISOString()
      }
    })
    .select()
    .single();

  if (insertErr) {
    console.error('[SummaryService] Error inserting into w_conversation_summaries:', insertErr);
    throw insertErr;
  }

  // 7. Update w_conversations
  const { data: updatedConv, error: updateConvErr } = await supabase
    .from('w_conversations')
    .update({
      latest_summary_id: insertedSummary.id,
      summary_status: 'ready'
    })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('id, handoff_status, handoff_reason, handoff_requested_at, summary_status, latest_summary_id')
    .single();

  if (updateConvErr) {
    console.warn('[SummaryService] Failed to update w_conversations:', updateConvErr);
  }

  // 8. Insert into w_conversation_notes for display across drawer tabs
  const formattedNoteBody = [
    `Customer Intent:\n  • ${summaryResult.customer_intent}`,
    summaryResult.important_facts.length ? `\nImportant Facts:\n  • ${summaryResult.important_facts.join('\n  • ')}` : '',
    summaryResult.products_discussed.length ? `\nProducts / Services Discussed:\n  • ${summaryResult.products_discussed.join('\n  • ')}` : '',
    `\nRecommended Next Action:\n  • ${summaryResult.next_best_action}`
  ].filter(Boolean).join('\n');

  try {
    await supabase.from('w_conversation_notes').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      note_type: 'ai_summary',
      body: formattedNoteBody,
      source: 'ai_agent',
      metadata: {
        summary_id: insertedSummary.id,
        lead_quality: summaryResult.lead_quality,
        customer_stage: summaryResult.customer_stage,
        customer_intent: summaryResult.customer_intent,
        next_best_action: summaryResult.next_best_action,
        model: modelUsed,
        generated_at: new Date().toISOString()
      }
    });
  } catch (noteErr) {
    console.warn('[SummaryService] Failed to insert conversation notes:', noteErr);
  }

  // 9. Update contact's custom fields with captured intelligence
  if (conversation.contact_id) {
    try {
      const existingCustom = (contact?.custom_fields && typeof contact.custom_fields === 'object') ? contact.custom_fields : {};
      const updatedCustom: Record<string, any> = {
        ...existingCustom,
        lead_temperature: summaryResult.lead_quality,
        lead_interest: summaryResult.customer_intent,
        lead_summary: summaryResult.summary_text,
        lead_next_step: summaryResult.next_best_action,
        lead_topics: summaryResult.products_discussed.join(', '),
      };

      if (summaryResult.captured_data?.budget) {
        updatedCustom.captured_amount = summaryResult.captured_data.budget;
      }
      if (summaryResult.captured_data?.follow_up_time) {
        updatedCustom.follow_up_time = summaryResult.captured_data.follow_up_time;
      }
      if (summaryResult.captured_data?.email && !contact?.email) {
        updatedCustom.captured_email = summaryResult.captured_data.email;
      }
      if (summaryResult.captured_data?.name && !contact?.name) {
        updatedCustom.captured_name = summaryResult.captured_data.name;
      }

      await supabase
        .from('w_contacts')
        .update({
          custom_fields: updatedCustom,
          ...(summaryResult.captured_data?.name && !contact?.name ? { name: summaryResult.captured_data.name } : {}),
          ...(summaryResult.captured_data?.email && !contact?.email ? { email: summaryResult.captured_data.email } : {})
        })
        .eq('id', conversation.contact_id);
    } catch (contactErr) {
      console.warn('[SummaryService] Failed to update contact attributes:', contactErr);
    }
  }

  // 10. Emit Socket.IO event for live UI update
  try {
    if (io && typeof io.to === 'function') {
      io.to(`org:${organizationId}`).emit('conversation_summary_updated', {
        conversation_id: conversationId,
        summary: insertedSummary,
        summary_status: 'ready'
      });
    }
  } catch (ioErr) {
    console.warn('[SummaryService] Failed to emit Socket.IO summary update:', ioErr);
  }

  console.log(`[SummaryService] AI Summary generated successfully for ${conversationId}! Intent: "${summaryResult.customer_intent}", Quality: "${summaryResult.lead_quality}"`);

  return {
    success: true,
    summary: insertedSummary,
    conversation: updatedConv || { ...conversation, summary_status: 'ready', latest_summary_id: insertedSummary.id }
  };
}
