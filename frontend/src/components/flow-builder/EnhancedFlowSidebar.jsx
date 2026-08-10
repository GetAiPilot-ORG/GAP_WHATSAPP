import {
    Bot, Calendar, ChevronDown, FileSpreadsheet, FileText, GitBranch, Globe,
    Handshake, Image, Link2, MapPin, MessageSquare, Music, PackageSearch,
    Rocket, Search, Square, UserCircle, Video, Workflow, File, X
} from 'lucide-react';
import { useMemo, useState } from 'react';

const nodeCategories = [
    {
        title: 'Trigger',
        nodes: [
            {
                type: 'startBotFlow',
                icon: Rocket,
                label: 'Keyword Trigger',
                description: 'Start the flow when a message matches keywords.',
                useCase: 'Use this as the first block for welcome, pricing, support, or campaign entry points.',
                setup: ['Add one or more keywords', 'Choose exact or contains match', 'Connect it to the first reply'],
                badge: 'Required',
            },
        ],
    },
    {
        title: 'Send',
        nodes: [
            {
                type: 'textMessage',
                icon: MessageSquare,
                label: 'Text Message',
                description: 'Send a simple WhatsApp text reply.',
                useCase: 'Best for greetings, confirmations, instructions, and short answers.',
                setup: ['Write message copy', 'Insert variables like {{name}}', 'Optionally add typing delay'],
            },
            {
                type: 'template',
                icon: FileText,
                label: 'Template Message',
                description: 'Send an approved Meta template.',
                useCase: 'Use for outbound notifications, reminders, order updates, or re-engagement.',
                setup: ['Select template', 'Map variables', 'Choose language'],
                badge: 'Meta',
            },
            {
                type: 'image',
                icon: Image,
                label: 'Image',
                description: 'Send an image with an optional caption.',
                useCase: 'Useful for product photos, offers, posters, receipts, and visual instructions.',
                setup: ['Upload or paste image URL', 'Add caption', 'Connect next step'],
            },
            {
                type: 'video',
                icon: Video,
                label: 'Video',
                description: 'Send a video message.',
                useCase: 'Use for demos, walkthroughs, testimonials, and onboarding clips.',
                setup: ['Upload or paste video URL', 'Add optional caption', 'Keep file size WhatsApp-safe'],
            },
            {
                type: 'audio',
                icon: Music,
                label: 'Audio',
                description: 'Send voice notes or audio files.',
                useCase: 'Helpful for personal follow-ups, guided instructions, and language-specific replies.',
                setup: ['Upload audio file', 'Confirm format', 'Connect next block'],
            },
            {
                type: 'file',
                icon: File,
                label: 'Document',
                description: 'Send a PDF, invoice, brochure, or document.',
                useCase: 'Use for quotations, menus, invoices, catalogs, and policy documents.',
                setup: ['Upload document', 'Set display name', 'Add optional caption'],
            },
        ],
    },
    {
        title: 'Collect',
        nodes: [
            {
                type: 'button',
                icon: Link2,
                label: 'Reply Buttons',
                description: 'Show quick replies and branch from choices.',
                useCase: 'Best when the user must choose from 2-3 clear options.',
                setup: ['Write prompt text', 'Add button labels', 'Connect each reply handle'],
            },
            {
                type: 'interactive',
                icon: Workflow,
                label: 'List Menu',
                description: 'Show a structured WhatsApp list.',
                useCase: 'Use when options are more than three, like services, branches, or product categories.',
                setup: ['Add list title', 'Create sections and rows', 'Connect selected outcomes'],
            },
            {
                type: 'userInput',
                icon: UserCircle,
                label: 'User Input',
                description: 'Collect and save a typed response.',
                useCase: 'Use for name, phone, email, city, budget, or free-form questions.',
                setup: ['Choose input type', 'Set save field', 'Add validation if needed'],
            },
            {
                type: 'location',
                icon: MapPin,
                label: 'Location',
                description: 'Ask for or send a location.',
                useCase: 'Useful for delivery address, nearest branch, field visits, and service area checks.',
                setup: ['Choose request or share mode', 'Add prompt', 'Connect follow-up'],
            },
            {
                type: 'whatsappFlow',
                icon: Workflow,
                label: 'WhatsApp Form',
                description: 'Open a native WhatsApp form.',
                useCase: 'Use for richer forms like lead capture, appointment booking, or surveys.',
                setup: ['Select WhatsApp Flow', 'Map submitted fields', 'Connect success path'],
                badge: 'Coming Soon',
                comingSoon: true,
            },
        ],
    },
    {
        title: 'Logic',
        nodes: [
            {
                type: 'condition',
                icon: GitBranch,
                label: 'Condition',
                description: 'Create if/else branches.',
                useCase: 'Use to route users by saved field, selected option, language, or lead score.',
                setup: ['Select variable', 'Choose operator', 'Connect true and false paths'],
            },
            {
                type: 'handoff',
                icon: Handshake,
                label: 'Handoff to Human',
                description: 'Send the chat to a team member.',
                useCase: 'Use when the customer asks for sales, escalation, or complex support.',
                setup: ['Set handoff reason', 'Choose team or agent', 'Add internal note'],
            },
            {
                type: 'end',
                icon: Square,
                label: 'End Flow',
                description: 'Stop automation cleanly.',
                useCase: 'Use after resolution, successful booking, opt-out, or final confirmation.',
                setup: ['Add final message before this if needed', 'Connect terminal path'],
            },
        ],
    },
    {
        title: 'AI & Data',
        nodes: [
            {
                type: 'ai',
                icon: Bot,
                label: 'AI Agent',
                description: 'Reply from your knowledge base.',
                useCase: 'Use for FAQs, product guidance, support triage, and smart responses.',
                setup: ['Select AI agent', 'Choose knowledge source', 'Set fallback handoff'],
                badge: 'AI',
            },
            {
                type: 'httpApi',
                icon: Globe,
                label: 'HTTP Request',
                description: 'Call an external API.',
                useCase: 'Use for CRM lookup, order status, payment checks, and custom backend actions.',
                setup: ['Choose method', 'Add URL and headers', 'Map response fields'],
            },
            {
                type: 'googleSheets',
                icon: FileSpreadsheet,
                label: 'Google Sheets',
                description: 'Create or update spreadsheet rows.',
                useCase: 'Use for lead logging, feedback collection, registrations, and simple reporting.',
                setup: ['Connect sheet', 'Choose row action', 'Map columns'],
            },
        ],
    },
    {
        title: 'Commerce',
        nodes: [
            {
                type: 'appointment',
                icon: Calendar,
                label: 'Appointment',
                description: 'Book a demo, visit, or meeting.',
                useCase: 'Use when the flow should capture date/time and create a booking path.',
                setup: ['Set appointment type', 'Capture preferred slot', 'Confirm booking'],
            },
            {
                type: 'product',
                icon: PackageSearch,
                label: 'Product',
                description: 'Recommend a product or catalog item.',
                useCase: 'Use for product discovery, pricing replies, and sales qualification.',
                setup: ['Select product', 'Add price or offer', 'Connect buy/help choices'],
            },
        ],
    },
];

const allNodes = nodeCategories.flatMap(category => category.nodes);

export default function EnhancedFlowSidebar({ onDragStart, mobileMode = false, onMobileTap }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedCategories, setCollapsedCategories] = useState(new Set());
    const [activeNode, setActiveNode] = useState(allNodes[0]);
    const [hoveredComingSoonNode, setHoveredComingSoonNode] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

    const toggleCategory = (categoryTitle) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            next.has(categoryTitle) ? next.delete(categoryTitle) : next.add(categoryTitle);
            return next;
        });
    };

    const filteredCategories = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return nodeCategories.map(category => ({
            ...category,
            nodes: category.nodes.filter(node => {
                if (!query) return true;
                return [node.label, node.description, node.useCase].some(value =>
                    value.toLowerCase().includes(query)
                );
            }),
        })).filter(category => category.nodes.length > 0);
    }, [searchQuery]);

    return (
        <div className={`bg-white flex flex-col h-full ${mobileMode ? 'w-full' : 'w-[316px] border-r border-gray-200'}`}>
            {/* Header */}
            <div className="border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <div className={mobileMode ? 'flex items-center gap-2' : ''}>
                        {!mobileMode && (
                            <>
                                <h3 className="text-sm font-semibold text-black">Nodes</h3>
                                <p className="text-[11px] text-gray-500">Drag blocks to build WhatsApp automation.</p>
                            </>
                        )}
                        {mobileMode && (
                            <h3 className="text-sm font-semibold text-black">Add Node</h3>
                        )}
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600 shrink-0">
                        {allNodes.length} blocks
                    </span>
                </div>
                <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="fp-input h-9 pl-9 text-xs"
                    />
                </div>
            </div>

            {/* Node List */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {filteredCategories.map((category) => {
                    const isCollapsed = collapsedCategories.has(category.title);

                    return (
                        <section key={category.title} className="mb-3">
                            <button
                                type="button"
                                onClick={() => toggleCategory(category.title)}
                                className="mb-1.5 flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-gray-50"
                            >
                                <span className="text-[11px] font-semibold uppercase tracking-normal text-gray-500">{category.title}</span>
                                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                            </button>

                            {!isCollapsed && (
                                <div className={`${mobileMode ? 'grid grid-cols-2 gap-1.5' : 'space-y-1'}`}>
                                    {category.nodes.map((node) => {
                                        const Icon = node.icon;
                                        const isActive = activeNode?.type === node.type;

                                        if (mobileMode) {
                                            // Mobile: compact grid card — tap to add
                                            return (
                                                <button
                                                    key={node.type}
                                                    type="button"
                                                    onClick={() => node.comingSoon ? undefined : onMobileTap?.(node.type, node)}
                                                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 w-full text-center transition-colors ${
                                                        isActive
                                                            ? 'border-[#25D366] bg-[#25D366]/[0.06]'
                                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                                    } ${node.comingSoon ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
                                                >
                                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                                                        isActive
                                                            ? 'border-[#25D366]/40 bg-white text-[#128C7E]'
                                                            : 'border-gray-200 bg-[#f5f7fa] text-gray-600'
                                                    }`}>
                                                        <Icon className="h-4 w-4 stroke-[1.8]" />
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-gray-800 leading-tight line-clamp-2">{node.label}</span>
                                                    {node.badge && (
                                                        <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[8px] font-semibold uppercase text-gray-500">
                                                            {node.badge}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        }

                                        return (
                                            <div
                                                key={node.type}
                                                draggable={!node.comingSoon}
                                                tabIndex={0}
                                                onMouseEnter={(e) => {
                                                    setActiveNode(node);
                                                    if (node.comingSoon) {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setHoveredComingSoonNode(node);
                                                        setTooltipPosition({
                                                            top: rect.top + rect.height / 2,
                                                            left: rect.right + 12
                                                        });
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    setHoveredComingSoonNode(null);
                                                }}
                                                onFocus={() => setActiveNode(node)}
                                                onClick={() => setActiveNode(node)}
                                                onDragStart={(e) => {
                                                    if (node.comingSoon) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    onDragStart(e, node.type, node);
                                                }}
                                                className={`group relative cursor-grab rounded-md border bg-white p-2.5 transition-colors active:cursor-grabbing ${
                                                    isActive
                                                        ? 'border-[#25D366] bg-[#25D366]/[0.04]'
                                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                } ${node.comingSoon ? 'opacity-65 cursor-not-allowed' : ''}`}
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border ${
                                                        isActive
                                                            ? 'border-[#25D366]/40 bg-white text-[#128C7E]'
                                                            : 'border-gray-200 bg-[#f5f7fa] text-gray-600'
                                                    }`}>
                                                        <Icon className="h-4 w-4 stroke-[1.8]" />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-2">
                                                            <span className="truncate text-xs font-semibold text-gray-900">{node.label}</span>
                                                            {node.badge && (
                                                                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                                                                    node.comingSoon 
                                                                        ? 'border-amber-200 bg-amber-50 text-amber-700' 
                                                                        : 'border-gray-200 bg-white text-gray-500'
                                                                }`}>
                                                                    {node.badge}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="mt-0.5 block truncate text-[11px] leading-4 text-gray-500">
                                                            {node.description}
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {/* NodeHelp — desktop only */}
            {!mobileMode && <NodeHelp node={activeNode} />}

            {/* Viewport-fixed tooltip floating on top of all sidebar & canvas elements */}
            {!mobileMode && hoveredComingSoonNode && (
                <div 
                    style={{ 
                        position: 'fixed', 
                        top: `${tooltipPosition.top}px`, 
                        left: `${tooltipPosition.left}px`,
                        transform: 'translateY(-50%)'
                    }}
                    className="z-[999999] w-72 p-4 bg-slate-950 text-white text-xs rounded-2xl shadow-2xl border border-slate-800 pointer-events-none transition-all duration-150 select-none animate-in fade-in zoom-in-95 duration-150"
                >
                    <div className="font-bold text-amber-400 mb-1.5 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                        Coming Soon!
                    </div>
                    <p className="text-slate-300 leading-relaxed font-normal text-[11px]">
                        We are actively building native Meta WhatsApp Flows integration to support rich interactive forms inside your chat automation.
                    </p>
                    {/* Tooltip pointer arrow pointing left */}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-[7px] border-transparent border-r-slate-950" />
                </div>
            )}
        </div>
    );
}

function NodeHelp({ node }) {
    if (!node) return null;
    const Icon = node.icon;

    return (
        <div className="border-t border-gray-200 bg-[#f5f7fa] p-3">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-200 bg-[#f5f7fa] text-[#128C7E]">
                        <Icon className="h-4 w-4 stroke-[1.8]" />
                    </span>
                    <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-900">{node.label}</div>
                        <p className="mt-1 text-[11px] leading-4 text-gray-600">{node.useCase}</p>
                    </div>
                </div>
                <div className="mt-3 border-t border-gray-100 pt-2">
                    <div className="text-[10px] font-semibold uppercase text-gray-400">Setup</div>
                    <ul className="mt-1 space-y-1">
                        {node.setup.map(item => (
                            <li key={item} className="flex gap-2 text-[11px] leading-4 text-gray-600">
                                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[#25D366]" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="mt-3 rounded border border-gray-200 bg-[#f8faf9] px-2.5 py-2 text-[11px] leading-4 text-gray-600">
                    Connections: click an edge to reveal delete, or select it and press Delete.
                </div>
            </div>
        </div>
    );
}
