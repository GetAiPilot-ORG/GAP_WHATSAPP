export function cleanText(value: any, maxLength = 500) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function cleanNullableText(value: any, maxLength = 500) {
    const cleaned = cleanText(value, maxLength);
    return cleaned || null;
}

export function isUuid(value: string) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

export function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeWaIdToPhone(value: string | null | undefined): string | null {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const withoutDomain = raw.includes('@') ? raw.split('@')[0] : raw;
    const withoutDevice = withoutDomain.replace(/:\d+$/, '');
    const digits = withoutDevice.replace(/\D+/g, '');
    return digits.length >= 8 ? digits : null;
}

export function normalizeIndianPhoneKey(value: string | null | undefined): string | null {
    const digits = normalizeWaIdToPhone(value);
    if (!digits) return null;

    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;

    return null;
}

export function derivePhoneForStorage(value: string | null | undefined): string | null {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    if (lower.includes('@') && !lower.endsWith('@s.whatsapp.net') && !lower.endsWith('@c.us')) return null;

    const digits = normalizeWaIdToPhone(raw);
    if (!digits) return null;
    if (digits.length === 10) return `91${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return digits;
    return null;
}

export function isGroupOrChannelWaId(value: string | null | undefined): boolean {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return false;
    return raw.includes('@g.us') || raw.includes('@newsletter') || raw.includes('@broadcast');
}

export function isNonIndividualThreadContact(contact?: {
    contact_type?: string | null;
    wa_id?: string | null;
} | null): boolean {
    if (!contact || typeof contact !== 'object') return false;
    const contactType = String(contact.contact_type || '').trim().toLowerCase();
    if (contactType === 'group' || contactType === 'channel') return true;
    return isGroupOrChannelWaId(contact.wa_id);
}

export function shouldRunBaileysBotAutomation(params: {
    isOutbound?: boolean;
    isGroup?: boolean;
    isNewsletter?: boolean;
    remoteJid?: string | null;
    contact?: { contact_type?: string | null; wa_id?: string | null } | null;
    normalizedType?: string | null;
    captionText?: string | null;
}): boolean {
    if (params.isOutbound) return false;
    if (params.isGroup || params.isNewsletter) return false;
    if (isGroupOrChannelWaId(params.remoteJid)) return false;
    if (isNonIndividualThreadContact(params.contact)) return false;
    const msgType = String(params.normalizedType || '').trim().toLowerCase();
    if (msgType !== 'text' && msgType !== 'audio') return false;
    return Boolean(String(params.captionText || '').trim());
}
