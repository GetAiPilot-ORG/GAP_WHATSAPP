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
export const sessionPhoneMap = new Map<string, string>();
export const MAX_RECONNECT_ATTEMPTS = 20;

let baileysRuntimeStarted = false;

export function markBaileysRuntimeStarted() {
    baileysRuntimeStarted = true;
}

export function hasBaileysRuntimeStarted(): boolean {
    return baileysRuntimeStarted;
}

function normalizePhoneDigits(value: unknown): string {
    return String(value || '').split(':')[0].split('@')[0].replace(/\D+/g, '');
}

export interface LiveBaileysSessionStatus {
    connected: boolean;
    reconnecting: boolean;
    sessionId: string | null;
    phone: string | null;
}

export function findLiveBaileysSessionForAccount(
    account: {
        id?: string | null;
        phone_number_id?: string | null;
        display_phone_number?: string | null;
    } | null | undefined,
    overrides?: {
        sessionsMap?: Map<string, any>;
        initializingSet?: Set<string>;
        reconnectMap?: Map<string, number>;
        phoneMap?: Map<string, string>;
    }
): LiveBaileysSessionStatus {
    const activeSessions = overrides?.sessionsMap ?? sessions;
    const initSet = overrides?.initializingSet ?? initializingSessions;
    const retriesMap = overrides?.reconnectMap ?? reconnectAttempts;
    const phoneMap = overrides?.phoneMap ?? sessionPhoneMap;

    const targetId = account?.id ? String(account.id) : '';
    const targetPhoneId = normalizePhoneDigits(account?.phone_number_id);
    const targetDisplayPhone = normalizePhoneDigits(account?.display_phone_number);

    for (const [sid, sock] of activeSessions.entries()) {
        if (!sock) continue;
        const connectedPhone = normalizePhoneDigits(sock?.user?.id || sock?.authState?.creds?.me?.id || phoneMap.get(sid));
        const matchesId = Boolean(targetId && sid === targetId) || Boolean(targetPhoneId && sid === targetPhoneId);
        const matchesPhone = Boolean(
            connectedPhone &&
            ((targetPhoneId && connectedPhone === targetPhoneId) ||
             (targetDisplayPhone && connectedPhone === targetDisplayPhone))
        );

        if (matchesId || matchesPhone) {
            const hasUser = Boolean(sock?.user?.id);
            const wsHealthy = sock?.ws ? (sock.ws.isOpen !== false && sock.ws.isClosed !== true) : true;
            const connected = hasUser && wsHealthy;
            const reconnecting = !connected && (initSet.has(sid) || (retriesMap.get(sid) || 0) > 0);
            return {
                connected,
                reconnecting,
                sessionId: sid,
                phone: connectedPhone || null,
            };
        }
    }

    for (const [sid, mappedPhone] of phoneMap.entries()) {
        const cleanMapped = normalizePhoneDigits(mappedPhone);
        if (!cleanMapped) continue;
        if ((targetPhoneId && cleanMapped === targetPhoneId) || (targetDisplayPhone && cleanMapped === targetDisplayPhone)) {
            const reconnecting = initSet.has(sid) || (retriesMap.get(sid) || 0) > 0;
            if (reconnecting) {
                return { connected: false, reconnecting: true, sessionId: sid, phone: cleanMapped };
            }
        }
    }

    if (targetId && (initSet.has(targetId) || (retriesMap.get(targetId) || 0) > 0)) {
        return { connected: false, reconnecting: true, sessionId: targetId, phone: null };
    }
    if (account?.phone_number_id && (initSet.has(String(account.phone_number_id)) || (retriesMap.get(String(account.phone_number_id)) || 0) > 0)) {
        return { connected: false, reconnecting: true, sessionId: String(account.phone_number_id), phone: null };
    }

    return {
        connected: false,
        reconnecting: false,
        sessionId: null,
        phone: null,
    };
}

export interface BaileysDisconnectDecision {
    action: 'reconnect' | 'clear_and_stop' | 'stop_conflict';
    clearCredentials: boolean;
    resetRetries: boolean;
    delayMs: number;
    reason: string;
}

export function classifyBaileysDisconnect(params: {
    statusCode?: number;
    errorMessage?: string;
    attempt?: number;
    maxAttempts?: number;
}): BaileysDisconnectDecision {
    const { statusCode, errorMessage = '', attempt = 0, maxAttempts = MAX_RECONNECT_ATTEMPTS } = params;
    const msg = String(errorMessage || '');

    // Genuine unrecoverable auth / crypto failures where credentials must be cleared
    const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.forbidden;
    const isCorruptedSession =
        statusCode === DisconnectReason.badSession ||
        statusCode === DisconnectReason.multideviceMismatch ||
        msg.includes('Bad MAC') ||
        msg.includes('pre-key');

    if (isLoggedOut || isCorruptedSession) {
        return {
            action: 'clear_and_stop',
            clearCredentials: true,
            resetRetries: true,
            delayMs: 0,
            reason: isLoggedOut ? 'logged_out' : 'bad_session',
        };
    }

    if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
        return {
            action: 'stop_conflict',
            clearCredentials: false,
            resetRetries: true,
            delayMs: 0,
            reason: 'connection_conflict',
        };
    }

    // 515 restartRequired should reconnect cleanly right away without burning retry budget
    if (statusCode === DisconnectReason.restartRequired) {
        return {
            action: 'reconnect',
            clearCredentials: false,
            resetRetries: true,
            delayMs: 1000,
            reason: 'restart_required',
        };
    }

    // 428 connectionClosed, 408 timedOut/connectionLost, 503 unavailableService, and transient socket errors MUST reconnect
    if (attempt >= maxAttempts) {
        return {
            action: 'reconnect',
            clearCredentials: false,
            resetRetries: false,
            delayMs: 60000,
            reason: 'transient_backoff_capped',
        };
    }

    const delayMs = Math.min(3000 * Math.pow(2, Math.max(0, attempt)), 60000);
    return {
        action: 'reconnect',
        clearCredentials: false,
        resetRetries: false,
        delayMs,
        reason: 'transient_disconnect',
    };
}

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
                if (orgId) {
                    io.to(`org:${orgId}`).emit("qr", { sessionId, qr, organization_id: orgId });
                } else {
                    io.emit("qr", { sessionId, qr });
                }
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
                    if (orgId) {
                        io.to(`org:${orgId}`).emit("disconnected", { sessionId, organization_id: orgId });
                    } else {
                        io.emit("disconnected", { sessionId });
                    }
                }
            }
        } else if (connection === 'open') {
            console.log(`[Baileys] Connection opened for ${sessionId}`);
            initializingSessions.delete(sessionId);
            reconnectAttempts.delete(sessionId);
            latestQrBySession.delete(sessionId);
            
            if (io) {
                if (orgId) {
                    io.to(`org:${orgId}`).emit("ready", { sessionId, organization_id: orgId });
                } else {
                    io.emit("ready", { sessionId });
                }
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
