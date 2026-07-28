import React, { useState } from 'react';
import InsightsPieChart from './InsightsPieChart';
import InsightsLegend from './InsightsLegend';
import { BarChart2 } from 'lucide-react';

export default function InsightsCard({ chartData, isLoading }) {
    const [activeIndex, setActiveIndex] = useState(null);

    if (isLoading) {
        return (
            <div className="rounded-[18px] border border-gray-200/80 bg-white p-6 shadow-xs animate-pulse min-h-[250px] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-gray-200 rounded-md" />
                    <div className="h-5 w-16 bg-gray-200 rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-4 items-center my-auto">
                    <div className="h-36 w-36 bg-gray-100 rounded-full mx-auto" />
                    <div className="space-y-2">
                        <div className="h-3.5 bg-gray-100 rounded w-full" />
                        <div className="h-3.5 bg-gray-100 rounded w-4/5" />
                        <div className="h-3.5 bg-gray-100 rounded w-3/5" />
                    </div>
                </div>
            </div>
        );
    }

    if (!chartData) return null;

    const { title, totalFormatted, subLabel, data, totalValue, badgeDotColor } = chartData;
    const hasData = totalValue > 0;

    return (
        <div className="group relative rounded-[18px] border border-gray-200/80 bg-white p-6 shadow-xs hover:border-gray-300 hover:shadow-md hover:shadow-gray-200/50 hover:-translate-y-0.5 transition-all duration-200 ease-out flex flex-col justify-between min-h-[250px] overflow-hidden">
            {/* Header Strip */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: badgeDotColor || '#2563eb' }}
                    />
                    <h3 className="text-sm font-bold text-gray-900 truncate tracking-tight">{title}</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-gray-50 border border-gray-200/80 text-xs font-bold text-gray-900 tabular-nums">
                    {totalFormatted}
                </span>
            </div>

            {/* Main Content: Side-by-Side Donut Chart (Left) + Legend (Right) */}
            {!hasData ? (
                <div className="py-10 px-4 flex flex-col items-center justify-center text-center my-auto">
                    <div className="h-10 w-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 mb-2 shadow-2xs">
                        <BarChart2 className="h-5 w-5 stroke-[1.5]" />
                    </div>
                    <p className="text-xs font-bold text-gray-700">No analytics available</p>
                    <p className="text-[11px] text-gray-400 mt-1 max-w-[200px]">
                        No recorded message activity matches this breakdown.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center flex-1 my-auto">
                    {/* Left Column: Donut Chart */}
                    <div className="w-full flex items-center justify-center">
                        <InsightsPieChart
                            data={data}
                            totalFormatted={totalFormatted}
                            subLabel={subLabel}
                            activeIndex={activeIndex}
                            onHoverIndex={setActiveIndex}
                            hasData={hasData}
                        />
                    </div>

                    {/* Right Column: Legend Text directly beside Chart (No Scrollbars!) */}
                    <div className="w-full">
                        <InsightsLegend
                            data={data}
                            totalValue={totalValue}
                            activeIndex={activeIndex}
                            onHoverIndex={setActiveIndex}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
