import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

// ====== AES-256-CBC Token Encryption ======
// TOKEN_ENCRYPTION_KEY must be exactly 32 ASCII characters in .env
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';

export function encryptToken(token: string): string {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        console.warn('⚠️ TOKEN_ENCRYPTION_KEY not set or not 32 chars — storing token unencrypted!');
        return token;
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptToken(stored: string | null | undefined): string {
    if (!stored) {
        return '';
    }
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32 || !stored.includes(':')) {
        // Not encrypted (legacy plain-text or key not set) — return as-is
        return stored;
    }
    try {
        const [ivHex, encHex] = stored.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
        // Decryption failed (e.g. key changed or invalid ciphertext) - return empty string
        return '';
    }
}

// ====== AES-256-GCM Form URL Token Encryption & Decryption ======
export function encryptFormToken(payloadStr: string): string {
    const secret = process.env.FORM_LINK_SECRET || 'dev_fallback_form_link_secret_key';
    if (!process.env.FORM_LINK_SECRET) {
        console.warn('⚠️ FORM_LINK_SECRET is not configured — using local fallback key for testing!');
    }
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(payloadStr, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + '.' + tag.toString('hex') + '.' + encrypted.toString('base64url');
}

export function decryptFormToken(token: string): string {
    const secret = process.env.FORM_LINK_SECRET || 'dev_fallback_form_link_secret_key';
    if (!process.env.FORM_LINK_SECRET) {
        console.warn('⚠️ FORM_LINK_SECRET is not configured — using local fallback key for testing!');
    }
    const key = crypto.createHash('sha256').update(secret).digest();
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid secure token format');
    }
    const [ivHex, tagHex, ciphertextBase64Url] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(ciphertextBase64Url, 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    // Validate expiration
    const payload = JSON.parse(decrypted.toString('utf8'));
    if (payload?.expires_at) {
        const expires = new Date(payload.expires_at).getTime();
        if (Date.now() > expires) {
            throw new Error('Token has expired');
        }
    }
    return decrypted.toString('utf8');
}

