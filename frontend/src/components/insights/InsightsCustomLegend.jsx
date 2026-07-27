import React from 'react';

export default function InsightsCustomLegend({ data, activeIndex, onHoverIndex }) {
    if (!data || !data.length) return null;

    return (
        <div className="mt-3 pt-3 border-t border-gray-100 divide-y divide-gray-50/60 max-h-[220px] overflow-y-auto pr-1">
            {data.map((item, idx) => {
                const isActive = activeIndex === idx;
                const isZero = item.value === 0;

                return (
                    <div
                        key={item.key || item.label}
                        onMouseEnter={() => onHoverIndex(idx)}
                        onMouseLeave={() => onHoverIndex(null)}
                        className={`flex items-center justify-between py-1.5 px-2 rounded-lg text-xs transition-all duration-150 cursor-pointer ${
                            isActive
                                ? 'bg-blue-50/80 font-medium text-blue-900 shadow-sm border border-blue-100/60'
                                : isZero
                                ? 'text-gray-400 hover:bg-gray-50'
                                : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span
                                className={`h-2.5 w-2.5 rounded-full shrink-0 transition-transform duration-150 ${
                                    isActive ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''
                                }`}
                                style={{ backgroundColor: item.color }}
                            />
                            <span className={`truncate ${isActive ? 'font-semibold text-gray-900' : ''}`}>
                                {item.label}
                            </span>
                        </div>
                        <span className={`font-semibold tabular-nums shrink-0 ${
                            isActive ? 'text-blue-700' : isZero ? 'text-gray-400' : 'text-gray-900'
                        }`}>
                            {item.formattedValue}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
