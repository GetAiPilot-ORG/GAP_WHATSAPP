import { Handle, Position } from 'reactflow';
import { Trash2, Check, Link2, Eye } from 'lucide-react';

export default function EnhancedButtonNode({ id, data, selected }) {
    const config = data?.config || {};
    const buttons = config.buttons || [];

    return (
        <div
            className={`flow-node relative group bg-white rounded-lg border border-gray-200 transition-all ${selected ? 'ring-2 ring-[#25D366] ring-offset-2 ring-offset-[#f5f7fa]' : 'hover:border-gray-300'}`}
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

            {/* Input Handle - Top */}
            <Handle type="target" position={Position.Top} className="flow-handle w-3 h-3 bg-white border-2 border-gray-400" />

            {/* Header */}
            <div className="bg-[#25D366] text-white px-3 py-2 rounded-t-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    <span className="text-xs font-semibold">Buttons</span>
                </div>
                <div className="flex items-center gap-1">
                    {data?.configured && <Check className="h-3 w-3 text-white opacity-70" />}
                    <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            data?.onDelete?.(id);
                        }}
                        className="text-white/80 hover:text-white nodrag nopan"
                        title="Delete node"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-1.5">
                {config.headerText && (
                    <div className="text-xs text-gray-600 mb-2 bg-gray-50 p-2 rounded">{config.headerText}</div>
                )}

                {buttons.length > 0 ? (
                    buttons.map((btn, idx) => (
                        btn.text && (
                            <div key={idx} className="relative">
                                <div className="bg-green-50/80 border border-green-200 rounded px-2 py-1.5 pr-6">
                                    <div className="text-xs font-medium text-green-800">{btn.text}</div>
                                    <div className="text-[10px] text-green-500">
                                        {btn.type === 'url' ? '🔗 URL' : btn.type === 'form' ? '📝 Form' : btn.type === 'phone' ? '📞 Call' : '↩ Reply'}
                                    </div>
                                </div>
                                {/* Per-button output handle */}
                                {btn.type === 'reply' && (
                                    <Handle
                                        type="source"
                                        position={Position.Right}
                                        id={`button-${idx}`}
                                        style={{ top: '50%', right: -8 }}
                                        className="flow-handle w-3 h-3 bg-white border-2 border-green-500"
                                    />
                                )}
                            </div>
                        )
                    ))
                ) : (
                    <div className="text-xs text-gray-400 italic">Configure buttons</div>
                )}
            </div>
        </div>
    );
}
