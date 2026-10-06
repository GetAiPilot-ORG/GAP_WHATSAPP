import {
    Bot, Calendar, ChevronDown, FileSpreadsheet, FileText, GitBranch, Globe,
    Handshake, Image, Link2, MapPin, MessageSquare, Music, PackageSearch,
    Rocket, Search, Square, UserCircle, Video, Workflow, File, X, Waypoints,
    SplitSquareHorizontal
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
                type: 'abTest',
                icon: SplitSquareHorizontal,
                label: 'A/B Test',
                description: 'Split traffic 50/50 to test flows.',
                useCase: 'Analyze which flow gets more responses.',
                setup: ['Connect Path A', 'Connect Path B'],
            },
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
                type: 'goto',
                icon: Waypoints,
                label: 'Jump to Node',
                description: 'Teleport to another part of the flow.',
                useCase: 'Use to jump back to a main menu or repeat a step without drawing a messy line.',
                setup: ['Place node', 'Select target node from list'],
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
            <div className="border-b border-gray-100 px-4 py-3 bg-white/80 backdrop-blur-md z-10 relative shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        {mobileMode ? 'Add Node' : 'Nodes'}
                    </h3>
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 shrink-0 border border-gray-200 shadow-sm">
                        {allNodes.length} blocks
                    </span>
                </div>
                <div className="relative group">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 group-focus-within:text-[#25D366] transition-colors" />
                    <input
                        type="text"
                        placeholder="Search blocks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-8 pl-9 pr-3 text-xs rounded-lg bg-gray-50 border border-gray-200 focus:bg-white focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/10 outline-none transition-all placeholder:text-gray-400"
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
                                                onClick={() => {
                                                    setActiveNode(node);
                                                    if (!node.comingSoon && onMobileTap) {
                                                        onMobileTap(node.type);
                                                    }
                                                }}
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
        <div className="relative border-t border-gray-100 bg-white p-3 shrink-0">
            {/* Ambient background glow */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#25D366]/[0.02] to-transparent pointer-events-none" />
            
            <div className="relative rounded-xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                {/* Subtle top highlight */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#25D366]/30 to-transparent" />
                
                <div className="p-3">

                    
                    <div className="rounded-lg bg-gray-50/80 border border-gray-100 p-2.5">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                            <span className="flex h-1.5 w-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-40"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#25D366]"></span>
                            </span>
                            {node.label}
                        </div>
                        <ul className="space-y-1.5">
                            {node.setup.map((item, index) => (
                                <li key={index} className="flex items-start gap-2 text-[10px] leading-relaxed text-gray-600 font-medium">
                                    <span className="mt-[6px] flex h-[3px] w-[3px] shrink-0 items-center justify-center rounded-full bg-gray-400" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
