import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { sessions } from './whatsapp.service.js';
import { decryptToken } from '../utils/crypto.js';
import { normalizeWaIdToPhone } from '../utils/format.js';
import {
  sendTextMessage,
  sendMediaMessageMeta,
  sendInteractiveButtons,
  sendInteractiveList,
} from './messages.sender.js';
import { storeMessage } from './messages.service.js';
import { uploadMediaToStorage } from './broadcast.service.js';

export interface OutboundMediaPayload {
  buffer?: Buffer;
  url?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  type?: 'image' | 'video' | 'audio' | 'document';
}

export interface OutboundInteractivePayload {
  type: 'buttons' | 'button' | 'list' | 'cta_url';
  body: string;
  footer?: string;
  buttons?: Array<{ id: string; text?: string; title?: string; phone?: string; url?: string; type?: string }>;
  buttonText?: string;
  sections?: any[];
}

export interface OutboundDispatchParams {
  organizationId: string;
  to: string; // Contact wa_id / phone
  conversationId?: string | null;
  contactId?: string | null;
  waAccountId?: string | null;
  phoneNumberId?: string | null;
  sessionId?: string | null;

  type?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'interactive' | 'template';
  text?: string | null;
  media?: OutboundMediaPayload | null;
  interactive?: OutboundInteractivePayload | null;

  replyToWaMessageId?: string | null;
  forwardFromMessageId?: string | null;
  clientMessageId?: string | null;

  senderType?: 'user' | 'agent' | 'ai_agent' | 'system';
  automationSource?: 'flow' | 'ai_agent' | 'campaign' | 'manual';
  isBotReply?: boolean;
  metadata?: Record<string, any>;
  skipPersistence?: boolean;
}

export interface OutboundDispatchResult {
  success: boolean;
  waMessageId: string | null;
  storedMessageId?: string | null;
  transport: 'meta' | 'baileys';
  isFallback: boolean;
  raw?: any;
}

/**
 * Normalizes an arbitrary recipient identifier into a Baileys JID.
 */
export function normalizeForBaileys(raw: string): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (v.includes('@')) return v;
  const digits = v.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

/**
 * Resolves an active Baileys socket for an account.
 */
export function resolveBaileysSocket(params: {
  sessionId?: string | null;
  phoneOrId?: string | null;
  displayPhone?: string | null;
}): any | null {
  const { sessionId, phoneOrId, displayPhone } = params;

  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    if (s?.user?.id) return s;
  }

  const cleanPhone = String(phoneOrId || '').replace(/\D+/g, '');
  const cleanDisplay = String(displayPhone || '').replace(/\D+/g, '');

  for (const s of sessions.values()) {
    const connectedJid = s?.user?.id || '';
    const connectedPhone = connectedJid ? connectedJid.split(':')[0] : '';
    if (
      connectedPhone &&
      (connectedPhone === cleanPhone || connectedPhone === cleanDisplay)
    ) {
      return s;
    }
  }

  // Fallback to first active connected session if only one exists
  if (sessions.size > 0) {
    const firstConnected = Array.from(sessions.values()).find((s) => s?.user?.id);
    if (firstConnected) return firstConnected;
  }

  return null;
}

/**
 * Unified Outbound Message Dispatcher.
 * Automatically chooses between Meta Cloud API and Baileys socket connection,
 * transparently falls back if Cloud API fails, persists to w_messages,
 * updates conversation timestamps, and emits Socket.io updates.
 */
export async function sendOutboundMessage(
  params: OutboundDispatchParams
): Promise<OutboundDispatchResult> {
  const {
    organizationId,
    to,
    conversationId,
    contactId,
    waAccountId,
    phoneNumberId,
    sessionId,
    type = 'text',
    text,
    media,
    interactive,
    replyToWaMessageId,
    forwardFromMessageId,
    clientMessageId,
    senderType = 'agent',
    automationSource,
    isBotReply = false,
    metadata = {},
    skipPersistence = false,
  } = params;

  if (!organizationId) throw new Error('organizationId is required for outbound dispatch');
  if (!to) throw new Error('Recipient "to" is required for outbound dispatch');

  // 1. Resolve Account details
  let accountRow: any = null;
  if (waAccountId) {
    const { data: acc } = await supabase
      .from('w_wa_accounts')
      .select('id, phone_number_id, display_phone_number, access_token_encrypted, status')
      .eq('id', waAccountId)
      .maybeSingle();
    accountRow = acc;
  } else if (phoneNumberId) {
    const { data: acc } = await supabase
      .from('w_wa_accounts')
      .select('id, phone_number_id, display_phone_number, access_token_encrypted, status')
      .eq('organization_id', organizationId)
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();
    accountRow = acc;
  } else if (conversationId) {
    const { data: conv } = await supabase
      .from('w_conversations')
      .select('wa_account:w_wa_accounts(id, phone_number_id, display_phone_number, access_token_encrypted, status)')
      .eq('id', conversationId)
      .maybeSingle();
    accountRow = conv?.wa_account;
  }

  const accountPhoneOrId = String(accountRow?.phone_number_id || phoneNumberId || '');
  const hasEncryptedToken = Boolean(accountRow?.access_token_encrypted);

  let sendResult: any = null;
  let waMessageId: string | null = null;
  let usedTransport: 'meta' | 'baileys' = 'meta';
  let isFallback = false;

  // 2. Attempt Meta Cloud API if token is present
  if (hasEncryptedToken) {
    try {
      const metaTo = normalizeWaIdToPhone(to);
      if (!metaTo) throw new Error(`Recipient "${to}" cannot be normalized for Meta Cloud API`);

      const token = decryptToken(accountRow.access_token_encrypted);

      if (type === 'interactive' && interactive) {
        if (interactive.type === 'list') {
          sendResult = await sendInteractiveList(
            metaTo,
            interactive.body,
            interactive.buttonText || 'Select',
            interactive.sections || [],
            interactive.footer || '',
            accountPhoneOrId
          );
        } else {
          sendResult = await sendInteractiveButtons(
            metaTo,
            interactive.body,
            interactive.buttons || [],
            interactive.footer || '',
            accountPhoneOrId
          );
        }
        waMessageId = sendResult?.messages?.[0]?.id || null;
      } else if (media && (type === 'image' || type === 'video' || type === 'audio' || type === 'document')) {
        let mediaBuffer = media.buffer;
        if (!mediaBuffer && media.url) {
          const res = await fetch(media.url);
          if (res.ok) {
            const arr = await res.arrayBuffer();
            mediaBuffer = Buffer.from(arr);
          }
        }
        if (!mediaBuffer) throw new Error('No media buffer available for Meta send');

        const sent = await sendMediaMessageMeta({
          phone_number_id: accountPhoneOrId,
          to: metaTo,
          token,
          buffer: mediaBuffer,
          mimeType: media.mimeType || 'application/octet-stream',
          fileName: media.fileName || 'attachment',
          type: type as any,
          caption: media.caption || text || undefined,
        });
        waMessageId = sent.wa_message_id;
        sendResult = sent.raw;
      } else {
        // Plain text
        sendResult = await sendTextMessage(
          metaTo,
          text || '',
          accountPhoneOrId,
          replyToWaMessageId || null
        );
        waMessageId = sendResult?.messages?.[0]?.id || null;
      }

      usedTransport = 'meta';
    } catch (cloudErr: any) {
      console.warn(
        `[OutboundDispatch] Meta Cloud API failed for ${accountPhoneOrId} (${cloudErr.message}). Initiating Baileys fallback.`
      );
      isFallback = true;
    }
  }

  // 3. Fallback or direct send via Baileys Socket
  if (!hasEncryptedToken || isFallback) {
    const sock = resolveBaileysSocket({
      sessionId,
      phoneOrId: accountPhoneOrId,
      displayPhone: accountRow?.display_phone_number,
    });

    if (!sock) {
      throw new Error(
        hasEncryptedToken
          ? `Meta Cloud API failed (${isFallback ? 'fallback attempted' : ''}) and no active Baileys socket found for account ${accountPhoneOrId}`
          : `No active WhatsApp connection found for account ${accountPhoneOrId}. Connect via QR code.`
      );
    }

    const jid = normalizeForBaileys(to);
    if (!jid) throw new Error(`Invalid recipient JID for Baileys: ${to}`);

    if (media && (type === 'image' || type === 'video' || type === 'audio' || type === 'document')) {
      let mediaSource: any;
      if (media.buffer) {
        mediaSource = media.buffer;
      } else if (media.url) {
        mediaSource = { url: media.url };
      } else {
        throw new Error('No media buffer or URL available for Baileys dispatch');
      }

      const caption = media.caption || text || undefined;
      if (type === 'image') {
        sendResult = await sock.sendMessage(jid, { image: mediaSource, caption });
      } else if (type === 'video') {
        sendResult = await sock.sendMessage(jid, { video: mediaSource, caption });
      } else if (type === 'audio') {
        sendResult = await sock.sendMessage(jid, { audio: mediaSource, mimetype: media.mimeType || 'audio/mp4' });
      } else {
        sendResult = await sock.sendMessage(jid, {
          document: mediaSource,
          fileName: media.fileName || 'file',
          mimetype: media.mimeType || 'application/octet-stream',
          caption,
        });
      }
    } else {
      // Plain text or text fallback for interactive
      const bodyText = interactive ? `${interactive.body}\n${(interactive.buttons || []).map((b) => `• ${b.text || b.title}`).join('\n')}` : text || '';
      sendResult = await sock.sendMessage(jid, { text: bodyText });
    }

    waMessageId = sendResult?.key?.id || null;
    usedTransport = 'baileys';
  }

  // 4. Persistence & Side Effects
  let storedMessageId: string | null = null;
  if (!skipPersistence && conversationId) {
    let quotedMessage: any = null;
    if (replyToWaMessageId) {
      const { data: quotedMsg } = await supabase
        .from('w_messages')
        .select('id, text_body, type, content, wa_message_id, direction')
        .eq('wa_message_id', replyToWaMessageId)
        .maybeSingle();
      if (quotedMsg) {
        quotedMessage = {
          wa_message_id: replyToWaMessageId,
          text: quotedMsg.text_body || quotedMsg.content?.text || null,
          type: quotedMsg.type || 'text',
          direction: quotedMsg.direction || null,
          found: true,
        };
      }
    }

    const preview =
      text ||
      interactive?.body ||
      (type === 'image'
        ? '[Image]'
        : type === 'video'
        ? '[Video]'
        : type === 'audio'
        ? '[Audio]'
        : type === 'document'
        ? '[Document]'
        : 'Message');

    const contentPayload: any = {
      text: text || null,
      caption: media?.caption || null,
      media_url: media?.url || null,
      mime_type: media?.mimeType || null,
      file_name: media?.fileName || null,
      interactive: interactive || null,
      quoted: quotedMessage,
      forwarded: Boolean(forwardFromMessageId),
      client_message_id: clientMessageId || null,
      transport: usedTransport,
      is_fallback: isFallback,
    };

    const stored = await storeMessage({
      organization_id: organizationId,
      contact_id: contactId || undefined,
      conversation_id: conversationId,
      wa_message_id: waMessageId,
      direction: 'outbound',
      type: type as any,
      content: contentPayload,
      status: 'sent',
      is_bot_reply: isBotReply,
      sender_type: senderType,
      automation_source: automationSource,
      metadata: {
        ...metadata,
        transport: usedTransport,
        is_fallback: isFallback,
      },
    } as any);

    storedMessageId = stored?.id || null;

    // Update conversation timestamp and preview
    await supabase
      .from('w_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: String(preview).slice(0, 100),
      })
      .eq('id', conversationId);

    // Emit real-time WebSocket event
    io.to(`org:${organizationId}`).emit('new_message', {
      organization_id: organizationId,
      wa_account_id: accountRow?.id || waAccountId || null,
      phone_number_id: accountPhoneOrId,
      from: accountRow?.display_phone_number || accountPhoneOrId,
      phone: to,
      text: preview,
      sender: senderType === 'user' ? 'agent' : senderType,
      conversation_id: conversationId,
      contact_id: contactId,
      message_id: storedMessageId,
      wa_message_id: waMessageId,
      created_at: stored?.created_at || new Date().toISOString(),
      connectedAccount: accountRow?.display_phone_number || accountPhoneOrId,
      type,
      media_url: media?.url || null,
      mime_type: media?.mimeType || null,
      file_name: media?.fileName || null,
      is_bot_reply: isBotReply,
      metadata: stored?.metadata || metadata,
    });
  }

  return {
    success: true,
    waMessageId,
    storedMessageId,
    transport: usedTransport,
    isFallback,
    raw: sendResult,
  };
}
