import React from 'react';

export default function InsightsCustomTooltip({ active, payload }) {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const { label, formattedValue, color, percent, value, isCurrency } = data;
    const percentageString = typeof percent === 'number' ? (percent * 100).toFixed(1) + '%' : null;

    return (
        <div className="bg-gray-900/95 backdrop-blur-md text-white text-xs rounded-xl p-3 shadow-xl border border-gray-700/80 animate-in fade-in zoom-in-95 duration-150 min-w-[150px]">
            <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-gray-700/60">
                <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: color }}
                />
                <span className="font-semibold text-gray-100 truncate">{label}</span>
            </div>
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-400">Value:</span>
                    <span className="font-bold text-white tabular-nums">{formattedValue}</span>
                </div>
                {percentageString && !isCurrency && (
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">Share:</span>
                        <span className="font-semibold text-emerald-400 tabular-nums">{percentageString}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
