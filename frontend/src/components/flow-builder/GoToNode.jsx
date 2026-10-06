import { Waypoints } from 'lucide-react';
import BaseNode from './BaseNode';

export default function GoToNode({ id, data, selected }) {
    const targetNodeId = data?.config?.targetNodeId;

    return (
        <BaseNode
            id={id}
            data={data}
            selected={selected}
            icon={Waypoints}
            title="Jump to Node"
            color="indigo"
            handles={{ input: true, output: false }}
        >
            <div className="text-xs text-gray-600 truncate bg-indigo-50 px-2 py-1.5 rounded border border-indigo-100">
                {targetNodeId ? (
                    <div className="flex items-center gap-1.5 font-medium text-indigo-700">
                        <Waypoints className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Jump to: {data.config.targetNodeName || targetNodeId}</span>
                    </div>
                ) : (
                    <span className="text-gray-400 italic">Select a target node...</span>
                )}
            </div>
        </BaseNode>
    );
}
