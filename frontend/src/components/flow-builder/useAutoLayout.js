import dagre from 'dagre';
import { useCallback } from 'react';
import { useReactFlow } from 'reactflow';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

export default function useAutoLayout() {
    const { getNodes, getEdges, setNodes, setEdges, fitView } = useReactFlow();

    const onLayout = useCallback(() => {
        const nodes = getNodes();
        const edges = getEdges();
        
        if (nodes.length === 0) return;

        // Set graph configuration
        dagreGraph.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 60, ranksep: 280 });

        // Add nodes to dagre
        nodes.forEach((node) => {
            // Rough estimate for typical node sizes in this builder
            const width = 320;
            const height = 150;
            dagreGraph.setNode(node.id, { width, height });
        });

        // Add edges to dagre
        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        // Compute layout
        dagre.layout(dagreGraph);

        // Apply new positions
        const newNodes = nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            // Center the anchor point for react-flow
            const newX = nodeWithPosition.x - (320 / 2);
            const newY = nodeWithPosition.y - (150 / 2);

            return {
                ...node,
                position: { x: newX, y: newY },
            };
        });

        setNodes(newNodes);

        // Give React Flow a frame to update nodes before fitting view
        window.requestAnimationFrame(() => {
            fitView({ padding: 0.3, duration: 800 });
        });
    }, [getNodes, getEdges, setNodes, setEdges, fitView]);

    return onLayout;
}
