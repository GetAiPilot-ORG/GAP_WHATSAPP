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
            step('[data-tour="sidebar-nav"]', 'Main navigation', 'Open the dashboard, chats, contacts, agents, flows, broadcasts, and billing from here.', 'right'),
            step('[data-tour="account-switcher"]', 'WhatsApp account switcher', 'If you have multiple connected accounts, choose the active account here.', 'right'),
            step('[data-tour="setup-checklist"], [data-tour="dashboard-overview"]', 'Setup and business overview', 'Follow your live setup progress, then monitor messages, delivery health, wallet usage, and account status.', 'bottom'),
            step('[data-tour="nav-whatsapp-connect"], [data-tour="mobile-menu-button"]', 'Connect WhatsApp', 'Connect an official WhatsApp Cloud API account as your first practical step.', 'right'),
            step('[data-tour="tour-menu"]', 'Guides anytime', 'Use this menu to tour the current page, continue setup, or review WhatsApp messaging rules.', 'bottom', 'end'),
        ],
    },
    dashboard: {
        id: 'dashboard',
        route: '/dashboard',
        ...copy,
        steps: [
            step('[data-tour="dashboard-range"]', 'Date range', 'Switch quickly between today, 7-day, and 30-day metrics.', 'bottom'),
            step('[data-tour="dashboard-metrics"]', 'Core metrics', 'Review messages, customer replies, AI and team replies, and failures at a glance.', 'bottom'),
            step('[data-tour="dashboard-wallet"]', 'Wallet overview', 'See a compact summary of your message wallet and billing activity.', 'bottom'),
            step('[data-tour="dashboard-health"]', 'System health', 'Monitor connected accounts, inbox activity, automation, and unread messages.', 'left'),
        ],
    },
    'whatsapp-connect': {
        id: 'whatsapp-connect',
        route: '/whatsapp-connect',
        ...copy,
        steps: [
            step('[data-tour="connect-primary"]', 'Official Meta setup', 'Use Meta Embedded Signup to connect WhatsApp Cloud API through the recommended path.', 'bottom'),
            step('[data-tour="connect-manual"]', 'Manual advanced setup', 'Advanced users can connect with a WABA ID and access token instead.', 'top'),
            step('[data-tour="connect-accounts"]', 'Connected accounts and diagnostics', 'Review connected numbers, run diagnostics, and verify send readiness. New outbound conversations require an approved template.', 'top'),
        ],
    },
    'whatsapp-number': {
        id: 'whatsapp-number',
        route: '/whatsapp-number',
        ...copy,
        steps: [
            step('[data-tour="number-tabs"]', 'Choose setup type', 'Request an official dedicated number through assisted setup.', 'bottom'),
            step('[data-tour="number-form"]', 'Assisted setup form', 'Enter your business details so the team can process your number setup request.', 'top'),
            step('[data-tour="number-requests"]', 'Request status', 'Track the latest status of your submitted setup requests here.', 'top'),
        ],
    },
    contacts: {
        id: 'contacts',
        route: '/contacts',
        ...copy,
        steps: [
            step('[data-tour="contacts-import"]', 'Import CSV', 'Upload contacts in bulk. Extra columns become custom fields.', 'bottom'),
            step('[data-tour="contacts-add"]', 'Add contact', 'Save a single customer manually.', 'bottom'),
            step('[data-tour="contacts-filters"]', 'Search and filters', 'Narrow the list by name, phone, tags, account, or custom fields.', 'bottom'),
            step('[data-tour="contacts-table"]', 'Contact table and outreach', 'Open a contact profile from a row. The first outbound message to a new contact must use an approved template.', 'top'),
        ],
    },
    'bot-agents': {
        id: 'bot-agents',
        route: '/bot-agents',
        ...copy,
        steps: [
            step('[data-tour="agents-create"]', 'Create agent', 'Create your first AI assistant here.', 'bottom'),
            step('[data-tour="agents-api"]', 'API settings', 'Configure an OpenAI key before enabling AI replies.', 'bottom'),
            step('[data-tour="agents-knowledge"]', 'Knowledge sync', 'Upload documents that the agent can use to answer customers.', 'left'),
            step('[data-tour="agents-list"]', 'Agent cards', 'Review each agent’s status, documents, keywords, and configuration.', 'top'),
        ],
    },
    'flow-builder': {
        id: 'flow-builder',
        route: '/flow-builder',
        ...copy,
        steps: [
            step('[data-tour="flows-create"]', 'Create flow', 'Start a visual automation flow here.', 'bottom'),
            step('[data-tour="flows-templates"]', 'Flow templates', 'Start faster with a ready-made automation template.', 'bottom'),
            step('[data-tour="flows-list"]', 'Flow list', 'Manage drafts, active flows, pauses, duplicates, and run history.', 'top'),
            step('[data-tour="flow-editor-sidebar"]', 'Drag nodes', 'Drag blocks into the editor to build a conversation path.', 'right'),
            step('[data-tour="flow-editor-canvas"]', 'Canvas', 'Connect nodes, create branches, then save, test, and publish.', 'left'),
        ],
    },
    templates: {
        id: 'templates',
        route: '/templates',
        ...copy,
        steps: [
            step('[data-tour="templates-create"]', 'New template (outbound initiation)', 'Create a Meta-approved message template to contact new customers or reopen an expired 24-hour window.', 'bottom'),
            step('[data-tour="templates-filters"]', 'Status filters', 'Filter approved, pending, rejected, and draft templates.', 'bottom'),
            step('[data-tour="templates-list"]', 'Template cards', 'Preview or delete templates, add from the library, and review approval status.', 'top'),
            step('[data-tour="templates-library-search"]', 'Industry library', 'Search ready-made templates and add an available one to your account.', 'bottom'),
        ],
    },
    broadcast: {
        id: 'broadcast',
        route: '/broadcast',
        ...copy,
        steps: [
            step('[data-tour="broadcast-tabs"]', 'Campaign workspace', 'Switch between a new campaign and campaign history.', 'bottom'),
            step('[data-tour="broadcast-stepper"]', 'Step-by-step builder', 'Complete campaign details, audience, content, and review in short steps.', 'bottom'),
            step('[data-tour="broadcast-recipients"]', 'Recipients', 'Choose saved contacts or imported numbers.', 'bottom'),
            step('[data-tour="broadcast-template"]', 'Approved template', 'A Meta-approved template is required for a broadcast.', 'bottom'),
            step('[data-tour="broadcast-cost"]', 'Wallet cost', 'Review the estimated wallet spend before sending.', 'top'),
            step('[data-tour="broadcast-send"]', 'Schedule or send', 'Send the campaign now or schedule it for later.', 'top'),
        ],
    },
    'live-chat': {
        id: 'live-chat',
        route: '/live-chat',
        ...copy,
        steps: [
            step('[data-tour="chat-search"]', 'Search chats', 'Find a chat quickly by customer name or phone number.', 'bottom'),
            step('[data-tour="chat-filters"]', 'Chat filters', 'Switch between unread, assigned, favorite, and archived views.', 'bottom'),
            step('[data-tour="chat-header"]', 'Chat controls and 24-hour timer', 'Review assignment, AI fallback, and the customer reply-window status.', 'bottom'),
            step('[data-tour="chat-composer"]', 'Reply box and template sender', 'Send free-form replies inside the 24-hour window. Use an approved template for a new contact or an expired window.', 'top'),
        ],
    },
    billing: {
        id: 'billing',
        route: '/billing',
        ...copy,
        steps: [
            step('[data-tour="billing-wallet"]', 'Message wallet', 'Review the wallet balance used for template and broadcast charges.', 'bottom'),
            step('[data-tour="billing-recharge"]', 'Recharge wallet', 'Choose an amount to add funds to the wallet.', 'bottom'),
            step('[data-tour="billing-plans"]', 'Subscription plans', 'Choose or upgrade a plan for feature access.', 'top'),
            step('[data-tour="billing-activity"]', 'Billing activity', 'Track recent charges and wallet transactions.', 'top'),
        ],
    },
    settings: {
        id: 'settings',
        route: '/settings',
        ...copy,
        steps: [
            step('[data-tour="settings-profile"]', 'Business profile', 'Update the profile for the connected WhatsApp account.', 'bottom'),
            step('[data-tour="settings-notifications"]', 'Notifications', 'Configure incoming-message alerts and sound preferences.', 'bottom'),
            step('[data-tour="settings-knowledge"]', 'Knowledge base', 'Upload and manage reusable documents for AI agents.', 'top'),
            step('[data-tour="settings-team"]', 'Team members', 'Invite agents and manage roles and access.', 'top'),
            step('[data-tour="settings-developer"]', 'Developer tools', 'Configure webhook and API settings for advanced integrations.', 'top'),
        ],
    },
    help: {
        id: 'help',
        route: '/help',
        ...copy,
        steps: [
            step('[data-tour="help-search"]', 'Search help', 'Enter a feature name to find relevant answers.', 'bottom'),
            step('[data-tour="help-categories"]', 'Categories', 'Browse guides by topic.', 'bottom'),
            step('[data-tour="help-faqs"]', 'FAQs', 'Expand a question to read concise guidance.', 'top'),
            step('[data-tour="help-support"]', 'Need more help', 'Use a support option if you cannot find the answer.', 'top'),
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
