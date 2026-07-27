const fs = require('fs');

const serverContent = fs.readFileSync('server.ts', 'utf8');
const lines = serverContent.split('\n');

const baileysStart = lines.findIndex(l => l.includes('async function upsertBaileysWaAccount'));
const ioStart = lines.findIndex(l => l.startsWith('io.on("connection"'));
const ioEnd = lines.findIndex(l => l.startsWith('httpServer.listen'));

const baileysCode = `
import * as fs from 'fs';
import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { storeMessage, upsertConversation } from './messages.service.js';
import { sessions, latestQrBySession, groupNameCache, profilePhotoCache, reconnectAttempts, MAX_RECONNECT_ATTEMPTS, initializingSessions, logger } from './whatsapp.service.js';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage,
    makeCacheableSignalKeyStore,
    Browsers,
    proto,
} from "@whiskeysockets/baileys";
// Add any missing helpers here or import them

${lines.slice(baileysStart, ioEnd).join('\n')}
`;

fs.writeFileSync('src/services/baileys.service.ts', baileysCode);
console.log("Baileys extraction completed.");
