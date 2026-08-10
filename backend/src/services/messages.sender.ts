import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';
import { fetchWithMetaBackoff } from './meta.service.js';
import { FlowEngineResult } from './flows.service.js';
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;

export async function sendMediaMessageMeta(params: {
    phone_number_id: string;
    to: string;
    token: string;
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    type: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
}) {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }), params.fileName);

    const uploadUrl = `https://graph.facebook.com/v21.0/${params.phone_number_id}/media`;
    const upRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.token}` },
        body: form as any,
    });
    const upJson: any = await upRes.json().catch(() => ({}));
    if (!upRes.ok || !upJson?.id) throw new Error(`Meta media upload failed: ${JSON.stringify(upJson)}`);

    const payload: any = { messaging_product: 'whatsapp', to: params.to, type: params.type };
    if (params.type === 'image') payload.image = { id: upJson.id, ...(params.caption ? { caption: params.caption } : {}) };
    if (params.type === 'video') payload.video = { id: upJson.id, ...(params.caption ? { caption: params.caption } : {}) };
    if (params.type === 'audio') payload.audio = { id: upJson.id };
    if (params.type === 'document') payload.document = { id: upJson.id, filename: params.fileName, ...(params.caption ? { caption: params.caption } : {}) };

    const sendUrl = `https://graph.facebook.com/v21.0/${params.phone_number_id}/messages`;
    const sendRes = await fetch(sendUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const sendJson: any = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) throw new Error(`Meta send media failed: ${JSON.stringify(sendJson)}`);
    return { wa_message_id: sendJson?.messages?.[0]?.id || null, raw: sendJson };
}

export async function downloadPublicMediaForSend(url: string, fallbackType: 'image' | 'video' | 'audio' | 'document') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download media URL: HTTP ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || '';
    const mimeType = contentType.split(';')[0] || (
        fallbackType === 'image' ? 'image/jpeg' :
            fallbackType === 'video' ? 'video/mp4' :
                fallbackType === 'audio' ? 'audio/mpeg' :
                    'application/octet-stream'
    );

    let fileName = 'flow-media';
    try {
        const parsed = new URL(url);
        const lastSegment = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
        if (lastSegment && lastSegment.includes('.')) fileName = lastSegment;
    } catch {
        // Keep fallback filename.
    }

    const extensionFromMime =
        mimeType.includes('jpeg') ? 'jpg' :
            mimeType.includes('png') ? 'png' :
                mimeType.includes('gif') ? 'gif' :
                    mimeType.includes('webp') ? 'webp' :
                        mimeType.includes('mp4') ? 'mp4' :
                            mimeType.includes('mpeg') ? 'mp3' :
                                mimeType.includes('ogg') ? 'ogg' :
                                    mimeType.includes('pdf') ? 'pdf' : '';
    if (!fileName.includes('.') && extensionFromMime) fileName = `${fileName}.${extensionFromMime}`;

    return { buffer, mimeType, fileName };
}

export async function sendFlowMediaMessageMeta(params: {
    phone_number_id: string | null;
    to: string;
    media: NonNullable<FlowEngineResult['media']>[number];
}) {
    let token = ACCESS_TOKEN;
    let fromId = PHONE_NUMBER_ID;

    if (params.phone_number_id && supabase) {
        const { data: accounts } = await supabase
            .from('w_wa_accounts')
            .select('access_token_encrypted')
            .eq('phone_number_id', params.phone_number_id)
            .order('status', { ascending: true })
            .limit(1);
        const data = accounts?.[0];
        if (data?.access_token_encrypted) {
            token = decryptToken(data.access_token_encrypted);
            fromId = params.phone_number_id;
        }
    }

    if (!fromId || !token) throw new Error('Missing WA creds for flow media send');

    const downloaded = await downloadPublicMediaForSend(params.media.url, params.media.type);
    const sent = await sendMediaMessageMeta({
        phone_number_id: fromId,
        to: params.to,
        token,
        buffer: downloaded.buffer,
        mimeType: params.media.mimeType || downloaded.mimeType,
        fileName: params.media.fileName || downloaded.fileName,
        type: params.media.type,
        caption: params.media.caption || undefined,
    });

    return {
        ...sent,
        media_url: params.media.url,
        mime_type: params.media.mimeType || downloaded.mimeType,
        file_name: params.media.fileName || downloaded.fileName,
        size: downloaded.buffer.length,
    };
}

export async function sendTextMessage(to: string, body: string, phone_number_id: string | null = null, contextMessageId: string | null = null) {
    let token: string | undefined = ACCESS_TOKEN;
    let fromId: string | null | undefined = PHONE_NUMBER_ID;

    if (phone_number_id && supabase) {
        fromId = phone_number_id;
        const { data: accounts } = await supabase
            .from('w_wa_accounts')
            .select('access_token_encrypted')
            .eq('phone_number_id', phone_number_id)
            .order('status', { ascending: true })
            .limit(1);
        const data = accounts?.[0];
        if (data?.access_token_encrypted) {
            token = decryptToken(data.access_token_encrypted);
        } else {
            token = undefined;
        }
    }

    if (!fromId || !token) throw new Error("Missing WA creds for send");

    const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

    const payload: any = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
    };
    if (contextMessageId) {
        payload.context = { message_id: contextMessageId };
    }

    const r = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
        console.error(`[Send Failure Debug] phone_number_id=${fromId}, tokenPrefix=${token ? token.slice(0, 15) : 'NONE'}... Meta error:`, JSON.stringify(data));
        throw new Error(`Send failed: ${JSON.stringify(data)}`);
    }
    return data;
}

export async function sendReactionMessage(to: string, targetMessageId: string, emoji: string | null, phone_number_id: string | null = null) {
    let token = ACCESS_TOKEN;
    let fromId = PHONE_NUMBER_ID;

    if (phone_number_id && supabase) {
        const { data: accounts } = await supabase
            .from('w_wa_accounts')
            .select('access_token_encrypted')
            .eq('phone_number_id', phone_number_id)
            .order('status', { ascending: true })
            .limit(1);
        const data = accounts?.[0];
        if (data?.access_token_encrypted) {
            token = decryptToken(data.access_token_encrypted);
            fromId = phone_number_id;
        }
    }

    if (!fromId || !token) throw new Error("Missing WA creds for reaction");

    const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        to,
        type: "reaction",
        reaction: {
            message_id: targetMessageId,
            emoji: emoji || "",
        },
    };

    const r = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
        throw new Error(`Reaction failed: ${JSON.stringify(data)}`);
    }
    return data;
}

export function applyReactionUpdate(existing: any, emoji: string | null, actor: string) {
    const reactions = Array.isArray(existing) ? existing : [];
    const index = reactions.findIndex(r => r.actor === actor);

    if (emoji) {
        if (index > -1) {
            reactions[index].emoji = emoji;
        } else {
            reactions.push({ emoji, actor });
        }
    } else {
        if (index > -1) {
            reactions.splice(index, 1);
        }
    }
    return reactions;
}

export async function downloadMetaMedia(params: {
  phone_number_id: string;
  mediaId: string;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  if (!supabase) return null;

  const { data: accounts } = await supabase
    .from("w_wa_accounts")
    .select("access_token_encrypted")
    .eq("phone_number_id", params.phone_number_id)
    .order("status", { ascending: true })
    .limit(1);

  const acc = accounts?.[0];

  const rawToken = acc?.access_token_encrypted || ACCESS_TOKEN;
  const token = rawToken ? decryptToken(rawToken) : rawToken;
  if (!token) return null;

  const metaUrl = `https://graph.facebook.com/v21.0/${params.mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) return null;
  const metaJson: any = await metaRes.json();
  const downloadUrl = metaJson?.url;
  const mimeType = metaJson?.mime_type || "application/octet-stream";
  const fileName = metaJson?.filename || `media-${params.mediaId}`;
  if (!downloadUrl) return null;

  const binRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!binRes.ok) return null;
  const arrayBuf = await binRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), mimeType, fileName };
}

export async function sendInteractiveButtons(
  to: string,
  body: string,
  buttons: any[],
  footer: string = "",
  phone_number_id: string | null = null,
) {
  let token: string | undefined = ACCESS_TOKEN;
  let fromId: string | null | undefined = PHONE_NUMBER_ID;

  if (phone_number_id && supabase) {
    fromId = phone_number_id;
    const { data: accounts } = await supabase
      .from("w_wa_accounts")
      .select("access_token_encrypted")
      .eq("phone_number_id", phone_number_id)
      .order("status", { ascending: true })
      .limit(1);
    const data = accounts?.[0];
    if (data?.access_token_encrypted) {
      token = decryptToken(data.access_token_encrypted);
    } else {
      token = undefined;
    }
  }

  if (!fromId || !token) throw new Error("Missing WA creds for interactive send");

  const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

  // Separate buttons by type — URL buttons need a completely different WA API format
  const urlButtons = (buttons || []).filter((b) => b.type === 'url' || b.type === 'form');
  const phoneButtons = (buttons || []).filter((b) => b.type === 'phone');
  const replyButtons = (buttons || []).filter((b) => !b.type || b.type === 'reply');

  let interactivePayload: any;

  if (urlButtons.length > 0) {
    // WhatsApp cta_url type — supports a single URL CTA button
    // If there are also reply buttons, we prioritize the URL button
    const urlBtn = urlButtons[0];
    interactivePayload = {
      type: "cta_url",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        name: "cta_url",
        parameters: {
          display_text: String(urlBtn.text || "Open Link").slice(0, 20),
          url: urlBtn.url,
        },
      },
    };
  } else if (phoneButtons.length > 0) {
    // WhatsApp phone_number button type
    interactivePayload = {
      type: "button",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: phoneButtons.slice(0, 3).map((b) => ({
          type: "phone_number",
          phone_number: {
            display_text: String(b.text || "Call Us").slice(0, 20),
            phone_number: String(b.phone || b.id || ""),
          },
        })),
      },
    };
  } else {
    // Standard quick-reply buttons
    interactivePayload = {
      type: "button",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: replyButtons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: {
            id: String(b.id || b.text || "").slice(0, 256),
            title: String(b.text || b.title || b.id || "Option").slice(0, 20),
          },
        })),
      },
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: interactivePayload,
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Interactive send failed: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function sendInteractiveList(
  to: string,
  body: string,
  buttonText: string,
  sections: any[],
  footer: string = "",
  phone_number_id: string | null = null,
) {
  let token: string | undefined = ACCESS_TOKEN;
  let fromId: string | null | undefined = PHONE_NUMBER_ID;

  if (phone_number_id && supabase) {
    fromId = phone_number_id;
    const { data: accounts } = await supabase
      .from("w_wa_accounts")
      .select("access_token_encrypted")
      .eq("phone_number_id", phone_number_id)
      .order("status", { ascending: true })
      .limit(1);
    const data = accounts?.[0];
    if (data?.access_token_encrypted) {
      token = decryptToken(data.access_token_encrypted);
    } else {
      token = undefined;
    }
  }

  if (!fromId || !token) throw new Error("Missing WA creds for list send");

  const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        button: buttonText.slice(0, 20),
        sections
      }
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Interactive list send failed: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function sendTypingIndicator(params: {
  phone_number_id: string;
  message_id: string;
  to?: string;
  token?: string;
}): Promise<any> {
  const { phone_number_id, message_id, to } = params;
  if (!phone_number_id || !message_id) return null;

  try {
    let token = params.token;
    if (!token && supabase) {
      const { data: accounts } = await supabase
        .from('w_wa_accounts')
        .select('access_token_encrypted')
        .eq('phone_number_id', phone_number_id)
        .order('status', { ascending: true })
        .limit(1);
      const data = accounts?.[0];
      if (data?.access_token_encrypted) {
        token = decryptToken(data.access_token_encrypted);
      }
    }
    if (!token) {
      token = process.env.WA_ACCESS_TOKEN;
    }
    if (!token) {
      console.warn(`[TypingIndicator] Skipped: No access token found for phone_number_id ${phone_number_id}`);
      return null;
    }

    const graphVersion = process.env.META_GRAPH_VERSION || 'v21.0';
    const url = `https://graph.facebook.com/${graphVersion}/${phone_number_id}/messages`;
    const payload: any = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: message_id,
      typing_indicator: {
        type: "text"
      }
    };
    if (to) {
      payload.recipient_type = "individual";
      payload.to = to;
    }

    const res = await fetchWithMetaBackoff(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[TypingIndicator] Meta returned status ${res.status} for message ${message_id}:`, JSON.stringify(json));
    } else {
      console.log(`💬 [TypingIndicator] Sent typing indicator & marked message ${message_id} as read (to: ${to || 'unspecified'})`);
    }
    return json;
  } catch (err: any) {
    console.warn(`[TypingIndicator] Non-blocking exception for message ${message_id}:`, err?.message || err);
    return null;
  }
}

