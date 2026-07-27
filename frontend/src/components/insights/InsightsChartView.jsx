import React, { useMemo } from 'react';
import InsightsCard from './InsightsCard';
import { transformInsightsToCharts } from './insightsUtils';

export default function InsightsChartView({ broadcastInsights, isLoading }) {
    // Memoize data transformation to avoid unnecessary recalculations
    const chartsData = useMemo(() => {
        return transformInsightsToCharts(broadcastInsights);
    }, [broadcastInsights]);

    if (!chartsData && !isLoading) {
        return (
            <div className="p-8 text-center bg-gray-50/50 rounded-[18px] border border-dashed border-gray-200">
                <p className="text-sm font-medium text-gray-500">No analytics data available to display charts.</p>
            </div>
        );
    }

    const cardsList = [
        chartsData?.allMessages,
        chartsData?.messagesDelivered,
        chartsData?.paidMessagesDelivered,
        chartsData?.approximateTotalCharges,
    ].filter(Boolean);

    return (
        <div className="space-y-4">
            {/* Stable 2x2 Responsive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                {cardsList.map((card) => (
                    <InsightsCard
                        key={card.id}
                        chartData={card}
                        isLoading={isLoading}
                    />
                ))}
            </div>
        </div>
    );
}
