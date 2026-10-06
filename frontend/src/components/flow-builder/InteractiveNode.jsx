import BaseNode from './BaseNode';
import { List } from 'lucide-react';
import { Handle, Position } from 'reactflow';

export default function InteractiveNode({ id, data, selected }) {
    const config = data?.config || {};
    const items = config.items || [];

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
                        <div className="text-[10px] uppercase font-bold text-teal-600 mb-2 tracking-wider">List Options</div>
                        {items.map((item, index) => {
                            const handleId = item.title || item.id || `item-${index}`;
                            return (
                                <div key={index} className="relative bg-teal-50/50 border border-teal-100/50 rounded px-2 py-1.5 text-xs flex justify-between items-center group">
                                    <span className="truncate text-teal-800 font-medium pr-2">{handleId}</span>
                                    <Handle
                                        type="source"
                                        position={Position.Right}
                                        id={handleId}
                                        className="w-3 h-3 bg-teal-500 !right-[-20px] transition-transform hover:scale-125 hover:bg-teal-600"
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic py-2">
                        Click to configure list items
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
