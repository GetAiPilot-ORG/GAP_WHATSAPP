import { Response } from 'express';
import crypto from "crypto";
import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { performAutoAssignment } from '../services/assignment.service.js';

import { storeMessage, upsertConversation, refundWhatsappMessage } from '../services/messages.service.js';
import { sendTextMessage, applyReactionUpdate, downloadMetaMedia, sendInteractiveButtons, sendFlowMediaMessageMeta, sendInteractiveList, sendTypingIndicator } from '../services/messages.sender.js';
import { processFlowEngine } from '../services/flows.service.js';
import { upsertContact } from '../services/contacts.service.js';
import { getBotAgentReply } from '../services/ai.service.js';
import { normalizeMetaTemplateStatus, upsertLocalTemplateSubmission } from './whatsapp.controller.js';
import { encryptToken } from '../utils/crypto.js';
import { uploadMediaToStorage } from '../services/broadcast.service.js';

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;
const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const WEBHOOK_DEBUG = String(process.env.WEBHOOK_DEBUG || "true").toLowerCase() !== "false";

const botDebounceMap = new Map<string, NodeJS.Timeout>();
const botLockMap = new Map<string, Promise<void>>();

function webhookLog(step: string, details: Record<string, any> = {}) {
  if (!WEBHOOK_DEBUG) return;
  console.log(
    `[WEBHOOK][${new Date().toISOString()}][${step}]`,
    JSON.stringify(details, null, 2),
  );
}

function webhookError(step: string, error: any, details: Record<string, any> = {}) {
  const safeError = {
    message: error?.message || String(error || "Unknown error"),
    code: error?.code || error?.details || null,
    hint: error?.hint || null,
  };
  console.error(
    `[WEBHOOK][${new Date().toISOString()}][${step}][ERROR]`,
    JSON.stringify({ ...details, error: safeError }, null, 2),
  );
}

function getMetaStatusErrorMessage(status: any) {
  const errors = Array.isArray(status?.errors) ? status.errors : [];
  const primary = errors[0];
  if (!primary) return null;

  return [
    primary.title,
    primary.message,
    primary.error_data?.details,
    primary.code ? `code ${primary.code}` : "",
  ]
    .filter(Boolean)
    .join(" | ") || null;
}

export function verifyMetaSignature(req: any) {
    const sig = req.get("X-Hub-Signature-256");
    if (!sig || !APP_SECRET) return false;

    const expected =
        "sha256=" +
        crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");

    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}

export async function verifyWebhook(req: any, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  webhookLog("verify.request", {
    mode,
    tokenMatches: token === VERIFY_TOKEN,
    hasChallenge: !!challenge,
    hasConfiguredVerifyToken: !!VERIFY_TOKEN,
    ip: req.ip,
  });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    webhookLog("verify.ok", {
      challengeLength: String(challenge || "").length,
    });
    return res.status(200).send(challenge);
  }
  webhookError("verify.failed", new Error("Verify token mismatch or invalid mode"), {
    mode,
    tokenMatches: token === VERIFY_TOKEN,
    hasChallenge: !!challenge,
  });
  return res.sendStatus(403);
}

export async function handleWebhook(req: any, res: Response) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  webhookLog("request.start", {
    requestId,
    method: req.method,
    path: req.path,
    contentType: req.get("content-type") || null,
    hasSignature: !!req.get("X-Hub-Signature-256"),
    hasAppSecret: !!APP_SECRET,
    rawBodyBytes: req.rawBody?.length || 0,
    ip: req.ip,
  });
  // Signature verify (recommended)
  if (APP_SECRET) {
    const ok = verifyMetaSignature(req);
    if (!ok) {
      console.log("❌ Webhook Signature Verification Failed!");
      webhookError("signature.failed", new Error("Webhook signature verification failed"), {
        requestId,
        hasSignature: !!req.get("X-Hub-Signature-256"),
        rawBodyBytes: req.rawBody?.length || 0,
      });
      return res.sendStatus(403);
    }
    webhookLog("signature.ok", { requestId });
  } else {
    webhookLog("signature.skipped", {
      requestId,
      reason: "META_APP_SECRET is not configured",
    });
  }
  res.sendStatus(200); // Ack immediately
  webhookLog("request.ack", {
    requestId,
    status: 200,
    ackMs: Date.now() - startedAt,
  });

  console.log("==========================================");
  console.log("📥 WEBHOOK EVENT RECEIVED!");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("==========================================");

  try {
    const body = req.body;
    const deliveries = (body?.entry || []).flatMap((entry: any) =>
      (entry?.changes || []).map((change: any) => ({ entry, change })),
    );

    for (const { entry, change } of deliveries) {
    const value = change?.value;
    const metadata = value?.metadata; // has phone_number_id

    webhookLog("payload.parsed", {
      requestId,
      object: body?.object || null,
      entryId: entry?.id || null,
      changeField: change?.field || null,
      hasValue: !!value,
      phone_number_id: metadata?.phone_number_id || null,
      display_phone_number: metadata?.display_phone_number || null,
      messagesCount: Array.isArray(value?.messages) ? value.messages.length : 0,
      statusesCount: Array.isArray(value?.statuses) ? value.statuses.length : 0,
      contactsCount: Array.isArray(value?.contacts) ? value.contacts.length : 0,
    });

    if (!value) {
      webhookLog("payload.no_value.stop", { requestId });
      continue;
    }

    if (
      change?.field === "message_template_status_update" ||
      value?.event === "message_template_status_update" ||
      value?.message_template_name
    ) {
      webhookLog("template.status.start", {
        requestId,
        changeField: change?.field || null,
        event: value?.event || null,
      });
      const wabaId = String(
        entry?.id ||
          value?.waba_id ||
          value?.whatsapp_business_account_id ||
          "",
      );
      const templateId =
        value?.message_template_id || value?.template_id || value?.id || null;
      const templateName =
        value?.message_template_name ||
        value?.name ||
        value?.template_name ||
        null;
      const templateLanguage =
        value?.message_template_language || value?.language || "en_US";
      const templateStatus = normalizeMetaTemplateStatus(
        value?.event ||
          value?.status ||
          value?.message_template_status ||
          "PENDING",
      );
      const rejectionReason =
        value?.reason ||
        value?.rejected_reason ||
        value?.disable_info?.reason ||
        value?.message_template_rejected_reason ||
        null;

      webhookLog("template.status.normalized", {
        requestId,
        wabaId: wabaId || null,
        templateId,
        templateName,
        templateLanguage,
        templateStatus,
        rejectionReason,
      });

      if (!templateName && !templateId) {
        webhookLog("template.status.no_identity.stop", { requestId });
        continue;
      }

      let query = supabase
        .from("w_template_submissions")
        .select(
          "id, organization_id, wa_account_id, name, language, category, components, normalized_payload",
        );
      if (templateId) query = query.eq("template_id", templateId);
      else
        query = query.eq("name", templateName).eq("language", templateLanguage);
      if (wabaId) query = query.eq("waba_id", wabaId);
      const { data: existing, error: templateLookupError } = await query.maybeSingle();
      if (templateLookupError) {
        webhookError("template.status.lookup.failed", templateLookupError, {
          requestId,
          templateId,
          templateName,
          templateLanguage,
          wabaId: wabaId || null,
        });
        continue;
      }

      if (existing) {
        webhookLog("template.status.lookup.ok", {
          requestId,
          localTemplateId: existing.id,
          organization_id: existing.organization_id,
        });

        if (templateStatus === "DELETED" || templateStatus === "DELETE") {
          const { error: delErr } = await supabase
            .from("w_template_submissions")
            .delete()
            .eq("id", existing.id);
          if (delErr) {
            console.warn("[Webhook] Template deletion from cache failed:", delErr.message);
          } else {
            console.log(`[Webhook] Deleted template "${existing.name}" (${existing.language}) because it was deleted on Meta.`);
          }
          io.to(`org:${existing.organization_id}`).emit(
            "template_status_updated",
            {
              name: existing.name,
              language: existing.language,
              status: "DELETED",
              rejected_reason: rejectionReason,
            },
          );
        } else {
          await upsertLocalTemplateSubmission({
            organization_id: existing.organization_id,
            wa_account_id: existing.wa_account_id,
            waba_id: wabaId || existing.normalized_payload?.waba_id || null,
            template_id: templateId,
            name: existing.name,
            language: existing.language,
            category: value?.category || existing.category,
            status: templateStatus,
            quality_score: value?.quality_score || value?.quality || null,
            rejection_reason: rejectionReason,
            components: existing.components || [],
            normalized_payload: existing.normalized_payload || {},
            meta_response: value,
          });
          io.to(`org:${existing.organization_id}`).emit(
            "template_status_updated",
            {
              name: existing.name,
              language: existing.language,
              status: templateStatus,
              rejected_reason: rejectionReason,
            },
          );
        }
        webhookLog("template.status.socket_emit.ok", {
          requestId,
          organization_id: existing.organization_id,
          status: templateStatus,
        });
      } else {
        webhookLog("template.status.unknown", {
          requestId,
          templateId,
          templateName,
          templateLanguage,
          wabaId: wabaId || null,
        });
        console.warn(
          "[Templates] Status webhook received for unknown template:",
          value,
        );
      }
      continue;
    }

    // 1. Identify Organization & Account
    const phone_number_id = metadata?.phone_number_id;
    let organization_id = null;
    let wa_account_id = null;

    if (phone_number_id && supabase) {
      webhookLog("account.lookup.start", {
        requestId,
        phone_number_id,
      });
      const { data: acc, error: accountLookupError } = await supabase
        .from("w_wa_accounts")
        .select("id, organization_id")
        .eq("phone_number_id", phone_number_id)
        .maybeSingle();

      if (accountLookupError) {
        webhookError("account.lookup.failed", accountLookupError, {
          requestId,
          phone_number_id,
        });
      }

      if (acc) {
        organization_id = acc.organization_id;
        wa_account_id = acc.id;
        webhookLog("account.lookup.ok", {
          requestId,
          phone_number_id,
          organization_id,
          wa_account_id,
        });
      } else if (!accountLookupError) {
        webhookLog("account.lookup.empty", {
          requestId,
          phone_number_id,
        });
      }
    } else {
      webhookLog("account.lookup.skipped", {
        requestId,
        hasPhoneNumberId: !!phone_number_id,
        hasSupabase: !!supabase,
      });
    }

    if (!organization_id) {
      if (phone_number_id === "123456123") {
        console.log("✅ Received Test Webhook from Meta Developer Portal. Webhook connection is successful!");
        continue;
      }

      webhookError("account.mapping.missing", new Error("Phone number ID is not mapped to an organization"), {
        requestId,
        phone_number_id: phone_number_id || null,
        display_phone_number: metadata?.display_phone_number || null,
      });
      console.error(
        `❌ Webhook Error: Phone ID ${phone_number_id} not mapped to any organization.`,
      );
      continue;
    }

    // 2. Handle Messages (Inbound)
    for (const msg of value.messages || []) {
      const contacts = value.contacts || [];

      const from = msg.from; // wa_id
      const profileName =
        contacts.find((contact: any) => contact?.wa_id === from)?.profile?.name ||
        contacts[0]?.profile?.name ||
        null;
      const wa_message_id = msg.id;

      let type = msg.type;
      let text = "";
      let interactivePayload: any = null; // button/list reply ka raw data

      webhookLog("message.start", {
        requestId,
        wa_message_id,
        from,
        type,
        organization_id,
        wa_account_id,
        hasProfileName: !!profileName,
      });

      if (type === "reaction") {
        const targetWaId = msg.reaction?.message_id || null;
        const emoji =
          typeof msg.reaction?.emoji === "string"
            ? msg.reaction.emoji.trim()
            : "";

        if (targetWaId) {
          webhookLog("reaction.lookup.start", {
            requestId,
            targetWaId,
            from,
            hasEmoji: !!emoji,
          });
          const { data: target, error: targetErr } = await supabase
            .from("w_messages")
            .select("id, conversation_id, reactions")
            .eq("organization_id", organization_id)
            .eq("wa_message_id", targetWaId)
            .maybeSingle();

          if (targetErr) {
            webhookError("reaction.lookup.failed", targetErr, {
              requestId,
              targetWaId,
            });
          }

          if (!targetErr && target) {
            const nextReactions = applyReactionUpdate(
              target.reactions,
              emoji || null,
              from,
            );
            const { error: updErr } = await supabase
              .from("w_messages")
              .update({ reactions: nextReactions })
              .eq("id", target.id)
              .eq("organization_id", organization_id);

            if (updErr) {
              webhookError("reaction.update.failed", updErr, {
                requestId,
                targetWaId,
                message_id: target.id,
              });
              console.error("Failed to update Cloud reaction", updErr);
            } else {
              io.to(`org:${organization_id}`).emit("message_updated", {
                conversation_id: target.conversation_id,
                message_id: target.id,
                wa_message_id: targetWaId,
                reactions: nextReactions,
              });
              webhookLog("reaction.update.ok", {
                requestId,
                targetWaId,
                message_id: target.id,
                conversation_id: target.conversation_id,
                reactionsCount: nextReactions.length,
              });
            }
          } else if (!targetErr) {
            webhookLog("reaction.lookup.empty", {
              requestId,
              targetWaId,
            });
          }
        }
        webhookLog("reaction.stop", { requestId, targetWaId });
        continue;
      }

      // REPLACED: Updated type extraction logic for interactive/buttons
      if (type === "text") {
        text = msg.text?.body || "";
      } else if (type === "interactive") {
        interactivePayload = msg.interactive;
        text =
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          msg.interactive?.button_reply?.id ||
          msg.interactive?.list_reply?.id ||
          `[interactive:${msg.interactive.type}]`;
      } else if (type === "button") {
        text = msg.button?.text || "";
      } else if (type === "image") {
        text = msg.image?.caption || "[Image]";
      } else if (type === "video") {
        text = msg.video?.caption || "[Video]";
      } else if (type === "audio") {
        text = "[Audio]";
      } else if (type === "document") {
        text = msg.document?.filename || "[Document]";
      } else {
        text = `[${type}]`;
      }

      webhookLog("message.normalized", {
        requestId,
        wa_message_id,
        type,
        textPreview: text ? text.slice(0, 120) : "",
        hasInteractivePayload: !!interactivePayload,
      });

      // Ensure wa_account exists so conversations FK/unique constraints work
      if (!wa_account_id && phone_number_id && supabase) {
        webhookLog("account.fallback_upsert.start", {
          requestId,
          phone_number_id,
          organization_id,
        });
        const { data: newAcc, error: fallbackUpsertError } = await supabase
          .from("w_wa_accounts")
          .upsert(
            {
              organization_id,
              phone_number_id,
              display_phone_number:
                metadata?.display_phone_number || phone_number_id,
              access_token_encrypted: null,
              status: "pending",
            },
            { onConflict: "phone_number_id" },
          )
          .select("id")
          .single();
        if (fallbackUpsertError) {
          webhookError("account.fallback_upsert.failed", fallbackUpsertError, {
            requestId,
            phone_number_id,
            organization_id,
          });
        }
        wa_account_id = newAcc?.id || null;
        webhookLog("account.fallback_upsert.done", {
          requestId,
          wa_account_id,
        });
      }

      // A. Upsert Contact
      webhookLog("contact.upsert.start", {
        requestId,
        organization_id,
        wa_account_id,
        from,
        hasProfileName: !!profileName,
      });
      const contact = await upsertContact(
        organization_id,
        wa_account_id,
        from,
        profileName,
      );
      webhookLog("contact.upsert.ok", {
        requestId,
        contact_id: contact?.id || null,
      });

      // B. Upsert Conversation
      webhookLog("conversation.upsert.start", {
        requestId,
        organization_id,
        wa_account_id,
        contact_id: contact.id,
      });
      const conv = await upsertConversation(
        organization_id,
        wa_account_id,
        contact.id,
        {
          direction: "inbound",
          preview: text,
        },
      );
      webhookLog("conversation.upsert.ok", {
        requestId,
        conversation_id: conv?.id || null,
      });

      // Quoted/Reply context extract karo
      let quotedMessage: any = null;
      const isForwarded = !!(
        msg.context?.forwarded || msg.context?.frequently_forwarded
      );
      if (msg.context?.id) {
        webhookLog("quoted.lookup.start", {
          requestId,
          quotedWaMessageId: msg.context.id,
        });
        // DB mein quoted message dhundo
        const { data: quotedMsg } = await supabase
          .from("w_messages")
          .select("id, text_body, type, content, wa_message_id, direction")
          .eq("wa_message_id", msg.context.id)
          .maybeSingle();

        quotedMessage = {
          wa_message_id: msg.context.id,
          from: msg.context.from || null,
          // Agar DB mein mila toh uska text use karo
          text: quotedMsg?.text_body || quotedMsg?.content?.text || null,
          type: quotedMsg?.type || "text",
          direction: quotedMsg?.direction || null,
          found: !!quotedMsg,
        };
        webhookLog("quoted.lookup.done", {
          requestId,
          quotedWaMessageId: msg.context.id,
          found: !!quotedMsg,
        });
      }

      // PRE-DEFINE CONTENT (Media will update this row later)
      const enrichedContent: any = {
        text,
        raw: msg,
        quoted: quotedMessage,
        forwarded: isForwarded,
        frequently_forwarded: !!msg.context?.frequently_forwarded,
      };

      // C. Insert Message
      webhookLog("message.store.start", {
        requestId,
        wa_message_id,
        conversation_id: conv.id,
        contact_id: contact.id,
        type,
      });
      const storedInbound = await storeMessage({
        organization_id,
        contact_id: contact.id,
        conversation_id: conv.id, // TS fix needed? Cast in storeMessage helper
        wa_message_id,
        direction: "inbound",
        type,
        content: enrichedContent,
        status: "delivered",
        sender_type: "customer",
        automation_source: "webhook",
      } as any);
      webhookLog("message.store.ok", {
        requestId,
        message_id: storedInbound?.id || null,
        wa_message_id,
        created_at: storedInbound?.created_at || null,
      });

      // D. Emit Realtime
      // Emit to org room
      io.to(`org:${organization_id}`).emit("new_message", {
        from,
        phone: from,
        text,
        quoted: quotedMessage || null,
        forwarded: isForwarded,
        sender: "user",
        conversation_id: conv.id,
        contact_id: contact.id,
        message_id: storedInbound?.id || null,
        wa_message_id,
        created_at: storedInbound?.created_at || new Date().toISOString(),
        status: "delivered",
        name: profileName,
        connectedAccount: metadata?.display_phone_number,
        type,
        ...(enrichedContent?.media_url
          ? { media_url: enrichedContent.media_url }
          : {}),
        ...(enrichedContent?.mime_type
          ? { mime_type: enrichedContent.mime_type }
          : {}),
        ...(enrichedContent?.file_name
          ? { file_name: enrichedContent.file_name }
          : {}),
      });
      webhookLog("socket.emit.new_message.ok", {
        requestId,
        room: `org:${organization_id}`,
        conversation_id: conv.id,
        message_id: storedInbound?.id || null,
        wa_message_id,
      });

      // If media, download from Meta and store in Supabase Storage
      if (["image", "video", "audio", "document"].includes(type)) {
        webhookLog("media.async.start", {
          requestId,
          type,
          wa_message_id,
          storedMessageId: storedInbound?.id || null,
        });
        // RUN THIS ASYNC TO NOT BLOCK THE THREAD
        (async () => {
          const mediaId =
            type === "image"
              ? msg.image?.id
              : type === "video"
                ? msg.video?.id
                : type === "audio"
                  ? msg.audio?.id
                  : type === "document"
                    ? msg.document?.id
                    : null;

          if (mediaId && phone_number_id) {
            try {
              webhookLog("media.download.start", {
                requestId,
                mediaId,
                phone_number_id,
                type,
              });
              const downloaded = await downloadMetaMedia({
                phone_number_id,
                mediaId,
              });
              if (downloaded) {
                webhookLog("media.download.ok", {
                  requestId,
                  mediaId,
                  mimeType: downloaded.mimeType,
                  fileName: downloaded.fileName,
                  size: downloaded.buffer?.length || null,
                });
                const uploaded = await uploadMediaToStorage({
                  organization_id,
                  conversation_id: conv.id,
                  fileName: downloaded.fileName,
                  mimeType: downloaded.mimeType,
                  buffer: downloaded.buffer,
                });
                webhookLog("media.storage.upload.ok", {
                  requestId,
                  mediaId,
                  hasPublicUrl: !!uploaded?.publicUrl,
                });

                const caption =
                  type === "image"
                    ? msg.image?.caption || null
                    : type === "video"
                      ? msg.video?.caption || null
                      : type === "document"
                        ? msg.document?.caption || null
                        : null;

                const finalMediaContent = {
                  text: caption,
                  media_url: uploaded.publicUrl,
                  mime_type: downloaded.mimeType,
                  file_name: downloaded.fileName,
                  quoted: quotedMessage,
                  forwarded: isForwarded,
                  frequently_forwarded: !!msg.context?.frequently_forwarded,
                  raw: msg,
                };

                // UPDATE THE MESSAGE CONTENT IN DB AFTER UPLOAD
                if (storedInbound?.id) {
                  const { error: mediaUpdateError } = await supabase
                    .from("w_messages")
                    .update({ content: finalMediaContent })
                    .eq("id", storedInbound.id);
                  if (mediaUpdateError) {
                    webhookError("media.message_update.failed", mediaUpdateError, {
                      requestId,
                      message_id: storedInbound.id,
                      mediaId,
                    });
                  } else {
                    webhookLog("media.message_update.ok", {
                      requestId,
                      message_id: storedInbound.id,
                      mediaId,
                    });
                  }
                  // EMIT UPDATE TO FRONTEND
                  io.emit("message_updated", {
                    message_id: storedInbound.id,
                    content: finalMediaContent,
                  });
                  webhookLog("socket.emit.message_updated.ok", {
                    requestId,
                    message_id: storedInbound.id,
                    mediaId,
                  });
                }
              } else {
                webhookLog("media.download.empty", {
                  requestId,
                  mediaId,
                  type,
                });
              }
            } catch (mediaErr: any) {
              webhookError("media.async.failed", mediaErr, {
                requestId,
                mediaId,
                type,
                storedMessageId: storedInbound?.id || null,
              });
            }
          } else {
            webhookLog("media.async.skipped", {
              requestId,
              reason: "Missing mediaId or phone_number_id",
              hasMediaId: !!mediaId,
              hasPhoneNumberId: !!phone_number_id,
              type,
            });
          }
        })();
      }

      // E. Bot Auto-Reply
      try {
        // Send Meta WhatsApp typing indicator immediately & non-blockingly if bot is enabled for automated response
        const isBotEnabled = conv?.bot_enabled !== false;
        if (isBotEnabled && phone_number_id && wa_message_id) {
          webhookLog("typing_indicator.async.dispatch", {
            requestId,
            phone_number_id,
            wa_message_id,
            conversation_id: conv.id,
          });
          sendTypingIndicator({
            phone_number_id,
            message_id: wa_message_id,
          }).catch((err: any) => {
            webhookError("typing_indicator.async.failed", err, {
              requestId,
              wa_message_id,
              phone_number_id,
            });
          });
        }

        // Intercept human handoff request via button selection or keyword
        const incomingText = text?.toLowerCase().trim();
        const interactiveId = msg.interactive?.button_reply?.id || null;

        const isHandoffRequest =
          incomingText === "talk to human" ||
          incomingText === "human" ||
          interactiveId === "talk_to_agent";

        if (isHandoffRequest) {
          webhookLog("bot.handoff_intercepted", {
            requestId,
            conversation_id: conv.id,
            interactiveId,
            incomingText,
          });

          await supabase
            .from("w_conversations")
            .update({
              bot_enabled: false,
              handoff_status: "handoff_requested",
              handoff_requested_at: new Date().toISOString(),
              handoff_reason: `User requested stop with: ${interactiveId ? `button "${interactiveId}"` : `keyword "${text}"`}`,
            })
            .eq("id", conv.id);

          const autoReplyText = "I have paused the AI assistant. A human agent will connect with you shortly.";
          const sendResult = await sendTextMessage(from, autoReplyText, phone_number_id);
          const botWaMessageId = sendResult?.messages?.[0]?.id || null;

          const storedBotReply = await storeMessage({
            organization_id,
            contact_id: contact.id,
            conversation_id: conv.id,
            wa_message_id: botWaMessageId,
            direction: "outbound",
            type: "text",
            content: { text: autoReplyText },
            status: "sent",
            is_bot_reply: true,
            sender_type: "ai_agent",
            automation_source: "ai_agent",
          } as any);

          io.emit("new_message", {
            from: metadata?.display_phone_number || phone_number_id,
            phone: from,
            text: autoReplyText,
            sender: "agent",
            conversation_id: conv.id,
            contact_id: contact.id,
            message_id: storedBotReply?.id || null,
            wa_message_id: botWaMessageId,
            created_at: storedBotReply?.created_at || new Date().toISOString(),
            connectedAccount: metadata?.display_phone_number,
            type: "text",
            is_bot_reply: true,
          });

          continue; // Skip standard flow and AI process
        }

        let flowConsumedMessage = false;

        // Flow engine: text + button replies + interactive replies sab process karo
        const isFlowEligible =
          (type === "text" || type === "interactive" || type === "button") &&
          text;

        if (isFlowEligible) {
          webhookLog("flow.process.start", {
            requestId,
            conversation_id: conv.id,
            contact_id: contact.id,
            type,
            textPreview: text.slice(0, 120),
          });
          const flowResult = await processFlowEngine(
            organization_id,
            contact.id,
            conv.id,
            text,
            storedInbound?.id || null,
            conv.wa_account_id || null,
          );
          webhookLog("flow.process.done", {
            requestId,
            consumed: !!flowResult?.consumed,
            hasOutput: !!flowResult?.output,
            hasInteractive: !!flowResult?.interactive,
            mediaCount: Array.isArray(flowResult?.media) ? flowResult.media.length : 0,
            flow_id: flowResult?.flow_id || null,
          });
          if (flowResult?.consumed) {
            flowConsumedMessage = true;

            // 1. Send preceding text output if present
            if (flowResult.output) {
              console.log(
                `🌊 Flow Engine replied with text to: "${text.substring(0, 50)}"`,
              );
              const sendResult = await sendTextMessage(
                from,
                flowResult.output,
                phone_number_id,
              );
              const botWaMessageId = sendResult?.messages?.[0]?.id || null;

              const storedBotReply = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id,
                wa_message_id: botWaMessageId,
                direction: "outbound",
                type: "text",
                content: { text: flowResult.output, is_flow: true },
                status: "sent",
                is_bot_reply: true,
                sender_type: "ai_agent",
                automation_source: "flow",
                metadata: {
                  flow_id: flowResult.flow_id,
                  flow_version_id: flowResult.flow_version_id,
                  flow_session_id: flowResult.flow_session_id,
                  flow_run_id: flowResult.flow_run_id,
                  flow_node_id: flowResult.flow_node_id,
                  handoff: flowResult.handoff === true,
                },
              } as any);

              io.emit("new_message", {
                from: metadata?.display_phone_number || phone_number_id,
                phone: from,
                text: flowResult.output,
                sender: "agent",
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedBotReply?.id || null,
                wa_message_id: botWaMessageId,
                created_at:
                  storedBotReply?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number,
                type: "text",
                is_bot_reply: true,
              });
              webhookLog("flow.reply.text.sent", {
                requestId,
                botWaMessageId,
                storedMessageId: storedBotReply?.id || null,
              });
            }

            // 2. Send interactive buttons if present
            if (flowResult.interactive?.type === "button" || flowResult.interactive?.type === "cta_url") {
              console.log(`🔘 Flow Engine sending real buttons`);
              const { body, buttons, footer } = flowResult.interactive;
              const sendResult = await sendInteractiveButtons(
                from,
                body,
                buttons || [],
                footer,
                phone_number_id,
              );
              const botWaMessageId = sendResult?.messages?.[0]?.id || null;

              const storedBotReply = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id,
                wa_message_id: botWaMessageId,
                direction: "outbound",
                type: "interactive",
                content: {
                  text: body,
                  interactive: flowResult.interactive,
                  is_flow: true,
                },
                status: "sent",
                is_bot_reply: true,
                sender_type: "ai_agent",
                automation_source: "flow",
                metadata: {
                  flow_id: flowResult.flow_id,
                  flow_version_id: flowResult.flow_version_id,
                  flow_session_id: flowResult.flow_session_id,
                  flow_run_id: flowResult.flow_run_id,
                  flow_node_id: flowResult.flow_node_id,
                  handoff: flowResult.handoff === true,
                },
              } as any);

              io.emit("new_message", {
                from: metadata?.display_phone_number || phone_number_id,
                phone: from,
                text: body,
                sender: "agent",
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedBotReply?.id || null,
                wa_message_id: botWaMessageId,
                created_at:
                  storedBotReply?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number,
                type: "interactive",
                is_bot_reply: true,
              });
              webhookLog("flow.reply.buttons.sent", {
                requestId,
                botWaMessageId,
                storedMessageId: storedBotReply?.id || null,
                buttonsCount: Array.isArray(buttons) ? buttons.length : 0,
              });
            } else if (flowResult.interactive?.type === "list") {
              console.log(`🔘 Flow Engine sending native interactive list menu`);
              const { body, buttonText, sections, footer } = flowResult.interactive;
              const sendResult = await sendInteractiveList(
                from,
                body,
                buttonText || "Select",
                sections || [],
                footer,
                phone_number_id,
              );
              const botWaMessageId = sendResult?.messages?.[0]?.id || null;

              const storedBotReply = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id,
                wa_message_id: botWaMessageId,
                direction: "outbound",
                type: "interactive",
                content: {
                  text: body,
                  interactive: flowResult.interactive,
                  is_flow: true,
                },
                status: "sent",
                is_bot_reply: true,
                sender_type: "ai_agent",
                automation_source: "flow",
                metadata: {
                  flow_id: flowResult.flow_id,
                  flow_version_id: flowResult.flow_version_id,
                  flow_session_id: flowResult.flow_session_id,
                  flow_run_id: flowResult.flow_run_id,
                  flow_node_id: flowResult.flow_node_id,
                  handoff: flowResult.handoff === true,
                },
              } as any);

              io.emit("new_message", {
                from: metadata?.display_phone_number || phone_number_id,
                phone: from,
                text: body,
                sender: "agent",
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedBotReply?.id || null,
                wa_message_id: botWaMessageId,
                created_at: storedBotReply?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number,
                type: "interactive",
                is_bot_reply: true,
              });
              webhookLog("flow.reply.list.sent", {
                requestId,
                botWaMessageId,
                storedMessageId: storedBotReply?.id || null,
              });
            }

            // 3. Send media nodes as real WhatsApp attachments.
            if (
              Array.isArray(flowResult.media) &&
              flowResult.media.length > 0
            ) {
              for (const media of flowResult.media) {
                try {
                  const sentMedia = await sendFlowMediaMessageMeta({
                    phone_number_id,
                    to: from,
                    media,
                  });
                  const preview =
                    media.caption ||
                    (media.type === "image"
                      ? "[Image]"
                      : media.type === "video"
                        ? "[Video]"
                        : media.type === "audio"
                          ? "[Audio]"
                          : "[Document]");

                  const storedBotMedia = await storeMessage({
                    organization_id,
                    contact_id: contact.id,
                    conversation_id: conv.id,
                    wa_message_id: sentMedia.wa_message_id,
                    direction: "outbound",
                    type: media.type,
                    content: {
                      text: media.caption || null,
                      media_url: sentMedia.media_url,
                      mime_type: sentMedia.mime_type,
                      file_name: sentMedia.file_name,
                      size: sentMedia.size,
                      is_flow: true,
                      raw_send: sentMedia.raw,
                    },
                    status: "sent",
                    is_bot_reply: true,
                    sender_type: "ai_agent",
                    automation_source: "flow",
                    metadata: {
                      flow_id: flowResult.flow_id,
                      flow_version_id: flowResult.flow_version_id,
                      flow_session_id: flowResult.flow_session_id,
                      flow_run_id: flowResult.flow_run_id,
                      flow_node_id: flowResult.flow_node_id,
                      handoff: flowResult.handoff === true,
                    },
                  } as any);

                  io.emit("new_message", {
                    from: metadata?.display_phone_number || phone_number_id,
                    phone: from,
                    text: preview,
                    sender: "agent",
                    conversation_id: conv.id,
                    contact_id: contact.id,
                    message_id: storedBotMedia?.id || null,
                    wa_message_id: sentMedia.wa_message_id,
                    created_at:
                      storedBotMedia?.created_at || new Date().toISOString(),
                    connectedAccount: metadata?.display_phone_number,
                    type: media.type,
                    media_url: sentMedia.media_url,
                    mime_type: sentMedia.mime_type,
                    file_name: sentMedia.file_name,
                    is_bot_reply: true,
                  });
                  webhookLog("flow.reply.media.sent", {
                    requestId,
                    mediaType: media.type,
                    botWaMessageId: sentMedia.wa_message_id,
                    storedMessageId: storedBotMedia?.id || null,
                  });
                } catch (mediaErr: any) {
                  webhookError("flow.reply.media.failed", mediaErr, {
                    requestId,
                    mediaType: media?.type || null,
                  });
                  console.error(
                    "[Flow] Failed to send media node:",
                    mediaErr?.message || mediaErr,
                  );
                }
              }
            }

            // Update conversation preview
            const lastMedia = Array.isArray(flowResult.media)
              ? flowResult.media[flowResult.media.length - 1]
              : null;
            const lastPreview = lastMedia
              ? lastMedia.caption ||
                (lastMedia.type === "document"
                  ? "[Document]"
                  : `[${lastMedia.type.charAt(0).toUpperCase()}${lastMedia.type.slice(1)}]`)
              : flowResult.interactive?.body || flowResult.output || "";
            await supabase
              .from("w_conversations")
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: lastPreview.substring(0, 100),
              })
              .eq("id", conv.id);
            webhookLog("flow.conversation_preview.updated", {
              requestId,
              conversation_id: conv.id,
              preview: lastPreview.substring(0, 100),
            });
          }
        } else {
          webhookLog("flow.process.skipped", {
            requestId,
            type,
            hasText: !!text,
          });
        }

        // Meta template quick replies arrive as `button`, while list/button
        // selections arrive as `interactive`. Their normalized text should
        // reach the AI fallback when no Flow Builder flow consumed the reply.
        const isAgentEligible =
          (type === "text" || type === "button" || type === "interactive") &&
          Boolean(text?.trim());

        if (!flowConsumedMessage && isAgentEligible) {
          webhookLog("bot_agent.process.queue", {
            requestId,
            conversation_id: conv.id,
            textPreview: text.slice(0, 120),
          });
          
          const debounceKey = conv.id;
          if (botDebounceMap.has(debounceKey)) {
              clearTimeout(botDebounceMap.get(debounceKey)!);
          }
          
          botDebounceMap.set(debounceKey, setTimeout(async () => {
              botDebounceMap.delete(debounceKey);
              
              // Ensure sequential processing per conversation
              const previousPromise = botLockMap.get(conv.id) || Promise.resolve();
              const currentPromise = previousPromise.then(async () => {
                  try {
                      const botResult = await getBotAgentReply({
                        organization_id,
                        conversation_id: conv.id,
                        text, // This will be the text of the LAST message sent within the 5 seconds
                      });
                      
                      webhookLog("bot_agent.process.done", {
                        requestId,
                        hasReply: !!botResult?.reply,
                        agentId: botResult?.agent?.id || null,
                        agentName: botResult?.agent?.name || null,
                      });
                      
                      if (botResult?.reply) {
                        let botWaMessageId: string | null = null;
                        let storedBotReply: any = null;

                        const isFallback = botResult.reply.startsWith("[FALLBACK]");
                        const cleanReply = botResult.reply.replace("[FALLBACK]", "").trim();

                        if (isFallback) {
                          console.log(`🤖 Bot "${botResult.agent?.name}" sending fallback interactive buttons`);
                          const buttonBody = cleanReply || "I couldn't find an answer to your question. Please reply with \"human\" or click the button below to connect with a support agent.";
                          const fallbackButtons = [{ id: "talk_to_agent", text: "Talk to Agent" }];

                          const sendResult = await sendInteractiveButtons(
                            from,
                            buttonBody,
                            fallbackButtons,
                            "Choose an option",
                            phone_number_id
                          );
                          botWaMessageId = sendResult?.messages?.[0]?.id || null;

                          storedBotReply = await storeMessage({
                            organization_id,
                            contact_id: contact.id,
                            conversation_id: conv.id,
                            wa_message_id: botWaMessageId,
                            direction: "outbound",
                            type: "interactive",
                            content: {
                              text: buttonBody,
                              interactive: {
                                type: "button",
                                body: buttonBody,
                                buttons: fallbackButtons,
                              },
                              is_bot_reply: true,
                              bot_agent_id: botResult.agent?.id,
                              bot_agent_name: botResult.agent?.name,
                            },
                            status: "sent",
                            is_bot_reply: true,
                            bot_agent_id: botResult.agent?.id || null,
                            sender_type: "ai_agent",
                            automation_source: "ai_agent",
                          } as any);

                          io.emit("new_message", {
                            from: metadata?.display_phone_number || phone_number_id,
                            phone: from,
                            text: buttonBody,
                            sender: "agent",
                            conversation_id: conv.id,
                            contact_id: contact.id,
                            message_id: storedBotReply?.id || null,
                            wa_message_id: botWaMessageId,
                            created_at: storedBotReply?.created_at || new Date().toISOString(),
                            connectedAccount: metadata?.display_phone_number,
                            type: "interactive",
                            content: {
                              text: buttonBody,
                              interactive: {
                                type: "button",
                                body: buttonBody,
                                buttons: fallbackButtons,
                              }
                            },
                            is_bot_reply: true,
                          });
                        } else {
                          console.log(`🤖 Bot "${botResult.agent?.name}" replying`);
                          const sendResult = await sendTextMessage(
                            from,
                            botResult.reply,
                            phone_number_id,
                          );
                          botWaMessageId = sendResult?.messages?.[0]?.id || null;
                          storedBotReply = await storeMessage({
                            organization_id,
                            contact_id: contact.id,
                            conversation_id: conv.id,
                            wa_message_id: botWaMessageId,
                            direction: "outbound",
                            type: "text",
                            content: {
                              text: botResult.reply,
                              bot_agent_id: botResult.agent?.id,
                              bot_agent_name: botResult.agent?.name,
                            },
                            status: "sent",
                            is_bot_reply: true,
                            bot_agent_id: botResult.agent?.id || null,
                            sender_type: "ai_agent",
                            automation_source: "ai_agent",
                          } as any);
                          io.emit("new_message", {
                            from: metadata?.display_phone_number || phone_number_id,
                            phone: from,
                            text: botResult.reply,
                            sender: "agent",
                            conversation_id: conv.id,
                            contact_id: contact.id,
                            message_id: storedBotReply?.id || null,
                            wa_message_id: botWaMessageId,
                            created_at:
                              storedBotReply?.created_at || new Date().toISOString(),
                            connectedAccount: metadata?.display_phone_number,
                            type: "text",
                            is_bot_reply: true,
                          });
                        }
                        
                        webhookLog("bot_agent.reply.sent", {
                          requestId,
                          botWaMessageId: botWaMessageId,
                          storedMessageId: storedBotReply?.id || null,
                          agentId: botResult.agent?.id || null,
                        });

                        // Update conversation preview
                        await supabase
                          .from("w_conversations")
                          .update({
                            last_message_at: new Date().toISOString(),
                            last_message_preview: botResult.reply.substring(0, 100),
                          })
                          .eq("id", conv.id);
                        webhookLog("bot_agent.conversation_preview.updated", {
                          requestId,
                          conversation_id: conv.id,
                        });
                      }
                  } catch (err) {
                      console.error("[Bot Lock] Error generating reply for conversation:", conv.id, err);
                  }
              });
              
              botLockMap.set(conv.id, currentPromise);
              
          }, 5000));

        } else if (!flowConsumedMessage) {
          webhookLog("bot_agent.process.skipped", {
            requestId,
            type,
            hasText: !!text,
            flowConsumedMessage,
            isAgentEligible,
          });
        }
      } catch (botErr: any) {
        webhookError("automation.failed", botErr, {
          requestId,
          conversation_id: conv?.id || null,
          wa_message_id,
        });
        console.error("Bot auto-reply error:", botErr.message || botErr);
      }
      
      // Auto assign the conversation
      performAutoAssignment(organization_id, conv.id).catch(err => {
        console.error("Error running auto assignment for inbound webhook message:", err);
      });
    }

    // 3. Handle Status Updates (Sent/Delivered/Read)
    for (const status of value.statuses || []) {
      const wa_message_id = status.id;
      const newStatus = status.status; // sent, delivered, read
      const errorMessage = getMetaStatusErrorMessage(status);

      webhookLog("status.start", {
        requestId,
        wa_message_id,
        status: newStatus,
        recipient_id: status.recipient_id || null,
        timestamp: status.timestamp || null,
        hasError: !!errorMessage,
        errorMessage,
      });

      const { data: existingMessage, error: existingMessageError } = await supabase
        .from("w_messages")
        .select("id, content, metadata, automation_source")
        .eq("wa_message_id", wa_message_id)
        .maybeSingle();

      if (existingMessageError) {
        webhookError("status.message_lookup.failed", existingMessageError, {
          requestId,
          wa_message_id,
        });
      }

      const nextContent =
        existingMessage?.content && typeof existingMessage.content === "object"
          ? { ...existingMessage.content }
          : {};
      nextContent.meta_status = status;
      if (errorMessage) nextContent.meta_status_error = errorMessage;

      const nextMetadata =
        existingMessage?.metadata && typeof existingMessage.metadata === "object"
          ? { ...existingMessage.metadata }
          : {};
      nextMetadata.last_meta_status = newStatus;
      if (errorMessage) nextMetadata.last_meta_error = errorMessage;

      // Update message status in DB
      const { error: statusUpdateError } = await supabase
        .from("w_messages")
        .update({
          status: newStatus,
          content: nextContent,
          metadata: nextMetadata,
        })
        .eq("wa_message_id", wa_message_id);

      if (statusUpdateError) {
        webhookError("status.message_update.failed", statusUpdateError, {
          requestId,
          wa_message_id,
          status: newStatus,
        });
      } else {
        webhookLog("status.message_update.ok", {
          requestId,
          wa_message_id,
          status: newStatus,
        });
      }

      // Sync status update to whatsapp_message_usage_logs for analytics accuracy
      const { data: usageLogRows, error: logUpdateError } = await supabase
        .from("whatsapp_message_usage_logs")
        .update({ delivery_status: newStatus })
        .eq("wa_message_id", wa_message_id)
        .select("id");

      if (logUpdateError) {
        webhookError("status.log_update.failed", logUpdateError, {
          requestId,
          wa_message_id,
          status: newStatus,
        });
      } else if (!Array.isArray(usageLogRows) || usageLogRows.length === 0) {
        webhookError("status.log_update.no_rows", new Error("Usage log update matched zero rows"), {
          requestId,
          wa_message_id,
          status: newStatus,
        });
      }

      let wasRefundedByMessageDebit = false;
      if (newStatus === "failed") {
        try {
          const refundResult: any = await refundWhatsappMessage(wa_message_id);
          if (refundResult?.success) {
            wasRefundedByMessageDebit = true;
          } else if (
            refundResult?.reason === "already_refunded_recipient" ||
            refundResult?.reason === "already_refunded_status" ||
            refundResult?.reason === "already_refunded_idempotency"
          ) {
            wasRefundedByMessageDebit = true;
          }
          webhookLog("status.refund.result", {
            requestId,
            wa_message_id,
            success: !!refundResult?.success,
            reason: refundResult?.reason || refundResult?.error || null,
            refunded_amount: refundResult?.refunded_amount ?? null,
            new_balance: refundResult?.new_balance ?? null,
          });
        } catch (refundErr: any) {
          webhookError("status.refund.failed", refundErr, {
            requestId,
            wa_message_id,
          });
        }
      }

      const campaignId = nextMetadata.campaign_id || null;
      if (campaignId && existingMessage?.automation_source === "broadcast") {
        const { data: campaign, error: campaignLookupError } = await supabase
          .from("w_campaigns")
          .select("id, results, schema_version")
          .eq("id", campaignId)
          .maybeSingle();

        if (campaignLookupError) {
          webhookError("status.campaign_lookup.failed", campaignLookupError, {
            requestId,
            campaignId,
            wa_message_id,
          });
        } else if (campaign?.id && campaign.schema_version >= 2 && !wasRefundedByMessageDebit) {
          const { error: recipientStatusError } = await supabase.rpc(
            "update_broadcast_recipient_delivery",
            {
              p_wa_message_id: wa_message_id,
              p_status: newStatus,
              p_error_message: errorMessage,
            },
          );
          if (recipientStatusError) {
            webhookError("status.campaign_recipient_update.failed", recipientStatusError, {
              requestId,
              campaignId,
              wa_message_id,
              status: newStatus,
            });
          } else {
            webhookLog("status.campaign_recipient_update.ok", {
              requestId,
              campaignId,
              wa_message_id,
              status: newStatus,
            });
          }
        } else if (campaign?.id && campaign.schema_version >= 2 && wasRefundedByMessageDebit) {
          webhookLog("status.campaign_recipient_update.skipped_exact_debit", {
            requestId,
            campaignId,
            wa_message_id,
            status: newStatus,
          });
        } else if (campaign?.id && Array.isArray(campaign.results)) {
          let matched = false;
          const nextResults = campaign.results.map((result: any) => {
            const sameMessage = result?.wa_message_id && result.wa_message_id === wa_message_id;
            const samePhone =
              nextMetadata.recipient &&
              String(result?.phone || "") === String(nextMetadata.recipient);
            if (!sameMessage && !samePhone) return result;
            matched = true;
            return {
              ...result,
              wa_message_id,
              delivery_status: newStatus,
              status: newStatus === "failed" ? "failed" : result.status || "sent",
              error: errorMessage || result.error || null,
              meta_status_timestamp: status.timestamp || null,
            };
          });

          if (matched) {
            const sentCount = nextResults.filter((result: any) => result.status !== "failed").length;
            const failedCount = nextResults.filter((result: any) => result.status === "failed").length;
            const deliveredCount = nextResults.filter((result: any) =>
              ["delivered", "read"].includes(result.status) ||
              ["delivered", "read"].includes(result.delivery_status)
            ).length;
            const readCount = nextResults.filter((result: any) =>
              result.status === "read" ||
              result.delivery_status === "read"
            ).length;

            const campaignUpdatePayload: any = {
              results: nextResults,
              sent_count: sentCount,
              delivered_count: deliveredCount,
              read_count: readCount,
              failed_count: failedCount,
            };
            if (failedCount === nextResults.length) {
              campaignUpdatePayload.billing_status = "failed";
            }
            const { error: campaignUpdateError } = await supabase
              .from("w_campaigns")
              .update(campaignUpdatePayload)
              .eq("id", campaign.id);


            if (campaignUpdateError) {
              webhookError("status.campaign_update.failed", campaignUpdateError, {
                requestId,
                campaignId,
                wa_message_id,
              });
            } else {
              webhookLog("status.campaign_update.ok", {
                requestId,
                campaignId,
                wa_message_id,
                status: newStatus,
                sentCount,
                failedCount,
              });
            }
          } else {
            webhookLog("status.campaign_result_match.empty", {
              requestId,
              campaignId,
              wa_message_id,
              recipient: nextMetadata.recipient || null,
            });
          }

        }
      }

      // Refund is already handled asynchronously at the start of status loop execution if applicable

      io.emit("message_status_update", {
        wa_message_id,
        status: newStatus,
        error_message: errorMessage,
      });
      webhookLog("status.socket_emit.ok", {
        requestId,
        wa_message_id,
        status: newStatus,
      });

      // If "read", maybe mark conversation as read?
      // Usually "read" status on a message doesn't mean *we* read it, it means *user* read our message.
      // So we don't reset unread_count here.

      // Log event (optional)
      // await supabase.from('w_message_events').insert(...)
    }
    webhookLog("request.processed.done", {
      requestId,
      elapsedMs: Date.now() - startedAt,
      hadMessages: Array.isArray(value?.messages) && value.messages.length > 0,
      hadStatuses: Array.isArray(value?.statuses) && value.statuses.length > 0,
    });
    }
  } catch (e: any) {
    webhookError("request.unhandled", e, {
      requestId,
      elapsedMs: Date.now() - startedAt,
      stack: e?.stack || null,
    });
    console.error("Webhook Error:", e.message);
  }
}
