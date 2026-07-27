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
    const raw = String(value);
    const left = raw.includes('@') ? raw.split('@')[0] : raw;
    const digits = left.replace(/\D+/g, '');
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

    if (raw.includes('@') && !raw.endsWith('@s.whatsapp.net')) return null;

    const digits = normalizeWaIdToPhone(raw);
    if (!digits) return null;
    if (digits.length === 10) return `91${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return digits;
    return null;
}
