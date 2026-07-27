import React, { useState } from 'react';
import InsightsPieChart from './InsightsPieChart';
import InsightsCustomLegend from './InsightsCustomLegend';
import { BarChart3 } from 'lucide-react';

export default function InsightsChartCard({ chartData, isLoading }) {
    const [activeIndex, setActiveIndex] = useState(null);

    if (isLoading) {
        return (
            <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm animate-pulse space-y-4">
                <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-gray-200 rounded-md" />
                    <div className="h-5 w-16 bg-gray-200 rounded-full" />
                </div>
                <div className="h-44 w-44 mx-auto bg-gray-100 rounded-full" />
                <div className="space-y-2 pt-2">
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-4/6" />
                </div>
            </div>
        );
    }

    if (!chartData) return null;

    const { title, totalFormatted, subLabel, data, totalValue } = chartData;
    const hasData = totalValue > 0;

    return (
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-2">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-600 ring-4 ring-blue-50" />
                    <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200/60 text-xs font-bold text-gray-900 tabular-nums">
                    {totalFormatted}
                </span>
            </div>

            {/* Content: Empty State vs Chart */}
            {!hasData ? (
                <div className="py-10 px-4 flex flex-col items-center justify-center text-center my-auto">
                    <div className="h-12 w-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 mb-3 shadow-inner">
                        <BarChart3 className="h-6 w-6 stroke-[1.5]" />
                    </div>
                    <p className="text-xs font-semibold text-gray-600">No analytics available for this period.</p>
                    <p className="text-[11px] text-gray-400 mt-1 max-w-[200px]">
                        No recorded message metrics match this breakdown.
                    </p>
                </div>
            ) : (
                <div>
                    {/* Donut Chart */}
                    <InsightsPieChart
                        data={data}
                        totalFormatted={totalFormatted}
                        subLabel={subLabel}
                        activeIndex={activeIndex}
                        onHoverIndex={setActiveIndex}
                        hasData={hasData}
                    />

                    {/* Custom Legend */}
                    <InsightsCustomLegend
                        data={data}
                        activeIndex={activeIndex}
                        onHoverIndex={setActiveIndex}
                    />
                </div>
            )}
        </div>
    );
}
