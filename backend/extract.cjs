const fs = require('fs');

const serverContent = fs.readFileSync('server.ts', 'utf8');
const lines = serverContent.split('\n');

const getStart = lines.findIndex(l => l.startsWith('app.get("/webhook"'));
let getEnd = getStart;
while (getEnd < lines.length && !lines[getEnd].startsWith('});')) getEnd++;

const postStart = lines.findIndex(l => l.startsWith('app.post("/webhook"'));
let postEnd = postStart;
while (postEnd < lines.length && !lines[postEnd].startsWith('process.on(')) postEnd++;
// Back up a bit to find the closing `});`
while (postEnd > postStart && !lines[postEnd].startsWith('});')) postEnd--;

const getCode = lines.slice(getStart, getEnd + 1).join('\n');
const postCode = lines.slice(postStart, postEnd + 1).join('\n');

const cleanedGetCode = getCode
    .replace('app.get("/webhook", (req, res) => {', 'export async function verifyWebhook(req: any, res: Response) {')
    .replace(/}\);$/, '}');

const cleanedPostCode = postCode
    .replace('app.post("/webhook", async (req, res) => {', 'export async function handleWebhook(req: any, res: Response) {')
    .replace(/}\);$/, '}');

const controllerCode = `
import { Response } from 'express';
import crypto from "crypto";
import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { storeMessage, upsertConversation } from '../services/messages.service.js';
import { processFlowEngine } from '../services/flows.service.js';
// (Add other imports as needed later)

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

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

${cleanedGetCode}

${cleanedPostCode}
`;

fs.writeFileSync('src/controllers/webhook.controller.ts', controllerCode);
console.log("Extraction completed.");
