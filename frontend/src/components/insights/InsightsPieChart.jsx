import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import InsightsCustomTooltip from './InsightsCustomTooltip';

/**
 * Custom Active Shape for subtle 3D depth expansion on hover
 */
const renderActiveShape = (props) => {
    const {
        cx, cy, innerRadius, outerRadius, startAngle, endAngle,
        fill
    } = props;

    return (
        <g className="transition-all duration-300">
            {/* Soft Ambient Glow */}
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={outerRadius + 2}
                outerRadius={outerRadius + 7}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                opacity={0.2}
            />
            {/* Enlarged Sector */}
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius - 2}
                outerRadius={outerRadius + 5}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={2}
                style={{ filter: 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.12))' }}
            />
        </g>
    );
};

export default function InsightsPieChart({
    data,
    totalFormatted,
    subLabel,
    activeIndex,
    onHoverIndex,
    hasData,
}) {
    const chartData = useMemo(() => {
        if (!hasData) {
            return [{ label: 'Empty', value: 1, color: '#f1f5f9' }];
        }
        return data.map((d) => ({
            ...d,
            chartValue: d.value > 0 ? d.value : 0,
        }));
    }, [data, hasData]);

    return (
        <div className="relative w-full h-[180px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Tooltip content={<InsightsCustomTooltip />} />
                    <Pie
                        data={chartData}
                        dataKey="chartValue"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={74}
                        paddingAngle={hasData ? 3 : 0}
                        cornerRadius={4}
                        activeIndex={hasData && activeIndex !== null ? activeIndex : undefined}
                        activeShape={hasData ? renderActiveShape : undefined}
                        onMouseEnter={(_, index) => hasData && onHoverIndex && onHoverIndex(index)}
                        onMouseLeave={() => hasData && onHoverIndex && onHoverIndex(null)}
                        isAnimationActive={true}
                        animationDuration={650}
                        animationEasing="ease-out"
                    >
                        {chartData.map((entry, index) => {
                            const isZero = entry.value === 0;
                            const fillColor = isZero ? '#f1f5f9' : entry.color;

                            return (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={fillColor}
                                    stroke={isZero ? '#e2e8f0' : '#ffffff'}
                                    strokeWidth={isZero ? 1 : 2}
                                    style={{
                                        filter: isZero ? 'none' : 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.08))',
                                        transition: 'all 0.25s ease',
                                    }}
                                />
                            );
                        })}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>

            {/* Center Content Inside Donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
                <span className="text-base font-extrabold text-gray-900 leading-none tabular-nums tracking-tight">
                    {totalFormatted}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-1 max-w-[85px] truncate">
                    {subLabel}
                </span>
            </div>
        </div>
    );
}
