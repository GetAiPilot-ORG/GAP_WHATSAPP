import * as fs from 'fs';
import * as path from 'path';
import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { storeMessage, upsertConversation } from './messages.service.js';
import {
    sessions,
    latestQrBySession,
    groupNameCache,
    profilePhotoCache,
    reconnectAttempts,
    sessionPhoneMap,
    MAX_RECONNECT_ATTEMPTS,
    initializingSessions,
    logger,
    GROUP_NAME_TTL_MS,
    classifyBaileysDisconnect,
    markBaileysRuntimeStarted,
} from './whatsapp.service.js';
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
import { upsertContact, findContactByLidInDb, isLidWaId, sanitizeContactDisplayName } from './contacts.service.js';
import {
    BaileysContactDirectory,
    extractBaileysContactSignals,
    resolveLidsForPhoneWaIds,
    syncMissingLidsForOrg,
} from './baileysContactSync.service.js';
import { getBotAgentReply } from './ai.service.js';
import { shouldRunBaileysBotAutomation } from '../utils/format.js';
import { performAutoAssignment } from './assignment.service.js';
import { sendPushNotificationToOrg } from './push.service.js';
import { transcribeAudioBuffer } from './voice.service.js';

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

    const now = new Date().toISOString();
    let { data, error } = await supabase.from('w_wa_accounts').upsert({
        organization_id: orgId,
        phone_number_id: cleanPhone,
        display_phone_number: cleanPhone,
        name: 'WhatsApp Account',
        status: 'connected',
        connection_status: 'CONNECTED',
        has_access_token: false,
        last_sync_status: 'SUCCESS',
        last_health_check_at: now,
    }, { onConflict: 'phone_number_id' }).select('id').single();

    if (error && (error.message?.includes('column') || error.message?.includes('does not exist'))) {
        ({ data, error } = await supabase.from('w_wa_accounts').upsert({
            organization_id: orgId,
            phone_number_id: cleanPhone,
            display_phone_number: cleanPhone,
            name: 'WhatsApp Account',
            status: 'connected',
        }, { onConflict: 'phone_number_id' }).select('id').single());
    }

    if (error) {
        console.error("Failed to upsert Baileys wa_account:", error);
        return null;
    }

    return data?.id || null;
}

async function markBaileysAccountStatus(
    orgId: string | null | undefined,
    phone: string | null | undefined,
    status: 'pending' | 'disconnected',
    connectionStatus: 'DISCONNECTED' | 'WARNING' = 'DISCONNECTED',
) {
    const cleanPhone = String(phone || '').replace(/\D+/g, '');
    if (!supabase || !cleanPhone) return;

    const now = new Date().toISOString();
    const baseQuery = () => {
        let q = supabase
            .from('w_wa_accounts')
            .update({
                status,
                connection_status: connectionStatus,
                last_sync_status: 'FAILED',
                last_health_check_at: now,
            })
            .eq('phone_number_id', cleanPhone);
        if (orgId) q = q.eq('organization_id', orgId);
        return q;
    };

    const { error } = await baseQuery();
    if (error && (error.message?.includes('column') || error.message?.includes('does not exist'))) {
        let fallback = supabase.from('w_wa_accounts').update({ status }).eq('phone_number_id', cleanPhone);
        if (orgId) fallback = fallback.eq('organization_id', orgId);
        await fallback;
    }
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
        const initialCredPhone = String(state?.creds?.me?.id || '').split(':')[0].split('@')[0].replace(/\D+/g, '');
        if (initialCredPhone) {
            sessionPhoneMap.set(sessionId, initialCredPhone);
        }
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
            // Keep WebSocket alive across idle NAT/proxy intervals
            keepAliveIntervalMs: 30000,
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
            const myPhone = myJid.split(':')[0].split('@')[0];
            if (!myPhone) return { orgId, waAccountId: null as any };

            const { data: acc } = await supabase
                .from('w_wa_accounts')
                .select('id, status, connection_status')
                .eq('organization_id', orgId)
                .eq('phone_number_id', myPhone)
                .maybeSingle();

            let waAccountId = acc?.id || null;
            if (!waAccountId || acc?.status !== 'connected' || acc?.connection_status !== 'CONNECTED') {
                waAccountId = (await upsertBaileysWaAccount(orgId, myPhone)) || waAccountId;
            }

            cachedWaAccountId = waAccountId;
            return { orgId, waAccountId };
        };

        // Persist contact names & LID mappings when Baileys provides them.
        // Keeping a per-session directory ensures @lid outbound/inbound messages resolve immediately.
        const contactDirectory = new BaileysContactDirectory();
        const pendingPhoneLidLookups = new Set<string>();
        let phoneLidLookupTimer: NodeJS.Timeout | null = null;

        const schedulePhoneLidLookups = () => {
            if (phoneLidLookupTimer) clearTimeout(phoneLidLookupTimer);
            phoneLidLookupTimer = setTimeout(async () => {
                phoneLidLookupTimer = null;
                if (!sock?.user?.id || pendingPhoneLidLookups.size === 0) return;
                const batch = Array.from(pendingPhoneLidLookups);
                pendingPhoneLidLookups.clear();
                try {
                    const { orgId, waAccountId } = await resolveOrgAndAccount();
                    if (!orgId) return;
                    await resolveLidsForPhoneWaIds({
                        sock,
                        orgId,
                        waAccountId,
                        phoneWaIds: batch,
                        directory: contactDirectory,
                    });
                } catch (err: any) {
                    console.warn('[Baileys LID lookup] failed:', err?.message || err);
                }
            }, 500);
        };

        const upsertBaileysContacts = async (
            items: any[],
            opts: { source: 'contact' | 'chat'; skipProfilePhoto?: boolean } = { source: 'contact' },
        ) => {
            try {
                if (!Array.isArray(items) || items.length === 0) return;

                const { orgId, waAccountId } = await resolveOrgAndAccount();
                if (!orgId || !waAccountId) return;

                const skipPhoto = opts.skipProfilePhoto ?? items.length > 5;

                for (const raw of items) {
                    const sig = extractBaileysContactSignals(raw, { source: opts.source });
                    if (!sig) continue;

                    contactDirectory.record({
                        waId: sig.phoneWaId || sig.targetWaId,
                        lid: sig.lid,
                        name: sig.name,
                        preferIncomingName: sig.preferIncomingName,
                    });

                    if (
                        opts.source === 'contact' &&
                        sig.phoneWaId &&
                        !sig.lid &&
                        !contactDirectory.lookupLid(sig.phoneWaId)
                    ) {
                        pendingPhoneLidLookups.add(sig.phoneWaId);
                    }

                    // Skip writing placeholder rows unless we have a display name or a phone<->lid link.
                    if (!sig.name && !(sig.phoneWaId && sig.lid)) continue;

                    await upsertContact(orgId, waAccountId, sig.targetWaId, sig.name, {
                        lid: sig.lid,
                        preferIncomingName: sig.preferIncomingName,
                        skipProfilePhoto: skipPhoto,
                    });
                }

                if (pendingPhoneLidLookups.size > 0) {
                    schedulePhoneLidLookups();
                }
            } catch (err: any) {
                console.warn('âš ï¸ contacts sync failed:', err?.message || err);
            }
        };

        sock.ev.on('contacts.upsert', async (contacts: any[]) => {
            await upsertBaileysContacts(contacts, { source: 'contact', skipProfilePhoto: true });
        });

        sock.ev.on('contacts.update', async (updates: any[]) => {
            await upsertBaileysContacts(updates, { source: 'contact', skipProfilePhoto: true });
        });

        sock.ev.on('messaging-history.set', async ({ chats, contacts }: any) => {
            if (Array.isArray(contacts) && contacts.length > 0) {
                await upsertBaileysContacts(contacts, { source: 'contact', skipProfilePhoto: true });
            }
            if (Array.isArray(chats) && chats.length > 0) {
                await upsertBaileysContacts(chats, { source: 'chat', skipProfilePhoto: true });
            }
        });

        sock.ev.on('chats.upsert', async (chats: any[]) => {
            await upsertBaileysContacts(chats, { source: 'chat', skipProfilePhoto: true });
        });

        sock.ev.on('chats.update', async (updates: any[]) => {
            await upsertBaileysContacts(updates, { source: 'chat', skipProfilePhoto: true });
        });

        sock.ev.on('chats.phoneNumberShare', async ({ lid, jid }: any) => {
            try {
                const sig = extractBaileysContactSignals({ lid, jid }, { source: 'contact' });
                if (!sig?.phoneWaId || !sig?.lid) return;

                contactDirectory.record({ waId: sig.phoneWaId, lid: sig.lid });
                const { orgId, waAccountId } = await resolveOrgAndAccount();
                if (!orgId || !waAccountId) return;

                const knownName =
                    contactDirectory.lookupName(sig.phoneWaId) ||
                    contactDirectory.lookupName(sig.lid);

                await upsertContact(
                    orgId,
                    waAccountId,
                    sig.phoneWaId,
                    knownName?.name || null,
                    {
                        lid: sig.lid,
                        preferIncomingName: knownName?.preferIncomingName || false,
                        skipProfilePhoto: true,
                    },
                );
            } catch (err: any) {
                console.warn('[Baileys] chats.phoneNumberShare handling failed:', err?.message || err);
            }
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
            const myPhone = myJid.split(':')[0].split('@')[0];
            const myLid = (sock.user as any)?.lid || state?.creds?.me?.lid || "";

            // Resolve wa_account_id once per batch (and self-heal status if live socket is active)
            const { data: acc } = await supabase
                .from('w_wa_accounts')
                .select('id, status, connection_status')
                .eq('organization_id', orgId)
                .eq('phone_number_id', myPhone)
                .maybeSingle();

            let waAccountId = acc?.id;
            if (!waAccountId || acc?.status !== 'connected' || acc?.connection_status !== 'CONNECTED') {
                waAccountId = (await upsertBaileysWaAccount(orgId, myPhone)) || waAccountId;
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

                    const msgKeyAny = msg.key as any;
                    let identity = contactDirectory.resolveMessageIdentity({
                        remoteJid,
                        remoteJidAlt: msgKeyAny?.remoteJidAlt || null,
                        senderPn: msgKeyAny?.senderPn || null,
                        senderLid: msgKeyAny?.senderLid || null,
                        fromMe: Boolean(isOutbound),
                        myPhone,
                        myLid,
                        pushName: msg.pushName || null,
                        verifiedBizName: (msg as any)?.verifiedBizName || null,
                    });

                    const isGroup = identity.isGroup;
                    const isNewsletter = identity.isNewsletter;
                    let contactWaId = identity.contactWaId;

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
                                    io.to(`org:${orgId}`).emit('message_updated', {
                                        organization_id: orgId,
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

                    // On-demand LID -> Phone lookup when a 1:1 message arrives on an unmapped @lid.
                    if (!isGroup && !isNewsletter && identity.needsLidLookup && identity.lid) {
                        const dbMatch = await findContactByLidInDb(orgId, identity.lid);
                        if (dbMatch && !isLidWaId(dbMatch.wa_id)) {
                            contactDirectory.seedFromDbContacts([dbMatch]);
                        } else if (!isHistorySync && sock?.user?.id) {
                            await syncMissingLidsForOrg({
                                sock,
                                orgId,
                                waAccountId,
                                directory: contactDirectory,
                                forceFullSync: false,
                            }).catch(() => undefined);
                        }

                        identity = contactDirectory.resolveMessageIdentity({
                            remoteJid,
                            remoteJidAlt: msgKeyAny?.remoteJidAlt || null,
                            senderPn: msgKeyAny?.senderPn || null,
                            senderLid: msgKeyAny?.senderLid || null,
                            fromMe: Boolean(isOutbound),
                            myPhone,
                            myLid,
                            pushName: msg.pushName || null,
                            verifiedBizName: (msg as any)?.verifiedBizName || null,
                        });
                        contactWaId = identity.contactWaId;
                    }

                    // 1) Upsert Contact (this represents the thread for groups/newsletters too)
                    const contact = await upsertContact(
                        orgId,
                        waAccountId,
                        contactWaId,
                        threadName || identity.contactNameForUpsert,
                        {
                            lid: identity.lid,
                            preferIncomingName: Boolean(threadName) ? false : identity.preferIncomingName,
                            skipProfilePhoto: isHistorySync,
                        },
                    );

                    const resolvedDisplayName =
                        sanitizeContactDisplayName(contact?.custom_name, contactWaId) ||
                        sanitizeContactDisplayName(contact?.name, contactWaId) ||
                        threadName ||
                        identity.fallbackSenderName ||
                        contact?.phone ||
                        contactWaId;

                    // 2) Upsert Conversation
                    const direction = isOutbound ? 'outbound' : 'inbound';
                    const isNonIndividual = isGroup || isNewsletter;
                    const conv = await upsertConversation(orgId, waAccountId, contact.id, {
                        direction,
                        preview: previewText,
                        isNonIndividual,
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

                                let transcript: string | null = null;
                                if (msgType === 'audioMessage' && buffer) {
                                    try {
                                        transcript = await transcribeAudioBuffer({
                                            buffer,
                                            mimeType,
                                            fileName,
                                            organization_id: orgId,
                                        });
                                        if (transcript) {
                                            captionText = transcript;
                                        }
                                    } catch (tErr) {
                                        console.error('[Baileys] Voice transcription error:', tErr);
                                    }
                                }

                                enrichedContent = {
                                    text: transcript ? `[Voice Note]: "${transcript}"` : (captionText || null),
                                    transcript: transcript || null,
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
                        io.to(`org:${orgId}`).emit("new_message", {
                            organization_id: orgId,
                            wa_account_id: waAccountId,
                            phone_number_id: myPhone,
                            from: contactWaId,
                            phone: contact?.phone || identity.phoneWaId || null,
                            name: resolvedDisplayName,
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

                        // Trigger Push Notification for inbound messages
                        if (!isOutbound) {
                            sendPushNotificationToOrg(orgId, {
                                title: `New message from ${resolvedDisplayName}`,
                                body: captionText || 'New media message received',
                                url: `/live-chat`,
                                icon: '/pwa-192x192.png'
                            });
                        }

                        // Bot Auto-Reply for Baileys (inbound 1:1 text or transcribed audio messages only; skip groups/channels)
                        if (
                            shouldRunBaileysBotAutomation({
                                isOutbound: Boolean(isOutbound),
                                isGroup,
                                isNewsletter,
                                remoteJid,
                                contact,
                                normalizedType,
                                captionText,
                            })
                        ) {
                            try {
                                console.log(`📥 [Baileys] Inbound ${normalizedType} from ${contactWaId}: "${captionText}"`);
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
                                                flow_name: flowResult.flow_name,
                                                flow_version_id: flowResult.flow_version_id,
                                                flow_session_id: flowResult.flow_session_id,
                                                flow_run_id: flowResult.flow_run_id,
                                                flow_node_id: flowResult.flow_node_id,
                                                handoff: flowResult.handoff === true,
                                            },
                                        } as any);

                                        io.to(`org:${orgId}`).emit("new_message", {
                                            organization_id: orgId,
                                            wa_account_id: waAccountId,
                                            phone_number_id: myPhone,
                                            from: myPhone,
                                            phone: contact?.phone || contactWaId,
                                            text: flowResult.output,
                                            sender: 'agent',
                                            conversation_id: conv.id,
                                            contact_id: contact.id,
                                            message_id: storedBotReply?.id || null,
                                            wa_message_id: botWaMessageId,
                                            created_at: storedBotReply?.created_at || new Date().toISOString(),
                                            connectedAccount: myPhone,
                                            type: 'text',
                                            is_bot_reply: true,
                                            metadata: storedBotReply?.metadata || { flow_name: flowResult.flow_name, flow_id: flowResult.flow_id },
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
                                                        flow_name: flowResult.flow_name,
                                                        flow_version_id: flowResult.flow_version_id,
                                                        flow_session_id: flowResult.flow_session_id,
                                                        flow_run_id: flowResult.flow_run_id,
                                                        flow_node_id: flowResult.flow_node_id,
                                                        handoff: flowResult.handoff === true,
                                                    },
                                                } as any);

                                                io.to(`org:${orgId}`).emit('new_message', {
                                                    organization_id: orgId,
                                                    wa_account_id: waAccountId,
                                                    phone_number_id: myPhone,
                                                    from: myPhone,
                                                    phone: contact?.phone || contactWaId,
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
                                                    metadata: storedBotMedia?.metadata || { flow_name: flowResult.flow_name, flow_id: flowResult.flow_id },
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
                                                    let replyText = botResult.reply;
                                                    const isFallback = replyText.startsWith("[FALLBACK]");
                                                    replyText = replyText.replace("[FALLBACK]", "").trim();

                                                    try {
                                                        const trimmed = replyText.trim();
                                                        const firstBrace = trimmed.indexOf("{");
                                                        const lastBrace = trimmed.lastIndexOf("}");
                                                        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                                            const jsonCandidate = trimmed.substring(firstBrace, lastBrace + 1);
                                                            const parsed = JSON.parse(jsonCandidate);
                                                            if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
                                                                replyText = parsed.text;
                                                                // QR transport has no native URL CTA support. Preserve actions in its text fallback.
                                                                if (Array.isArray(parsed.buttons)) {
                                                                    replyText += parsed.buttons.map((button: any) => `\n${button.text || 'Open'}${button.url ? `: ${button.url}` : ''}`).join('');
                                                                }
                                                            }
                                                        }
                                                    } catch (e) {
                                                        // Keep original if parsing fails
                                                    }

                                                    // Send the reply via Baileys
                                                    const botMsg = await sock.sendMessage(remoteJid, { text: replyText });
                                                    const botWaMessageId = botMsg?.key?.id || null;

                                                    // Store the bot's reply message
                                                    const storedBotReply = await storeMessage({
                                                        organization_id: orgId,
                                                        contact_id: contact.id,
                                                        conversation_id: conv.id,
                                                        wa_message_id: botWaMessageId,
                                                        direction: "outbound",
                                                        type: "text",
                                                        content: { text: replyText, bot_agent_id: botResult.agent?.id, bot_agent_name: botResult.agent?.name },
                                                        status: "sent",
                                                        is_bot_reply: true,
                                                        bot_agent_id: botResult.agent?.id || null,
                                                        sender_type: 'ai_agent',
                                                        automation_source: 'ai_agent',
                                                    } as any);

                                                    // Emit the bot reply to frontend
                                                    io.to(`org:${orgId}`).emit("new_message", {
                                                        organization_id: orgId,
                                                        wa_account_id: waAccountId,
                                                        phone_number_id: myPhone,
                                                        from: myPhone,
                                                        phone: contact?.phone || contactWaId,
                                                        text: replyText,
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
                                                            last_message_preview: replyText.substring(0, 100)
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
                    const orgId = organization_id || await ensureDefaultOrganizationId();
                    if (orgId) {
                        await supabase.from('w_messages')
                            .update({ status: newStatus })
                            .eq('wa_message_id', update.key.id);

                        // Emit to frontend org room
                        io.to(`org:${orgId}`).emit("message_status_update", {
                            organization_id: orgId,
                            wa_message_id: update.key.id,
                            status: newStatus
                        });
                        console.log(`Updated status for ${update.key.id} -> ${newStatus}`);
                    }
                }
            }
        });

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                latestQrBySession.set(sessionId, { qr, createdAt: Date.now() });

                socket?.emit?.("qr", qr);
                if (organization_id) {
                    io.to(`org:${organization_id}`).emit("qr", qr);
                } else {
                    io.emit("qr", qr);
                }
                console.log(`[Baileys] QR Code emitted for session: ${sessionId}`);
                initializingSessions.delete(sessionId); // Unlock on QR (user needs to scan)
            }

            if (connection === "close") {
                initializingSessions.delete(sessionId); // Unlock
                if (phoneLidLookupTimer) {
                    clearTimeout(phoneLidLookupTimer);
                    phoneLidLookupTimer = null;
                }

                const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                const error = (lastDisconnect?.error as any);
                const errorMsg = error?.message || "";

                const attempts = reconnectAttempts.get(sessionId) || 0;
                const decision = classifyBaileysDisconnect({
                    statusCode,
                    errorMessage: errorMsg,
                    attempt: attempts,
                    maxAttempts: MAX_RECONNECT_ATTEMPTS,
                });

                const disconnectedPhone =
                    String(sock.user?.id || state?.creds?.me?.id || sessionPhoneMap.get(sessionId) || '')
                        .split(':')[0]
                        .split('@')[0]
                        .replace(/\D+/g, '') || null;

                sessions.delete(sessionId);

                if (decision.action === 'clear_and_stop') {
                    console.error(`❌ Unrecoverable Baileys disconnect (${decision.reason}, code=${statusCode || 'none'}: ${errorMsg}). Clearing session ${sessionId}.`);
                    reconnectAttempts.delete(sessionId);
                    latestQrBySession.delete(sessionId);
                    sessionPhoneMap.delete(sessionId);

                    try {
                        const sessionDir = `baileys_auth_info/${sessionId}`;
                        if (fs.existsSync(sessionDir)) {
                            fs.rmSync(sessionDir, { recursive: true, force: true });
                        }
                    } catch (e) {
                        console.error("Failed to clear session:", e);
                    }

                    await markBaileysAccountStatus(
                        organization_id,
                        disconnectedPhone,
                        decision.reason === 'logged_out' ? 'disconnected' : 'pending',
                        'DISCONNECTED',
                    );

                    socket?.emit?.('status', 'ready');
                    if (decision.reason === 'bad_session') {
                        socket?.emit?.('session_cleared', { reason: errorMsg || 'Session corrupted' });
                    }
                    return;
                }

                if (decision.action === 'stop_conflict') {
                    console.log("⚠️ Conflict detected (440). Another WhatsApp Web session might be active.");
                    reconnectAttempts.delete(sessionId);
                    await markBaileysAccountStatus(organization_id, disconnectedPhone, 'pending', 'DISCONNECTED');
                    socket?.emit?.('status', 'disconnected');
                    socket?.emit?.('conflict_detected', { message: 'Another WhatsApp Web session is active. Close it and reconnect.' });
                    return;
                }

                console.log(
                    `🔄 Connection closed for ${sessionId} (code=${statusCode || 'none'}, reason=${decision.reason}). Reconnecting in ${decision.delayMs / 1000}s...`,
                    errorMsg || ''
                );

                if (decision.resetRetries) {
                    reconnectAttempts.delete(sessionId);
                } else {
                    reconnectAttempts.set(sessionId, attempts + 1);
                }

                socket?.emit?.('status', 'disconnected');
                setTimeout(() => {
                    setupBaileys(sessionId, socket, organization_id);
                }, decision.delayMs);
            } else if (connection === "open") {
                console.log("✅ WhatsApp connection established successfully");
                initializingSessions.delete(sessionId); // Unlock
                reconnectAttempts.delete(sessionId); // Reset on successful connect
                const orgId = organization_id || await ensureDefaultOrganizationId();
                socket?.emit?.("status", "connected");
                if (orgId) {
                    io.to(`org:${orgId}`).emit("status", "connected");
                } else {
                    io.emit("status", "connected");
                }

                // Emit connected account info immediately
                const connectedJid = sock.user?.id || "";
                const connectedAccount = connectedJid ? connectedJid.split(':')[0].split('@')[0].replace(/\D+/g, '') : null;

                if (connectedAccount) {
                    sessionPhoneMap.set(sessionId, connectedAccount);
                }

                if (connectedAccount && orgId) {
                    try {
                        await upsertBaileysWaAccount(orgId, connectedAccount);
                        console.log(`✅ Upserted wa_account for ${connectedAccount}`);
                    } catch (err) {
                        console.error("Failed to upsert wa_account:", err);
                    }
                }

                if (connectedAccount) {
                    socket?.emit?.("connected_account", connectedAccount);
                    if (orgId) {
                        io.to(`org:${orgId}`).emit("connected_account", connectedAccount);
                    } else {
                        io.emit("connected_account", connectedAccount);
                    }
                }

                if (orgId && connectedAccount) {
                    resolveOrgAndAccount()
                        .then(({ orgId: resolvedOrg, waAccountId }) => {
                            if (!resolvedOrg) return;
                            return syncMissingLidsForOrg({
                                sock,
                                orgId: resolvedOrg,
                                waAccountId,
                                directory: contactDirectory,
                                forceFullSync: true,
                            });
                        })
                        .then((syncRes) => {
                            if (syncRes && !syncRes.skipped) {
                                console.log(
                                    `[Baileys LID Sync] org=${orgId} checked=${syncRes.checkedCount} matched=${syncRes.matchedCount} updated=${syncRes.updatedCount} merged=${syncRes.mergedCount}`,
                                );
                            }
                        })
                        .catch((err) => {
                            console.warn('[Baileys LID Sync] Initial backfill failed:', err?.message || err);
                        });
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

// Global crash handlers (never wipe saved QR auth directories on transient 428/socket errors)
process.on('uncaughtException', (err: any) => {
    console.error('❌ Uncaught Exception (Baileys):', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
    console.error('❌ Unhandled Rejection (Baileys):', (reason as any)?.message || reason);
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
            const connectedAccount = connectedJid ? connectedJid.split(':')[0].split('@')[0].replace(/\D+/g, '') : null;
            if (connectedAccount) {
                sessionPhoneMap.set(sessionId, connectedAccount);
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
                const credsFile = path.join(sessionDir, 'creds.json');
                if (!sessions.get(sessionId) && fs.existsSync(credsFile)) {
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
            sessionPhoneMap.delete(sessionId);
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
        sessionPhoneMap.delete(sessionId);

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
                await markBaileysAccountStatus(socket.data?.organization_id, phoneToDisconnect, 'disconnected', 'DISCONNECTED');
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
    markBaileysRuntimeStarted();
    const authDir = 'baileys_auth_info';
    if (!fs.existsSync(authDir)) return;
    
    try {
        const entries = fs.readdirSync(authDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith('session_')) {
                const sessionId = entry.name;
                const credsFile = path.join(authDir, sessionId, 'creds.json');
                if (!fs.existsSync(credsFile)) {
                    continue;
                }
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
