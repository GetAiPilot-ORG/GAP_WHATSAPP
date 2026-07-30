// Category Color System for WhatsApp Insights
export const CATEGORY_COLORS = {
    // Primary Category Keys
    marketing: '#2563eb',                    // Royal Blue
    marketing_lite: '#f59e0b',               // Warm Amber / Gold
    utility: '#ef4444',                      // Coral Red
    authentication: '#8b5cf6',               // Deep Purple
    authentication_international: '#ec4899', // Hot Pink
    ai_provider: '#06b6d4',                  // Cyan / Teal
    service: '#10b981',                      // Emerald Green
    free_customer_service: '#059669',        // Dark Emerald
    free_entry_point: '#6366f1',             // Indigo / Violet

    // All Messages Keys
    messages_sent: '#3b82f6',                // Blue
    messages_delivered: '#10b981',           // Emerald
    messages_received: '#f59e0b',            // Amber
};

export const CATEGORY_LABELS = {
    marketing: 'Marketing',
    marketing_lite: 'Marketing - lite',
    utility: 'Utility',
    authentication: 'Authentication',
    authentication_international: 'Authentication - international',
    ai_provider: 'AI Provider',
    service: 'Service',
    free_customer_service: 'Free customer service',
    free_entry_point: 'Free entry point',
    messages_sent: 'Messages sent',
    messages_delivered: 'Messages delivered',
    messages_received: 'Messages received',
};

// Formatter for numbers
export const formatNumber = (val) => {
    return Number(val || 0).toLocaleString();
};

// Formatter for currency (Rupees)
export const formatRupees = (paise) => {
    const rupees = Number(paise || 0) / 100;
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Transforms raw broadcast insights payload into clean structured data for the 4 card grid.
 */
export function transformInsightsToCharts(broadcastInsights) {
    if (!broadcastInsights) return null;

    const allMsg = broadcastInsights.all_messages || {};
    const msgDelivered = broadcastInsights.messages_delivered || {};
    const paidDelivered = broadcastInsights.paid_messages_delivered || {};
    const charges = broadcastInsights.approximate_total_charges || {};

    // 1. All Messages Chart Data
    const allMessagesData = [
        {
            key: 'messages_sent',
            label: 'Messages sent',
            value: Number(allMsg.total_sent || 0),
            formattedValue: formatNumber(allMsg.total_sent),
            color: CATEGORY_COLORS.messages_sent,
        },
        {
            key: 'messages_delivered',
            label: 'Messages delivered',
            value: Number(allMsg.total_delivered || 0),
            formattedValue: formatNumber(allMsg.total_delivered),
            color: CATEGORY_COLORS.messages_delivered,
        },
        {
            key: 'messages_received',
            label: 'Messages received',
            value: Number(allMsg.total_received || 0),
            formattedValue: formatNumber(allMsg.total_received),
            color: CATEGORY_COLORS.messages_received,
        },
    ];

    const allMessagesTotal = Number(allMsg.total_sent || 0);

    // Helper for category transformation
    const transformCategories = (catArray, isCurrency = false) => {
        return (catArray || []).map((c) => {
            const rawVal = isCurrency ? Number(c.charges_paise || 0) : Number(c.delivered || 0);
            const key = c.key || '';
            return {
                key,
                label: c.label || CATEGORY_LABELS[key] || key,
                value: rawVal,
                formattedValue: isCurrency ? formatRupees(rawVal) : formatNumber(rawVal),
                color: CATEGORY_COLORS[key] || '#94a3b8',
                isCurrency,
            };
        });
    };

    // 2. Messages Delivered
    const messagesDeliveredData = transformCategories(msgDelivered.categories);
    const messagesDeliveredTotal = Number(msgDelivered.total || 0);

    // 3. Paid Messages Delivered
    const paidDeliveredData = transformCategories(paidDelivered.categories);
    const paidDeliveredTotal = Number(paidDelivered.total || 0);

    // 4. Approximate Total Charges
    const chargesData = transformCategories(charges.categories, true);
    const chargesTotalPaise = Number(charges.total_paise || 0);

    return {
        allMessages: {
            id: 'all_messages',
            title: 'All Messages',
            totalFormatted: formatNumber(allMessagesTotal),
            subLabel: 'Messages',
            data: allMessagesData,
            totalValue: allMessagesTotal,
            isCurrency: false,
            badgeDotColor: '#3b82f6',
        },
        messagesDelivered: {
            id: 'messages_delivered',
            title: 'Messages Delivered',
            totalFormatted: formatNumber(messagesDeliveredTotal),
            subLabel: 'Delivered',
            data: messagesDeliveredData,
            totalValue: messagesDeliveredTotal,
            isCurrency: false,
            badgeDotColor: '#10b981',
        },
        paidMessagesDelivered: {
            id: 'paid_messages_delivered',
            title: 'Paid Messages Delivered',
            totalFormatted: formatNumber(paidDeliveredTotal),
            subLabel: 'Paid',
            data: paidDeliveredData,
            totalValue: paidDeliveredTotal,
            isCurrency: false,
            badgeDotColor: '#8b5cf6',
        },
        approximateTotalCharges: {
            id: 'approximate_total_charges',
            title: 'Approximate Total Charges',
            totalFormatted: formatRupees(chargesTotalPaise),
            subLabel: 'Charges',
            data: chargesData,
            totalValue: chargesTotalPaise,
            isCurrency: true,
            badgeDotColor: '#f59e0b',
        },
    };
}
