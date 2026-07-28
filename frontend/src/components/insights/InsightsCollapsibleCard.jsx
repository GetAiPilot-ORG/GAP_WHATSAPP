import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, ChevronRight, BarChart2, Sparkles } from 'lucide-react';
import InsightsPieChart from './InsightsPieChart';
import InsightsCustomLegend from './InsightsCustomLegend';
import InsightsCompactLegend from './InsightsCompactLegend';

export default function InsightsCollapsibleCard({
    chartData,
    isExpanded,
    onExpand,
    onCollapse,
    isLoading,
}) {
    const [activeIndex, setActiveIndex] = useState(null);
    const [isHovering, setIsHovering] = useState(false);
    const hoverTimerRef = useRef(null);

    // Intentional 1-second hover delay before triggering expansion
    const handleMouseEnter = () => {
        setIsHovering(true);
        if (typeof window !== 'undefined' && window.innerWidth >= 1024 && !isExpanded) {
            hoverTimerRef.current = setTimeout(() => {
                onExpand();
            }, 1000);
        }
    };

    const handleMouseLeave = () => {
        setIsHovering(false);
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    const handleClick = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        if (isExpanded) {
            onCollapse();
        } else {
            onExpand();
        }
    };

    if (isLoading) {
        return (
            <div className="rounded-[20px] border border-gray-200/70 bg-white/70 backdrop-blur-md p-6 shadow-xs animate-pulse h-[220px] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-gray-200 rounded-md" />
                    <div className="h-5 w-16 bg-gray-200 rounded-full" />
                </div>
                <div className="flex items-center justify-between gap-4">
                    <div className="h-28 w-28 bg-gray-100 rounded-full" />
                    <div className="space-y-2 flex-1">
                        <div className="h-3 bg-gray-200 rounded w-full" />
                        <div className="h-3 bg-gray-200 rounded w-3/4" />
                    </div>
                </div>
            </div>
        );
    }

    if (!chartData) return null;

    const { id, title, totalFormatted, subLabel, data, totalValue, badgeColor } = chartData;
    const hasData = totalValue > 0;

    return (
        <motion.div
            layout
            layoutId={`insight-card-container-${id}`}
            transition={{
                type: 'spring',
                stiffness: 240,
                damping: 24,
            }}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            aria-label={`${title} insight card, ${isExpanded ? 'click to collapse' : 'hover 1 sec or click to expand'}`}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
            className={`group relative rounded-[20px] transition-all duration-500 cursor-pointer overflow-hidden outline-none focus:ring-2 focus:ring-blue-500/40 ${
                isExpanded
                    ? 'col-span-1 md:col-span-2 lg:col-span-2 border border-blue-500/40 bg-white shadow-[0_16px_40px_-12px_rgba(37,99,235,0.12)] ring-1 ring-blue-500/20'
                    : 'col-span-1 border border-gray-200/80 bg-white/80 backdrop-blur-xl shadow-[0_2px_10px_-2px_rgba(0,0,0,0.03)] hover:border-blue-400/50 hover:shadow-[0_10px_30px_-6px_rgba(37,99,235,0.08)] hover:scale-[1.008]'
            }`}
        >
            {/* Ambient 1-Sec Hover Intent Progress Bar */}
            {isHovering && !isExpanded && (
                <span className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 animate-[pulse_1s_ease-in-out_infinite]" />
            )}

            {/* Header Strip */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/80 bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${badgeColor || 'bg-blue-600'}`} />
                    <h3 className="text-sm font-bold text-gray-900 truncate tracking-tight">{title}</h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <span className="px-3 py-1 rounded-full bg-gray-100/90 border border-gray-200/60 text-xs font-extrabold text-gray-900 tabular-nums">
                        {totalFormatted}
                    </span>
                    <button
                        type="button"
                        tabIndex={-1}
                        className="h-7 w-7 rounded-lg border border-gray-200/80 bg-white flex items-center justify-center text-gray-400 group-hover:text-blue-600 group-hover:border-blue-200 transition-colors shadow-2xs"
                    >
                        {isExpanded ? (
                            <Minimize2 className="h-3.5 w-3.5" />
                        ) : (
                            <Maximize2 className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>

            {/* Card Body */}
            <div className="p-6">
                <AnimatePresence mode="wait">
                    {isExpanded ? (
                        <motion.div
                            key="expanded-view"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="space-y-6"
                        >
                            {!hasData ? (
                                <div className="py-10 px-4 flex flex-col items-center justify-center text-center my-auto">
                                    <div className="h-12 w-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 mb-3 shadow-inner">
                                        <BarChart2 className="h-6 w-6 stroke-[1.5]" />
                                    </div>
                                    <p className="text-xs font-bold text-gray-700">
                                        No analytics available for this period.
                                    </p>
                                    <p className="text-[11px] text-gray-400 mt-1 max-w-[220px]">
                                        No recorded message metrics match this category breakdown.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                    {/* Donut Chart (Expanded Scale) */}
                                    <InsightsPieChart
                                        data={data}
                                        totalFormatted={totalFormatted}
                                        subLabel={subLabel}
                                        activeIndex={activeIndex}
                                        onHoverIndex={setActiveIndex}
                                        hasData={hasData}
                                        size="full"
                                    />

                                    {/* Custom Interactive Legend */}
                                    <InsightsCustomLegend
                                        data={data}
                                        activeIndex={activeIndex}
                                        onHoverIndex={setActiveIndex}
                                    />
                                </div>
                            )}

                            {/* Expanded Card Footer */}
                            <div className="pt-3 border-t border-gray-100/80 flex items-center justify-between text-xs text-gray-400">
                                <span className="font-semibold text-blue-600 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Focus Mode Active
                                </span>
                                <span className="flex items-center gap-1 hover:text-gray-600">
                                    Click to collapse <Minimize2 className="h-3 w-3" />
                                </span>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="collapsed-view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3"
                        >
                            {/* Always Visible Donut Chart (Compact Scale) + Mini Legend */}
                            <div className="flex items-center gap-4">
                                <div className="w-[140px] shrink-0">
                                    <InsightsPieChart
                                        data={data}
                                        totalFormatted={totalFormatted}
                                        subLabel={subLabel}
                                        hasData={hasData}
                                        size="compact"
                                    />
                                </div>

                                <InsightsCompactLegend data={data} />
                            </div>

                            {/* Card Footer Hint */}
                            <div className="pt-2 flex items-center justify-between text-xs text-gray-400 group-hover:text-blue-600 transition-colors border-t border-gray-100/60">
                                <span className="font-medium">
                                    {isHovering ? 'Hold 1 sec to expand...' : 'Hover to expand'}
                                </span>
                                <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
