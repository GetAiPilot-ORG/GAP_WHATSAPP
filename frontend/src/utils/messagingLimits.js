export const MESSAGING_TIERS = [
    { value: 'TIER_250', label: '250', keys: ['TIER_250', '250', 'TIER_50', '50'] },
    { value: 'TIER_2K', label: '2,000', keys: ['TIER_2K', '2,000', '2000', 'TIER_2000', 'TIER_1K', '1000', '1K'] },
    { value: 'TIER_10K', label: '10,000', keys: ['TIER_10K', '10,000', '10000', 'TIER_10000', '10K'] },
    { value: 'TIER_100K', label: '100,000', keys: ['TIER_100K', '100,000', '100000', 'TIER_100000', '100K'] },
    { value: 'TIER_UNLIMITED', label: 'Unlimited', keys: ['TIER_UNLIMITED', 'UNLIMITED', 'TIER_INFINITE'] },
];

export function isCurrentTier(tier, rawValue) {
    if (!rawValue || rawValue === 'NULL' || rawValue === 'null' || rawValue === 'UNKNOWN' || rawValue === 'Unavailable') {
        return tier.value === 'TIER_2K'; // Default Meta verified limit
    }
    const str = String(rawValue).toUpperCase().trim();
    if (str === 'NULL' || str === 'UNDEFINED') return tier.value === 'TIER_2K';
    if (tier.value === str) return true;
    if (tier.keys && tier.keys.some(k => k.toUpperCase() === str)) return true;
    if (str.includes('2K') || str.includes('2000') || str === '2,000') return tier.value === 'TIER_2K';
    if (str.includes('250') || str.includes('50')) return tier.value === 'TIER_250';
    if (str.includes('100K') || str.includes('100000')) return tier.value === 'TIER_100K';
    if (str.includes('10K') || str.includes('10000')) return tier.value === 'TIER_10K';
    if (str.includes('UNLIMITED')) return tier.value === 'TIER_UNLIMITED';
    return false;
}

export function getMessagingTierLabel(value) {
    if (!value || String(value).toUpperCase().trim() === 'NULL' || String(value).toUpperCase().trim() === 'UNDEFINED') {
        return '2,000';
    }
    const str = String(value).toUpperCase().trim();
    const matched = MESSAGING_TIERS.find(tier => isCurrentTier(tier, str));
    if (matched) return matched.label;
    return str.replace(/^TIER_/, '').replace('K', ',000') || '2,000';
}
