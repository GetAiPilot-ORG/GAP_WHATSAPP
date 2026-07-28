import React from 'react';

export default function InsightsCompactLegend({ data }) {
    if (!data || !data.length) return null;

    // Display top 3 categories or active categories
    const activeItems = data.filter((d) => d.value > 0);
    const displayItems = activeItems.length > 0 ? activeItems.slice(0, 3) : data.slice(0, 3);
    const remainingCount = Math.max(0, data.length - displayItems.length);

    return (
        <div className="space-y-1.5 min-w-0 flex-1">
            {displayItems.map((item) => (
                <div key={item.key || item.label} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.value > 0 ? item.color : '#cbd5e1' }}
                        />
                        <span className="text-gray-600 font-medium truncate">{item.label}</span>
                    </div>
                    <span className="font-semibold text-gray-900 tabular-nums text-right shrink-0">
                        {item.formattedValue}
                    </span>
                </div>
            ))}

            {remainingCount > 0 && (
                <div className="text-[10px] text-gray-400 font-medium pt-0.5">
                    +{remainingCount} more categories
                </div>
            )}
        </div>
    );
}
