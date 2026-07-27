export const DEFAULT_BILLING_MARKET = 'IN';
export const DEFAULT_BILLING_CURRENCY = 'INR';

export const DEFAULT_WHATSAPP_RATE_CARD: Record<string, { category: string; label: string; rate_paise: number; description: string }> = {
    marketing: {
        category: 'marketing',
        label: 'Marketing',
        rate_paise: 88,
        description: 'Promotions, offers, re-engagement, abandoned cart, and campaign templates.'
    },
    utility: {
        category: 'utility',
        label: 'Utility',
        rate_paise: 13,
        description: 'Order, payment, appointment, shipping, and account updates requested by the user.'
    },
    authentication: {
        category: 'authentication',
        label: 'Authentication',
        rate_paise: 13,
        description: 'OTP and verification templates.'
    },
    service: {
        category: 'service',
        label: 'Service',
        rate_paise: 0,
        description: 'Replies inside the customer service window.'
    }
};

export function decodeSupabaseJwtRole(token: string | undefined): string | null {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = payload.length % 4;
        if (pad) payload += '='.repeat(4 - pad);
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const json = JSON.parse(decoded);
        return json?.role || null;
    } catch {
        return null;
    }
}
