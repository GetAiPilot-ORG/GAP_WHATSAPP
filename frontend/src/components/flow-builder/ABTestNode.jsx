import BaseNode from './BaseNode';
import { SplitSquareHorizontal } from 'lucide-react';
import { Handle, Position } from 'reactflow';

export default function ABTestNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={SplitSquareHorizontal}
            title="A/B Test"
            color="indigo"
            selected={selected}
            handles={{ input: true, output: false }}
        >
            <div className="space-y-3">
                <div className="text-xs text-gray-500 text-center mb-2">
                    Splits traffic 50/50 to test which path performs better.
                </div>
                
                <div className="space-y-1.5">
                    <div className="relative bg-indigo-50 border border-indigo-100 rounded px-3 py-2 text-xs flex justify-between items-center">
                        <span className="font-semibold text-indigo-700">Path A (50%)</span>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="pathA"
                            className="w-3 h-3 bg-indigo-500 !right-[-20px] transition-transform hover:scale-125"
                        />
                    </div>
                    <div className="relative bg-purple-50 border border-purple-100 rounded px-3 py-2 text-xs flex justify-between items-center">
                        <span className="font-semibold text-purple-700">Path B (50%)</span>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="pathB"
                            className="w-3 h-3 bg-purple-500 !right-[-20px] transition-transform hover:scale-125"
                        />
                    </div>
                </div>
            </div>
        </BaseNode>
    );
}
