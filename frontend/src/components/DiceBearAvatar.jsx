import React from 'react';

function getAvatarColor(name) {
    const colors = [
        'bg-[#e0e7ff] text-[#4f46e5]', // Indigo
        'bg-[#fee2e2] text-[#dc2626]', // Red
        'bg-[#fef3c7] text-[#d97706]', // Amber/Orange
        'bg-[#d1fae5] text-[#059669]', // Emerald
        'bg-[#e0f2fe] text-[#0284c7]', // Sky Blue
        'bg-[#f3e8ff] text-[#9333ea]', // Purple
        'bg-[#fae8ff] text-[#c084fc]', // Fuchsia
    ];
    let hash = 0;
    const str = name || '';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

export default function DiceBearAvatar({ seed, className }) {
    const colorClass = getAvatarColor(seed);
    const initial = seed ? seed.charAt(0).toUpperCase() : '?';

    // Determine text sizing from classes
    let textSize = 'text-base';
    if (className) {
        if (className.includes('h-8') || className.includes('h-9')) {
            textSize = 'text-xs sm:text-sm';
        } else if (className.includes('h-10') || className.includes('h-11')) {
            textSize = 'text-[17px]';
        } else if (className.includes('h-14')) {
            textSize = 'text-xl';
        } else if (className.includes('h-16')) {
            textSize = 'text-2xl';
        }
    }

    return (
        <div className={`flex items-center justify-center font-bold ${colorClass} ${className} shadow-sm`}>
            <span className={textSize}>{initial}</span>
        </div>
    );
}

