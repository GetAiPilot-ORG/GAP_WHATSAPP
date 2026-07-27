export const BILLING_INTERVALS = [
    { months: 1, label: 'Monthly', discount: 0 },
    { months: 12, label: 'Yearly', discount: 17 },
]

export const FALLBACK_PLANS = [
    {
        id: 'starter',
        name: 'WA Starter',
        description: 'Simple WhatsApp workspace for small shops and service businesses.',
        monthly_price_paise: 99900,
        yearly_price_paise: 999000,
        limits: { numbers: 1, contacts: 1000, agents: 5, flows: 5, ai_agents: 1, broadcasts_per_month: 100, allow_broadcasts: true, allow_scheduling: false, allow_api_webhooks: false, allow_exports: false },
        features: ['1 WhatsApp number', '1,000 contacts', '5 automation flows', 'Manual broadcasts', 'Basic bot replies'],
    },
    {
        id: 'growth',
        name: 'WA Growth',
        description: 'Best plan for growing teams running campaigns and customer support.',
        monthly_price_paise: 199900,
        yearly_price_paise: 1999000,
        limits: { numbers: 1, contacts: 10000, agents: 5, flows: -1, ai_agents: 5, broadcasts_per_month: -1, allow_broadcasts: true, allow_scheduling: false, allow_api_webhooks: false, allow_exports: false },
        features: ['10,000 contacts', '5 agents included', 'Unlimited flows', 'Broadcast campaigns', 'Message spend dashboard'],
        badge: 'Recommended',
    },
    {
        id: 'pro',
        name: 'WA Pro',
        description: 'Advanced automation, campaigns, AI agents, and reporting.',
        monthly_price_paise: 349900,
        yearly_price_paise: 3499000,
        limits: { numbers: 2, contacts: 50000, agents: 10, flows: -1, ai_agents: 10, broadcasts_per_month: -1, allow_broadcasts: true, allow_scheduling: true, allow_api_webhooks: true, allow_exports: true },
        features: ['2 WhatsApp numbers', '50,000 contacts', '10 agents included', 'Campaign scheduler', 'API and webhooks'],
    },
]

export const FALLBACK_RATE_CARDS = [
    { category: 'marketing', label: 'Marketing', rate_paise: 88, description: 'Promotions, offers, re-engagement, and campaign templates.' },
    { category: 'utility', label: 'Utility', rate_paise: 13, description: 'Order, payment, appointment, and shipping updates.' },
    { category: 'authentication', label: 'Authentication', rate_paise: 13, description: 'OTP and verification templates.' },
    { category: 'service', label: 'Service', rate_paise: 0, description: 'Replies inside the customer service window.' },
]

export function formatINRFromPaise(value = 0, { compact = false } = {}) {
    const rupees = Number(value || 0) / 100
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
        notation: compact ? 'compact' : 'standard',
    }).format(rupees)
}

export function getPlanPrice(plan, intervalMonths) {
    if (intervalMonths === 12) return plan.yearly_price_paise ?? (plan.monthly_price_paise || 0) * 10
    return plan.monthly_price_paise || 0
}

export function getMonthlyEquivalent(plan, intervalMonths) {
    const price = getPlanPrice(plan, intervalMonths)
    return intervalMonths > 1 ? Math.round(price / intervalMonths) : price
}
