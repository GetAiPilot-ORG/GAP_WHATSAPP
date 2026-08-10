import React from 'react';

/**
 * Lightweight SVG Donut Ring Preview for collapsed card state.
 * Eliminates heavy Recharts re-renders when cards are collapsed.
 */
export default function InsightsMiniPreview({ data, totalFormatted, subLabel, totalValue, badgeColor }) {
    const hasData = totalValue > 0;
    const activeItems = (data || []).filter((d) => d.value > 0);

    // Calculate strokeDasharray segments for SVG ring
    const radius = 32;
    const circumference = 2 * Math.PI * radius;

    let accumulatedPercentage = 0;
    const segments = activeItems.map((item) => {
        const percentage = totalValue > 0 ? item.value / totalValue : 0;
        const strokeDasharray = `${percentage * circumference} ${circumference}`;
        const strokeDashoffset = -accumulatedPercentage * circumference;
        accumulatedPercentage += percentage;

        return {
            key: item.key || item.label,
            color: item.color,
            strokeDasharray,
            strokeDashoffset,
        };
    });

    return (
        <div className="flex items-center justify-between gap-4 py-2 px-1">
            {/* SVG Ring Preview */}
            <div className="relative h-16 w-16 shrink-0 flex items-center justify-center">
                <svg className="h-16 w-16 -rotate-90 transform" viewBox="0 0 80 80">
                    {/* Background Track Ring */}
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        className="stroke-gray-100"
                        strokeWidth="10"
                        fill="transparent"
                    />

                    {hasData && segments.length > 0 ? (
                        segments.map((seg) => (
                            <circle
                                key={seg.key}
                                cx="40"
                                cy="40"
                                r={radius}
                                stroke={seg.color}
                                strokeWidth="10"
                                strokeDasharray={seg.strokeDasharray}
                                strokeDashoffset={seg.strokeDashoffset}
                                strokeLinecap="round"
                                fill="transparent"
                                className="transition-all duration-500 ease-out"
                            />
                        ))
                    ) : (
                        <circle
                            cx="40"
                            cy="40"
                            r={radius}
                            className="stroke-gray-200/60"
                            strokeWidth="10"
                            strokeDasharray="4 4"
                            fill="transparent"
                        />
                    )}
                </svg>

                {/* Ring Center Mini Icon/Dot */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`h-2.5 w-2.5 rounded-full ${hasData ? badgeColor || 'bg-blue-600' : 'bg-gray-300'}`} />
                </div>
            </div>

            {/* Quick Metrics Summary */}
            <div className="flex-1 min-w-0 text-right">
                <div className="text-xl font-bold text-gray-900 tabular-nums tracking-tight">
                    {totalFormatted}
                </div>
                <div className="text-[11px] font-medium text-gray-500 truncate mt-0.5">
                    {hasData ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {activeItems.length} {activeItems.length === 1 ? 'Category' : 'Categories'} active
                        </span>
                    ) : (
                        <span className="text-gray-400">0 metrics recorded</span>
                    )}
                </div>
            </div>
        </div>
    );
}
