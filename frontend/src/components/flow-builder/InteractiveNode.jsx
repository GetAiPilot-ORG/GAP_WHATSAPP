import BaseNode from './BaseNode';
import { List, Trash2, Plus } from 'lucide-react';
import { Handle, Position } from 'reactflow';

export default function InteractiveNode({ id, data, selected }) {
    const config = data?.config || {};
    const items = config.items || [];

    const handleDeleteItem = (indexToDelete, event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!data?.onUpdate) return;
        const newItems = items.filter((_, idx) => idx !== indexToDelete);
        data.onUpdate(id, {
            config: {
                ...config,
                items: newItems,
            },
        });
    };

    const handleAddItem = (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!data?.onUpdate || items.length >= 10) return;
        const newItems = [
            ...items,
            { id: `item${items.length + 1}`, title: `Option ${items.length + 1}`, description: '' },
        ];
        data.onUpdate(id, {
            config: {
                ...config,
                items: newItems,
            },
        });
    };

    return (
        <BaseNode
            id={id}
            data={data}
            icon={List}
            title="Interactive List"
            color="teal"
            selected={selected}
            handles={{ input: true, output: false }}
        >
            <div className="space-y-2">
                {items.length > 0 ? (
                    <div className="space-y-1.5 mt-2">
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold text-teal-600 mb-1.5 tracking-wider">
                            <span>List Options ({items.length}/10)</span>
                            {items.length < 10 && (
                                <button
                                    type="button"
                                    onClick={handleAddItem}
                                    className="text-teal-600 hover:text-teal-800 hover:bg-teal-100/60 p-0.5 rounded nodrag nopan flex items-center transition-colors"
                                    title="Add menu item"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        {items.map((item, index) => {
                            const handleId = item.title || item.id || `item-${index}`;
                            return (
                                <div
                                    key={index}
                                    className="relative bg-teal-50/60 border border-teal-100 rounded px-2 py-1.5 text-xs flex justify-between items-center group/item hover:bg-teal-100/50 transition-colors"
                                >
                                    <span className="truncate text-teal-800 font-medium pr-1.5 flex-1">{handleId}</span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => handleDeleteItem(index, e)}
                                            className="opacity-0 group-hover/item:opacity-100 text-teal-600 hover:text-red-600 p-0.5 rounded hover:bg-white/80 transition-all nodrag nopan cursor-pointer"
                                            title="Delete menu item"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                        <Handle
                                            type="source"
                                            position={Position.Right}
                                            id={handleId}
                                            className="w-3 h-3 bg-teal-500 !right-[-20px] transition-transform hover:scale-125 hover:bg-teal-600"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic py-2 flex items-center justify-between">
                        <span>No list items</span>
                        <button
                            type="button"
                            onClick={handleAddItem}
                            className="text-teal-600 hover:text-teal-800 font-medium text-xs flex items-center gap-1 nodrag nopan"
                        >
                            <Plus className="h-3 w-3" /> Add item
                        </button>
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
