import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { upsertContact } from './contacts.service.js';
import { upsertConversation, storeMessage } from './messages.service.js';
import { applyReactionUpdate, downloadMetaMedia, sendTypingIndicator } from './messages.sender.js';
import { performAutoAssignment } from './assignment.service.js';
import { uploadMediaToStorage } from './broadcast.service.js';
import { processFlowEngine } from './flows.service.js';
import { getBotAgentReply } from './ai.service.js';
import { sendPushNotificationToOrg } from './push.service.js';
import { sendOutboundMessage } from './outboundDispatch.service.js';

export interface InboundMediaPayload {
  buffer?: Buffer;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
  url?: string;
}

export interface InboundInteractivePayload {
  type?: string;
  id?: string;
  title?: string;
  description?: string;
  rawPayload?: any;
}

export interface InboundMessageEvent {
  transport: 'meta' | 'baileys';
  organizationId: string;
  waAccountId?: string | null;
  phoneNumberId: string;
  contactWaId: string;
  contactName?: string | null;
  waMessageId: string;
  timestamp?: string | number | Date;
  direction?: 'inbound' | 'outbound';
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'interactive' | 'reaction' | 'location';
  text?: string | null;
  caption?: string | null;
  media?: InboundMediaPayload | null;
  interactive?: InboundInteractivePayload | null;
  reaction?: {
    targetWaMessageId: string;
    emoji: string;
    from?: string;
  } | null;
  quotedMessage?: any;
  isForwarded?: boolean;
  forwardingScore?: number;
  rawPayload?: any;
}

export interface InboundIngestionResult {
  status: 'ingested' | 'duplicate' | 'reaction_applied' | 'ignored';
  messageId?: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  flowTriggered?: boolean;
  botReplied?: boolean;
}

const botDebounceMap = new Map<string, NodeJS.Timeout>();
const botLockMap = new Map<string, Promise<void>>();

/**
 * Deep Inbound Ingestion Module.
 * Consolidates contact upsert, conversation creation, media persistence,
 * real-time broadcasts, Web Push notifications, flow execution, and AI Bot Agent replies
 * into a single unified pipeline shared across Meta Cloud API and Baileys socket transports.
 */
export async function ingestInboundMessage(
  event: InboundMessageEvent
): Promise<InboundIngestionResult> {
  const {
    transport,
    organizationId,
    waAccountId,
    phoneNumberId,
    contactWaId,
    contactName,
    waMessageId,
    direction = 'inbound',
    type = 'text',
    text,
    caption,
    media,
    interactive,
    reaction,
    quotedMessage,
    isForwarded = false,
    forwardingScore = 0,
    rawPayload,
  } = event;

  if (!organizationId) throw new Error('organizationId is required for inbound ingestion');
  if (!contactWaId) throw new Error('contactWaId is required for inbound ingestion');
  if (!waMessageId) throw new Error('waMessageId is required for inbound ingestion');

  // 1. Idempotency & Deduplication
  const { data: existingMessage } = await supabase
    .from('w_messages')
    .select('id, conversation_id, contact_id')
    .eq('wa_message_id', waMessageId)
    .maybeSingle();

  if (existingMessage) {
    return {
      status: 'duplicate',
      messageId: existingMessage.id,
      conversationId: existingMessage.conversation_id,
      contactId: existingMessage.contact_id,
    };
  }

  // 2. Reaction Handling
  if (type === 'reaction' && reaction?.targetWaMessageId) {
    const { data: targetMessage } = await supabase
      .from('w_messages')
      .select('id, conversation_id, reactions')
      .eq('wa_message_id', reaction.targetWaMessageId)
      .maybeSingle();

    if (targetMessage) {
      const nextReactions = applyReactionUpdate(
        targetMessage.reactions,
        reaction.emoji || null,
        reaction.from || contactWaId
      );

      await supabase
        .from('w_messages')
        .update({ reactions: nextReactions })
        .eq('id', targetMessage.id);

      io.to(`org:${organizationId}`).emit('message_reaction', {
        organization_id: organizationId,
        conversation_id: targetMessage.conversation_id,
        message_id: targetMessage.id,
        wa_message_id: reaction.targetWaMessageId,
        reactions: nextReactions,
      });

      return {
        status: 'reaction_applied',
        messageId: targetMessage.id,
        conversationId: targetMessage.conversation_id,
      };
    }
  }

  // 3. Contact Upserting
  const contact = await upsertContact(
    organizationId,
    waAccountId || '',
    contactWaId,
    contactName || null
  );

  // 4. Conversation Upserting & Auto-assignment
  const effectivePreview =
    caption ||
    text ||
    interactive?.title ||
    (type === 'image'
      ? '[Image]'
      : type === 'video'
      ? '[Video]'
      : type === 'audio'
      ? '[Audio]'
      : type === 'document'
      ? '[Document]'
      : 'Message');

  const conv = await upsertConversation(organizationId, waAccountId || '', contact.id, {
    direction,
    preview: effectivePreview,
  });

  // Check auto-assignment for new or unassigned conversations
  if (!conv.assigned_to && direction === 'inbound') {
    performAutoAssignment(organizationId, conv.id).catch((err) => {
      console.warn('[InboundIngestion] Auto-assignment failed non-blockingly:', err.message);
    });
  }

  // 5. Media Processing & Storage
  let storedMediaUrl: string | null = media?.url || null;
  let finalMimeType: string | null = media?.mimeType || null;
  let finalFileName: string | null = media?.fileName || null;

  if (media) {
    try {
      let buffer = media.buffer;
      if (!buffer && media.mediaId && transport === 'meta') {
        const downloaded = await downloadMetaMedia({
          phone_number_id: phoneNumberId,
          mediaId: media.mediaId,
        });
        if (downloaded) {
          buffer = downloaded.buffer;
          finalMimeType = downloaded.mimeType;
          finalFileName = downloaded.fileName;
        }
      }

      if (buffer) {
        const uploaded = await uploadMediaToStorage({
          organization_id: organizationId,
          conversation_id: conv.id,
          fileName: finalFileName || `attachment-${Date.now()}`,
          mimeType: finalMimeType || 'application/octet-stream',
          buffer,
        });
        if (uploaded?.publicUrl) {
          storedMediaUrl = uploaded.publicUrl;
        }
      }
    } catch (mediaErr: any) {
      console.error('[InboundIngestion] Media storage upload error:', mediaErr.message || mediaErr);
    }
  }

  // 6. Message Persistence
  const contentPayload: any = {
    text: text || null,
    caption: caption || null,
    media_url: storedMediaUrl,
    mime_type: finalMimeType,
    file_name: finalFileName,
    interactive: interactive || null,
    quoted: quotedMessage || null,
    forwarded: isForwarded,
    forwarding_score: forwardingScore,
    transport,
    raw: rawPayload || null,
  };

  const storedMessage = await storeMessage({
    organization_id: organizationId,
    contact_id: contact.id,
    conversation_id: conv.id,
    wa_message_id: waMessageId,
    direction,
    type: type as any,
    content: contentPayload,
    status: 'delivered',
  });

  // 7. Real-Time Broadcast & Push Notification
  io.to(`org:${organizationId}`).emit('new_message', {
    organization_id: organizationId,
    wa_account_id: waAccountId,
    phone_number_id: phoneNumberId,
    from: contactWaId,
    phone: contactWaId,
    text: effectivePreview,
    sender: 'customer',
    conversation_id: conv.id,
    contact_id: contact.id,
    message_id: storedMessage?.id || null,
    wa_message_id: waMessageId,
    created_at: storedMessage?.created_at || new Date().toISOString(),
    type,
    media_url: storedMediaUrl,
    mime_type: finalMimeType,
    file_name: finalFileName,
    interactive,
  });

  if (direction === 'inbound') {
    sendPushNotificationToOrg(organizationId, {
      title: contactName || contactWaId,
      body: effectivePreview,
      data: {
        conversationId: conv.id,
        contactId: contact.id,
      },
    }).catch((pushErr) => {
      console.warn('[InboundIngestion] Push notification failed non-blockingly:', pushErr.message);
    });
  }

  // 8. Automation: Flow Engine & AI Bot Agent (Only for inbound)
  let flowTriggered = false;
  let botReplied = false;

  if (direction === 'inbound') {
    const inboundText = text || caption || interactive?.title || interactive?.id || '';

    // Flow Engine Evaluation
    const flowResult = await processFlowEngine(
      organizationId,
      contact.id,
      conv.id,
      inboundText,
      storedMessage?.id || null,
      waAccountId || null
    );

    if (flowResult?.consumed) {
      flowTriggered = true;

      // 8a. Outbound Text Response from Flow
      if (flowResult.output) {
        await sendOutboundMessage({
          organizationId,
          to: contactWaId,
          conversationId: conv.id,
          contactId: contact.id,
          waAccountId,
          phoneNumberId,
          type: 'text',
          text: flowResult.output,
          senderType: 'ai_agent',
          automationSource: 'flow',
          isBotReply: true,
          metadata: {
            flow_id: flowResult.flow_id,
            flow_version_id: flowResult.flow_version_id,
            flow_session_id: flowResult.flow_session_id,
            flow_run_id: flowResult.flow_run_id,
            flow_node_id: flowResult.flow_node_id,
            handoff: flowResult.handoff === true,
          },
        });
      }

      // 8b. Outbound Interactive Response from Flow (Buttons or List)
      if (flowResult.interactive) {
        await sendOutboundMessage({
          organizationId,
          to: contactWaId,
          conversationId: conv.id,
          contactId: contact.id,
          waAccountId,
          phoneNumberId,
          type: 'interactive',
          interactive: flowResult.interactive,
          senderType: 'ai_agent',
          automationSource: 'flow',
          isBotReply: true,
          metadata: {
            flow_id: flowResult.flow_id,
            flow_version_id: flowResult.flow_version_id,
            flow_session_id: flowResult.flow_session_id,
            flow_run_id: flowResult.flow_run_id,
            flow_node_id: flowResult.flow_node_id,
            handoff: flowResult.handoff === true,
          },
        });
      }

      // 8c. Outbound Media Nodes from Flow
      if (Array.isArray(flowResult.media) && flowResult.media.length > 0) {
        for (const m of flowResult.media) {
          try {
            await sendOutboundMessage({
              organizationId,
              to: contactWaId,
              conversationId: conv.id,
              contactId: contact.id,
              waAccountId,
              phoneNumberId,
              type: m.type as any,
              media: {
                url: m.url,
                mimeType: m.mimeType || undefined,
                fileName: m.fileName || undefined,
                caption: m.caption || undefined,
                type: m.type,
              },
              senderType: 'ai_agent',
              automationSource: 'flow',
              isBotReply: true,
              metadata: {
                flow_id: flowResult.flow_id,
                flow_version_id: flowResult.flow_version_id,
                flow_session_id: flowResult.flow_session_id,
                flow_run_id: flowResult.flow_run_id,
                flow_node_id: flowResult.flow_node_id,
                handoff: flowResult.handoff === true,
              },
            });
          } catch (flowMediaErr: any) {
            console.error('[InboundIngestion] Failed to send flow media node:', flowMediaErr.message);
          }
        }
      }
    } else {
      // 9. AI Bot Agent Evaluation (if not consumed by Flow)
      const isAgentEligible =
        (type === 'text' || type === 'interactive') && Boolean(inboundText.trim());

      if (isAgentEligible) {
        const debounceKey = conv.id;

        // Send typing indicator
        if (phoneNumberId && waMessageId) {
          sendTypingIndicator({
            phone_number_id: phoneNumberId,
            message_id: waMessageId,
            to: contactWaId,
          }).catch(() => {});
        }

        if (botDebounceMap.has(debounceKey)) {
          clearTimeout(botDebounceMap.get(debounceKey)!);
        }

        botDebounceMap.set(
          debounceKey,
          setTimeout(async () => {
            botDebounceMap.delete(debounceKey);

            const prevPromise = botLockMap.get(debounceKey) || Promise.resolve();
            const nextPromise = prevPromise.then(async () => {
              try {
                const botResult = await getBotAgentReply({
                  organization_id: organizationId,
                  conversation_id: conv.id,
                  text: inboundText,
                });

                if (botResult?.reply) {
                  botReplied = true;
                  const isFallback = botResult.reply.startsWith('[FALLBACK]');
                  const cleanReply = botResult.reply.replace('[FALLBACK]', '').trim();

                  if (isFallback) {
                    await sendOutboundMessage({
                      organizationId,
                      to: contactWaId,
                      conversationId: conv.id,
                      contactId: contact.id,
                      waAccountId,
                      phoneNumberId,
                      type: 'interactive',
                      interactive: {
                        type: 'buttons',
                        body:
                          cleanReply ||
                          'I could not find an answer. Would you like to connect with a support agent?',
                        footer: 'Choose an option',
                        buttons: [{ id: 'talk_to_agent', text: 'Talk to Agent' }],
                      },
                      senderType: 'ai_agent',
                      automationSource: 'ai_agent',
                      isBotReply: true,
                      metadata: {
                        bot_agent_id: botResult.agent?.id,
                        bot_agent_name: botResult.agent?.name,
                        handoff: true,
                      },
                    });
                  } else {
                    await sendOutboundMessage({
                      organizationId,
                      to: contactWaId,
                      conversationId: conv.id,
                      contactId: contact.id,
                      waAccountId,
                      phoneNumberId,
                      type: 'text',
                      text: cleanReply,
                      senderType: 'ai_agent',
                      automationSource: 'ai_agent',
                      isBotReply: true,
                      metadata: {
                        bot_agent_id: botResult.agent?.id,
                        bot_agent_name: botResult.agent?.name,
                      },
                    });
                  }
                }
              } catch (botErr: any) {
                console.error('[InboundIngestion] AI Bot evaluation error:', botErr.message);
              }
            });

            botLockMap.set(debounceKey, nextPromise);
            await nextPromise;
          }, 500)
        );
      }
    }
  }

  return {
    status: 'ingested',
    messageId: storedMessage?.id || null,
    conversationId: conv.id,
    contactId: contact.id,
    flowTriggered,
    botReplied,
  };
}
