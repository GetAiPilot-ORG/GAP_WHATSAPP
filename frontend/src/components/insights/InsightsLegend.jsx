import React from 'react';

export default function InsightsLegend({ data, totalValue, activeIndex, onHoverIndex }) {
    if (!data || !data.length) return null;

    return (
        <div className="space-y-2 w-full">
            {data.map((item, idx) => {
                const isActive = activeIndex === idx;
                const isZero = item.value === 0;
                const percentage = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(0) + '%' : '0%';

                return (
                    <div
                        key={item.key || item.label}
                        onMouseEnter={() => onHoverIndex(idx)}
                        onMouseLeave={() => onHoverIndex(null)}
                        className={`flex items-center justify-between py-1.5 px-2.5 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                            isActive
                                ? 'bg-blue-50/80 text-blue-900 font-semibold shadow-2xs ring-1 ring-blue-200/60'
                                : isZero
                                ? 'text-gray-400 hover:bg-gray-50/80'
                                : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        {/* Dot + Label */}
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span
                                className={`h-2.5 w-2.5 rounded-full shrink-0 transition-transform duration-150 ${
                                    isActive ? 'scale-125 ring-2 ring-blue-300 ring-offset-1' : ''
                                }`}
                                style={{ backgroundColor: isZero ? '#e2e8f0' : item.color }}
                            />
                            <span className="truncate">{item.label}</span>
                        </div>

                        {/* Value + Percentage */}
                        <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            <span className={`font-bold ${isActive ? 'text-blue-900' : isZero ? 'text-gray-400' : 'text-gray-900'}`}>
                                {item.formattedValue}
                            </span>
                            {!item.isCurrency && (
                                <span className={`text-[11px] font-medium w-9 text-right ${isZero ? 'text-gray-300' : 'text-gray-400'}`}>
                                    {percentage}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
