import * as fs from 'fs';
import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { storeMessage, upsertConversation } from './messages.service.js';
import { sessions, latestQrBySession, groupNameCache, profilePhotoCache, reconnectAttempts, MAX_RECONNECT_ATTEMPTS, initializingSessions, logger, GROUP_NAME_TTL_MS } from './whatsapp.service.js';
import { processFlowEngine } from './flows.service.js';
import { applyReactionUpdate } from './messages.sender.js';
import { uploadMediaToStorage } from './broadcast.service.js';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage,
    makeCacheableSignalKeyStore,
    Browsers,
    proto,
} from "@whiskeysockets/baileys";
import { upsertContact, sanitizeContactDisplayName, normalizeContactWaIdForStorage, pickBestBaileysContactName } from './contacts.service.js';
import { getBotAgentReply } from './ai.service.js';
import { performAutoAssignment } from './assignment.service.js';


const botDebounceMap = new Map<string, NodeJS.Timeout>();
const botLockMap = new Map<string, Promise<void>>();

async function ensureDefaultOrganizationId(): Promise<string | null> {
    return null;
}

async function streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function upsertBaileysWaAccount(orgId: string | null | undefined, phone: string | null | undefined) {
    const cleanPhone = String(phone || '').replace(/\D+/g, '');
    if (!supabase || !orgId || !cleanPhone) return null;

    const { data, error } = await supabase.from('w_wa_accounts').upsert({
        organization_id: orgId,
        phone_number_id: cleanPhone,
        display_phone_number: cleanPhone,
        name: 'WhatsApp Account',
        status: 'connected',
    }, { onConflict: 'phone_number_id' }).select('id').single();

    if (error) {
        console.error("Failed to upsert Baileys wa_account:", error);
        return null;
    }

    return data?.id || null;
}

async function setupBaileys(sessionId: string, socket: any, orgIdFromRequest: string | null = null) {
    // CRITICAL FIX: Check concurrency lock
    if (initializingSessions.has(sessionId)) {
        console.log(`â³ Session ${sessionId} is already initializing. Skipping duplicate request.`);
        return;
    }

    // CRITICAL FIX: Check if session already exists to prevent multiple connections
    const existingSession = sessions.get(sessionId);
    if (existingSession) {
        console.log(`âš ï¸ Session ${sessionId} already active, reusing existing connection`);
        // Only report connected if we actually have a logged-in user on this socket.
        if (existingSession?.user?.id) socket.emit("status", "connected");
        else socket.emit("status", "connecting");

        // Emit info if available
        const connectedJid = existingSession.user?.id || "";
        const connectedAccount = connectedJid ? connectedJid.split(':')[0] : null;
        if (connectedAccount) {
            let existingOrgId = orgIdFromRequest || socket?.data?.organization_id || null;
            const sessionOrgFile = `baileys_auth_info/${sessionId}/org_id.txt`;
            if (!existingOrgId && fs.existsSync(sessionOrgFile)) {
                existingOrgId = fs.readFileSync(sessionOrgFile, 'utf8').trim();
            }
            await upsertBaileysWaAccount(existingOrgId, connectedAccount);
            socket.emit("connected_account", connectedAccount);
        }

        return existingSession;
    }

    initializingSessions.add(sessionId);

    try {
        const sessionDir = `baileys_auth_info/${sessionId}`;
        const orgFile = `${sessionDir}/org_id.txt`;

        // Create dir if needed
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Persist/Resolve Organization ID
        let organization_id = orgIdFromRequest;
        if (!organization_id && fs.existsSync(orgFile)) {
            organization_id = fs.readFileSync(orgFile, 'utf8').trim();
        }

        if (organization_id) {
            fs.writeFileSync(orgFile, organization_id);
        } else {
            // Check if we can find it in socket data
            organization_id = socket?.data?.organization_id || null;
            if (organization_id) {
                fs.writeFileSync(orgFile, organization_id);
            }
        }

        if (!organization_id) {
            console.warn(`⚠️ Cannot initialize Baileys session ${sessionId} - No Organization ID provided or persisted.`);
            initializingSessions.delete(sessionId);
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

        // Create a logger that's silent to avoid noise
        // Using the logger imported from whatsapp.service.js

        // Store messages for retry mechanism (fixes "Waiting for this message" issue)
        const msgRetryCounterCache = new Map<string, number>();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                // Use cacheable signal key store for better encryption key management
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            // CRITICAL: Proper browser identification for multi-device
            browser: Browsers.ubuntu('Chrome'),
            // Enable history sync
            syncFullHistory: true,
            // Needed to receive events for messages sent by this logged-in account
            emitOwnEvents: true,
            // QR will be handled via socket.emit to frontend
            printQRInTerminal: false,
            // Prevent connection being marked as stale too quickly
            defaultQueryTimeoutMs: 60000,
            // Keep online to maintain encryption key sync
            markOnlineOnConnect: true,
            // Generate high-quality link preview
            generateHighQualityLinkPreview: true,
            // Retry message handling
            msgRetryCounterCache: msgRetryCounterCache as any,
            // CRITICAL: This callback is called when a message needs to be resent
            getMessage: async (key) => {
                // Try to get message from database if we stored it
                if (key.id) {
                    try {
                        const { data } = await supabase
                            .from('w_messages')
                            .select('content')
                            .eq('wa_message_id', key.id)
                            .maybeSingle();
                        if (data?.content?.text) {
                            return proto.Message.fromObject({ conversation: data.content.text });
                        }
                    } catch (e) {
                        console.log('getMessage lookup failed:', e);
                    }
                }
                // Return undefined to let Baileys handle it
                return undefined;
            },
            logger,
        });

        sock.ev.on("creds.update", saveCreds);

        // Keep a small cache for account id for this socket.
        let cachedWaAccountId: string | null = null;
        const resolveOrgAndAccount = async () => {
            if (cachedWaAccountId) return { orgId: organization_id!, waAccountId: cachedWaAccountId };

            const orgId = organization_id!;

            const myJid = sock.user?.id || "";
            const myPhone = myJid.split(':')[0];
            if (!myPhone) return { orgId, waAccountId: null as any };

            const { data: acc } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('organization_id', orgId)
                .eq('phone_number_id', myPhone)
                .maybeSingle();

            let waAccountId = acc?.id || null;
            if (!waAccountId) {
                waAccountId = await upsertBaileysWaAccount(orgId, myPhone);
            }

            cachedWaAccountId = waAccountId;
            return { orgId, waAccountId };
        };

        // Persist contact names when Baileys provides them (notify/name/verifiedName).
        // This is the only reliable way to show names in the UI for Baileys sessions.
        const upsertBaileysContacts = async (contacts: any[]) => {
            try {
                if (!Array.isArray(contacts) || contacts.length === 0) return;

                const { orgId, waAccountId } = await resolveOrgAndAccount();
                if (!orgId || !waAccountId) return;

                for (const c of contacts) {
                    const jid = c?.id || c?.jid || c?.key || null;
                    const waId = normalizeContactWaIdForStorage(jid);
                    if (!waId) continue;

                    const name = pickBestBaileysContactName(c, waId);
                    if (!name) continue;

                    await upsertContact(orgId, waAccountId, waId, name);
                }
            } catch (err: any) {
                console.warn('âš ï¸ contacts sync failed:', err?.message || err);
            }
        };

        sock.ev.on('contacts.upsert', async (contacts: any[]) => {
            // Runs on initial sync and when new contacts are discovered.
            upsertBaileysContacts(contacts);
        });

        sock.ev.on('contacts.update', async (updates: any[]) => {
            // Runs when notify/name changes.
            upsertBaileysContacts(updates);
        });

        // âœ… NEW: Listen for incoming w_messages (new + history)
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            // type can be "notify" (new) or "append" (history sync)
            if (type !== "notify" && type !== "append") return;
            const isHistorySync = type === "append";

            console.log(`ðŸ“© messages.upsert type=${type} count=${messages?.length || 0}`);

            const orgId = organization_id || await ensureDefaultOrganizationId();
            if (!orgId) return;

            const myJid = sock.user?.id || "";
            const myPhone = myJid.split(':')[0];

            // Resolve wa_account_id once per batch
            const { data: acc } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('organization_id', orgId)
                .eq('phone_number_id', myPhone)
                .maybeSingle();

            let waAccountId = acc?.id;
            if (!waAccountId) {
                waAccountId = await upsertBaileysWaAccount(orgId, myPhone);
            }
            if (!waAccountId) return;

            for (const msg of messages) {
                try {
                    const isOutbound = msg.key.fromMe;
                    const remoteJid = msg.key.remoteJid || "";
                    if (!remoteJid) continue;

                    if (!isHistorySync) {
                        console.log(`   â†³ jid=${remoteJid} fromMe=${isOutbound} id=${msg.key.id || ''}`);
                    }

                    // Ignore status broadcast; keep groups and newsletters.
                    if (remoteJid === 'status@broadcast') continue;

                    const isGroup = remoteJid.endsWith('@g.us');
                    const isNewsletter = remoteJid.endsWith('@newsletter');

                    // For 1:1 store phone number only; for groups/newsletters store full JID.
                    const contactWaId = remoteJid.endsWith('@s.whatsapp.net')
                        ? remoteJid.split('@')[0]
                        : remoteJid;

                    const msgType = Object.keys(msg.message || {})[0] || '';
                    if (!msgType) continue;

                    let normalizedType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' = 'text';
                    let captionText = '';
                    let previewText = '';

                    // Reactions must patch the target message, not render as a new bubble.
                    if (msgType === 'reactionMessage') {
                        const reaction = (msg.message as any)?.reactionMessage;
                        const targetWaId = reaction?.key?.id || null;
                        const emoji = typeof reaction?.text === 'string' ? reaction.text.trim() : '';
                        const from = String((msg.key as any)?.participant || (msg as any)?.participant || contactWaId || 'unknown');

                        if (targetWaId) {
                            const { data: target, error: targetErr } = await supabase
                                .from('w_messages')
                                .select('id, conversation_id, reactions')
                                .eq('wa_message_id', targetWaId)
                                .maybeSingle();

                            if (!targetErr && target) {
                                const nextReactions = applyReactionUpdate(target.reactions, emoji || null, from);
                                const { error: updErr } = await supabase
                                    .from('w_messages')
                                    .update({ reactions: nextReactions })
                                    .eq('id', target.id);

                                if (updErr) {
                                    console.error('Failed to update reactions (did you run the migration?)', updErr);
                                } else if (!isHistorySync) {
                                    io.emit('message_updated', {
                                        conversation_id: target.conversation_id,
                                        message_id: target.id,
                                        wa_message_id: targetWaId,
                                        reactions: nextReactions,
                                    });
                                }
                            }
                        }
                        continue;
                    }

                    // Protocol/system noise should never render as chat bubbles.
                    if (msgType === 'protocolMessage') {
                        continue;
                    }

                    if (msgType === 'conversation') {
                        captionText = msg.message?.conversation || '';
                        previewText = captionText;
                    } else if (msgType === 'extendedTextMessage') {
                        captionText = msg.message?.extendedTextMessage?.text || '';
                        previewText = captionText;
                    } else if (msgType === 'imageMessage') {
                        normalizedType = 'image';
                        captionText = msg.message?.imageMessage?.caption || '';
                        previewText = captionText || '[Image]';
                    } else if (msgType === 'videoMessage') {
                        normalizedType = 'video';
                        captionText = msg.message?.videoMessage?.caption || '';
                        previewText = captionText || '[Video]';
                    } else if (msgType === 'documentMessage') {
                        normalizedType = 'document';
                        const fileName = msg.message?.documentMessage?.fileName || '';
                        const docCaption = (msg.message as any)?.documentMessage?.caption || '';
                        captionText = docCaption;
                        previewText = docCaption || fileName || '[Document]';
                    } else if (msgType === 'audioMessage') {
                        normalizedType = 'audio';
                        captionText = '';
                        previewText = '[Audio]';
                    } else if (msgType === 'stickerMessage') {
                        normalizedType = 'sticker';
                        captionText = '';
                        previewText = '[Sticker]';
                    } else {
                        // Unknown/unsupported message types: ignore instead of persisting provider keys like [stickerMessage]
                        continue;
                    }

                    const contextInfo =
                        (msg.message as any)?.extendedTextMessage?.contextInfo ||
                        (msg.message as any)?.imageMessage?.contextInfo ||
                        (msg.message as any)?.videoMessage?.contextInfo ||
                        (msg.message as any)?.documentMessage?.contextInfo ||
                        (msg.message as any)?.audioMessage?.contextInfo ||
                        (msg.message as any)?.stickerMessage?.contextInfo ||
                        null;
                    const isForwarded = !!(contextInfo?.isForwarded || Number(contextInfo?.forwardingScore || 0) > 0);

                    // Thread name (group/channel)
                    let threadName: string | null = null;
                    if (isGroup) {
                        const cached = groupNameCache.get(remoteJid);
                        const isFresh = cached && (Date.now() - cached.fetchedAt) < GROUP_NAME_TTL_MS;
                        if (isFresh) {
                            threadName = cached!.subject;
                        } else {
                            try {
                                const meta = await sock.groupMetadata(remoteJid);
                                if (meta?.subject) {
                                    threadName = meta.subject;
                                    groupNameCache.set(remoteJid, { subject: meta.subject, fetchedAt: Date.now() });
                                }
                            } catch {
                                // ignore
                            }
                        }
                        if (!threadName) threadName = `Group ${remoteJid.split('@')[0]}`;
                    } else if (isNewsletter) {
                        threadName = `Channel ${remoteJid.split('@')[0]}`;
                    }

                    const senderName = isOutbound ? "You" : sanitizeContactDisplayName(msg.pushName || null, contactWaId);

                    // 1) Upsert Contact (this represents the thread for groups/newsletters too)
                    const contact = await upsertContact(
                        orgId,
                        waAccountId,
                        contactWaId,
                        threadName || (isOutbound ? null : senderName)
                    );

                    // 2) Upsert Conversation
                    const direction = isOutbound ? 'outbound' : 'inbound';
                    const conv = await upsertConversation(orgId, waAccountId, contact.id, {
                        direction,
                        preview: previewText
                    });

                    // 3) Store Message (download media when possible)
                    let enrichedContent: any = {
                        text: captionText || null,
                        rawType: msgType,
                        forwarded: isForwarded,
                        forwarding_score: Number(contextInfo?.forwardingScore || 0) || 0,
                    };
                    if (['image', 'video', 'document', 'audio', 'sticker'].includes(normalizedType) && msg.message) {
                        try {
                            let inner: any = null;
                            let streamType: any = null;
                            let mimeType = 'application/octet-stream';
                            let fileName = `${normalizedType}-${msg.key.id || crypto.randomUUID()}`;

                            if (msgType === 'imageMessage') {
                                inner = msg.message.imageMessage;
                                streamType = 'image';
                                mimeType = inner?.mimetype || 'image/jpeg';
                                fileName = `image-${msg.key.id || crypto.randomUUID()}.jpg`;
                            } else if (msgType === 'videoMessage') {
                                inner = msg.message.videoMessage;
                                streamType = 'video';
                                mimeType = inner?.mimetype || 'video/mp4';
                                fileName = `video-${msg.key.id || crypto.randomUUID()}.mp4`;
                            } else if (msgType === 'audioMessage') {
                                inner = msg.message.audioMessage;
                                streamType = 'audio';
                                mimeType = inner?.mimetype || 'audio/ogg';
                                fileName = `audio-${msg.key.id || crypto.randomUUID()}.ogg`;
                            } else if (msgType === 'documentMessage') {
                                inner = msg.message.documentMessage;
                                streamType = 'document';
                                mimeType = inner?.mimetype || 'application/octet-stream';
                                fileName = inner?.fileName || fileName;
                            } else if (msgType === 'stickerMessage') {
                                inner = (msg.message as any).stickerMessage;
                                streamType = 'sticker';
                                mimeType = inner?.mimetype || 'image/webp';
                                fileName = `sticker-${msg.key.id || crypto.randomUUID()}.webp`;
                            }

                            if (inner && streamType) {
                                const stream = await downloadContentFromMessage(inner, streamType);
                                const buffer = await streamToBuffer(stream);
                                const uploaded = await uploadMediaToStorage({
                                    organization_id: orgId,
                                    conversation_id: conv.id,
                                    fileName,
                                    mimeType,
                                    buffer,
                                });

                                enrichedContent = {
                                    text: captionText || null,
                                    media_url: uploaded.publicUrl,
                                    mime_type: mimeType,
                                    file_name: fileName,
                                    duration_seconds: msgType === 'audioMessage' && Number.isFinite(Number(inner?.seconds)) ? Number(inner.seconds) : null,
                                    rawType: msgType,
                                    forwarded: isForwarded,
                                    forwarding_score: Number(contextInfo?.forwardingScore || 0) || 0,
                                };
                            }
                        } catch {
                            // ignore download errors
                        }
                    }

                    const stored = await storeMessage({
                        organization_id: orgId,
                        contact_id: contact.id,
                        conversation_id: conv.id,
                        wa_message_id: msg.key.id || null,
                        direction,
                        type: normalizedType,
                        content: enrichedContent,
                        status: isOutbound ? 'sent' : 'delivered',
                        sender_type: isOutbound ? 'human_agent' : 'customer',
                        automation_source: isOutbound ? 'manual' : 'webhook',
                    });

                    // 4) Emit only realtime (not history sync)
                    if (!isHistorySync) {
                        io.emit("new_message", {
                            from: contactWaId,
                            name: threadName || senderName,
                            text: captionText,
                            forwarded: isForwarded,
                            type: normalizedType,
                            ...(enrichedContent?.media_url ? { media_url: enrichedContent.media_url } : {}),
                            ...(enrichedContent?.mime_type ? { mime_type: enrichedContent.mime_type } : {}),
                            ...(enrichedContent?.file_name ? { file_name: enrichedContent.file_name } : {}),
                            timestamp: new Date().toISOString(),
                            connectedAccount: myPhone,
                            contact_id: contact.id,
                            conversation_id: conv.id,
                            message_id: stored?.id || null,
                            wa_message_id: msg.key.id || null,
                            created_at: stored?.created_at || new Date().toISOString(),
                            sender: isOutbound ? 'agent' : 'user',
                            status: isOutbound ? 'sent' : 'delivered'
                        });

                        // Bot Auto-Reply for Baileys (only for inbound text messages)
                        if (!isOutbound && normalizedType === 'text' && captionText) {
                            try {
                                console.log(`📥 [Baileys] Inbound text from ${contactWaId}: "${captionText}"`);
                                let flowConsumedMessage = false;
                                const flowResult = await processFlowEngine(orgId, contact.id, conv.id, captionText, stored?.id || null, conv.wa_account_id || null);

                                if (flowResult?.consumed) {
                                    flowConsumedMessage = true;

                                    if (flowResult.output) {
                                        console.log(`ðŸŒŠ Flow Engine (Baileys) replying to: "${captionText.substring(0, 50)}..."`);
                                        const botMsg = await sock.sendMessage(remoteJid, { text: flowResult.output });
                                        const botWaMessageId = botMsg?.key?.id || null;

                                        const storedBotReply = await storeMessage({
                                            organization_id: orgId, contact_id: contact.id, conversation_id: conv.id,
                                            wa_message_id: botWaMessageId, direction: "outbound", type: "text",
                                            content: { text: flowResult.output, is_flow: true }, status: "sent",
                                            is_bot_reply: true,
                                            sender_type: 'ai_agent',
                                            automation_source: 'flow',
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
                                            from: myPhone, phone: contactWaId, text: flowResult.output,
                                            sender: 'agent', conversation_id: conv.id, contact_id: contact.id, message_id: storedBotReply?.id || null,
                                            wa_message_id: botWaMessageId, created_at: storedBotReply?.created_at || new Date().toISOString(),
                                            connectedAccount: myPhone, type: 'text', is_bot_reply: true,
                                        });

                                        await supabase.from('w_conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: flowResult.output.substring(0, 100) }).eq('id', conv.id);
                                    }

                                    if (Array.isArray(flowResult.media) && flowResult.media.length > 0) {
                                        for (const media of flowResult.media) {
                                            try {
                                                let botMsg: any = null;
                                                if (media.type === 'image') botMsg = await sock.sendMessage(remoteJid, { image: { url: media.url }, caption: media.caption || undefined });
                                                else if (media.type === 'video') botMsg = await sock.sendMessage(remoteJid, { video: { url: media.url }, caption: media.caption || undefined });
                                                else if (media.type === 'audio') botMsg = await sock.sendMessage(remoteJid, { audio: { url: media.url }, mimetype: media.mimeType || 'audio/mpeg' });
                                                else botMsg = await sock.sendMessage(remoteJid, { document: { url: media.url }, fileName: media.fileName || 'document', mimetype: media.mimeType || 'application/octet-stream', caption: media.caption || undefined });

                                                const botWaMessageId = botMsg?.key?.id || null;
                                                const preview = media.caption || (
                                                    media.type === 'image' ? '[Image]' :
                                                        media.type === 'video' ? '[Video]' :
                                                            media.type === 'audio' ? '[Audio]' :
                                                                '[Document]'
                                                );

                                                const storedBotMedia = await storeMessage({
                                                    organization_id: orgId,
                                                    contact_id: contact.id,
                                                    conversation_id: conv.id,
                                                    wa_message_id: botWaMessageId,
                                                    direction: 'outbound',
                                                    type: media.type,
                                                    content: {
                                                        text: media.caption || null,
                                                        media_url: media.url,
                                                        mime_type: media.mimeType || null,
                                                        file_name: media.fileName || null,
                                                        is_flow: true,
                                                    },
                                                    status: 'sent',
                                                    is_bot_reply: true,
                                                    sender_type: 'ai_agent',
                                                    automation_source: 'flow',
                                                    metadata: {
                                                        flow_id: flowResult.flow_id,
                                                        flow_version_id: flowResult.flow_version_id,
                                                        flow_session_id: flowResult.flow_session_id,
                                                        flow_run_id: flowResult.flow_run_id,
                                                        flow_node_id: flowResult.flow_node_id,
                                                        handoff: flowResult.handoff === true,
                                                    },
                                                } as any);

                                                io.emit('new_message', {
                                                    from: myPhone,
                                                    phone: contactWaId,
                                                    text: preview,
                                                    sender: 'agent',
                                                    conversation_id: conv.id,
                                                    contact_id: contact.id,
                                                    message_id: storedBotMedia?.id || null,
                                                    wa_message_id: botWaMessageId,
                                                    created_at: storedBotMedia?.created_at || new Date().toISOString(),
                                                    connectedAccount: myPhone,
                                                    type: media.type,
                                                    media_url: media.url,
                                                    mime_type: media.mimeType || null,
                                                    file_name: media.fileName || null,
                                                    is_bot_reply: true,
                                                });

                                                await supabase.from('w_conversations').update({
                                                    last_message_at: new Date().toISOString(),
                                                    last_message_preview: preview.substring(0, 100),
                                                }).eq('id', conv.id);
                                            } catch (mediaErr: any) {
                                                console.error('[Flow] Failed to send Baileys media node:', mediaErr?.message || mediaErr);
                                            }
                                        }
                                    }
                                }

                                if (!flowConsumedMessage) {
                                    const debounceKey = conv.id;
                                    
                                    // Send typing indicator immediately
                                    try {
                                        await sock.sendPresenceUpdate('composing', remoteJid);
                                    } catch (e) {
                                        console.error('Failed to send composing presence', e);
                                    }

                                    if (botDebounceMap.has(debounceKey)) {
                                        clearTimeout(botDebounceMap.get(debounceKey)!);
                                    }

                                    botDebounceMap.set(debounceKey, setTimeout(async () => {
                                        botDebounceMap.delete(debounceKey);
                                        
                                        // Ensure sequential execution of AI generation for the same conversation
                                        let prevPromise = botLockMap.get(debounceKey) || Promise.resolve();
                                        
                                        const nextPromise = prevPromise.then(async () => {
                                            try {
                                                const botResult = await getBotAgentReply({
                                                    organization_id: orgId,
                                                    conversation_id: conv.id,
                                                    text: captionText
                                                });

                                                if (botResult?.reply) {
                                                    console.log(`🤖 Bot "${botResult.agent?.name}" replying via Baileys to: "${captionText.substring(0, 50)}..."`);

                                                    // Send the reply via Baileys
                                                    const botMsg = await sock.sendMessage(remoteJid, { text: botResult.reply });
                                                    const botWaMessageId = botMsg?.key?.id || null;

                                                    // Store the bot's reply message
                                                    const storedBotReply = await storeMessage({
                                                        organization_id: orgId,
                                                        contact_id: contact.id,
                                                        conversation_id: conv.id,
                                                        wa_message_id: botWaMessageId,
                                                        direction: "outbound",
                                                        type: "text",
                                                        content: { text: botResult.reply, bot_agent_id: botResult.agent?.id, bot_agent_name: botResult.agent?.name },
                                                        status: "sent",
                                                        is_bot_reply: true,
                                                        bot_agent_id: botResult.agent?.id || null,
                                                        sender_type: 'ai_agent',
                                                        automation_source: 'ai_agent',
                                                    } as any);

                                                    // Emit the bot reply to frontend
                                                    io.emit("new_message", {
                                                        from: myPhone,
                                                        phone: contactWaId,
                                                        text: botResult.reply,
                                                        sender: 'agent',
                                                        conversation_id: conv.id,
                                                        contact_id: contact.id,
                                                        message_id: storedBotReply?.id || null,
                                                        wa_message_id: botWaMessageId,
                                                        created_at: storedBotReply?.created_at || new Date().toISOString(),
                                                        connectedAccount: myPhone,
                                                        type: 'text',
                                                        is_bot_reply: true,
                                                        bot_agent_name: botResult.agent?.name,
                                                    });

                                                    // Update conversation preview
                                                    await supabase
                                                        .from('w_conversations')
                                                        .update({
                                                            last_message_at: new Date().toISOString(),
                                                            last_message_preview: botResult.reply.substring(0, 100)
                                                        })
                                                        .eq('id', conv.id);
                                                }
                                            } catch (botErr: any) {
                                                console.error('Bot auto-reply execution error:', botErr.message || botErr);
                                            } finally {
                                                // Clear typing indicator
                                                try {
                                                    await sock.sendPresenceUpdate('paused', remoteJid);
                                                } catch (e) {
                                                    // ignore
                                                }
                                            }
                                        }).catch(err => {
                                            console.error("Queue execution error:", err);
                                        });

                                        botLockMap.set(debounceKey, nextPromise);
                                        
                                    }, 6000));
                                }
                            } catch (botErr: any) {
                                console.error('Bot auto-reply error (Baileys):', botErr.message || botErr);
                            }
                        }

                        // Trigger auto-assignment for inbound messages
                        if (!isOutbound) {
                            performAutoAssignment(orgId, conv.id).catch(err => {
                                console.error("Error running auto assignment for Baileys message:", err);
                            });
                        }
                    }
                } catch (err) {
                    console.error("Error processing message:", err);
                }
            }
        });



        // ✅ NEW: Listen for status updates (Read Receipts / Delivery)
        sock.ev.on("messages.update", async (updates) => {
            for (const update of updates) {
                // update.update.status: 3=delivered, 4=read/played
                const statusRaw = update.update.status;
                if (!statusRaw) continue;

                let newStatus = null;
                if (statusRaw === 3) newStatus = 'delivered';
                else if (statusRaw >= 4) newStatus = 'read';

                if (newStatus && update.key.id) {
                    // Update DB
                    const orgId = await ensureDefaultOrganizationId();
                    if (orgId) {
                        await supabase.from('w_messages')
                            .update({ status: newStatus })
                            .eq('wa_message_id', update.key.id);
                    }

                    // Emit to frontend
                    io.emit("message_status_update", {
                        wa_message_id: update.key.id,
                        status: newStatus
                    });
                    console.log(`Updated status for ${update.key.id} -> ${newStatus}`);
                }
            }
        });

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Always cache QR, but only emit if the frontend explicitly requested it.
                latestQrBySession.set(sessionId, { qr, createdAt: Date.now() });

                const requested = Boolean(
                    socket?.data?.qrRequestedSessions &&
                    typeof socket.data.qrRequestedSessions?.has === 'function' &&
                    socket.data.qrRequestedSessions.has(sessionId)
                );

                if (requested) {
                    socket.emit("qr", qr);
                    console.log("QR Code sent to client");
                } else {
                    console.log("QR generated but not requested; cached for later");
                }
                initializingSessions.delete(sessionId); // Unlock on QR (user needs to scan)
            }

            if (connection === "close") {
                initializingSessions.delete(sessionId); // Unlock

                const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                const error = (lastDisconnect?.error as any);
                const errorMsg = error?.message || "";

                // Check for critical session corruption errors
                const isBadSession =
                    statusCode === DisconnectReason.badSession ||
                    statusCode === DisconnectReason.connectionClosed || // Often means bad session state
                    statusCode === 428 || // Precondition Required (often Boom error)
                    errorMsg.includes("Bad MAC") ||
                    errorMsg.includes("pre-key") ||
                    errorMsg.includes("Connection Closed");

                if (isBadSession) {
                    console.error(`âŒ Critical Session Error (${statusCode || errorMsg}). Clearing session...`);
                    // Clear only THIS session directory to force fresh scan (not all sessions!)
                    try {
                        const sessionDir = `baileys_auth_info/${sessionId}`;
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        sessions.delete(sessionId);
                        socket.emit('status', 'ready'); // Ensure UI resets to QR generate state
                        socket.emit('session_cleared', { reason: errorMsg || 'Session corrupted' });
                        console.log(`âœ… Session ${sessionId} cleared. User must re-scan.`);
                    } catch (e) {
                        console.error("Failed to clear session:", e);
                    }
                    return; // Stop here
                }

                // CRITICAL FIX: Don't reconnect on conflict (440) or if logged out
                const shouldReconnect =
                    statusCode !== DisconnectReason.loggedOut &&
                    statusCode !== 440; // 440 = Stream Errored (conflict)

                console.log(
                    "connection closed due to ",
                    lastDisconnect?.error,
                    ", status code:",
                    statusCode,
                    ", reconnecting:",
                    shouldReconnect
                );

                // Remove from sessions map
                sessions.delete(sessionId);
                socket.emit('status', 'disconnected');

                if (shouldReconnect) {
                    // Get current attempt count
                    const attempts = reconnectAttempts.get(sessionId) || 0;

                    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
                        console.log(`âŒ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${sessionId}. Stopping.`);
                        reconnectAttempts.delete(sessionId);
                        socket.emit('status', 'idle');
                        socket.emit('reconnect_failed', { reason: 'Max attempts reached. Please reconnect manually.' });
                        return;
                    }

                    // Exponential backoff: 3s, 6s, 12s, 24s, 48s
                    const delay = 3000 * Math.pow(2, attempts);
                    reconnectAttempts.set(sessionId, attempts + 1);

                    console.log(`â³ Reconnect attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`);
                    setTimeout(() => {
                        setupBaileys(sessionId, socket);
                    }, delay);
                } else {
                    console.log("âŒ Not reconnecting. User needs to scan QR again or logout detected.");
                    reconnectAttempts.delete(sessionId); // Reset on deliberate disconnect
                    if (statusCode === 440) {
                        console.log("âš ï¸ Conflict detected. Another WhatsApp Web session might be active.");
                        socket.emit('conflict_detected', { message: 'Another WhatsApp Web session is active. Close it and reconnect.' });
                    }
                    if (statusCode === DisconnectReason.loggedOut) {
                        // Clear session files on logout
                        try {
                            const sessionDir = `baileys_auth_info/${sessionId}`;
                            fs.rmSync(sessionDir, { recursive: true, force: true });
                            console.log(`âœ… Session ${sessionId} cleared after logout.`);
                        } catch (e) {
                            console.error("Failed to clear session on logout:", e);
                        }
                    }
                }
            } else if (connection === "open") {
                console.log("âœ… WhatsApp connection established successfully");
                initializingSessions.delete(sessionId); // Unlock
                reconnectAttempts.delete(sessionId); // Reset on successful connect
                socket.emit("status", "connected");

                // âœ… Emit connected account info immediately
                const connectedJid = sock.user?.id || "";
                const connectedAccount = connectedJid ? connectedJid.split(':')[0] : null;

                const orgId = organization_id || await ensureDefaultOrganizationId();
                if (connectedAccount && orgId) {
                    // âœ… UPSERT into wa_accounts so we have a valid ID for FKs
                    try {
                        await supabase.from('w_wa_accounts').upsert({
                            organization_id: orgId,
                            phone_number_id: connectedAccount,
                            display_phone_number: connectedAccount, // Use phone as display name defaults
                            status: 'connected',
                            // waba_id: null // Not available in Baileys
                        }, { onConflict: 'phone_number_id' });
                        console.log(`âœ… Upserted wa_account for ${connectedAccount}`);
                    } catch (err) {
                        console.error("Failed to upsert wa_account:", err);
                    }
                }

                if (connectedAccount) {
                    socket.emit("connected_account", connectedAccount);
                }
            }
        });

        // Final Guard: If we're no longer in initializingSessions, it means we aborted or logged out mid-flow
        if (!initializingSessions.has(sessionId)) {
            console.log(`âš ï¸ Session ${sessionId} initialization aborted (likely logout). Not setting session.`);
            try { sock.end(undefined); } catch (e) { }
            return;
        }

        sessions.set(sessionId, sock);
        return sock;
    } catch (err) {
        console.error("Setup failed:", err);
        initializingSessions.delete(sessionId);
    }
}



// Resolve the real active Baileys sessionId for an org (phone_number_id stored in DB)
async function getSessionIdForOrg(orgId: string): Promise<string | null> {
    try {
        const { data } = await supabase
            .from('w_wa_accounts')
            .select('phone_number_id')
            .eq('organization_id', orgId)
            .eq('status', 'connected')
            .maybeSingle();
        const phoneId = data?.phone_number_id;
        if (phoneId && sessions.has(phoneId)) return phoneId;
    } catch (err) {
        console.error('[getSessionIdForOrg] Error:', err);
    }
    return null;
}

// Global Error Handlers to prevent crash
process.on('uncaughtException', (err: any) => {
    console.error('âŒ Uncaught Exception:', err);
    // If it's the known connection crash, try to handle it
    if (err.message && (err.message.includes('Connection Closed') || err.message.includes('Bad MAC'))) {
        console.log("âš ï¸ Caught fatal session error. Cleaning up...");
        try {
            if (fs.existsSync('baileys_auth_info')) {
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                console.log("âœ… Corrupted session cleared.");
            }
        } catch (e) { console.error("Cleanup failed:", e); }
    }
});

process.on('unhandledRejection', (reason: any, promise) => {
    console.error('âŒ Unhandled Rejection:', reason);
    if (reason && (reason.output?.statusCode === 428 || reason.message?.includes('Connection Closed'))) {
        console.log("âš ï¸ Caught Fatal Boom Error (428). Cleaning up session...");
        try {
            if (fs.existsSync('baileys_auth_info')) {
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                console.log("âœ… Corrupted session cleared.");
            }
        } catch (e) { console.error("Cleanup failed:", e); }
    }
});

io.on("connection", (socket) => {
    console.log("✅ Frontend connected:", socket.id);

    // Join organization-specific room for multi-tenancy
    socket.on("join_org", (orgId: string, userId?: string) => {
        if (orgId) {
            console.log(`👤 Client ${socket.id} joining room: org:${orgId}`);
            socket.join(`org:${orgId}`);
            socket.data.organization_id = orgId; // ✅ store so agent_typing can read it
            if (userId) {
                socket.data.user_id = userId; // ✅ store so disconnect can read it
            }
        }
    });

    // Track explicit QR requests per socket.
    socket.data = socket.data || {};
    socket.data.qrRequestedSessions = socket.data.qrRequestedSessions || new Set<string>();

    // Frontend requests to join/init a session
    socket.on("join_session", async (sessionId: string, orgId?: string) => {
        console.log(`Client ${socket.id} checking session ${sessionId}`);
        socket.data.sessionId = sessionId;
        if (orgId) socket.data.organization_id = orgId;

        // Check if session exists in memory; if not, try restoring from disk.
        const existing = sessions.get(sessionId);
        if (existing && existing?.user?.id) {
            console.log(`âœ… Reusing existing session for ${sessionId}`);
            socket.emit("status", "connected");

            // âœ… Emit connected account info immediately
            const connectedJid = existing.user?.id || "";
            const connectedAccount = connectedJid ? connectedJid.split(':')[0] : null;
            if (connectedAccount) {
                let existingOrgId = socket?.data?.organization_id || null;
                const sessionOrgFile = `baileys_auth_info/${sessionId}/org_id.txt`;
                if (!existingOrgId && fs.existsSync(sessionOrgFile)) {
                    existingOrgId = fs.readFileSync(sessionOrgFile, 'utf8').trim();
                }
                await upsertBaileysWaAccount(existingOrgId, connectedAccount);
                socket.emit("connected_account", connectedAccount);
            }
        } else {
            if (existing && !existing?.user?.id) {
                console.log(`â„¹ï¸ Session ${sessionId} exists but not connected yet. Emitting scanning status.`);
                socket.emit("status", "scanning");

                // If a QR is already generated but connection isn't open, resend the QR
                const cached = latestQrBySession.get(sessionId);
                if (cached?.qr) {
                    socket.emit('qr', cached.qr);
                }
                return;
            }

            // If the session exists on disk (e.g. server restart), restore it.
            // QR may be generated by Baileys if creds are invalid, but QR emission is gated.
            try {
                const sessionDir = `baileys_auth_info/${sessionId}`;
                if (!sessions.get(sessionId) && fs.existsSync(sessionDir)) {
                    console.log(`ðŸ”„ Restoring Baileys session from disk: ${sessionId}`);
                    await setupBaileys(sessionId, socket);
                    return;
                }
            } catch {
                // ignore
            }

            console.log(`â„¹ï¸ No active connected session for ${sessionId}. Waiting for QR request...`);
            socket.emit("session_not_found"); // Trigger frontend to request QR
        }
    });

    // NEW: Explicit QR generation request
    socket.on("request_qr", async (sessionId: string, orgId?: string) => {
        console.log(`🔔 QR generation requested for session ${sessionId} (Org: ${orgId || 'None'})`);
        if (orgId) socket.data.organization_id = orgId;

        // Kill any existing session to ensure a clean slate for fresh QR
        const existing = sessions.get(sessionId);
        if (existing) {
            console.log(`âš ï¸ Killing existing session ${sessionId} to force fresh QR scan.`);
            try {
                existing.end(undefined);
            } catch (e) { }
            sessions.delete(sessionId);
            initializingSessions.delete(sessionId);
            reconnectAttempts.delete(sessionId);
            latestQrBySession.delete(sessionId);
        }

        socket.data.qrRequestedSessions.add(sessionId);

        // If we already have a cached QR for this session, emit it immediately.
        const cached = latestQrBySession.get(sessionId);
        if (cached?.qr) {
            socket.emit('qr', cached.qr);
        }

        // Create new Baileys session
        await setupBaileys(sessionId, socket, orgId || socket.data.organization_id);
    });

    // NEW: Explicit Logout request
    socket.on("logout", async (sessionId: string) => {
        console.log(`Logout requested for session ${sessionId}`);

        // Clear all tracking maps for this session
        initializingSessions.delete(sessionId);
        reconnectAttempts.delete(sessionId);
        latestQrBySession.delete(sessionId);

        const sock = sessions.get(sessionId);
        let phoneToDisconnect = null;
        if (sock) {
            // Get phone before ending connection to update DB
            const jid = sock.user?.id || "";
            phoneToDisconnect = jid ? jid.split(':')[0] : null;

            try {
                // sock.logout() sends a message to WhatsApp to invalidate the session
                await sock.logout();
                sock.end(undefined);
            } catch (e) {
                console.error("Baileys logout error:", e);
            }
            sessions.delete(sessionId);
        }

        // Update database if we found a phone number
        if (phoneToDisconnect && supabase) {
            console.log(`Updating DB: Setting account ${phoneToDisconnect} to disconnected.`);
            try {
                await supabase.from('w_wa_accounts')
                    .update({ status: 'disconnected' })
                    .eq('phone_number_id', phoneToDisconnect);
            } catch (err) {
                console.error("Failed to update wa_account status on logout:", err);
            }
        }

        const sessionDir = `baileys_auth_info/${sessionId}`;
        if (fs.existsSync(sessionDir)) {
            // Delay to resolve file locks
            setTimeout(() => {
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    console.log(`✅ Session directory ${sessionId} cleared on request. Chat data remains in DB.`);
                } catch (e) { }
            }, 500);
        }

        socket.emit("status", "ready");
    });



    socket.on("disconnect", async () => {
        console.log("❌ Frontend disconnected:", socket.id);
        const orgId = socket.data?.organization_id;
        const userId = socket.data?.user_id;

        if (orgId && userId) {
            console.log(`[Socket Disconnect] Auto-offline check for user ${userId} in org ${orgId}`);
            
            // Wait 3 seconds before marking offline, in case of a quick page reload or transient network drop.
            setTimeout(async () => {
                try {
                    // Check if there are other active socket connections for this user in this org
                    const activeSockets = await io.in(`org:${orgId}`).fetchSockets();
                    const isStillConnected = activeSockets.some(s => s.data?.user_id === userId && s.id !== socket.id);

                    if (isStillConnected) {
                        console.log(`[Socket Disconnect] User ${userId} has other active connections. Skipping offline update.`);
                        return;
                    }

                    // User has no other active socket connections. Check if they are online in DB.
                    const { data: member } = await supabase
                        .from('organization_members')
                        .select('role, is_online, name, online_time_today, last_online_at, last_reset_date')
                        .eq('user_id', userId)
                        .eq('organization_id', orgId)
                        .maybeSingle();

                    if (member && member.is_online && member.role !== 'owner') {
                        const now = new Date();
                        const todayStr = now.toISOString().split('T')[0];
                        let nextOnlineTime = member.online_time_today || 0;
                        if (member.last_reset_date !== todayStr) {
                            nextOnlineTime = 0;
                        }

                        const updatePayload: any = {
                            is_online: false,
                            last_reset_date: todayStr
                        };

                        if (member.last_online_at) {
                            const lastOnline = new Date(member.last_online_at);
                            const diffMs = now.getTime() - lastOnline.getTime();
                            const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
                            updatePayload.online_time_today = nextOnlineTime + diffSecs;
                        } else {
                            updatePayload.online_time_today = nextOnlineTime;
                        }
                        updatePayload.last_online_at = null;

                        const { error } = await supabase
                            .from('organization_members')
                            .update(updatePayload)
                            .eq('user_id', userId)
                            .eq('organization_id', orgId);

                        if (!error) {
                            console.log(`[Socket Disconnect] Marked user ${userId} offline.`);
                            io.to(`org:${orgId}`).emit('agent_offline', {
                                user_id: userId,
                                organization_id: orgId,
                                name: member.name
                            });
                        } else {
                            console.error("[Socket Disconnect] Error updating status in DB:", error);
                        }
                    }
                } catch (err) {
                    console.error("[Socket Disconnect Exception]", err);
                }
            }, 3000);
        }
    });
});

// --- Auto-Initialize existing sessions ---
function autoInitializeSessions() {
    const authDir = 'baileys_auth_info';
    if (!fs.existsSync(authDir)) return;
    
    try {
        const entries = fs.readdirSync(authDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith('session_')) {
                const sessionId = entry.name;
                console.log(`[Auto-Init] Found existing session directory: ${sessionId}. Initializing...`);
                let orgId = undefined;
                const orgFile = `${authDir}/${sessionId}/org_id.txt`;
                if (fs.existsSync(orgFile)) {
                    try {
                        orgId = fs.readFileSync(orgFile, 'utf8').trim();
                    } catch (e) {
                        console.error(`[Auto-Init] Failed to read org_id for ${sessionId}`, e);
                    }
                }
                
                // Initialize asynchronously to not block the main loop
                const dummySocket = { emit: () => {}, data: {} };
                setupBaileys(sessionId, dummySocket, orgId).catch(err => {
                    console.error(`[Auto-Init] Failed to auto-initialize session ${sessionId}:`, err);
                });
            }
        }
    } catch (err) {
        console.error('[Auto-Init] Failed to read auth directory:', err);
    }
}

// Start auto-initialization immediately
autoInitializeSessions();
