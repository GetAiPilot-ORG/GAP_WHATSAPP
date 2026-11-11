const tpl = (value, fields) =>
    String(value || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => fields[key] ?? '');

const node = (id, type, x, y, config = {}) => ({
    id,
    type,
    position: { x, y },
    data: {
        label: config.title || config.label || type,
        config,
        configured: true,
        status: { sent: 0, delivered: 0, subscribers: 0, errors: 0 },
    },
});

const edge = (id, source, target, sourceHandle) => ({
    id,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    type: 'deletable',
});

export const FLOW_TEMPLATE_CATEGORIES = ['All', 'Sales', 'Support', 'Booking', 'Commerce', 'Retention', 'Food', 'Automobile', 'Events', 'Real Estate', 'Travel', 'Education', 'Healthcare', 'Home Services', 'Finance', 'B2B'];

export const FLOW_TEMPLATES = [
    {
        id: 'advanced-lead-gen-qual',
        name: 'Advanced Lead Generation & Qualification',
        category: 'Sales',
        difficulty: 'Medium',
        minutes: 10,
        fakeStars: 345,
        description: 'Perfect for Real Estate, SaaS, and Agencies. Collect name, email, and ask for requirements before routing the lead.',
        bestFor: 'Real Estate, SaaS, Agencies, B2B services.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'leads' },
            { key: 'businessName', label: 'Business name', defaultValue: 'GetAiPilot Agency' },
            { key: 'service1', label: 'Service Option 1', defaultValue: 'Digital Marketing' },
            { key: 'service2', label: 'Service Option 2', defaultValue: 'Website Development' },
            { key: 'service3', label: 'Service Option 3', defaultValue: 'SEO & Content' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword],
            trigger_keywords: [fields.keyword],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('askName', 'userInput', 0, 150, {
                    question: `Hi! Welcome to ${fields.businessName}. May I know your good name?`,
                    saveToField: 'lead_name',
                    inputType: 'text'
                }),
                node('askEmail', 'userInput', 0, 300, {
                    question: `Thanks! And what's your email address so we can send details?`,
                    saveToField: 'lead_email',
                    inputType: 'email'
                }),
                node('askService', 'interactive', 0, 450, {
                    headerText: 'Great! What service are you looking for today?',
                    items: [
                        { id: 'opt1', title: fields.service1, description: 'Get more customers' },
                        { id: 'opt2', title: fields.service2, description: 'Build your online presence' },
                        { id: 'opt3', title: fields.service3, description: 'Rank higher on Google' }
                    ]
                }),
                node('opt1-reply', 'textMessage', -300, 650, {
                    message: `Awesome! We have helped many clients with ${fields.service1}. Let me connect you to our marketing expert.`
                }),
                node('opt2-reply', 'textMessage', 0, 650, {
                    message: `Great choice! Our ${fields.service2} team builds ultra-fast, premium sites. I'm transferring you to our technical head.`
                }),
                node('opt3-reply', 'textMessage', 300, 650, {
                    message: `SEO is a long-term game! I will share our recent SEO case studies with you.`
                }),
                node('handoff1', 'handoff', -300, 800, { reason: 'Marketing Lead', message: 'Connecting to expert...' }),
                node('handoff2', 'handoff', 0, 800, { reason: 'Development Lead', message: 'Connecting to developer...' }),
                node('file', 'file', 300, 800, { mediaUrl: 'https://example.com/seo-case-study.pdf', caption: 'Here is our Case Study PDF!' })
            ],
            edges: [
                edge('e1', 'start', 'askName'),
                edge('e2', 'askName', 'askEmail'),
                edge('e3', 'askEmail', 'askService'),
                edge('e4', 'askService', 'opt1-reply', fields.service1),
                edge('e5', 'askService', 'opt2-reply', fields.service2),
                edge('e6', 'askService', 'opt3-reply', fields.service3),
                edge('e7', 'opt1-reply', 'handoff1'),
                edge('e8', 'opt2-reply', 'handoff2'),
                edge('e9', 'opt3-reply', 'file')
            ],
        }),
    },
    {
        id: 'ecom-abandoned-cart',
        name: 'E-commerce Abandoned Cart & Support',
        category: 'Commerce',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 412,
        description: 'Recover lost sales by offering a discount and instantly resolving customer doubts.',
        bestFor: 'Shopify stores, D2C brands, E-commerce businesses.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'cart' },
            { key: 'brandName', label: 'Brand name', defaultValue: 'GetAiPilot Store' },
            { key: 'discountCode', label: 'Discount code (e.g. GET10)', defaultValue: 'SAVE10' },
            { key: 'checkoutUrl', label: 'Store URL', defaultValue: 'https://store.example.com/checkout' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword],
            trigger_keywords: [fields.keyword],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('abandoned-msg', 'textMessage', 0, 150, {
                    message: `Hi there! 👋\n\nWe noticed you left something great in your cart at ${fields.brandName}. Complete your purchase today and get 10% off!`
                }),
                node('action-buttons', 'button', 0, 310, {
                    headerText: 'What would you like to do?',
                    buttons: [
                        { text: 'Complete Purchase', type: 'reply' },
                        { text: 'I Need Help', type: 'reply' }
                    ]
                }),
                node('purchase-reply', 'textMessage', -300, 500, {
                    message: `Awesome! 🎉\n\nUse code *${fields.discountCode}* at checkout.\n\nClick here to securely complete your order:\n${fields.checkoutUrl}`
                }),
                node('support-menu', 'interactive', 300, 500, {
                    headerText: 'No problem! How can we help you today?',
                    items: [
                        { id: 'opt-track', title: 'Track Order', description: 'Check your delivery status' },
                        { id: 'opt-refund', title: 'Refund Policy', description: 'Learn about returns' },
                        { id: 'opt-agent', title: 'Talk to Agent', description: 'Chat with a real human' }
                    ]
                }),
                node('track-reply', 'textMessage', 0, 700, {
                    message: `To track your order, please visit our tracking page: ${fields.checkoutUrl}/track`
                }),
                node('refund-reply', 'textMessage', 300, 700, {
                    message: `We offer a 7-day no-questions-asked return policy. Items must be unused.`
                }),
                node('agent-handoff', 'handoff', 600, 700, {
                    reason: 'Cart Support Query',
                    message: 'Transferring you to our support superhero. Please wait!'
                })
            ],
            edges: [
                edge('e1', 'start', 'abandoned-msg'),
                edge('e2', 'abandoned-msg', 'action-buttons'),
                edge('e3', 'action-buttons', 'purchase-reply', 'button-0'),
                edge('e4', 'action-buttons', 'support-menu', 'button-1'),
                edge('e5', 'support-menu', 'track-reply', 'Track Order'),
                edge('e6', 'support-menu', 'refund-reply', 'Refund Policy'),
                edge('e7', 'support-menu', 'agent-handoff', 'Talk to Agent')
            ]
        })
    },
    {
        id: 'automated-appointment-booking',
        name: 'Automated Appointment Booking',
        category: 'Booking',
        difficulty: 'Hard',
        minutes: 12,
        fakeStars: 524,
        description: 'A highly detailed A-to-Z booking flow. Collects service type, date, time, and patient/client details, then routes to staff.',
        bestFor: 'Doctors, Clinics, Salons, Consultants, and Spas.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'book' },
            { key: 'businessName', label: 'Clinic/Salon name', defaultValue: 'GetAiPilot Care' },
            { key: 'service1', label: 'Service Option 1', defaultValue: 'General Checkup' },
            { key: 'service2', label: 'Service Option 2', defaultValue: 'Dental Care' },
            { key: 'service3', label: 'Service Option 3', defaultValue: 'Skin Treatment' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'appointment'],
            trigger_keywords: [fields.keyword, 'appointment'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, appointment`, matchType: 'string', title: 'Start Booking' }),
                node('welcome', 'textMessage', 0, 150, {
                    message: `Welcome to ${fields.businessName}! 🏥\n\nWe provide the best care and services for you and your family.`
                }),
                node('askService', 'interactive', 0, 300, {
                    headerText: 'Which service would you like to book an appointment for?',
                    items: [
                        { id: 'opt1', title: fields.service1, description: 'Routine care & checkups' },
                        { id: 'opt2', title: fields.service2, description: 'Specialist consultation' },
                        { id: 'opt3', title: fields.service3, description: 'Advanced therapy' }
                    ]
                }),
                node('askDate', 'userInput', 0, 500, {
                    question: `Great choice! 📅\n\nPlease reply with your preferred Date for the visit.\n\n_(For example: "Tomorrow" or "15th Nov")_`,
                    saveToField: 'booking_date',
                    inputType: 'text'
                }),
                node('askTime', 'userInput', 0, 650, {
                    question: `Got it. ⏰\n\nWhat time would be preferable for you?\n\n_(For example: "10:30 AM" or "Evening")_`,
                    saveToField: 'booking_time',
                    inputType: 'text'
                }),
                node('askName', 'userInput', 0, 800, {
                    question: `Almost done! 👤\n\nCould you please share the full name of the person visiting?`,
                    saveToField: 'patient_name',
                    inputType: 'text'
                }),
                node('confirm', 'textMessage', 0, 950, {
                    message: `Thank you! 🎉\n\nYour appointment request has been recorded with the following details:\n\n📅 Date: {{booking_date}}\n⏰ Time: {{booking_time}}\n👤 Name: {{patient_name}}\n\nOur front desk will review this and send a final confirmation message shortly.`
                }),
                node('handoff', 'handoff', 0, 1150, {
                    reason: 'New Appointment Booking Request',
                    message: 'Your request has been forwarded to our reception desk.'
                })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askService'),
                edge('e3', 'askService', 'askDate', fields.service1),
                edge('e4', 'askService', 'askDate', fields.service2),
                edge('e5', 'askService', 'askDate', fields.service3),
                edge('e6', 'askDate', 'askTime'),
                edge('e7', 'askTime', 'askName'),
                edge('e8', 'askName', 'confirm'),
                edge('e9', 'confirm', 'handoff')
            ]
        })
    },
    {
        id: 'welcome-lead-capture',
        name: 'Welcome + Lead Capture',
        category: 'Sales',
        difficulty: 'Easy',
        minutes: 5,
        fakeStars: 184,
        description: 'Greet new WhatsApp users, collect their name, then route them to pricing, services, or sales.',
        bestFor: 'Agencies, service businesses, local businesses, SaaS demo leads.',
        fields: [
            { key: 'businessName', label: 'Business name', defaultValue: 'GetAiPilot' },
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'hello' },
            { key: 'serviceName', label: 'Main service', defaultValue: 'WhatsApp automation' },
            { key: 'handoffReason', label: 'Sales handoff reason', defaultValue: 'Lead asked to talk to sales' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword],
            trigger_keywords: [fields.keyword],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Welcome Trigger' }),
                node('welcome', 'textMessage', 0, 150, {
                    message: `Hi! Welcome to ${fields.businessName}. We help with ${fields.serviceName}.\n\nWhat should I help you with today?`,
                    typingDisplay: true,
                }),
                node('menu', 'button', 0, 310, {
                    headerText: 'Choose one option:',
                    buttons: [
                        { text: 'Pricing', type: 'reply' },
                        { text: 'Services', type: 'reply' },
                        { text: 'Talk to Sales', type: 'reply' },
                    ],
                }),
                node('pricing', 'textMessage', -320, 500, { message: 'Sure. Our team can share the right plan after understanding your requirement.' }),
                node('services', 'textMessage', 0, 500, { message: `We offer ${fields.serviceName}, onboarding support, and done-for-you setup.` }),
                node('handoff', 'handoff', 320, 500, {
                    reason: fields.handoffReason,
                    message: 'Thanks. I am connecting you with a sales specialist now.',
                }),
                node('end', 'end', 0, 680, { message: 'Thanks for contacting us.' }),
            ],
            edges: [
                edge('e-start-welcome', 'start', 'welcome'),
                edge('e-welcome-menu', 'welcome', 'menu'),
                edge('e-menu-pricing', 'menu', 'pricing', 'button-0'),
                edge('e-menu-services', 'menu', 'services', 'button-1'),
                edge('e-menu-handoff', 'menu', 'handoff', 'button-2'),
                edge('e-pricing-end', 'pricing', 'end'),
                edge('e-services-end', 'services', 'end'),
            ],
        }),
    },
    {
        id: 'pricing-enquiry',
        name: 'Pricing Enquiry Flow',
        category: 'Sales',
        difficulty: 'Easy',
        minutes: 6,
        fakeStars: 151,
        description: 'Answer pricing queries, qualify the buyer, and hand off high-intent leads.',
        bestFor: 'Teams receiving frequent price, cost, plan, or package questions.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'price' },
            { key: 'starterPlan', label: 'Starter plan text', defaultValue: 'Starter: basic automation setup' },
            { key: 'proPlan', label: 'Pro plan text', defaultValue: 'Pro: full WhatsApp funnel + integrations' },
            { key: 'cta', label: 'Sales CTA', defaultValue: 'Would you like our team to suggest the best plan?' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'pricing', 'cost'],
            trigger_keywords: [fields.keyword, 'pricing', 'cost'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, pricing, cost`, matchType: 'string' }),
                node('intro', 'textMessage', 0, 150, { message: `Here are our popular options:\n\n1. ${fields.starterPlan}\n2. ${fields.proPlan}\n\n${fields.cta}` }),
                node('choice', 'button', 0, 330, {
                    headerText: 'What do you want next?',
                    buttons: [
                        { text: 'Suggest Plan', type: 'reply' },
                        { text: 'Talk to Sales', type: 'reply' },
                    ],
                }),
                node('qualify', 'userInput', -220, 520, { question: 'Briefly tell us your requirement or monthly WhatsApp volume.', inputType: 'text', saveToField: 'requirement' }),
                node('sales', 'handoff', 220, 520, { reason: 'Pricing enquiry lead', message: 'Great. Connecting you to sales for pricing help.' }),
                node('end', 'end', -220, 700, { message: 'Thanks. We saved your requirement: {{requirement}}' }),
            ],
            edges: [
                edge('e1', 'start', 'intro'),
                edge('e2', 'intro', 'choice'),
                edge('e3', 'choice', 'qualify', 'button-0'),
                edge('e4', 'choice', 'sales', 'button-1'),
                edge('e5', 'qualify', 'end'),
            ],
        }),
    },
    {
        id: 'support-triage',
        name: 'Support Triage',
        category: 'Support',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 207,
        description: 'Categorize support requests, answer common issues, and escalate urgent cases.',
        bestFor: 'Support teams that need clean routing before human handoff.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'support' },
            { key: 'billingReply', label: 'Billing reply', defaultValue: 'Please share your registered phone/email and invoice number.' },
            { key: 'technicalReply', label: 'Technical reply', defaultValue: 'Please describe the issue and attach a screenshot if possible.' },
            { key: 'urgentReason', label: 'Urgent handoff reason', defaultValue: 'Customer selected urgent support' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'help', 'issue'],
            trigger_keywords: [fields.keyword, 'help', 'issue'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, help, issue`, matchType: 'string' }),
                node('menu', 'button', 0, 160, {
                    headerText: 'What kind of support do you need?',
                    buttons: [
                        { text: 'Billing', type: 'reply' },
                        { text: 'Technical', type: 'reply' },
                        { text: 'Urgent', type: 'reply' },
                    ],
                }),
                node('billing', 'textMessage', -340, 350, { message: fields.billingReply }),
                node('technical', 'userInput', 0, 350, { question: fields.technicalReply, inputType: 'text', saveToField: 'support_issue' }),
                node('urgent', 'handoff', 340, 350, { reason: fields.urgentReason, message: 'I am escalating this to the team now.' }),
                node('end', 'end', 0, 560, { message: 'Support request recorded. Our team will help you shortly.' }),
            ],
            edges: [
                edge('e1', 'start', 'menu'),
                edge('e2', 'menu', 'billing', 'button-0'),
                edge('e3', 'menu', 'technical', 'button-1'),
                edge('e4', 'menu', 'urgent', 'button-2'),
                edge('e5', 'billing', 'end'),
                edge('e6', 'technical', 'end'),
            ],
        }),
    },
    {
        id: 'appointment-booking',
        name: 'Appointment Booking',
        category: 'Booking',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 126,
        description: 'Collect customer details and preferred time for demos, consultations, or visits.',
        bestFor: 'Clinics, salons, consultants, agencies, and field service teams.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'book' },
            { key: 'appointmentType', label: 'Appointment type', defaultValue: 'consultation' },
            { key: 'hours', label: 'Working hours', defaultValue: '10 AM to 6 PM, Monday to Saturday' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'appointment', 'demo'],
            trigger_keywords: [fields.keyword, 'appointment', 'demo'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, appointment, demo`, matchType: 'string' }),
                node('name', 'userInput', 0, 150, { question: `Sure, I can help book a ${fields.appointmentType}. What is your name?`, inputType: 'text', saveToField: 'name' }),
                node('slot', 'userInput', 0, 330, { question: `Thanks {{name}}. Please share your preferred date/time. We are available ${fields.hours}.`, inputType: 'text', saveToField: 'preferred_slot' }),
                node('confirm', 'textMessage', 0, 510, { message: 'Thanks {{name}}. Your preferred slot is {{preferred_slot}}. Our team will confirm availability shortly.' }),
                node('handoff', 'handoff', 0, 680, { reason: 'Appointment booking request', message: 'I am sending this booking request to the team.' }),
            ],
            edges: [
                edge('e1', 'start', 'name'),
                edge('e2', 'name', 'slot'),
                edge('e3', 'slot', 'confirm'),
                edge('e4', 'confirm', 'handoff'),
            ],
        }),
    },
    {
        id: 'faq-intake-handoff',
        name: 'FAQ Intake + Human Handoff',
        category: 'Support',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 173,
        description: 'Capture customer questions, provide a helpful first response, and route complex cases to a human.',
        bestFor: 'Businesses with FAQs, product knowledge, policies, or support documentation.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'ask' },
            { key: 'firstReply', label: 'First response', defaultValue: 'Thanks for sharing your question. I will help route this correctly.' },
            { key: 'fallbackMessage', label: 'Human handoff message', defaultValue: 'I will connect you with a team member for this.' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'question', 'help'],
            trigger_keywords: [fields.keyword, 'question', 'help'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, question, help`, matchType: 'string' }),
                node('question', 'userInput', 0, 150, { question: 'Please type your question in one message.', inputType: 'text', saveToField: 'customer_question' }),
                node('reply', 'textMessage', 0, 330, { message: `${fields.firstReply}\n\nYour question: {{customer_question}}` }),
                node('choice', 'button', 0, 500, {
                    headerText: 'Was this helpful?',
                    buttons: [
                        { text: 'Yes', type: 'reply' },
                        { text: 'Need Human', type: 'reply' },
                    ],
                }),
                node('end', 'end', -220, 680, { message: 'Glad I could help.' }),
                node('handoff', 'handoff', 220, 680, { reason: 'FAQ handoff requested', message: fields.fallbackMessage }),
            ],
            edges: [
                edge('e1', 'start', 'question'),
                edge('e2', 'question', 'reply'),
                edge('e3', 'reply', 'choice'),
                edge('e4', 'choice', 'end', 'button-0'),
                edge('e5', 'choice', 'handoff', 'button-1'),
            ],
        }),
    },
    {
        id: 'feedback-rating',
        name: 'Feedback + Rating',
        category: 'Retention',
        difficulty: 'Easy',
        minutes: 5,
        fakeStars: 98,
        description: 'Collect customer rating and comments after delivery, service, or support.',
        bestFor: 'Any team wanting feedback loops and service quality tracking.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'feedback' },
            { key: 'brandName', label: 'Brand name', defaultValue: 'our team' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'rating'],
            trigger_keywords: [fields.keyword, 'rating'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, rating`, matchType: 'string' }),
                node('rating', 'button', 0, 160, {
                    headerText: `How was your experience with ${fields.brandName}?`,
                    buttons: [
                        { text: 'Good', type: 'reply' },
                        { text: 'Average', type: 'reply' },
                        { text: 'Poor', type: 'reply' },
                    ],
                }),
                node('comment', 'userInput', 0, 350, { question: 'Please share one short comment so we can improve.', inputType: 'text', saveToField: 'feedback_comment' }),
                node('thanks', 'end', 0, 540, { message: 'Thank you for your feedback.' }),
            ],
            edges: [
                edge('e1', 'start', 'rating'),
                edge('e2', 'rating', 'comment', 'button-0'),
                edge('e3', 'rating', 'comment', 'button-1'),
                edge('e4', 'rating', 'comment', 'button-2'),
                edge('e5', 'comment', 'thanks'),
            ],
        }),
    },
    {
        id: 'webinar-registration',
        name: 'Webinar & Course Registration',
        category: 'Sales',
        difficulty: 'Easy',
        minutes: 6,
        fakeStars: 432,
        description: 'Invite users to a webinar, collect their details, and share the joining link.',
        bestFor: 'Coaches, EdTech, Consultants, Creators.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'webinar' },
            { key: 'webinarName', label: 'Webinar Topic', defaultValue: 'AI in Marketing Masterclass' },
            { key: 'webinarDate', label: 'Date & Time', defaultValue: 'This Sunday, 11:00 AM' },
            { key: 'zoomLink', label: 'Meeting Link', defaultValue: 'https://zoom.us/j/123456789' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'register'],
            trigger_keywords: [fields.keyword, 'register'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('invite', 'textMessage', 0, 150, {
                    message: `Hi there! 👋\n\nYou're invited to our exclusive live session: *${fields.webinarName}*\n\n📅 When: ${fields.webinarDate}\n\nWould you like to secure your free spot?`
                }),
                node('registerBtn', 'button', 0, 310, {
                    headerText: 'Choose an option:',
                    buttons: [{ text: 'Yes, Register Me', type: 'reply' }, { text: 'Not this time', type: 'reply' }]
                }),
                node('askName', 'userInput', -300, 500, {
                    question: 'Awesome! Please reply with your full name to register.',
                    saveToField: 'attendee_name',
                    inputType: 'text'
                }),
                node('reject', 'textMessage', 300, 500, { message: 'No problem! We will let you know about our future events. Have a great day! 😊' }),
                node('askEmail', 'userInput', -300, 650, {
                    question: 'Thanks! Please provide your email address to send the calendar invite.',
                    saveToField: 'attendee_email',
                    inputType: 'email'
                }),
                node('confirm', 'textMessage', -300, 800, {
                    message: `🎉 Registration Confirmed, {{attendee_name}}!\n\nHere is your joining link:\n${fields.zoomLink}\n\nPlease save this link. We'll send you a reminder 10 minutes before we start.`
                })
            ],
            edges: [
                edge('e1', 'start', 'invite'),
                edge('e2', 'invite', 'registerBtn'),
                edge('e3', 'registerBtn', 'askName', 'button-0'),
                edge('e4', 'registerBtn', 'reject', 'button-1'),
                edge('e5', 'askName', 'askEmail'),
                edge('e6', 'askEmail', 'confirm')
            ]
        })
    },
    {
        id: 'emi-loan-calculator',
        name: 'Loan Pre-Approval & EMI Inquiry',
        category: 'Sales',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 389,
        description: 'Qualify loan applicants by asking their income and loan requirements.',
        bestFor: 'Real Estate, Banks, Finance Agents, Auto Dealers.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'loan' },
            { key: 'companyName', label: 'Company Name', defaultValue: 'FastFinance Corp' },
            { key: 'minIncome', label: 'Min Income Required', defaultValue: '30,000' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'emi'],
            trigger_keywords: [fields.keyword, 'emi'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.companyName}! 🏦\n\nLet's check your loan eligibility in just 2 steps.` }),
                node('incomeMenu', 'interactive', 0, 310, {
                    headerText: 'What is your current monthly income?',
                    items: [
                        { id: 'opt1', title: 'Below 30k', description: 'Less than minimum' },
                        { id: 'opt2', title: '30k - 70k', description: 'Standard applicant' },
                        { id: 'opt3', title: 'Above 70k', description: 'Premium applicant' }
                    ]
                }),
                node('reject', 'textMessage', -300, 500, { message: `We're sorry, but currently we require a minimum monthly income of ₹${fields.minIncome} for standard loan processing. Our agent will contact you if we find alternative offers.` }),
                node('askAmount', 'userInput', 300, 500, {
                    question: 'Great! You meet our basic criteria. ✅\n\nHow much loan amount are you looking for? (e.g., 5 Lakhs)',
                    saveToField: 'loan_amount',
                    inputType: 'text'
                }),
                node('askPurpose', 'userInput', 300, 650, {
                    question: 'And what is the primary purpose of this loan? (e.g., Home, Car, Personal)',
                    saveToField: 'loan_purpose',
                    inputType: 'text'
                }),
                node('handoff', 'handoff', 300, 800, {
                    reason: 'Qualified Loan Lead',
                    message: 'Thanks! Your profile has been pre-approved for evaluation. Our loan expert is reviewing your request for {{loan_amount}} and will message you here shortly! 🚀'
                })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'incomeMenu'),
                edge('e3', 'incomeMenu', 'reject', 'Below 30k'),
                edge('e4', 'incomeMenu', 'askAmount', '30k - 70k'),
                edge('e5', 'incomeMenu', 'askAmount', 'Above 70k'),
                edge('e6', 'askAmount', 'askPurpose'),
                edge('e7', 'askPurpose', 'handoff')
            ]
        })
    },
    {
        id: 'gym-free-trial',
        name: 'Gym Membership & Free Trial',
        category: 'Booking',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 512,
        description: 'Offer free trials, collect fitness goals, and share diet charts automatically.',
        bestFor: 'Gyms, Fitness Centers, Yoga Studios, Dieticians.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'fitness' },
            { key: 'gymName', label: 'Gym/Studio Name', defaultValue: 'FitLife Arena' },
            { key: 'trialDays', label: 'Free Trial Days', defaultValue: '3' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'gym', 'trial'],
            trigger_keywords: [fields.keyword, 'gym', 'trial'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('offer', 'textMessage', 0, 150, { message: `Hey! Welcome to ${fields.gymName} 💪\n\nClaim your ${fields.trialDays}-Day Free Pass today and kickstart your fitness journey!` }),
                node('goalMenu', 'interactive', 0, 310, {
                    headerText: 'What is your primary fitness goal?',
                    items: [
                        { id: 'g1', title: 'Weight Loss', description: 'Burn fat and get lean' },
                        { id: 'g2', title: 'Muscle Gain', description: 'Build strength & mass' },
                        { id: 'g3', title: 'Stay Fit', description: 'Cardio and general fitness' }
                    ]
                }),
                node('askName', 'userInput', 0, 500, {
                    question: 'Awesome goal! 🎯\n\nPlease reply with your full name to generate your pass.',
                    saveToField: 'lead_name',
                    inputType: 'text'
                }),
                node('askTime', 'userInput', 0, 650, {
                    question: 'When would you like to visit us for your first session? (e.g., Today Evening, Tomorrow Morning)',
                    saveToField: 'visit_time',
                    inputType: 'text'
                }),
                node('confirm', 'textMessage', 0, 800, {
                    message: `🎟️ *TRIAL PASS CONFIRMED*\n\nName: {{lead_name}}\nTime: {{visit_time}}\n\nShow this message at the reception. See you at ${fields.gymName}! 🔥`
                }),
                node('dietPlan', 'file', 0, 950, {
                    mediaUrl: 'https://example.com/diet-plan.pdf',
                    caption: 'Here is a free Beginner Diet Plan PDF for you. Enjoy!'
                })
            ],
            edges: [
                edge('e1', 'start', 'offer'),
                edge('e2', 'offer', 'goalMenu'),
                edge('e3', 'goalMenu', 'askName', 'Weight Loss'),
                edge('e4', 'goalMenu', 'askName', 'Muscle Gain'),
                edge('e5', 'goalMenu', 'askName', 'Stay Fit'),
                edge('e6', 'askName', 'askTime'),
                edge('e7', 'askTime', 'confirm'),
                edge('e8', 'confirm', 'dietPlan')
            ]
        })
    },
    {
        id: 'hotel-concierge',
        name: 'Hotel Concierge & Room Booking',
        category: 'Commerce',
        difficulty: 'Hard',
        minutes: 10,
        fakeStars: 488,
        description: 'Allow guests to book rooms, order room service, or request housekeeping via WhatsApp.',
        bestFor: 'Hotels, Resorts, Airbnbs, Guest Houses.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'hotel' },
            { key: 'hotelName', label: 'Hotel Name', defaultValue: 'Grand Palace Resort' },
            { key: 'menuPdf', label: 'Food Menu URL', defaultValue: 'https://example.com/food-menu.pdf' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'room'],
            trigger_keywords: [fields.keyword, 'room'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.hotelName} 🏨\n\nYour premium digital concierge is at your service.` }),
                node('mainMenu', 'interactive', 0, 310, {
                    headerText: 'How can we assist you today?',
                    items: [
                        { id: 'm1', title: 'Book a Room', description: 'Check availability & prices' },
                        { id: 'm2', title: 'Room Service', description: 'Order food to your room' },
                        { id: 'm3', title: 'Housekeeping', description: 'Towels, cleaning, etc.' }
                    ]
                }),
                
                // Branch 1: Book Room
                node('askDates', 'userInput', -400, 500, { question: 'Please reply with your Check-in and Check-out dates. (e.g., 10th to 12th Oct)', saveToField: 'booking_dates', inputType: 'text' }),
                node('askGuests', 'userInput', -400, 650, { question: 'How many Adults and Children?', saveToField: 'booking_guests', inputType: 'text' }),
                node('handoffBooking', 'handoff', -400, 800, { reason: 'New Room Booking', message: 'Thanks! Our reservation desk is checking availability and will reply in a minute.' }),
                
                // Branch 2: Room Service
                node('foodMenu', 'file', 0, 500, { mediaUrl: fields.menuPdf, caption: 'Please review our In-Room Dining menu 🍽️' }),
                node('askOrder', 'userInput', 0, 650, { question: 'Please type your Room Number and what you would like to order.', saveToField: 'food_order', inputType: 'text' }),
                node('handoffFood', 'handoff', 0, 800, { reason: 'Room Service Order', message: 'Order received! The kitchen is preparing it now.' }),
                
                // Branch 3: Housekeeping
                node('housekeepingMenu', 'interactive', 400, 500, {
                    headerText: 'What do you need?',
                    items: [
                        { id: 'h1', title: 'Room Cleaning', description: '' },
                        { id: 'h2', title: 'Extra Towels', description: '' },
                        { id: 'h3', title: 'Laundry Pickup', description: '' }
                    ]
                }),
                node('askRoom', 'userInput', 400, 650, { question: 'Please reply with your Room Number.', saveToField: 'room_number', inputType: 'text' }),
                node('confirmService', 'textMessage', 400, 800, { message: 'Noted! We have sent the request to the housekeeping team. They will be at Room {{room_number}} shortly. 🧹' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'mainMenu'),
                
                edge('e3', 'mainMenu', 'askDates', 'Book a Room'),
                edge('e4', 'askDates', 'askGuests'),
                edge('e5', 'askGuests', 'handoffBooking'),
                
                edge('e6', 'mainMenu', 'foodMenu', 'Room Service'),
                edge('e7', 'foodMenu', 'askOrder'),
                edge('e8', 'askOrder', 'handoffFood'),
                
                edge('e9', 'mainMenu', 'housekeepingMenu', 'Housekeeping'),
                edge('e10', 'housekeepingMenu', 'askRoom', 'Room Cleaning'),
                edge('e11', 'housekeepingMenu', 'askRoom', 'Extra Towels'),
                edge('e12', 'housekeepingMenu', 'askRoom', 'Laundry Pickup'),
                edge('e13', 'askRoom', 'confirmService')
            ]
        })
    },
    {
        id: 'restaurant-booking',
        name: 'Restaurant Table Booking & Pre-Order',
        category: 'Food',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 521,
        description: 'Allow guests to book a table and pre-order their meals via a digital menu.',
        bestFor: 'Restaurants, Cafes, Cloud Kitchens, Fine Dining.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'table' },
            { key: 'restaurantName', label: 'Restaurant Name', defaultValue: 'The Grand Diner' },
            { key: 'menuLink', label: 'Digital Menu URL', defaultValue: 'https://example.com/menu.pdf' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'book table', 'reservation'],
            trigger_keywords: [fields.keyword, 'reservation'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.restaurantName}! 🍽️\n\nLet's get your table booked.` }),
                node('askGuests', 'userInput', 0, 300, { question: 'How many guests will be joining us?', saveToField: 'guest_count', inputType: 'text' }),
                node('askTime', 'userInput', 0, 450, { question: 'At what time would you like to reserve the table? (e.g., Today 8 PM)', saveToField: 'reservation_time', inputType: 'text' }),
                node('preOrderMenu', 'interactive', 0, 600, {
                    headerText: 'Would you like to pre-order your food so it is ready when you arrive?',
                    items: [
                        { id: 'p1', title: 'Yes, pre-order', description: 'I want to see the menu' },
                        { id: 'p2', title: 'No, maybe later', description: 'Just book the table' }
                    ]
                }),
                node('sendMenu', 'file', -300, 750, { mediaUrl: fields.menuLink, caption: 'Here is our Digital Menu 🌮' }),
                node('askOrder', 'userInput', -300, 900, { question: 'Please type the names of the dishes you want to pre-order.', saveToField: 'food_order', inputType: 'text' }),
                node('confirmOrder', 'textMessage', -300, 1050, { message: 'Great choices! Your table for {{guest_count}} at {{reservation_time}} is confirmed along with your pre-order. See you soon! 🥂' }),
                node('confirmTable', 'textMessage', 300, 750, { message: 'Done! Your table for {{guest_count}} at {{reservation_time}} is confirmed. You can order when you arrive. See you soon! 🥂' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askGuests'),
                edge('e3', 'askGuests', 'askTime'),
                edge('e4', 'askTime', 'preOrderMenu'),
                edge('e5', 'preOrderMenu', 'sendMenu', 'Yes, pre-order'),
                edge('e6', 'sendMenu', 'askOrder'),
                edge('e7', 'askOrder', 'confirmOrder'),
                edge('e8', 'preOrderMenu', 'confirmTable', 'No, maybe later')
            ]
        })
    },
    {
        id: 'car-dealership',
        name: 'Car Test Drive & Service Booking',
        category: 'Automobile',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 432,
        description: 'A dual-purpose flow for dealerships to book test drives and service appointments.',
        bestFor: 'Car Dealerships, Bike Showrooms, Auto Service Centers.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'car' },
            { key: 'dealershipName', label: 'Dealership Name', defaultValue: 'Prime Motors' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'service', 'test drive'],
            trigger_keywords: [fields.keyword, 'service'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'interactive', 0, 150, {
                    headerText: `Welcome to ${fields.dealershipName}! 🚗 How can we assist you today?`,
                    items: [
                        { id: 'd1', title: 'Book Test Drive', description: 'Experience a new car' },
                        { id: 'd2', title: 'Book Service', description: 'Maintenance or repair' }
                    ]
                }),
                
                // Test Drive branch
                node('askModel', 'userInput', -300, 350, { question: 'Which car model would you like to test drive?', saveToField: 'car_model', inputType: 'text' }),
                node('askDateTD', 'userInput', -300, 500, { question: 'Please share your preferred date and time.', saveToField: 'td_datetime', inputType: 'text' }),
                node('handoffTD', 'handoff', -300, 650, { reason: 'Test Drive Request', message: 'Perfect! Our sales advisor will confirm your test drive for the {{car_model}}.' }),
                
                // Service branch
                node('askCarNo', 'userInput', 300, 350, { question: 'Please enter your Car Registration Number.', saveToField: 'car_number', inputType: 'text' }),
                node('askIssue', 'userInput', 300, 500, { question: 'Briefly describe the issue or the type of service required (e.g., General Service, Denting).', saveToField: 'car_issue', inputType: 'text' }),
                node('handoffService', 'handoff', 300, 650, { reason: 'Service Booking Request', message: 'Thanks! Your service request has been logged. Our workshop manager will message you shortly.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askModel', 'Book Test Drive'),
                edge('e3', 'askModel', 'askDateTD'),
                edge('e4', 'askDateTD', 'handoffTD'),
                edge('e5', 'welcome', 'askCarNo', 'Book Service'),
                edge('e6', 'askCarNo', 'askIssue'),
                edge('e7', 'askIssue', 'handoffService')
            ]
        })
    },
    {
        id: 'saas-demo',
        name: 'AI Agent / SaaS Demo Qualification',
        category: 'Sales',
        difficulty: 'Easy',
        minutes: 5,
        fakeStars: 395,
        description: 'Qualify B2B leads by asking their team size before giving a demo link.',
        bestFor: 'SaaS Companies, B2B Agencies, Tech Startups.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'demo' },
            { key: 'softwareName', label: 'Software Name', defaultValue: 'GetAiPilot' },
            { key: 'calendarUrl', label: 'Calendar Link', defaultValue: 'https://calendly.com/example/demo' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'software'],
            trigger_keywords: [fields.keyword, 'software'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Hi there! Thanks for your interest in ${fields.softwareName}. 🚀` }),
                node('askTeamSize', 'interactive', 0, 300, {
                    headerText: 'To help us customize the demo, what is your team size?',
                    items: [
                        { id: 't1', title: '1-10', description: 'Startup' },
                        { id: 't2', title: '11-50', description: 'Growing Team' },
                        { id: 't3', title: '50+', description: 'Enterprise' }
                    ]
                }),
                node('askChallenge', 'userInput', 0, 450, { question: 'Got it. And what is the biggest challenge you are trying to solve right now?', saveToField: 'lead_challenge', inputType: 'text' }),
                node('sendLink', 'textMessage', 0, 600, { message: `Awesome. We have the perfect solution for you.\n\nPlease pick a time for a personalized 1-on-1 demo here:\n${fields.calendarUrl}` })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askTeamSize'),
                edge('e3', 'askTeamSize', 'askChallenge', '1-10'),
                edge('e4', 'askTeamSize', 'askChallenge', '11-50'),
                edge('e5', 'askTeamSize', 'askChallenge', '50+'),
                edge('e6', 'askChallenge', 'sendLink')
            ]
        })
    },
    {
        id: 'event-tickets',
        name: 'Event Ticket Purchase & Info Desk',
        category: 'Events',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 604,
        description: 'Sell event tickets directly on WhatsApp by sharing details and payment links.',
        bestFor: 'Event Organizers, Concerts, Stand-up Comedy, Workshops.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'ticket' },
            { key: 'eventName', label: 'Event Name', defaultValue: 'New Year Bash 2027' },
            { key: 'paymentLink', label: 'Payment Gateway URL', defaultValue: 'https://pay.example.com/tickets' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'event', 'pass'],
            trigger_keywords: [fields.keyword, 'event'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('eventInfo', 'textMessage', 0, 150, { message: `🎉 Welcome to the official ticketing bot for *${fields.eventName}*!` }),
                node('ticketMenu', 'interactive', 0, 300, {
                    headerText: 'Which pass would you like to buy?',
                    items: [
                        { id: 'v1', title: 'General Pass', description: '₹999 - Entry & 1 Drink' },
                        { id: 'v2', title: 'VIP Pass', description: '₹2499 - Front row & unlimited drinks' }
                    ]
                }),
                node('askQty', 'userInput', 0, 450, { question: 'How many passes do you need? (Enter a number)', saveToField: 'ticket_qty', inputType: 'text' }),
                node('sendPayment', 'textMessage', 0, 600, { message: `Great! You are buying {{ticket_qty}} pass(es).\n\nPlease complete your payment securely here:\n${fields.paymentLink}` }),
                node('handoff', 'handoff', 0, 750, { reason: 'Ticket Purchase Verification', message: 'Once you pay, please reply with "PAID" or share a screenshot. Our team will verify and send your barcode tickets! 🎟️' })
            ],
            edges: [
                edge('e1', 'start', 'eventInfo'),
                edge('e2', 'eventInfo', 'ticketMenu'),
                edge('e3', 'ticketMenu', 'askQty', 'General Pass'),
                edge('e4', 'ticketMenu', 'askQty', 'VIP Pass'),
                edge('e5', 'askQty', 'sendPayment'),
                edge('e6', 'sendPayment', 'handoff')
            ]
        })
    },
    {
        id: 'property-finder',
        name: 'Property Finder (AI Filtering)',
        category: 'Real Estate',
        difficulty: 'Medium',
        minutes: 6,
        fakeStars: 588,
        description: 'Help buyers find their dream property by asking standard filtering questions.',
        bestFor: 'Real Estate Brokers, Builders, Property Agencies.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'property' },
            { key: 'agencyName', label: 'Agency Name', defaultValue: 'DreamHomes Realty' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'buy house', 'flat'],
            trigger_keywords: [fields.keyword, 'flat'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Hello! 🏡 Welcome to ${fields.agencyName}. Let's find your dream home.` }),
                node('propertyType', 'interactive', 0, 300, {
                    headerText: 'What kind of property are you looking for?',
                    items: [
                        { id: 'p1', title: 'Apartment / Flat', description: '2BHK, 3BHK, etc.' },
                        { id: 'p2', title: 'Villa / Independent', description: 'Luxury homes' },
                        { id: 'p3', title: 'Plot / Land', description: 'For investment or building' }
                    ]
                }),
                node('budgetMenu', 'interactive', 0, 450, {
                    headerText: 'What is your approximate budget?',
                    items: [
                        { id: 'b1', title: 'Under 50 Lakhs', description: 'Affordable' },
                        { id: 'b2', title: '50L to 1 Crore', description: 'Premium' },
                        { id: 'b3', title: 'Above 1 Crore', description: 'Luxury' }
                    ]
                }),
                node('askCity', 'userInput', 0, 600, { question: 'Which city or specific area are you targeting?', saveToField: 'preferred_location', inputType: 'text' }),
                node('handoff', 'handoff', 0, 750, { reason: 'Qualified Buyer Lead', message: 'Got it! Our real estate expert is fetching the best matching property brochures for your criteria and will share them here in a moment. 🏠' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'propertyType'),
                edge('e3', 'propertyType', 'budgetMenu', 'Apartment / Flat'),
                edge('e4', 'propertyType', 'budgetMenu', 'Villa / Independent'),
                edge('e5', 'propertyType', 'budgetMenu', 'Plot / Land'),
                edge('e6', 'budgetMenu', 'askCity', 'Under 50 Lakhs'),
                edge('e7', 'budgetMenu', 'askCity', '50L to 1 Crore'),
                edge('e8', 'budgetMenu', 'askCity', 'Above 1 Crore'),
                edge('e9', 'askCity', 'handoff')
            ]
        })
    },
    {
        id: 'tour-planner',
        name: 'Tour Package Planner',
        category: 'Travel',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 742,
        description: 'Collect travel details like destination, duration, and budget to generate leads.',
        bestFor: 'Travel Agencies, Tour Operators.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'trip' },
            { key: 'agencyName', label: 'Agency Name', defaultValue: 'Wanderlust Travels' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'tour', 'holiday'],
            trigger_keywords: [fields.keyword, 'holiday'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.agencyName}! ✈️ Let's plan your dream vacation.` }),
                node('askDest', 'userInput', 0, 300, { question: 'Where would you like to travel? (e.g., Bali, Kashmir, Europe)', saveToField: 'destination', inputType: 'text' }),
                node('askDays', 'userInput', 0, 450, { question: 'For how many days? (e.g., 5 Days / 4 Nights)', saveToField: 'duration', inputType: 'text' }),
                node('askBudget', 'interactive', 0, 600, {
                    headerText: 'What is your budget per person?',
                    items: [
                        { id: 'b1', title: 'Budget', description: 'Under ₹20,000' },
                        { id: 'b2', title: 'Standard', description: '₹20k - ₹50k' },
                        { id: 'b3', title: 'Luxury', description: 'Above ₹50k' }
                    ]
                }),
                node('handoff', 'handoff', 0, 750, { reason: 'New Travel Lead', message: 'Thanks! Our travel expert is designing a custom itinerary for {{destination}} and will message you shortly.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askDest'),
                edge('e3', 'askDest', 'askDays'),
                edge('e4', 'askDays', 'askBudget'),
                edge('e5', 'askBudget', 'handoff', 'Budget'),
                edge('e6', 'askBudget', 'handoff', 'Standard'),
                edge('e7', 'askBudget', 'handoff', 'Luxury')
            ]
        })
    },
    {
        id: 'flight-checkin',
        name: 'Flight/Train Web Check-in',
        category: 'Travel',
        difficulty: 'Easy',
        minutes: 5,
        fakeStars: 512,
        description: 'Provide quick assistance for flight/train check-in processes.',
        bestFor: 'Airlines, Travel Portals, Ticketing Agents.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'checkin' },
            { key: 'checkinLink', label: 'Check-in URL', defaultValue: 'https://airline.com/checkin' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'flight'],
            trigger_keywords: [fields.keyword, 'flight'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: 'Hello! I can help you with your web check-in. ✈️' }),
                node('askPNR', 'userInput', 0, 300, { question: 'Please reply with your PNR number.', saveToField: 'pnr_number', inputType: 'text' }),
                node('sendLink', 'textMessage', 0, 450, { message: `Thank you. You can complete your web check-in and select your seats using this link:\n\n${fields.checkinLink}?pnr={{pnr_number}}\n\nHave a safe journey!` })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askPNR'),
                edge('e3', 'askPNR', 'sendLink')
            ]
        })
    },
    {
        id: 'local-guide',
        name: 'Local Tourist Guide Flow',
        category: 'Travel',
        difficulty: 'Medium',
        minutes: 6,
        fakeStars: 429,
        description: 'Act as a virtual local guide providing top spots, cafes, and emergency info.',
        bestFor: 'Hotels, Airbnb Hosts, Tourism Boards.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'guide' },
            { key: 'city', label: 'City Name', defaultValue: 'Goa' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'explore', 'places'],
            trigger_keywords: [fields.keyword, 'explore'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'interactive', 0, 150, {
                    headerText: `Welcome to ${fields.city}! 🌴 What would you like to explore?`,
                    items: [
                        { id: 'm1', title: 'Top Attractions', description: 'Must-visit places' },
                        { id: 'm2', title: 'Best Cafes/Food', description: 'Local delicacies' },
                        { id: 'm3', title: 'Emergency Info', description: 'Hospitals, Police, etc.' }
                    ]
                }),
                node('attractions', 'textMessage', -300, 300, { message: `Here are the top attractions in ${fields.city}:\n1. Sunset Point\n2. Ancient Fort\n3. Local Market` }),
                node('food', 'textMessage', 0, 300, { message: `Don't miss out on these:\n1. The Grand Cafe (Seafood)\n2. Street Food Alley\n3. Vegan Bistro` }),
                node('emergency', 'textMessage', 300, 300, { message: 'Emergency Contacts:\nPolice: 100\nAmbulance: 108\nTourist Helpline: 1363' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'attractions', 'Top Attractions'),
                edge('e3', 'welcome', 'food', 'Best Cafes/Food'),
                edge('e4', 'welcome', 'emergency', 'Emergency Info')
            ]
        })
    },
    {
        id: 'student-admission',
        name: 'Student Admission & Prospectus',
        category: 'Education',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 890,
        description: 'Collect student details, course preference, and send a PDF prospectus automatically.',
        bestFor: 'Universities, Schools, Coaching Institutes.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'admission' },
            { key: 'instituteName', label: 'Institute Name', defaultValue: 'Global Tech University' },
            { key: 'prospectusLink', label: 'Prospectus PDF URL', defaultValue: 'https://example.com/prospectus.pdf' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'course'],
            trigger_keywords: [fields.keyword, 'course'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.instituteName}! 🎓` }),
                node('askCourse', 'interactive', 0, 300, {
                    headerText: 'Which program are you interested in?',
                    items: [
                        { id: 'c1', title: 'B.Tech / Engineering', description: 'Undergraduate' },
                        { id: 'c2', title: 'MBA / Management', description: 'Postgraduate' },
                        { id: 'c3', title: 'Diploma Courses', description: 'Short-term' }
                    ]
                }),
                node('askName', 'userInput', 0, 450, { question: 'Excellent choice. What is your full name?', saveToField: 'student_name', inputType: 'text' }),
                node('askEmail', 'userInput', 0, 600, { question: 'And your email address?', saveToField: 'student_email', inputType: 'email' }),
                node('sendFile', 'file', 0, 750, { mediaUrl: fields.prospectusLink, caption: 'Here is your Course Prospectus & Fee Structure PDF. 📥' }),
                node('handoff', 'handoff', 0, 900, { reason: 'New Admission Lead', message: 'Our admission counselor will contact you shortly to guide you through the process!' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askCourse'),
                edge('e3', 'askCourse', 'askName', 'B.Tech / Engineering'),
                edge('e4', 'askCourse', 'askName', 'MBA / Management'),
                edge('e5', 'askCourse', 'askName', 'Diploma Courses'),
                edge('e6', 'askName', 'askEmail'),
                edge('e7', 'askEmail', 'sendFile'),
                edge('e8', 'sendFile', 'handoff')
            ]
        })
    },
    {
        id: 'therapy-intake',
        name: 'Therapy/Counseling Intake Form',
        category: 'Healthcare',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 489,
        description: 'Discreetly collect patient concerns and book a therapy or counseling session.',
        bestFor: 'Therapists, Psychologists, Mental Health Clinics.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'counseling' },
            { key: 'clinicName', label: 'Clinic Name', defaultValue: 'MindWell Care' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'therapy', 'help'],
            trigger_keywords: [fields.keyword, 'therapy'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Hello. You've reached ${fields.clinicName}. We are here to support you. 💙` }),
                node('askConcern', 'interactive', 0, 300, {
                    headerText: 'What would you like to focus on during your session? (This is confidential)',
                    items: [
                        { id: 'c1', title: 'Anxiety / Stress', description: '' },
                        { id: 'c2', title: 'Relationships', description: '' },
                        { id: 'c3', title: 'Career / Life Goals', description: '' }
                    ]
                }),
                node('askTime', 'userInput', 0, 450, { question: 'When would you prefer to schedule your consultation? (e.g., Weekday mornings, Weekends)', saveToField: 'pref_time', inputType: 'text' }),
                node('handoff', 'handoff', 0, 600, { reason: 'New Patient Intake', message: 'Thank you for sharing. A counselor will message you shortly to finalize your appointment time.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askConcern'),
                edge('e3', 'askConcern', 'askTime', 'Anxiety / Stress'),
                edge('e4', 'askConcern', 'askTime', 'Relationships'),
                edge('e5', 'askConcern', 'askTime', 'Career / Life Goals'),
                edge('e6', 'askTime', 'handoff')
            ]
        })
    },
    {
        id: 'handyman-booking',
        name: 'Handyman Service Booking',
        category: 'Home Services',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 633,
        description: 'Book home services like plumbers, electricians, or appliance repair with image upload.',
        bestFor: 'Home Service Apps, Plumbers, Electricians, AC Repair.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'repair' },
            { key: 'serviceCompany', label: 'Company Name', defaultValue: 'QuickFix Experts' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'service', 'fix'],
            trigger_keywords: [fields.keyword, 'repair'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'interactive', 0, 150, {
                    headerText: `Welcome to ${fields.serviceCompany} 🛠️ What needs fixing?`,
                    items: [
                        { id: 's1', title: 'Plumbing', description: 'Leaks, pipes, taps' },
                        { id: 's2', title: 'Electrical', description: 'Wiring, lights, fans' },
                        { id: 's3', title: 'Appliance', description: 'AC, Fridge, Washing Machine' }
                    ]
                }),
                node('askIssue', 'userInput', 0, 300, { question: 'Please describe the issue briefly (e.g., AC is not cooling). You can also send a photo later.', saveToField: 'issue_desc', inputType: 'text' }),
                node('askAddress', 'userInput', 0, 450, { question: 'Please reply with your full address.', saveToField: 'address', inputType: 'text' }),
                node('handoff', 'handoff', 0, 600, { reason: 'Home Service Request', message: 'Got it! A technician is being assigned to your request and will contact you with the exact visit time and charges.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askIssue', 'Plumbing'),
                edge('e3', 'welcome', 'askIssue', 'Electrical'),
                edge('e4', 'welcome', 'askIssue', 'Appliance'),
                edge('e5', 'askIssue', 'askAddress'),
                edge('e6', 'askAddress', 'handoff')
            ]
        })
    },
    {
        id: 'cleaning-subscription',
        name: 'Recurring Cleaning Subscription',
        category: 'Home Services',
        difficulty: 'Medium',
        minutes: 6,
        fakeStars: 399,
        description: 'Sell recurring cleaning packages directly over WhatsApp.',
        bestFor: 'Cleaning Agencies, Maid Services, Facility Management.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'cleaning' },
            { key: 'companyName', label: 'Company Name', defaultValue: 'Sparkle Cleaners' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'clean', 'maid'],
            trigger_keywords: [fields.keyword, 'cleaning'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Hi! Welcome to ${fields.companyName} ✨` }),
                node('askPlan', 'interactive', 0, 300, {
                    headerText: 'Choose a cleaning subscription plan:',
                    items: [
                        { id: 'p1', title: 'Weekly Plan', description: '1 deep clean per week' },
                        { id: 'p2', title: 'Bi-Weekly Plan', description: '2 deep cleans per month' },
                        { id: 'p3', title: 'One-Time Deep Clean', description: 'For special occasions' }
                    ]
                }),
                node('askDay', 'userInput', 0, 450, { question: 'Which day of the week is usually best for the cleaning? (e.g., Saturday morning)', saveToField: 'preferred_day', inputType: 'text' }),
                node('handoff', 'handoff', 0, 600, { reason: 'Cleaning Subscription', message: 'Perfect! Our booking manager will share the payment link and confirm your schedule.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askPlan'),
                edge('e3', 'askPlan', 'askDay', 'Weekly Plan'),
                edge('e4', 'askPlan', 'askDay', 'Bi-Weekly Plan'),
                edge('e5', 'askPlan', 'askDay', 'One-Time Deep Clean'),
                edge('e6', 'askDay', 'handoff')
            ]
        })
    },
    {
        id: 'sip-mutual-fund',
        name: 'SIP / Mutual Fund Advisor',
        category: 'Finance',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 580,
        description: 'Understand the users financial goals and suggest SIP or Mutual Fund options.',
        bestFor: 'Financial Advisors, Banks, FinTech Apps.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'invest' },
            { key: 'advisorName', label: 'Advisor/Brand Name', defaultValue: 'WealthGrow Advisors' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'sip', 'mutual fund'],
            trigger_keywords: [fields.keyword, 'sip'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.advisorName}! 📈 Let's start your wealth creation journey.` }),
                node('askGoal', 'interactive', 0, 300, {
                    headerText: 'What is your primary investment goal?',
                    items: [
                        { id: 'g1', title: 'Wealth Creation', description: 'Long term growth' },
                        { id: 'g2', title: 'Tax Saving', description: 'ELSS Funds' },
                        { id: 'g3', title: 'Short Term Goals', description: 'Car, Vacation (1-3 yrs)' }
                    ]
                }),
                node('askAmount', 'userInput', 0, 450, { question: 'How much are you planning to invest monthly? (e.g., ₹5000)', saveToField: 'sip_amount', inputType: 'text' }),
                node('handoff', 'handoff', 0, 600, { reason: 'Investment Lead', message: 'Great decision! An expert advisor is reviewing your goals and will suggest the top 3 mutual funds for you in a moment.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askGoal'),
                edge('e3', 'askGoal', 'askAmount', 'Wealth Creation'),
                edge('e4', 'askGoal', 'askAmount', 'Tax Saving'),
                edge('e5', 'askGoal', 'askAmount', 'Short Term Goals'),
                edge('e6', 'askAmount', 'handoff')
            ]
        })
    },
    {
        id: 'credit-card-application',
        name: 'Credit Card Application',
        category: 'Finance',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 890,
        description: 'Qualify users for a credit card and hand off for KYC.',
        bestFor: 'Banks, DSA Agents, FinTech Platforms.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'credit card' },
            { key: 'bankName', label: 'Bank Name', defaultValue: 'Global Bank' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'card', 'apply'],
            trigger_keywords: [fields.keyword, 'card'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.bankName} Credit Cards! 💳` }),
                node('askEmpType', 'interactive', 0, 300, {
                    headerText: 'Are you Salaried or Self-Employed?',
                    items: [
                        { id: 'e1', title: 'Salaried', description: 'Working in a company' },
                        { id: 'e2', title: 'Self-Employed', description: 'Business owner / Freelancer' }
                    ]
                }),
                node('askIncome', 'userInput', 0, 450, { question: 'Please enter your net monthly income (or yearly ITR if business).', saveToField: 'cc_income', inputType: 'text' }),
                node('handoff', 'handoff', 0, 600, { reason: 'Credit Card Application', message: 'Thanks! Your application is in process. An agent will verify your details and send the final KYC link.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askEmpType'),
                edge('e3', 'askEmpType', 'askIncome', 'Salaried'),
                edge('e4', 'askEmpType', 'askIncome', 'Self-Employed'),
                edge('e5', 'askIncome', 'handoff')
            ]
        })
    },
    {
        id: 'coworking-booking',
        name: 'Coworking Space Booking',
        category: 'B2B',
        difficulty: 'Medium',
        minutes: 6,
        fakeStars: 312,
        description: 'Generate leads for coworking spaces by asking for seat counts and space types.',
        bestFor: 'Coworking Spaces, Business Centers, Real Estate.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'coworking' },
            { key: 'hubName', label: 'Space Name', defaultValue: 'Innovate Hub' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'office', 'workspace'],
            trigger_keywords: [fields.keyword, 'office'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Start' }),
                node('welcome', 'textMessage', 0, 150, { message: `Welcome to ${fields.hubName}! 🏢 The perfect workspace for your team.` }),
                node('askType', 'interactive', 0, 300, {
                    headerText: 'What type of workspace are you looking for?',
                    items: [
                        { id: 'w1', title: 'Hot Desk', description: 'Flexible seating' },
                        { id: 'w2', title: 'Dedicated Desk', description: 'Fixed seating' },
                        { id: 'w3', title: 'Private Cabin', description: 'For teams' }
                    ]
                }),
                node('askSeats', 'userInput', 0, 450, { question: 'How many seats do you need?', saveToField: 'seat_count', inputType: 'text' }),
                node('handoff', 'handoff', 0, 600, { reason: 'Workspace Lead', message: 'Thanks! Our community manager will share the pricing and availability with you shortly.' })
            ],
            edges: [
                edge('e1', 'start', 'welcome'),
                edge('e2', 'welcome', 'askType'),
                edge('e3', 'askType', 'askSeats', 'Hot Desk'),
                edge('e4', 'askType', 'askSeats', 'Dedicated Desk'),
                edge('e5', 'askType', 'askSeats', 'Private Cabin'),
                edge('e6', 'askSeats', 'handoff')
            ]
        })
    },
].map(template => ({
    ...template,
    preview: template.build(Object.fromEntries(template.fields.map(field => [field.key, field.defaultValue]))),
}));

export function buildFlowFromTemplate(template, values = {}) {
    const fields = Object.fromEntries(template.fields.map(field => [field.key, values[field.key] || field.defaultValue || '']));
    const built = template.build(fields);
    const keyword = built.trigger_keywords?.[0] || fields.keyword || template.name.toLowerCase().split(/\s+/)[0];

    return {
        name: `${template.name}`,
        description: tpl(template.description, fields),
        status: 'draft',
        trigger_type: 'keyword',
        trigger_keywords: built.trigger_keywords || [keyword],
        triggers: built.triggers || [keyword],
        nodes: built.nodes,
        edges: built.edges,
    };
}
