import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} from "@whiskeysockets/baileys";
import pino from "pino";
import * as fs from "fs";
import { supabase } from '../config/supabase.js';

// ====== Baileys Global Session State ======
export const sessions = new Map<string, any>();
export const latestQrBySession = new Map<string, { qr: string; createdAt: number }>();
export const groupNameCache = new Map<string, { subject: string; fetchedAt: number }>();
export const GROUP_NAME_TTL_MS = 5 * 60 * 1000;
export const profilePhotoCache = new Map<string, { url: string | null; fetchedAt: number }>();
export const PROFILE_PHOTO_TTL_MS = 30 * 60 * 1000;
export const initializingSessions = new Set<string>();
export const reconnectAttempts = new Map<string, number>();
export const MAX_RECONNECT_ATTEMPTS = 5;

// Basic Pino logger for Baileys
export const logger = pino({ level: 'silent' });

/**
 * Initializes a new Baileys socket connection for a specific session ID.
 */
export async function connectToWhatsApp(sessionId: string, orgId: string, io?: any) {
    if (initializingSessions.has(sessionId)) {
        console.log(`[Baileys] Session ${sessionId} is already initializing...`);
        return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(`baileys_auth_info/${sessionId}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[Baileys] using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: Browsers.macOS('Desktop'),
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            return { conversation: 'Hello' };
        }
    });

    sessions.set(sessionId, sock);
    initializingSessions.add(sessionId);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQrBySession.set(sessionId, { qr, createdAt: Date.now() });
            if (io) {
                io.emit("qr", { sessionId, qr });
            }
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[Baileys] Connection closed for ${sessionId} due to `, lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            
            sessions.delete(sessionId);
            initializingSessions.delete(sessionId);
            
            if (shouldReconnect) {
                const attempts = reconnectAttempts.get(sessionId) || 0;
                if (attempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts.set(sessionId, attempts + 1);
                    setTimeout(() => connectToWhatsApp(sessionId, orgId, io), 5000 * Math.pow(2, attempts));
                }
            } else {
                // Logged out
                if (fs.existsSync(`baileys_auth_info/${sessionId}`)) {
                    fs.rmSync(`baileys_auth_info/${sessionId}`, { recursive: true, force: true });
                }
                latestQrBySession.delete(sessionId);
                reconnectAttempts.delete(sessionId);
                if (io) {
                    io.emit("disconnected", { sessionId });
                }
            }
        } else if (connection === 'open') {
            console.log(`[Baileys] Connection opened for ${sessionId}`);
            initializingSessions.delete(sessionId);
            reconnectAttempts.delete(sessionId);
            latestQrBySession.delete(sessionId);
            
            if (io) {
                io.emit("ready", { sessionId });
            }
        }
    });

    // In a full extraction, we would add the message handler here:
    // sock.ev.on('messages.upsert', handleIncomingMessages);

    return sock;
}

export function getSession(sessionId: string) {
    return sessions.get(sessionId);
}

export function isSessionConnected(sessionId: string) {
    const sock = sessions.get(sessionId);
    return sock?.authState?.creds?.me != null;
}

export async function logoutSession(sessionId: string) {
    const sock = sessions.get(sessionId);
    if (sock) {
        await sock.logout();
    }
    sessions.delete(sessionId);
    latestQrBySession.delete(sessionId);
    if (fs.existsSync(`baileys_auth_info/${sessionId}`)) {
        fs.rmSync(`baileys_auth_info/${sessionId}`, { recursive: true, force: true });
    }
}

export function toProfilePhotoJid(waId: string | null | undefined): string | null {
    if (!waId) return null;
    const digits = waId.replace(/\D+/g, '');
    if (digits.length < 8) return null;
    return `${digits}@s.whatsapp.net`;
}

export async function getCachedProfilePhotoUrl(waId: string | null | undefined) {
    const jid = toProfilePhotoJid(waId);
    if (!jid) return null;

    const cached = profilePhotoCache.get(jid);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_PHOTO_TTL_MS) return cached.url;

    let attempted = false;
    for (const sock of sessions.values()) {
        try {
            if (!sock?.user?.id || typeof sock.profilePictureUrl !== 'function') continue;
            attempted = true;
            let url: string | null = null;
            try {
                url = await sock.profilePictureUrl(jid, 'image');
            } catch {
                url = await sock.profilePictureUrl(jid, 'preview');
            }
            profilePhotoCache.set(jid, { url: url || null, fetchedAt: Date.now() });
            return url || null;
        } catch {
            // WhatsApp privacy settings or missing profile photos commonly land here.
        }
    }

    if (attempted) profilePhotoCache.set(jid, { url: null, fetchedAt: Date.now() });
    return null;
}
