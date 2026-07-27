import React from 'react';
import { List, PieChart } from 'lucide-react';

export default function InsightsViewToggle({ activeView, onChangeView }) {
    return (
        <div
            role="tablist"
            aria-label="Insights View Mode"
            className="inline-flex items-center p-1 rounded-xl bg-gray-100/80 backdrop-blur-sm border border-gray-200/80 shadow-inner"
        >
            <button
                type="button"
                role="tab"
                aria-selected={activeView === 'list'}
                aria-controls="insights-view-content"
                onClick={() => onChangeView('list')}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                    activeView === 'list'
                        ? 'bg-white text-gray-900 shadow-sm shadow-gray-200 border border-gray-200/50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
            >
                <List className={`h-3.5 w-3.5 ${activeView === 'list' ? 'text-blue-600' : 'text-gray-500'}`} />
                <span>List</span>
            </button>

            <button
                type="button"
                role="tab"
                aria-selected={activeView === 'charts'}
                aria-controls="insights-view-content"
                onClick={() => onChangeView('charts')}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                    activeView === 'charts'
                        ? 'bg-white text-gray-900 shadow-sm shadow-gray-200 border border-gray-200/50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
            >
                <PieChart className={`h-3.5 w-3.5 ${activeView === 'charts' ? 'text-blue-600' : 'text-gray-500'}`} />
                <span>Charts</span>
            </button>
        </div>
    );
}
