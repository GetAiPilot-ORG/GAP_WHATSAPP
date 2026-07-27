import { Handle, Position } from 'reactflow';
import { Trash2, Check, AlertCircle, Eye } from 'lucide-react';

export default function BaseNode({
    id,
    data,
    icon: Icon,
    title,
    color = 'blue',
    children,
    handles = { input: true, output: true },
    selected = false
}) {
    const colorClasses = {
        blue: 'bg-[#128C7E] border-[#0b6f63] text-teal-700',
        green: 'bg-[#25D366] border-[#1fb85a] text-green-700',
        purple: 'bg-purple-600 border-purple-500 text-purple-700',
        orange: 'bg-orange-600 border-orange-500 text-orange-700',
        pink: 'bg-pink-600 border-pink-500 text-pink-700',
        red: 'bg-red-600 border-red-500 text-red-700',
        teal: 'bg-teal-600 border-teal-500 text-teal-700',
        indigo: 'bg-indigo-600 border-indigo-500 text-indigo-700',
        yellow: 'bg-yellow-500 border-yellow-400 text-yellow-700',
    };

    const bgColor = colorClasses[color]?.split(' ')[0] || 'bg-blue-500';
    const borderColor = colorClasses[color]?.split(' ')[1] || 'border-blue-400';

    const status = data?.status || { sent: 0, delivered: 0, subscribers: 0, errors: 0 };

    return (
        <div
            className={`flow-node group relative bg-white rounded-lg border border-gray-200 transition-all ${selected ? 'ring-2 ring-[#25D366] ring-offset-2 ring-offset-[#f5f7fa]' : 'hover:border-gray-300'
                }`}
            style={{ minWidth: '240px', maxWidth: '280px' }}
        >
            {/* Eye preview button */}
            {data?.onPreview && (
                <div className="absolute -left-10 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            data.onPreview(id);
                        }}
                        className="bg-white border border-gray-200 shadow-sm rounded-full p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-50 flex items-center justify-center nodrag nopan"
                        title="Preview node on WhatsApp"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                </div>
            )}
            {handles.input && (
                <Handle
                    type="target"
                    position={Position.Top}
                    className="flow-handle w-3 h-3 bg-white border-2 border-gray-400"
                />
            )}

            {/* Header */}
            <div className={`${bgColor} text-white px-3 py-2 rounded-t-lg flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4" />}
                    <span className="text-xs font-semibold">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    {data?.configured && (
                        <Check className="h-3 w-3 text-white opacity-70" />
                    )}
                    <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            data?.onDelete?.(id);
                        }}
                        className="text-white/80 hover:text-white transition-colors nodrag nopan"
                        title="Delete node"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="p-3">
                {children}
            </div>

            {/* Status Footer */}
            {(status.sent > 0 || status.delivered > 0 || status.subscribers > 0 || status.errors > 0) && (
                <div className="border-t border-gray-200 px-3 py-2 bg-[#f5f7fa] rounded-b-lg">
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div className="flex flex-col items-center">
                            <span className="text-blue-600 font-semibold">{status.sent}</span>
                            <span className="text-gray-500">Sent</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-green-600 font-semibold">{status.delivered}</span>
                            <span className="text-gray-500">Delivered</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-purple-600 font-semibold">{status.subscribers}</span>
                            <span className="text-gray-500">Subscribers</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className={`font-semibold ${status.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                {status.errors}
                            </span>
                            <span className="text-gray-500">Errors</span>
                        </div>
                    </div>
                </div>
            )}

            {handles.output && (
                <Handle
                    type="source"
                    position={Position.Bottom}
                    className="flow-handle w-3 h-3 bg-white border-2 border-gray-400"
                />
            )}
        </div>
    );
}
