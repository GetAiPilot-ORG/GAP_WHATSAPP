import { useState, useRef, useCallback, useEffect } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    MarkerType,
    Panel,
    BaseEdge,
    EdgeLabelRenderer,
    getSmoothStepPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, ArrowLeft, Play, Zap, Handshake, Square, Plus, MoreHorizontal, X, ChevronDown } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import TourButton from '../../onboarding/TourButton';

// Import all node components
import StartBotFlowNode from './StartBotFlowNode';
import EnhancedTextNode from './EnhancedTextNode';
import EnhancedMediaNode from './EnhancedMediaNode';
import UserInputNode from './UserInputNode';
import EnhancedConditionNode from './EnhancedConditionNode';
import EnhancedButtonNode from './EnhancedButtonNode';
import LocationNode from './LocationNode';
import HTTPAPINode from './HTTPAPINode';
import AINode from './AINode';
import InteractiveNode from './InteractiveNode';
import WhatsAppFlowNode from './WhatsAppFlowNode';
import GoogleSheetsNode from './GoogleSheetsNode';
import TemplateMessageNode from './TemplateMessageNode';
import AppointmentNode from './AppointmentNode';
import ProductNode from './ProductNode';

// Import UI components
import EnhancedFlowSidebar from './EnhancedFlowSidebar';
import NodeConfigPanel from './NodeConfigPanel';
import BaseNode from './BaseNode';
import WhatsAppPreviewPanel from './WhatsAppPreviewPanel';

function DeletableEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    selected,
    data,
}) {
    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 14,
    });

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                className={selected ? 'flow-edge-path flow-edge-path-selected' : 'flow-edge-path'}
            />
            {selected && (
                <EdgeLabelRenderer>
                    <button
                        type="button"
                        className="flow-edge-delete nodrag nopan"
                        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            data?.onDelete?.(id);
                        }}
                        title="Delete connection"
                    >
                        ×
                    </button>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

// Register all node types
const nodeTypes = {
    startBotFlow: StartBotFlowNode,
    textMessage: EnhancedTextNode,
    image: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'image' }} />,
    video: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'video' }} />,
    audio: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'audio' }} />,
    file: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'file' }} />,
    userInput: UserInputNode,
    condition: EnhancedConditionNode,
    button: EnhancedButtonNode,
    location: LocationNode,
    httpApi: HTTPAPINode,
    ai: AINode,
    interactive: InteractiveNode,
    whatsappFlow: WhatsAppFlowNode,
    googleSheets: GoogleSheetsNode,
    template: TemplateMessageNode,
    appointment: AppointmentNode,
    product: ProductNode,
    handoff: ({ id, data, selected }) => (
        <BaseNode id={id} data={data} selected={selected} icon={Handshake} title="Handoff to Human" color="orange">
            <div className="text-xs text-gray-600">{data?.config?.reason || 'Request sales agent help'}</div>
        </BaseNode>
    ),
    end: ({ id, data, selected }) => (
        <BaseNode id={id} data={data} selected={selected} icon={Square} title="End Flow" color="teal" handles={{ input: true, output: false }}>
            <div className="text-xs text-gray-600">Complete the automation</div>
        </BaseNode>
    ),
};

const edgeTypes = {
    deletable: DeletableEdge,
};

function FlowEditorContent({ flow, waAccounts = [], onClose }) {
    const { session } = useAuth();
    const { alertDialog } = useDialog();
    const reactFlowWrapper = useRef(null);
    const [nodes, setNodes, onNodesChange] = useNodesState(flow?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(flow?.edges || []);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [configPanelOpen, setConfigPanelOpen] = useState(false);
    const [previewNodeId, setPreviewNodeId] = useState(null);
    const [accountScope, setAccountScope] = useState(flow?.wa_account_scope || 'all');
    const [accountIds, setAccountIds] = useState(Array.isArray(flow?.wa_account_ids) ? flow.wa_account_ids : []);

    // Mobile-specific state
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const [mobileNodesOpen, setMobileNodesOpen] = useState(false);
    const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
    const previewNode = nodes.find((node) => node.id === previewNodeId) || null;

    const getId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge({
            ...params,
            type: 'deletable',
            animated: false,
            style: { stroke: '#9aa4b2', strokeWidth: 1.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#9aa4b2' }
        }, eds)),
        []
    );

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            if (!type || !reactFlowInstance) return;

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode = {
                id: getId(),
                type,
                position,
                data: {
                    label: `New ${type}`,
                    config: {},
                    configured: false,
                    status: { sent: 0, delivered: 0, subscribers: 0, errors: 0 },
                    onDelete: handleDeleteNode,
                    onUpdate: handleUpdateNode,
                    onPreview: setPreviewNodeId,
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance]
    );

    // Mobile: tap-to-add node at canvas center
    const handleMobileTapNode = useCallback((type) => {
        if (!reactFlowInstance) return;

        // Place at center of current viewport
        const { x, y, zoom } = reactFlowInstance.getViewport();
        const canvasEl = reactFlowWrapper.current;
        const centerX = canvasEl ? canvasEl.offsetWidth / 2 : 200;
        const centerY = canvasEl ? canvasEl.offsetHeight / 2 : 200;

        const position = reactFlowInstance.screenToFlowPosition({
            x: centerX,
            y: centerY,
        });

        // Stagger so multiple additions don't stack exactly
        const offset = nodes.length * 30;
        const newNode = {
            id: getId(),
            type,
            position: { x: position.x + offset, y: position.y + offset },
            data: {
                label: `New ${type}`,
                config: {},
                configured: false,
                status: { sent: 0, delivered: 0, subscribers: 0, errors: 0 },
                onDelete: handleDeleteNode,
                onUpdate: handleUpdateNode,
                onPreview: setPreviewNodeId,
            },
        };

        setNodes((nds) => nds.concat(newNode));
        setMobileNodesOpen(false);
    }, [reactFlowInstance, nodes.length]);

    const handleDeleteNode = (nodeId) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedEdgeId(null);
        if (selectedNodeId === nodeId) {
            setSelectedNodeId(null);
            setConfigPanelOpen(false);
            setMobileConfigOpen(false);
        }
    };

    const handleDeleteEdge = useCallback((edgeId) => {
        setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
        setSelectedEdgeId(null);
    }, [setEdges]);

    const handleUpdateNode = (nodeId, newData) => {
        setNodes((nds) =>
            nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node))
        );
    };

    const onDragStart = (event, nodeType, nodeInfo) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const onNodeClick = useCallback((event, node) => {
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
        if (isMobile) {
            setMobileConfigOpen(true);
            setConfigPanelOpen(false);
        } else {
            setConfigPanelOpen(true);
        }
    }, [isMobile]);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setConfigPanelOpen(false);
        setMobileConfigOpen(false);
    }, []);

    const onEdgeClick = useCallback((event, edge) => {
        event.stopPropagation();
        setSelectedNodeId(null);
        setConfigPanelOpen(false);
        setMobileConfigOpen(false);
        setSelectedEdgeId(edge.id);
    }, []);

    const onKeyDown = useCallback((event) => {
        if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeId) {
            event.preventDefault();
            handleDeleteEdge(selectedEdgeId);
        }
    }, [handleDeleteEdge, selectedEdgeId]);

    const handleSaveConfig = (nodeId, config) => {
        setNodes((nds) =>
            nds.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, config, configured: true } }
                    : node
            )
        );
    };

    const handleSave = async () => {
        try {
            const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            await axios.put(`${API_URL}/api/flows/${flow.id}`, {
                nodes,
                edges,
                wa_account_scope: accountScope,
                wa_account_ids: accountScope === 'selected' ? accountIds : [],
            }, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            await alertDialog('Draft saved. Click Publish to make this flow live on WhatsApp.', { title: 'Draft saved', tone: 'success' });
        } catch (error) {
            console.error('Error saving flow:', error);
            alertDialog('Failed to save flow.', { title: 'Save failed', tone: 'danger' });
        }
    };

    const handlePublish = async () => {
        try {
            const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            await axios.put(`${API_URL}/api/flows/${flow.id}`, {
                nodes,
                edges,
                wa_account_scope: accountScope,
                wa_account_ids: accountScope === 'selected' ? accountIds : [],
            }, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            await axios.post(`${API_URL}/api/flows/${flow.id}/publish`, {}, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            onClose();
        } catch (error) {
            const details = error?.response?.data?.validation?.errors || [error?.response?.data?.error || 'Failed to publish flow'];
            alertDialog(details.join('\n'), { title: 'Publish failed', tone: 'danger' });
        }
    };

    const handleTest = async () => {
        console.log('Testing flow:', { nodes, edges });
        await alertDialog('Flow test started. Check console for details.', { title: 'Test started', tone: 'info' });
    };

    return (
        <div className="h-full flex flex-col bg-[#f5f7fa]">

            {/* ── MOBILE HEADER (< md) ── */}
            <div className="md:hidden bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
                {/* Left: Back + Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                        onClick={onClose}
                        className="h-8 w-8 shrink-0 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors inline-flex items-center justify-center"
                        title="Back"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-sm font-semibold text-black truncate leading-tight">{flow.name}</h1>
                        <p className="text-[10px] text-gray-400 leading-none mt-0.5">
                            {nodes.length} nodes · {edges.length} connections
                        </p>
                    </div>
                </div>

                {/* Right: Publish + More */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={handlePublish}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-black px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#181818]"
                    >
                        <Zap className="h-3.5 w-3.5" />
                        Publish
                    </button>
                    <button
                        onClick={() => setMobileMoreOpen(true)}
                        className="h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full inline-flex items-center justify-center"
                        title="More options"
                    >
                        <MoreHorizontal className="h-4.5 w-4.5" />
                    </button>
                </div>
            </div>

            {/* ── DESKTOP HEADER (md+) ── */}
            <div className="hidden md:flex bg-white border-b border-gray-200 px-5 py-1 items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors inline-flex items-center justify-center"
                        title="Back"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h1 className="text-base font-semibold leading-tight text-black">{flow.name}</h1>
                        {flow.description && <p className="text-[11px] text-gray-500 mt-0.5">{flow.description}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <TourButton compact />
                    <AccountTargetControl
                        accounts={waAccounts}
                        scope={accountScope}
                        selectedIds={accountIds}
                        onScopeChange={setAccountScope}
                        onSelectedIdsChange={setAccountIds}
                    />
                    <div className="text-xs text-gray-600 px-3 py-1 bg-[#f5f7fa] rounded-full">
                        <span className="font-semibold">{nodes.length}</span> nodes · <span className="font-semibold">{edges.length}</span> connections
                    </div>
                    <button
                        onClick={handleTest}
                        className="fp-button-secondary !h-8 !px-4 !text-xs"
                    >
                        <Play className="h-4 w-4" />
                        Test Flow
                    </button>
                    <button
                        onClick={handleSave}
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#1fb85a] disabled:opacity-50"
                    >
                        <Save className="h-4 w-4" />
                        Save Flow
                    </button>
                    <button
                        onClick={handlePublish}
                        className="fp-button-primary bg-black hover:bg-[#181818] !h-8 !px-4 !text-xs"
                    >
                        <Zap className="h-4 w-4" />
                        Publish
                    </button>
                </div>
            </div>

            {/* ── MAIN BODY ── */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* Desktop Sidebar (md+) */}
                <div data-tour="flow-editor-sidebar" className="hidden md:block h-full shrink-0">
                    <EnhancedFlowSidebar onDragStart={onDragStart} />
                </div>

                {/* Canvas — full width on mobile, shared on desktop */}
                <div data-tour="flow-editor-canvas" className="flex-1 relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes.map(node => ({
                            ...node,
                            selected: selectedNode?.id === node.id,
                            data: {
                                ...node.data,
                                onDelete: handleDeleteNode,
                                onUpdate: handleUpdateNode,
                                onPreview: setPreviewNodeId,
                            },
                        }))}
                        edges={edges.map(edge => ({
                            ...edge,
                            type: 'deletable',
                            animated: false,
                            selected: selectedEdgeId === edge.id,
                            data: {
                                ...edge.data,
                                onDelete: handleDeleteEdge,
                            },
                            markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed, color: '#9aa4b2' },
                        }))}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onInit={setReactFlowInstance}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onNodeClick={onNodeClick}
                        onEdgeClick={onEdgeClick}
                        onPaneClick={onPaneClick}
                        onKeyDown={onKeyDown}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.28, minZoom: 0.55, maxZoom: 0.9 }}
                        className="flow-canvas"
                        defaultEdgeOptions={{
                            type: 'deletable',
                            animated: false,
                            style: { strokeWidth: 1.8, stroke: '#9aa4b2' },
                        }}
                        deleteKeyCode={['Backspace', 'Delete']}
                        minZoom={0.35}
                        maxZoom={2}
                    >
                        <Controls className="flow-controls bg-white border border-gray-200 rounded-lg" />
                        <Background variant="dots" gap={18} size={1.2} color="#cbd5e1" />

                        {/* Empty State */}
                        {nodes.length === 0 && (
                            <Panel position="top-center" className="mt-16 md:mt-20">
                                <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-8 max-w-xs md:max-w-md text-center mx-3">
                                    <div className="w-10 h-10 md:w-14 md:h-14 bg-[#25D366] rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
                                        <Zap className="h-5 w-5 md:h-8 md:w-8 text-white" />
                                    </div>
                                    <h3 className="text-sm md:text-lg font-bold text-gray-900 mb-1.5 md:mb-2">
                                        Start Building Your Flow
                                    </h3>
                                    <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
                                        <span className="md:hidden">Tap <strong>+ Add Node</strong> below to build your WhatsApp automation</span>
                                        <span className="hidden md:inline">Drag nodes from the sidebar to create your WhatsApp automation workflow</span>
                                    </p>
                                    <div className="flex gap-2 justify-center text-xs text-gray-500 flex-wrap">
                                        <span className="bg-blue-50 px-2.5 py-1 rounded-full">📱 Messages</span>
                                        <span className="bg-purple-50 px-2.5 py-1 rounded-full">🤖 AI</span>
                                        <span className="bg-green-50 px-2.5 py-1 rounded-full">🔗 Integrations</span>
                                    </div>
                                </div>
                            </Panel>
                        )}
                    </ReactFlow>

                    {/* Desktop Configuration Panel */}
                    {!isMobile && configPanelOpen && selectedNode && (
                        <NodeConfigPanel
                            node={selectedNode}
                            onClose={() => setConfigPanelOpen(false)}
                            onSave={handleSaveConfig}
                        />
                    )}

                    {/* WhatsApp Preview Panel */}
                    <WhatsAppPreviewPanel
                        node={previewNode}
                        onClose={() => setPreviewNodeId(null)}
                        phoneNumber={waAccounts?.[0]?.display_phone_number || waAccounts?.[0]?.phone_number_id || '+91 00000 00000'}
                        isConfigOpen={configPanelOpen && selectedNode !== null}
                    />

                    {/* ── MOBILE: Floating Add Node FAB ── */}
                    <div className="md:hidden absolute bottom-5 left-1/2 -translate-x-1/2 z-30">
                        <button
                            onClick={() => setMobileNodesOpen(true)}
                            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#25D366] text-white text-sm font-bold shadow-lg shadow-green-500/30 active:scale-95 transition-transform"
                        >
                            <Plus className="h-4.5 w-4.5" />
                            Add Node
                        </button>
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════
                MOBILE BOTTOM SHEETS
            ════════════════════════════════════════ */}

            {/* ── More Menu Bottom Sheet ── */}
            {mobileMoreOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMobileMoreOpen(false)}>
                    <div
                        className="absolute inset-0 bg-black/40"
                        aria-hidden="true"
                    />
                    <div
                        className="relative w-full bg-white rounded-t-2xl pb-safe-area animate-slide-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="h-1 w-10 rounded-full bg-gray-300" />
                        </div>
                        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 truncate max-w-[220px]">{flow.name}</h3>
                                <p className="text-[11px] text-gray-400 mt-0.5">{nodes.length} nodes · {edges.length} connections</p>
                            </div>
                            <button
                                onClick={() => setMobileMoreOpen(false)}
                                className="h-8 w-8 rounded-full bg-gray-100 inline-flex items-center justify-center text-gray-500"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Actions */}
                        <div className="px-4 py-3 space-y-2">
                            <button
                                onClick={async () => { setMobileMoreOpen(false); await handleSave(); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                            >
                                <Save className="h-4.5 w-4.5 text-[#25D366]" />
                                Save Flow
                            </button>
                            <button
                                onClick={async () => { setMobileMoreOpen(false); await handleTest(); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                            >
                                <Play className="h-4.5 w-4.5 text-blue-500" />
                                Test Flow
                            </button>
                        </div>

                        {/* Account Scope */}
                        <div className="px-4 pb-3">
                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Run on numbers</p>
                                <MobileAccountTargetControl
                                    accounts={waAccounts}
                                    scope={accountScope}
                                    selectedIds={accountIds}
                                    onScopeChange={setAccountScope}
                                    onSelectedIdsChange={setAccountIds}
                                />
                            </div>
                        </div>

                        {/* Safe-area spacer */}
                        <div className="h-4" />
                    </div>
                </div>
            )}

            {/* ── Nodes Bottom Sheet ── */}
            {mobileNodesOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMobileNodesOpen(false)}>
                    <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
                    <div
                        className="relative w-full bg-white rounded-t-2xl animate-slide-up"
                        style={{ height: '70vh' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="h-1 w-10 rounded-full bg-gray-300" />
                        </div>

                        {/* Sheet header */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-900">Add Node</h3>
                            <button
                                onClick={() => setMobileNodesOpen(false)}
                                className="h-8 w-8 rounded-full bg-gray-100 inline-flex items-center justify-center text-gray-500"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Sidebar content (mobile mode) */}
                        <div className="flex-1 overflow-hidden" style={{ height: 'calc(70vh - 80px)' }}>
                            <EnhancedFlowSidebar
                                onDragStart={onDragStart}
                                mobileMode={true}
                                onMobileTap={handleMobileTapNode}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Node Config Bottom Sheet (mobile) ── */}
            {mobileConfigOpen && selectedNode && (
                <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-white animate-slide-up">
                    {/* Sheet top bar */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
                        <button
                            onClick={() => { setMobileConfigOpen(false); setSelectedNodeId(null); }}
                            className="h-8 w-8 rounded-full bg-gray-100 inline-flex items-center justify-center text-gray-600"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-sm font-bold text-gray-900 truncate">Configure Node</h2>
                            <p className="text-[10px] text-gray-400 truncate">{selectedNode.type}</p>
                        </div>
                    </div>

                    {/* Config panel content – rendered relative so backdrop/panel fills correctly */}
                    <div className="flex-1 overflow-hidden relative">
                        <NodeConfigPanel
                            node={selectedNode}
                            onClose={() => { setMobileConfigOpen(false); setSelectedNodeId(null); }}
                            onSave={(nodeId, config) => { handleSaveConfig(nodeId, config); setMobileConfigOpen(false); setSelectedNodeId(null); }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function AccountTargetControl({ accounts, scope, selectedIds, onScopeChange, onSelectedIdsChange }) {
    const selectedSet = new Set(selectedIds || []);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleAccount = (id) => {
        onSelectedIdsChange(
            selectedSet.has(id)
                ? selectedIds.filter((item) => item !== id)
                : [...selectedIds, id]
        );
    };

    return (
        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1 py-0.5">
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none"
                    title="Choose where this flow can run"
                >
                    {scope === 'all' ? 'Runs on all numbers' : 'Runs on selected numbers'}
                    <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                
                {isOpen && (
                    <div className="absolute left-0 top-full mt-2 w-56 origin-top-left rounded-xl border border-gray-200/60 bg-white/80 p-1 shadow-lg backdrop-blur-xl z-50">
                        <button
                            onClick={() => { onScopeChange('all'); setIsOpen(false); }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${scope === 'all' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 font-medium hover:bg-gray-100'}`}
                        >
                            Runs on all numbers
                            {scope === 'all' && (
                                <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={() => { onScopeChange('selected'); setIsOpen(false); }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors mt-0.5 ${scope === 'selected' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 font-medium hover:bg-gray-100'}`}
                        >
                            Runs on selected numbers
                            {scope === 'selected' && (
                                <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {scope === 'selected' && (
                <div className="flex max-w-[320px] items-center gap-1 overflow-x-auto border-l border-gray-200 pl-1.5 ml-0.5">
                    {accounts.length === 0 ? (
                        <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">No accounts</span>
                    ) : accounts.map((account) => (
                        <label
                            key={account.id}
                            className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors ${selectedSet.has(account.id) ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                }`}
                        >
                            <input
                                type="checkbox"
                                className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={selectedSet.has(account.id)}
                                onChange={() => toggleAccount(account.id)}
                            />
                            {getEditorAccountLabel(account)}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

// Mobile-specific simplified account scope control (used in More sheet)
function MobileAccountTargetControl({ accounts, scope, selectedIds, onScopeChange, onSelectedIdsChange }) {
    const selectedSet = new Set(selectedIds || []);

    const toggleAccount = (id) => {
        onSelectedIdsChange(
            selectedSet.has(id)
                ? selectedIds.filter((item) => item !== id)
                : [...selectedIds, id]
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <button
                    onClick={() => onScopeChange('all')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${scope === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                    All numbers
                </button>
                <button
                    onClick={() => onScopeChange('selected')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${scope === 'selected' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                    Selected
                </button>
            </div>
            {scope === 'selected' && accounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {accounts.map((account) => (
                        <label
                            key={account.id}
                            className={`flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors ${selectedSet.has(account.id) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200'}`}
                        >
                            <input
                                type="checkbox"
                                className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={selectedSet.has(account.id)}
                                onChange={() => toggleAccount(account.id)}
                            />
                            {getEditorAccountLabel(account)}
                        </label>
                    ))}
                </div>
            )}
            {scope === 'selected' && accounts.length === 0 && (
                <p className="text-xs text-amber-600 font-medium">No WhatsApp accounts connected.</p>
            )}
        </div>
    );
}

function getEditorAccountLabel(account) {
    const label = account?.display_phone_number || account?.phone_number_id || account?.name || 'Account';
    return `${label} ${account?.whatsapp_business_account_id ? 'Meta' : 'QR'}`;
}

export default function FlowEditor({ flow, waAccounts, onClose }) {
    return (
        <ReactFlowProvider>
            <FlowEditorContent flow={flow} waAccounts={waAccounts} onClose={onClose} />
        </ReactFlowProvider>
    );
}
