export const GLOBAL_TOUR_ID = 'global-setup-v1'

const copy = {
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
}

const step = (selector, title, description, side = 'bottom', align = 'start') => ({
    element: selector,
    popover: { title, description, side, align },
})

export const tours = {
    [GLOBAL_TOUR_ID]: {
        id: GLOBAL_TOUR_ID,
        route: '*',
        ...copy,
        steps: [
            step('[data-tour="sidebar-nav"]', 'Main navigation', 'Yahan se dashboard, chats, contacts, agents, flows, broadcasts aur billing open hote hain.', 'right'),
            step('[data-tour="account-switcher"]', 'WhatsApp account switcher', 'Agar multiple numbers/accounts connected hain, yahan se active account choose kar sakte ho.', 'right'),
            step('[data-tour="dashboard-overview"]', 'Business overview', 'Dashboard par messages, delivery health, wallet aur automation status ka quick view milta hai.', 'bottom'),
            step('[data-tour="nav-whatsapp-connect"], [data-tour="mobile-menu-button"]', 'Start setup', 'Pehla practical step: WhatsApp account connect karo ya naya number request karo.', 'right'),
            step('[data-tour="tour-menu"]', 'Guides anytime', 'Har important page par Show Tour se short page guide dobara dekh sakte ho.', 'bottom', 'end'),
        ],
    },
    dashboard: {
        id: 'dashboard',
        route: '/dashboard',
        ...copy,
        steps: [
            step('[data-tour="dashboard-range"]', 'Date range', 'Aaj, 7 days, ya 30 days ke metrics quickly switch karo.', 'bottom'),
            step('[data-tour="dashboard-metrics"]', 'Core metrics', 'Messages, customer replies, AI/team replies aur failures ek glance mein dikhenge.', 'bottom'),
            step('[data-tour="dashboard-wallet"]', 'Wallet overview', 'Message wallet aur billing summary yahan compact form mein dikhti hai.', 'bottom'),
            step('[data-tour="dashboard-health"]', 'System health', 'Connected account, inbox, bot aur unread status monitor karne ke liye useful hai.', 'left'),
        ],
    },
    'whatsapp-connect': {
        id: 'whatsapp-connect',
        route: '/whatsapp-connect',
        ...copy,
        steps: [
            step('[data-tour="connect-primary"]', 'Official Meta setup', 'Recommended path: Meta embedded signup se WhatsApp Cloud API connect karo.', 'bottom'),
            step('[data-tour="connect-manual"]', 'Manual advanced setup', 'Agar Meta flow nahi use karna, WABA ID aur token se manual connect kar sakte ho.', 'top'),
            step('[data-tour="connect-accounts"]', 'Connected accounts', 'Connected numbers, diagnostics aur send readiness yahan verify hoti hai.', 'top'),
        ],
    },
    'whatsapp-number': {
        id: 'whatsapp-number',
        route: '/whatsapp-number',
        ...copy,
        steps: [
            step('[data-tour="number-tabs"]', 'Choose setup type', 'Instant setup aur assisted setup ke beech yahan choose karo.', 'bottom'),
            step('[data-tour="number-form"]', 'Assisted setup form', 'Business details fill karo so team number setup request process kar sake.', 'top'),
            step('[data-tour="number-requests"]', 'Request status', 'Submitted setup requests ka latest status yahan dikhega.', 'top'),
        ],
    },
    contacts: {
        id: 'contacts',
        route: '/contacts',
        ...copy,
        steps: [
            step('[data-tour="contacts-import"]', 'Import CSV', 'Bulk contacts upload karo. Extra columns custom fields ban jaate hain.', 'bottom'),
            step('[data-tour="contacts-add"]', 'Add contact', 'Single customer manually save karne ke liye use karo.', 'bottom'),
            step('[data-tour="contacts-filters"]', 'Search and filters', 'Name, phone, tags, account aur custom fields se list narrow karo.', 'bottom'),
            step('[data-tour="contacts-table"]', 'Contact table', 'Row click karke profile drawer open hota hai.', 'top'),
        ],
    },
    'bot-agents': {
        id: 'bot-agents',
        route: '/bot-agents',
        ...copy,
        steps: [
            step('[data-tour="agents-create"]', 'Create agent', 'Pehla AI assistant yahan se create karo.', 'bottom'),
            step('[data-tour="agents-api"]', 'API settings', 'AI replies ke liye OpenAI key configured hona zaroori hai.', 'bottom'),
            step('[data-tour="agents-knowledge"]', 'Knowledge sync', 'Docs upload karo. Agent isi knowledge se customer ko answer karega.', 'left'),
            step('[data-tour="agents-list"]', 'Agent cards', 'Har bot ka status, docs, keywords aur configure action yahan milta hai.', 'top'),
        ],
    },
    'flow-builder': {
        id: 'flow-builder',
        route: '/flow-builder',
        ...copy,
        steps: [
            step('[data-tour="flows-create"]', 'Create flow', 'Visual automation flow yahan se start hota hai.', 'bottom'),
            step('[data-tour="flows-templates"]', 'Flow templates', 'Ready-made automation templates se faster start karo.', 'bottom'),
            step('[data-tour="flows-list"]', 'Flow list', 'Draft, active, pause, duplicate aur run history yahan manage karo.', 'top'),
            step('[data-tour="flow-editor-sidebar"]', 'Drag nodes', 'Editor mein blocks drag karke conversation path build hota hai.', 'right'),
            step('[data-tour="flow-editor-canvas"]', 'Canvas', 'Nodes connect karo, branches banao, then save/test/publish.', 'left'),
        ],
    },
    templates: {
        id: 'templates',
        route: '/templates',
        ...copy,
        steps: [
            step('[data-tour="templates-create"]', 'New template', 'WhatsApp-approved message template create aur submit karo.', 'bottom'),
            step('[data-tour="templates-filters"]', 'Status filters', 'Approved, pending, rejected/draft templates quickly filter karo.', 'bottom'),
            step('[data-tour="templates-list"]', 'Template cards', 'Preview, delete, add from library, aur approval status yahan dikhta hai.', 'top'),
            step('[data-tour="templates-library-search"]', 'Industry library', 'Ready templates search/filter karke apne account mein add karo.', 'bottom'),
        ],
    },
    broadcast: {
        id: 'broadcast',
        route: '/broadcast',
        ...copy,
        steps: [
            step('[data-tour="broadcast-tabs"]', 'Campaign workspace', 'New campaign aur history ke beech switch yahan se hota hai.', 'bottom'),
            step('[data-tour="broadcast-stepper"]', 'Step-by-step builder', 'Details, audience, content aur review ko short steps mein complete karo.', 'bottom'),
            step('[data-tour="broadcast-recipients"]', 'Recipients', 'Contacts ya imported numbers choose karo.', 'bottom'),
            step('[data-tour="broadcast-template"]', 'Approved template', 'Broadcast ke liye Meta-approved template required hota hai.', 'bottom'),
            step('[data-tour="broadcast-cost"]', 'Wallet cost', 'Send se pehle estimated message wallet spend check karo.', 'top'),
            step('[data-tour="broadcast-send"]', 'Schedule or send', 'Campaign ko abhi send karo ya future time ke liye schedule karo.', 'top'),
        ],
    },
    'live-chat': {
        id: 'live-chat',
        route: '/live-chat',
        ...copy,
        steps: [
            step('[data-tour="chat-search"]', 'Search chats', 'Customer ya phone number search karke chat quickly find karo.', 'bottom'),
            step('[data-tour="chat-filters"]', 'Chat filters', 'Unread, assigned, favorites, archived jaise views switch karo.', 'bottom'),
            step('[data-tour="chat-header"]', 'Chat controls', 'Assignment, AI fallback aur contact info yahan manage hota hai.', 'bottom'),
            step('[data-tour="chat-composer"]', 'Reply box', 'Text, media, audio aur templates se customer ko reply bhejo.', 'top'),
        ],
    },
    billing: {
        id: 'billing',
        route: '/billing',
        ...copy,
        steps: [
            step('[data-tour="billing-wallet"]', 'Message wallet', 'Broadcast aur template charges ke liye wallet balance yahan dikhta hai.', 'bottom'),
            step('[data-tour="billing-recharge"]', 'Recharge wallet', 'Quick recharge amount select karke wallet top-up karo.', 'bottom'),
            step('[data-tour="billing-plans"]', 'Subscription plans', 'Feature access ke liye plan choose/upgrade karo.', 'top'),
            step('[data-tour="billing-activity"]', 'Billing activity', 'Recent charges aur wallet transactions yahan track hote hain.', 'top'),
        ],
    },
    settings: {
        id: 'settings',
        route: '/settings',
        ...copy,
        steps: [
            step('[data-tour="settings-profile"]', 'Business profile', 'Connected WhatsApp account ka profile yahan update hota hai.', 'bottom'),
            step('[data-tour="settings-notifications"]', 'Notifications', 'Incoming message alerts aur sound preferences set karo.', 'bottom'),
            step('[data-tour="settings-knowledge"]', 'Knowledge base', 'AI agents ke liye reusable docs yahan upload/manage karo.', 'top'),
            step('[data-tour="settings-team"]', 'Team members', 'Agents invite karo aur role/access manage karo.', 'top'),
            step('[data-tour="settings-developer"]', 'Developer tools', 'Webhook/API settings advanced integrations ke liye hain.', 'top'),
        ],
    },
    help: {
        id: 'help',
        route: '/help',
        ...copy,
        steps: [
            step('[data-tour="help-search"]', 'Search help', 'Feature ka naam type karke relevant answer find karo.', 'bottom'),
            step('[data-tour="help-categories"]', 'Categories', 'Topic-wise guides browse karo.', 'bottom'),
            step('[data-tour="help-faqs"]', 'FAQs', 'Question expand karke short guidance read karo.', 'top'),
            step('[data-tour="help-support"]', 'Need more help', 'Agar answer na mile, support option use karo.', 'top'),
        ],
    },
}

export function getTourForPath(pathname) {
    if (!pathname) return null
    if (pathname.startsWith('/templates/industries')) return tours.templates
    const key = pathname.replace(/^\//, '').split('/')[0] || 'dashboard'
    return tours[key] || null
}

export function getGlobalTour() {
    return tours[GLOBAL_TOUR_ID]
}
