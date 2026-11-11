import { useCallback, useEffect, useRef, useState } from 'react';

export default function useUndoRedo(nodes, setNodes, edges, setEdges) {
    const [past, setPast] = useState([]);
    const [future, setFuture] = useState([]);
    const isUndoRedoing = useRef(false);
    const timeoutRef = useRef(null);

    // Deep compare omitting 'selected'
    const areEqual = (a, b) => {
        const cleanA = a.map(item => { const { selected, ...rest } = item; return rest; });
        const cleanB = b.map(item => { const { selected, ...rest } = item; return rest; });
        return JSON.stringify(cleanA) === JSON.stringify(cleanB);
    };

    const takeSnapshot = useCallback((force = false) => {
        if (isUndoRedoing.current) return;

        setPast((pastState) => {
            const lastState = pastState[pastState.length - 1];
            // Don't save if state hasn't meaningfully changed
            if (lastState && areEqual(lastState.nodes, nodes) && areEqual(lastState.edges, edges)) {
                return pastState;
            }

            const newPast = [
                ...pastState,
                { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }
            ];
            
            if (newPast.length > 50) return newPast.slice(newPast.length - 50);
            return newPast;
        });
        setFuture([]);
    }, [nodes, edges]);

    // Auto-snapshot with debounce
    useEffect(() => {
        if (isUndoRedoing.current) return;
        
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            takeSnapshot();
        }, 800); // 800ms debounce
        
        return () => clearTimeout(timeoutRef.current);
    }, [nodes, edges, takeSnapshot]);

    const undo = useCallback(() => {
        if (past.length === 0) return;
        
        isUndoRedoing.current = true;
        clearTimeout(timeoutRef.current);

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        
        setPast(newPast);
        setFuture((futureState) => [
            { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) },
            ...futureState
        ]);
        
        setNodes(previous.nodes);
        setEdges(previous.edges);
        
        setTimeout(() => { isUndoRedoing.current = false; }, 100);
    }, [past, nodes, edges, setNodes, setEdges]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        
        isUndoRedoing.current = true;
        clearTimeout(timeoutRef.current);

        const next = future[0];
        const newFuture = future.slice(1);
        
        setPast((pastState) => [
            ...pastState,
            { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }
        ]);
        setFuture(newFuture);
        
        setNodes(next.nodes);
        setEdges(next.edges);
        
        setTimeout(() => { isUndoRedoing.current = false; }, 100);
    }, [future, nodes, edges, setNodes, setEdges]);

    return { undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
