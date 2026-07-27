export const MESSAGING_TIERS = [
    { value: 'TIER_250', label: '250' },
    { value: 'TIER_2K', label: '2,000' },
    { value: 'TIER_10K', label: '10,000' },
    { value: 'TIER_100K', label: '100,000' },
    { value: 'TIER_UNLIMITED', label: 'Unlimited' },
];

export function getMessagingTierLabel(value) {
    return MESSAGING_TIERS.find(tier => tier.value === value)?.label || String(value || '').replace(/^TIER_/, '').replace('K', ',000') || 'Unavailable';
}
