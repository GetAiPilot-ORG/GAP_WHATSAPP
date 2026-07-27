import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Shield, Lock, Eye, Mail, ArrowLeft, Search, X, ChevronUp, Copy, Check,
  Printer, Menu, ChevronDown, ExternalLink, Scale, Globe,
  Database, Users, MessageSquare, Bot, CreditCard, Bell, FileText,
  Cookie, Clock, Trash2, Baby, Brain, Workflow, Phone, Server
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────
const COMPANY_NAME = 'GetAiPilot';
const PRODUCT_NAME = 'GAP FlowPilot';
const DOMAIN = 'getaipilot.in';
const SUPPORT_EMAIL = 'getaipilott@gmail.com';
const PRIVACY_EMAIL = 'privacy@getaipilot.in';
const LAST_UPDATED = 'July 20, 2026';
const EFFECTIVE_DATE = 'July 20, 2026';

// ─── Section Data ─────────────────────────────────────────────────────────────
const POLICY_SECTIONS = [
  {
    id: 'introduction',
    title: 'Introduction & Scope',
    icon: Shield,
    content: [
      {
        type: 'paragraph',
        text: `${COMPANY_NAME} ("Company," "we," "us," or "our") operates the ${PRODUCT_NAME} platform — a Software-as-a-Service ("SaaS") solution that enables businesses to manage WhatsApp communication, automation, broadcasting, AI-powered customer engagement, and related services through the official WhatsApp Business Platform provided by Meta Platforms, Inc.`,
      },
      {
        type: 'paragraph',
        text: `This Privacy Policy explains how we collect, use, disclose, store, and protect information when you access or use our platform available at ${DOMAIN} and any associated services, APIs, mobile applications, or tools (collectively, the "Services"). This Policy applies to all users, including workspace owners, administrators, team agents, and end-customers whose data may be processed through the Services.`,
      },
      {
        type: 'paragraph',
        text: `By accessing or using the Services, you acknowledge that you have read, understood, and agree to the practices described in this Privacy Policy. If you do not agree, please discontinue use of the Services immediately.`,
      },
      {
        type: 'paragraph',
        text: `This Privacy Policy is designed to comply with applicable data protection laws, including but not limited to the General Data Protection Regulation (GDPR), the Indian Digital Personal Data Protection Act, 2023 (DPDP Act), and the requirements of the Meta Platform Terms and WhatsApp Business Platform Policies.`,
      },
    ],
  },
  {
    id: 'definitions',
    title: 'Definitions',
    icon: FileText,
    content: [
      {
        type: 'list',
        items: [
          { label: 'Platform / Services', text: `The ${PRODUCT_NAME} web application and all associated backend services, APIs, and tools operated by ${COMPANY_NAME}.` },
          { label: 'User / You', text: 'Any individual or entity that accesses or uses the Services, including workspace owners, administrators, and team agents.' },
          { label: 'End-Customer', text: 'A person whose phone number or personal data is uploaded to or processed through the Platform by a User for the purposes of WhatsApp messaging.' },
          { label: 'Organization / Workspace', text: 'A multi-tenant workspace created within the Platform, representing a business entity and its associated data, team members, and configurations.' },
          { label: 'WhatsApp Business Account (WABA)', text: 'A business account on the WhatsApp Business Platform, managed via Meta\'s Cloud API, that the User connects to the Platform.' },
          { label: 'Personal Data', text: 'Any information relating to an identified or identifiable natural person, as defined under applicable data protection laws.' },
          { label: 'Processing', text: 'Any operation performed on Personal Data, including collection, storage, use, disclosure, or deletion.' },
        ],
      },
    ],
  },
  {
    id: 'information-collected',
    title: 'Information We Collect',
    icon: Database,
    content: [
      {
        type: 'paragraph',
        text: 'We collect and process the following categories of information in connection with the Services. Every data point listed below is collected because it is required for specific platform functionality — we do not collect data beyond what is necessary to provide the Services.',
      },
      {
        type: 'subsection',
        title: '3.1 Account & Authentication Data',
        items: [
          'Full name, email address, and hashed password (for email-based registration)',
          'Google account identifier and profile information (when signing in via Google OAuth)',
          'Organization name, industry, website, and workspace slug',
          'Team member profiles including name, email, role (owner, admin, agent), and avatar preferences',
          'Invitation tokens, acceptance status, and temporary credentials (encrypted at rest)',
          'Authentication session tokens and JWT Bearer tokens',
        ],
      },
      {
        type: 'subsection',
        title: '3.2 WhatsApp Business Data',
        items: [
          'WhatsApp Business Account ID (WABA ID)',
          'Phone Number ID and display phone number',
          'Meta access tokens (encrypted using AES-256-CBC before storage)',
          'WhatsApp Business Profile information (about, address, description, email, websites, profile picture, business vertical)',
          'Message template content, parameters, language, category, and approval status',
          'Webhook subscription configurations and event payloads',
          'Business verification status and account review status',
        ],
      },
      {
        type: 'subsection',
        title: '3.3 Messaging & Conversation Data',
        items: [
          'Inbound and outbound message content (text, interactive, button responses)',
          'Message metadata (timestamps, delivery status, read receipts, message IDs)',
          'Media files exchanged in conversations (images, videos, audio, documents, PDFs)',
          'Conversation assignment and handoff state (bot/human agent assignment)',
          'Internal notes and conversation summaries',
          'Sender type classification (customer, human agent, AI agent, system)',
        ],
      },
      {
        type: 'subsection',
        title: '3.4 Contact & CRM Data',
        items: [
          'Contact names, phone numbers, and WhatsApp IDs',
          'Custom fields and tags assigned to contacts',
          'Contact import data (from CSV file uploads)',
          'Lead status and segmentation information',
          'Contact interaction history and last message timestamps',
        ],
      },
      {
        type: 'subsection',
        title: '3.5 Campaign & Broadcast Data',
        items: [
          'Campaign name, template selection, recipient lists, and scheduling parameters',
          'Broadcast execution status, delivery reports, and error logs',
          'Campaign analytics (sent, delivered, read, failed counts)',
          'Queue processing metadata (job IDs, retry counts, rate limiting data)',
        ],
      },
      {
        type: 'subsection',
        title: '3.6 Automation & Flow Builder Data',
        items: [
          'Flow definitions (nodes, edges, trigger keywords, trigger types)',
          'Published flow versions and version history',
          'Flow session state (current node, state data, interaction timestamps)',
          'Flow run execution logs (input/output per node, status, error messages)',
          'Chatbot configurations and automation rules',
        ],
      },
      {
        type: 'subsection',
        title: '3.7 AI & Bot Agent Data',
        items: [
          'Bot agent configurations (name, description, model selection, temperature settings)',
          'System prompts and custom instructions',
          'Knowledge base documents (uploaded text, PDFs, and parsed content)',
          'Trigger keywords and automation settings',
          'AI-generated responses and conversation context sent to AI providers',
          'Conversation summaries generated by AI/workflow systems',
        ],
      },
      {
        type: 'subsection',
        title: '3.8 Payment & Billing Data',
        items: [
          'Subscription plan selection and billing cycle (monthly/yearly)',
          'Payment transaction records (payment link IDs, status, amounts in paise)',
          'Proration calculations for plan upgrades/downgrades',
          'Invoice and payment history',
          'Razorpay payment link references (we do not store raw card numbers or CVVs — all payment card processing is handled exclusively by Razorpay)',
        ],
      },
      {
        type: 'subsection',
        title: '3.9 Form Submission Data',
        items: [
          'Quick Form definitions and configurations',
          'Form responses submitted by end-customers',
          'Files uploaded through forms',
          'Encrypted form URL tokens (AES-256-GCM with time-based expiration)',
        ],
      },
      {
        type: 'subsection',
        title: '3.10 Technical & Usage Data',
        items: [
          'IP address and approximate geolocation (derived from IP, not GPS)',
          'Browser type, version, and operating system',
          'Device information and screen resolution',
          'Pages visited, features used, and interaction patterns within the Platform',
          'Error logs, crash reports, and performance metrics',
          'API request logs and response times',
          'Cookie consent preferences',
        ],
      },
      {
        type: 'subsection',
        title: '3.11 Communication Data',
        items: [
          'Emails sent by the Platform (team invitations, system notifications)',
          'Support inquiries and correspondence',
          'In-app notification preferences and sound settings',
        ],
      },
    ],
  },
  {
    id: 'how-we-collect',
    title: 'How We Collect Information',
    icon: Eye,
    content: [
      {
        type: 'list',
        items: [
          { label: 'Directly from you', text: 'When you register an account, configure your workspace, upload contacts, create campaigns, connect a WhatsApp Business Account, or submit support requests.' },
          { label: 'From Meta\'s WhatsApp Business Platform', text: 'Through webhooks, APIs, and the Embedded Signup flow, we receive message delivery statuses, inbound messages, template status updates, and account information that you have authorized Meta to share with our application.' },
          { label: 'Automatically through your use of the Platform', text: 'We collect technical data such as IP addresses, browser information, and usage patterns through server logs and essential cookies.' },
          { label: 'From third-party authentication providers', text: 'When you sign in via Google OAuth, we receive your name, email, and profile identifier from Google through Supabase Auth.' },
          { label: 'From payment processors', text: 'Razorpay provides us with payment status confirmations and transaction references (not raw card details).' },
          { label: 'From your team members', text: 'Workspace administrators and agents may add contacts, upload files, configure bots, or send messages that involve processing of end-customer data.' },
        ],
      },
    ],
  },
  {
    id: 'purpose',
    title: 'Purpose of Data Processing',
    icon: FileText,
    content: [
      {
        type: 'paragraph',
        text: 'We process your information strictly for the following purposes:',
      },
      {
        type: 'table',
        headers: ['Purpose', 'Data Categories Used'],
        rows: [
          ['Authenticate and authorize your access to the Platform', 'Account data, session tokens, OAuth identifiers'],
          ['Provision and manage your Organization workspace', 'Organization details, team member profiles, role assignments'],
          ['Connect and manage your WhatsApp Business Account', 'WABA ID, phone number ID, encrypted access tokens, Meta permissions'],
          ['Send, receive, and display WhatsApp messages on your behalf', 'Message content, media files, contact phone numbers, delivery statuses'],
          ['Execute broadcast campaigns and scheduled messages', 'Campaign data, recipient lists, templates, scheduling parameters, queue metadata'],
          ['Run Flow Builder automations and chatbot responses', 'Flow definitions, session state, trigger data, execution logs'],
          ['Provide AI-powered automated replies via bot agents', 'Conversation context, knowledge base, system prompts, AI model parameters'],
          ['Manage your contacts and CRM records', 'Contact names, phone numbers, custom fields, tags, import data'],
          ['Process subscription payments and manage billing', 'Plan selection, payment references, invoice history'],
          ['Send transactional emails (invitations, notifications)', 'Email addresses, notification content'],
          ['Deliver real-time updates within the Platform', 'WebSocket session data, notification preferences'],
          ['Generate dashboard analytics and usage reports', 'Aggregated messaging metrics, campaign statistics, flow execution data'],
          ['Maintain security and prevent abuse', 'IP addresses, authentication logs, webhook signatures, rate limiting data'],
          ['Troubleshoot errors and improve platform stability', 'Error logs, API logs, crash reports, performance metrics'],
          ['Comply with legal obligations and respond to lawful requests', 'Any data as required by applicable law or legal process'],
          ['Collect and process Quick Form responses', 'Form submissions, uploaded files, encrypted URL tokens'],
        ],
      },
    ],
  },
  {
    id: 'legal-basis',
    title: 'Legal Basis for Processing',
    icon: Scale,
    content: [
      {
        type: 'paragraph',
        text: 'Where applicable data protection laws require a legal basis for processing Personal Data, we rely on the following:',
      },
      {
        type: 'list',
        items: [
          { label: 'Performance of a Contract', text: 'Processing necessary to provide the Services you have subscribed to, including account management, messaging, campaigns, and automation features.' },
          { label: 'Consent', text: 'Where you have provided explicit consent, such as connecting your WhatsApp Business Account via Meta\'s Embedded Signup flow, enabling AI bot agents, or accepting optional cookies.' },
          { label: 'Legitimate Interest', text: 'Processing necessary for our legitimate business interests, including platform security, fraud prevention, service improvement, and analytics — balanced against your rights and freedoms.' },
          { label: 'Legal Obligation', text: 'Processing required to comply with applicable laws, regulations, court orders, or governmental requests, including tax and financial record-keeping requirements.' },
        ],
      },
      {
        type: 'paragraph',
        text: 'Under the Indian Digital Personal Data Protection Act, 2023 (DPDP Act), we process personal data based on consent obtained from the Data Principal or for legitimate uses as specified under the Act. You may withdraw your consent at any time by contacting us or using the account settings within the Platform.',
      },
    ],
  },
  {
    id: 'whatsapp-business-platform',
    title: 'WhatsApp Business Platform',
    icon: MessageSquare,
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: 'This section describes how our Platform interacts with the WhatsApp Business Platform operated by Meta Platforms, Inc. It is designed to provide transparency in accordance with Meta\'s Platform Terms, WhatsApp Business Messaging Policy, and Meta App Review requirements.',
      },
      {
        type: 'subsection',
        title: '7.1 Platform Integration',
        items: [
          `${PRODUCT_NAME} is a registered application on the Meta Platform and uses the official WhatsApp Cloud API to provide messaging services.`,
          'We operate as a Technology Provider enabling businesses to communicate with their customers via WhatsApp.',
          'All messaging operations comply with the WhatsApp Business Platform Policies and Meta Platform Terms.',
        ],
      },
      {
        type: 'subsection',
        title: '7.2 Account Connection & Authorization',
        items: [
          'Users explicitly connect their own WhatsApp Business Account (WABA) to our Platform through Meta\'s Embedded Signup flow.',
          'During Embedded Signup, users authorize our application to access their WABA through Meta\'s OAuth consent screen.',
          'We request only the permissions necessary to provide the Services: whatsapp_business_messaging and whatsapp_business_management.',
          'Users retain full ownership and control of their WhatsApp Business Account at all times.',
          'Users can disconnect their WhatsApp Business Account from our Platform at any time, which immediately revokes our access.',
        ],
      },
      {
        type: 'subsection',
        title: '7.3 Message Processing',
        items: [
          'We process messages solely to provide the messaging, automation, broadcasting, live chat, and analytics features explicitly requested and configured by the User.',
          'Outbound messages are sent only when initiated by the User (manually, through campaigns, via automation flows, or through AI bot agents configured by the User).',
          'Inbound messages are received through Meta\'s webhook system and stored to enable live chat, conversation history, flow automation, and AI agent responses.',
          'We do not access, read, or use customer conversations for any purpose beyond what is strictly required for message delivery, automation execution, analytics generation, or features explicitly enabled and configured by the User.',
          'Message content is not used to train our systems or any third-party AI models unless the User has explicitly configured AI bot agents with conversation access for that specific workspace.',
        ],
      },
      {
        type: 'subsection',
        title: '7.4 Template Management',
        items: [
          'Users create and submit message templates through our Platform, which are forwarded to Meta for approval.',
          'We store template content, parameters, and approval status to enable template selection and campaign management.',
          'Template status updates are received via Meta webhooks and reflected in the Platform.',
        ],
      },
      {
        type: 'subsection',
        title: '7.5 Media Handling',
        items: [
          'Media files (images, videos, audio, documents) sent or received through WhatsApp are downloaded from Meta\'s CDN and stored in our secure storage infrastructure (Supabase Storage).',
          'Media is stored to enable conversation history display, media preview in live chat, and campaign analytics.',
          'Users can delete media associated with their workspace at any time.',
        ],
      },
      {
        type: 'subsection',
        title: '7.6 Webhook Security',
        items: [
          'All incoming webhooks from Meta are verified using HMAC-SHA256 signature validation against our Meta App Secret.',
          'Webhook payloads that fail signature verification are rejected and logged for security monitoring.',
        ],
      },
      {
        type: 'subsection',
        title: '7.7 User Responsibilities',
        items: [
          'Users are solely responsible for obtaining necessary consents from their end-customers before sending WhatsApp messages.',
          'Users must comply with WhatsApp\'s Business Messaging Policy, Commerce Policy, and all applicable Meta Platform Terms.',
          'Users must not use the Platform to send spam, phishing, or any content that violates WhatsApp\'s policies.',
          `${COMPANY_NAME} is not responsible for the content of messages sent by Users through the Platform.`,
        ],
      },
    ],
  },
  {
    id: 'ai-features',
    title: 'AI-Powered Features',
    icon: Brain,
    content: [
      {
        type: 'paragraph',
        text: 'Our Platform offers AI-powered bot agents that can automatically respond to incoming WhatsApp messages. This section explains how AI features process data.',
      },
      {
        type: 'subsection',
        title: '8.1 How AI Processing Works',
        items: [
          'When a User configures and activates an AI bot agent, incoming messages matching trigger keywords (or all messages, if configured) are sent to OpenAI\'s API along with conversation context and the bot\'s knowledge base.',
          'The AI model generates a response based on the system prompt, knowledge base content, and recent conversation history provided by the User.',
          'AI-generated responses are sent back to the end-customer via the WhatsApp Cloud API on behalf of the User.',
        ],
      },
      {
        type: 'subsection',
        title: '8.2 Third-Party AI Providers',
        items: [
          'We currently use OpenAI\'s API (GPT models) as the AI provider for bot agent responses.',
          'Users can configure their own OpenAI API key for their workspace, in which case API calls are made using their key.',
          'Data sent to OpenAI includes: the conversation message, recent message history (up to 40 messages), system prompt, and knowledge base context (up to 10,000 characters).',
          'OpenAI\'s data processing is governed by their own privacy policy and API data usage policies. As of the date of this policy, OpenAI does not use data submitted via their API to train their models.',
        ],
      },
      {
        type: 'subsection',
        title: '8.3 Knowledge Base',
        items: [
          'Users can upload documents (text, PDF, DOCX) to create a knowledge base that the AI agent references when generating responses.',
          'Knowledge base content is stored in our database and is scoped to the User\'s organization — it is never shared across workspaces.',
          'Document content is parsed and indexed for retrieval but is not used for any purpose other than providing context to the AI agent.',
        ],
      },
      {
        type: 'subsection',
        title: '8.4 AI Data Minimization',
        items: [
          'We apply data minimization principles: only the minimum conversation context and knowledge base content necessary to generate a relevant response is sent to the AI provider.',
          'Conversation history sent to the AI is limited to the most recent messages and truncated to fit within context limits.',
          'We do not use customer conversation data to train, fine-tune, or improve any AI model. Customer data remains solely for the purpose of generating real-time responses.',
        ],
      },
      {
        type: 'subsection',
        title: '8.5 Conversation Summaries',
        items: [
          'Our Platform can generate AI-powered conversation summaries for agent handoff and CRM purposes.',
          'Summaries are generated by sending conversation transcripts to an AI provider (via n8n workflow automation) and storing the resulting summary within the workspace.',
          'Summaries are workspace-private and visible only to authorized team members.',
        ],
      },
      {
        type: 'subsection',
        title: '8.6 Human Handoff',
        items: [
          'End-customers can request to speak with a human agent at any time (e.g., by typing "talk to human").',
          'When a handoff is triggered, the AI bot is paused for that conversation, and a human agent is notified.',
          'Users retain full control over whether AI automation is enabled or disabled for any given conversation.',
        ],
      },
    ],
  },
  {
    id: 'data-sharing',
    title: 'Data Sharing & Third-Party Services',
    icon: Globe,
    content: [
      {
        type: 'callout',
        variant: 'important',
        text: `${COMPANY_NAME} does not sell, rent, trade, or monetize your Personal Data or your customers' contact information to any third party. Data is shared only as described below to provide and operate the Services.`,
      },
      {
        type: 'subsection',
        title: '9.1 Service Providers',
        items: [],
      },
      {
        type: 'table',
        headers: ['Service Provider', 'Purpose', 'Data Shared'],
        rows: [
          ['Meta Platforms, Inc. (WhatsApp Cloud API)', 'Message delivery, template management, account management', 'Messages, templates, media, WABA credentials, phone numbers'],
          ['Meta Platforms, Inc. (Facebook SDK)', 'Embedded Signup flow for WABA connection', 'OAuth tokens, WABA authorization'],
          ['Google (via Supabase Auth)', 'OAuth-based user authentication', 'Name, email, profile identifier'],
          ['Supabase (PostgreSQL, Auth, Storage)', 'Primary database, authentication, media file storage', 'All platform data (encrypted at rest by Supabase infrastructure)'],
          ['Razorpay', 'Payment processing and subscription billing', 'User email, plan details, payment amounts (card data is processed exclusively by Razorpay)'],
          ['OpenAI', 'AI-powered bot agent responses', 'Conversation context, knowledge base content, system prompts (only when AI features are enabled)'],
          ['SMTP Provider (email delivery)', 'Sending transactional emails (invitations, notifications)', 'Recipient email addresses, email content'],
          ['Redis (via managed hosting)', 'Job queue for broadcast processing', 'Campaign job metadata, message queue data (transient)'],
          ['n8n (workflow automation)', 'Conversation summary generation and agent handoff workflows', 'Conversation transcripts, contact details (only when configured)'],
          ['Twilio', 'Phone number provisioning (optional feature)', 'Phone number selection and provisioning data'],
          ['Vercel', 'Frontend application hosting and CDN', 'Static assets, client-side routing (no personal data stored by Vercel)'],
          ['DiceBear', 'Avatar generation for team member profiles', 'Avatar seed/style parameters (no personal data)'],
        ],
      },
      {
        type: 'subsection',
        title: '9.2 Legal Disclosures',
        items: [
          'We may disclose your information if required by law, regulation, legal process, or governmental request.',
          'We may disclose information to enforce our Terms of Service, protect our rights, property, or safety, or that of our users or the public.',
          'In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity, subject to applicable privacy laws.',
        ],
      },
      {
        type: 'subsection',
        title: '9.3 Aggregated & De-identified Data',
        items: [
          'We may use aggregated, anonymized, or de-identified data for analytics, benchmarking, and service improvement purposes. Such data cannot be used to identify any individual.',
        ],
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies & Tracking Technologies',
    icon: Cookie,
    content: [
      {
        type: 'paragraph',
        text: 'Our Platform uses cookies and similar technologies to operate effectively and provide a personalized experience. We implement a cookie consent mechanism that allows you to control non-essential cookies.',
      },
      {
        type: 'table',
        headers: ['Cookie Category', 'Purpose', 'Required?'],
        rows: [
          ['Essential / Necessary', 'Authentication sessions, CSRF protection, cookie consent state, core functionality. These cookies are strictly necessary for the Platform to function.', 'Yes'],
          ['Authentication', 'Maintaining your login session via Supabase Auth tokens stored in local storage / cookies. These enable you to remain signed in across page navigations.', 'Yes'],
          ['Preference', 'Storing your UI preferences such as notification sound selection, sidebar state, and display settings.', 'No'],
          ['Integration', 'Facebook SDK cookies required for the Meta Embedded Signup flow. These are loaded only when you initiate WhatsApp account connection or when you consent.', 'No'],
          ['Security', 'Rate limiting, abuse prevention, and webhook signature validation tokens.', 'Yes'],
        ],
      },
      {
        type: 'paragraph',
        text: 'You can manage your cookie preferences at any time through the cookie consent banner or your browser settings. Disabling essential cookies may prevent the Platform from functioning correctly.',
      },
    ],
  },
  {
    id: 'data-security',
    title: 'Data Security',
    icon: Lock,
    content: [
      {
        type: 'paragraph',
        text: `We implement comprehensive technical and organizational security measures to protect your data. Security is a fundamental design principle of the ${PRODUCT_NAME} platform.`,
      },
      {
        type: 'subsection',
        title: '11.1 Encryption',
        items: [
          'Encryption in Transit: All data transmitted between your browser, our servers, and third-party APIs is encrypted using TLS 1.2+ (HTTPS).',
          'Encryption at Rest: WhatsApp Business API access tokens are encrypted using AES-256-CBC with a dedicated server-side encryption key before being stored in the database.',
          'Form URL tokens are encrypted using AES-256-GCM with authenticated encryption and time-based expiration.',
          'Team member invitation passwords are encrypted before temporary storage.',
          'Supabase infrastructure provides additional encryption at rest for all database and storage content.',
        ],
      },
      {
        type: 'subsection',
        title: '11.2 Access Controls',
        items: [
          'Role-based access control (RBAC) with three levels: Owner, Admin, and Agent — each with distinct permission boundaries.',
          'JWT Bearer token authentication for all API requests, verified against Supabase Auth.',
          'Organization-level data isolation: each workspace\'s data is strictly scoped and inaccessible to other workspaces.',
          'Principle of least privilege applied to service accounts and database access.',
          'Subscription-based feature gating that prevents unauthorized access to premium features.',
        ],
      },
      {
        type: 'subsection',
        title: '11.3 Webhook & API Security',
        items: [
          'Meta webhook payloads are verified using HMAC-SHA256 signature validation with timing-safe comparison.',
          'CORS policy restricts API access to authorized frontend origins only.',
          'Rate limiting on broadcast operations to prevent abuse (configurable per-second message limits).',
          'N8N webhook calls are authenticated using secret header tokens.',
        ],
      },
      {
        type: 'subsection',
        title: '11.4 Infrastructure Security',
        items: [
          'Application hosted on secure cloud infrastructure with automatic security patching.',
          'Database hosted on Supabase with enterprise-grade security, including network isolation and automated backups.',
          'Redis instances configured with TLS encryption (when enabled) for broadcast queue operations.',
          'Regular dependency auditing and security updates.',
        ],
      },
      {
        type: 'subsection',
        title: '11.5 Payment Security',
        items: [
          'All payment processing is handled by Razorpay, a PCI DSS-compliant payment gateway.',
          'We do not store, process, or have access to raw credit card numbers, CVVs, or banking credentials.',
          'Payment links are generated server-side with authenticated Razorpay API calls.',
        ],
      },
      {
        type: 'subsection',
        title: '11.6 Session Security',
        items: [
          'Authentication sessions are managed by Supabase Auth with automatic token refresh and expiration.',
          'Agent login portal uses separate authentication context with portal-type headers to enforce role boundaries.',
          'Real-time WebSocket connections (Socket.IO) are authenticated and scoped to authorized CORS origins.',
        ],
      },
    ],
  },
  {
    id: 'data-retention',
    title: 'Data Retention',
    icon: Clock,
    content: [
      {
        type: 'paragraph',
        text: 'We retain your data only for as long as necessary to provide the Services, fulfill legal obligations, resolve disputes, and enforce our agreements. Below are our retention periods for different data categories.',
      },
      {
        type: 'table',
        headers: ['Data Category', 'Retention Period'],
        rows: [
          ['Account & organization data', 'Retained for the duration of your active account. Deleted upon account termination and completion of any mandatory retention period.'],
          ['Messages & conversation history', 'Retained for the duration of your active account to provide conversation history and analytics. Users can delete individual conversations.'],
          ['Contact & CRM data', 'Retained until deleted by the User or upon account termination.'],
          ['Campaign & broadcast data', 'Retained for the duration of your active account for analytics and audit purposes.'],
          ['Flow execution logs', 'Retained for debugging and analytics. Older logs may be automatically pruned.'],
          ['AI conversation context', 'Sent to AI providers in real-time for response generation. Not permanently stored by the AI provider (per OpenAI\'s API data usage policy).'],
          ['Payment & billing records', 'Retained for a minimum of 7 years in compliance with Indian financial record-keeping requirements (Income Tax Act, GST Act).'],
          ['Activity & audit logs', 'Retained for up to 2 years for security and compliance purposes.'],
          ['Webhook & API logs', 'Retained for up to 90 days for debugging and monitoring. Debug logs may be purged more frequently.'],
          ['Backups', 'Supabase automated backups are retained per their infrastructure retention policies (typically 7–30 days for point-in-time recovery).'],
          ['Deleted accounts', 'Upon account deletion, we initiate data purge within 30 days. Certain data may be retained longer if required by law or for fraud prevention.'],
          ['BullMQ job data (Redis)', 'Completed jobs removed after 24 hours. Failed jobs retained for up to 7 days for troubleshooting.'],
        ],
      },
    ],
  },
  {
    id: 'international-transfers',
    title: 'International Data Transfers',
    icon: Globe,
    content: [
      {
        type: 'paragraph',
        text: 'Our cloud infrastructure providers may process and store data in data centers located outside your country of residence. When data is transferred internationally, we ensure appropriate safeguards are in place:',
      },
      {
        type: 'list',
        items: [
          { label: 'Supabase', text: 'Database and authentication services may be hosted in data centers in the United States or other regions, subject to Supabase\'s data processing agreements and security certifications.' },
          { label: 'Meta (WhatsApp Cloud API)', text: 'Message processing occurs on Meta\'s global infrastructure in accordance with Meta\'s Data Processing Terms.' },
          { label: 'OpenAI', text: 'AI API processing occurs on OpenAI\'s infrastructure in the United States, subject to OpenAI\'s data processing addendum.' },
          { label: 'Razorpay', text: 'Payment processing is primarily handled within India, compliant with RBI regulations.' },
          { label: 'Vercel', text: 'Frontend hosting may use global CDN edge locations for performance optimization.' },
        ],
      },
      {
        type: 'paragraph',
        text: 'Where required by GDPR, we rely on Standard Contractual Clauses (SCCs) or other approved transfer mechanisms to ensure adequate protection for data transfers outside the European Economic Area (EEA). For transfers involving Indian personal data, we comply with the cross-border data transfer provisions of the DPDP Act.',
      },
    ],
  },
  {
    id: 'user-rights',
    title: 'Your Rights',
    icon: Users,
    content: [
      {
        type: 'paragraph',
        text: 'Depending on your location and applicable laws, you have the following rights regarding your Personal Data:',
      },
      {
        type: 'list',
        items: [
          { label: 'Right of Access', text: 'You can request a copy of the Personal Data we hold about you. Within the Platform, you can access your account information, contacts, conversations, and campaign data at any time.' },
          { label: 'Right to Correction', text: 'You can request correction of inaccurate or incomplete Personal Data. You can update your profile, organization details, and contact records directly within the Platform.' },
          { label: 'Right to Deletion / Erasure', text: 'You can request deletion of your Personal Data, subject to legal retention requirements. You can delete contacts, conversations, campaigns, and flows directly within the Platform. For full account deletion, please contact us.' },
          { label: 'Right to Data Portability', text: 'You can request your data in a structured, commonly used, and machine-readable format. Contact export (CSV/Excel) is available directly within the Platform.' },
          { label: 'Right to Restrict Processing', text: 'You can request that we restrict processing of your Personal Data in certain circumstances, such as when you contest the accuracy of the data.' },
          { label: 'Right to Object', text: 'You can object to processing of your Personal Data based on legitimate interests. We will cease processing unless we demonstrate compelling legitimate grounds.' },
          { label: 'Right to Withdraw Consent', text: 'Where processing is based on consent, you can withdraw consent at any time. You can disconnect your WhatsApp Business Account, disable AI bot agents, or revoke cookie consent without affecting prior lawful processing.' },
          { label: 'Right to Lodge a Complaint', text: 'You have the right to lodge a complaint with your local data protection authority. In India, you may contact the Data Protection Board of India established under the DPDP Act.' },
        ],
      },
      {
        type: 'paragraph',
        text: `To exercise any of these rights, please contact us at ${PRIVACY_EMAIL} or ${SUPPORT_EMAIL}. We will respond to your request within 30 days, or as required by applicable law.`,
      },
    ],
  },
  {
    id: 'account-deletion',
    title: 'Account Deletion & Data Purge',
    icon: Trash2,
    content: [
      {
        type: 'paragraph',
        text: 'You can request deletion of your account and associated data at any time:',
      },
      {
        type: 'list',
        items: [
          { label: 'WhatsApp Disconnection', text: 'You can disconnect your Meta WhatsApp Business Account at any time from the WhatsApp Connect page. This immediately removes your encrypted API access tokens from our servers and revokes our access to your WABA.' },
          { label: 'Data Deletion', text: 'You can delete contacts, conversations, campaigns, flow builders, and bot agents from within the Platform interface.' },
          { label: 'Full Account Deletion', text: `To request complete deletion of your organization account and all associated data, email us at ${SUPPORT_EMAIL}. We will process your request within 30 days.` },
          { label: 'Post-Deletion Retention', text: 'After account deletion, certain data may be retained in encrypted backups for up to 30 additional days before being permanently purged. Payment and billing records are retained as required by law.' },
        ],
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payment Information',
    icon: CreditCard,
    content: [
      {
        type: 'paragraph',
        text: 'Our Platform uses Razorpay as the exclusive payment gateway for processing subscription payments.',
      },
      {
        type: 'list',
        items: [
          { label: 'Payment Processing', text: 'All payment card processing is handled entirely by Razorpay. We never receive, store, or have access to your full card number, CVV, or banking credentials.' },
          { label: 'What We Store', text: 'We store payment transaction references (Razorpay payment link IDs), payment status, amount (in paise), subscription plan details, billing cycle, and timestamps.' },
          { label: 'Invoices & Tax Records', text: 'Invoice and payment records are retained for a minimum of 7 years in compliance with Indian tax laws (Income Tax Act, GST Act).' },
          { label: 'Refunds', text: 'Refund requests are processed through Razorpay in accordance with our refund policy. Refund transaction records are retained for audit purposes.' },
          { label: 'Subscription History', text: 'Your subscription plan history, including upgrades, downgrades, and renewal dates, is maintained for billing and support purposes.' },
          { label: 'PCI Compliance', text: 'Razorpay is PCI DSS Level 1 compliant, ensuring the highest standard of payment data security.' },
        ],
      },
    ],
  },
  {
    id: 'children',
    title: 'Children\'s Privacy',
    icon: Baby,
    content: [
      {
        type: 'paragraph',
        text: `The Services are intended for use by businesses and individuals who are at least 18 years of age (or the age of majority in their jurisdiction). ${COMPANY_NAME} does not knowingly collect Personal Data from children under 18 years of age.`,
      },
      {
        type: 'paragraph',
        text: 'If we become aware that we have inadvertently collected Personal Data from a child under 18, we will take immediate steps to delete such data from our systems. If you believe that a child has provided us with Personal Data, please contact us immediately.',
      },
    ],
  },
  {
    id: 'automated-decisions',
    title: 'Automated Decision-Making',
    icon: Workflow,
    content: [
      {
        type: 'paragraph',
        text: 'Our Platform uses automated processing in the following contexts:',
      },
      {
        type: 'list',
        items: [
          { label: 'Flow Builder Automations', text: 'Automated message sequences and decision branches configured by the User. These are rule-based automations defined entirely by the User and do not involve profiling.' },
          { label: 'AI Bot Agent Responses', text: 'AI-generated replies based on the User\'s configured system prompts and knowledge base. End-customers can always request human agent handoff.' },
          { label: 'Broadcast Delivery', text: 'Automated delivery of campaign messages to contact lists at scheduled times, as configured by the User.' },
          { label: 'Subscription Enforcement', text: 'Automated checks that verify subscription status and plan limits. These are based on objective criteria (plan tier, expiration date) and do not involve profiling.' },
        ],
      },
      {
        type: 'paragraph',
        text: 'None of our automated processing produces legal effects or similarly significant effects on individuals without human oversight. Users remain in control of all automation configurations and can disable them at any time.',
      },
    ],
  },
  {
    id: 'policy-changes',
    title: 'Changes to This Policy',
    icon: FileText,
    content: [
      {
        type: 'paragraph',
        text: 'We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or business operations. When we make material changes:',
      },
      {
        type: 'list',
        items: [
          { label: 'Notification', text: 'We will notify you via email, in-app notification, or a prominent notice on our Platform at least 15 days before the changes take effect.' },
          { label: 'Last Updated Date', text: 'The "Last Updated" date at the top of this Policy will be revised to reflect the date of the latest version.' },
          { label: 'Review', text: 'We encourage you to review this Privacy Policy periodically to stay informed about how we protect your data.' },
          { label: 'Continued Use', text: 'Your continued use of the Services after the effective date of any changes constitutes your acceptance of the updated Privacy Policy.' },
        ],
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact Information',
    icon: Mail,
    content: [
      {
        type: 'paragraph',
        text: 'If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us using the information below:',
      },
      {
        type: 'contact-card',
        entries: [
          { label: 'Company', value: COMPANY_NAME },
          { label: 'Product', value: PRODUCT_NAME },
          { label: 'Privacy Inquiries', value: PRIVACY_EMAIL, isEmail: true },
          { label: 'General Support', value: SUPPORT_EMAIL, isEmail: true },
          { label: 'Website', value: `https://${DOMAIN}`, isLink: true },
        ],
      },
      {
        type: 'subsection',
        title: '20.1 Grievance Officer (DPDP Act, India)',
        items: [
          `In accordance with the Digital Personal Data Protection Act, 2023, the Grievance Officer for the purposes of this policy can be reached at ${PRIVACY_EMAIL}.`,
          'The Grievance Officer shall acknowledge your grievance within 48 hours and resolve it within 30 days of receipt.',
        ],
      },
      {
        type: 'subsection',
        title: '20.2 Data Protection Representative (GDPR)',
        items: [
          `For inquiries from data subjects in the European Economic Area (EEA) or United Kingdom, please contact us at ${PRIVACY_EMAIL} with "GDPR Request" in the subject line.`,
          'We will respond to all verifiable data subject requests within 30 days.',
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function highlightText(text, query) {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="pp-search-highlight">{part}</mark>
      : part
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function CopyLinkButton({ sectionId }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#${sectionId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [sectionId]);

  return (
    <button
      onClick={handleCopy}
      className="pp-copy-link"
      title="Copy link to this section"
      aria-label="Copy section link"
    >
      {copied ? <Check className="pp-icon-xs" /> : <Copy className="pp-icon-xs" />}
    </button>
  );
}

function SectionContent({ content, searchQuery }) {
  return content.map((block, idx) => {
    switch (block.type) {
      case 'paragraph':
        return (
          <p key={idx} className="pp-paragraph">
            {highlightText(block.text, searchQuery)}
          </p>
        );

      case 'list':
        return (
          <ul key={idx} className="pp-def-list">
            {block.items.map((item, i) => (
              <li key={i} className="pp-def-item">
                <strong className="pp-def-label">{highlightText(item.label)}</strong>
                <span className="pp-def-separator">—</span>
                <span className="pp-def-text">{highlightText(item.text, searchQuery)}</span>
              </li>
            ))}
          </ul>
        );

      case 'subsection':
        const subId = slugify(block.title);
        return (
          <div key={idx} id={subId} className="pp-subsection">
            <div className="pp-subsection-header">
              <h4 className="pp-subsection-title">{highlightText(block.title, searchQuery)}</h4>
              <CopyLinkButton sectionId={subId} />
            </div>
            <ul className="pp-bullet-list">
              {block.items.map((item, i) => (
                <li key={i} className="pp-bullet-item">
                  {highlightText(item, searchQuery)}
                </li>
              ))}
            </ul>
          </div>
        );

      case 'table':
        return (
          <div key={idx} className="pp-table-wrapper">
            <table className="pp-table">
              <thead>
                <tr>
                  {block.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{highlightText(cell, searchQuery)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'callout':
        return (
          <div key={idx} className={`pp-callout pp-callout-${block.variant || 'info'}`}>
            <p>{highlightText(block.text, searchQuery)}</p>
          </div>
        );

      case 'contact-card':
        return (
          <div key={idx} className="pp-contact-card">
            {block.entries.map((entry, i) => (
              <div key={i} className="pp-contact-row">
                <span className="pp-contact-label">{entry.label}</span>
                {entry.isEmail ? (
                  <a href={`mailto:${entry.value}`} className="pp-contact-link">{entry.value}</a>
                ) : entry.isLink ? (
                  <a href={entry.value} target="_blank" rel="noopener noreferrer" className="pp-contact-link">
                    {entry.value} <ExternalLink className="pp-icon-xs inline-ml" />
                  </a>
                ) : (
                  <span className="pp-contact-value">{entry.value}</span>
                )}
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PrivacyPolicy() {
  const [activeSection, setActiveSection] = useState(POLICY_SECTIONS[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const contentRef = useRef(null);
  const sectionRefs = useRef({});

  // Set page meta tags for SEO/Meta crawler
  useEffect(() => {
    document.title = "GetAiPilot Privacy Policy";
    
    const setMetaTag = (property, content) => {
      let element = document.querySelector(`meta[property="${property}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute('property', property);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMetaTag('og:title', 'GetAiPilot Privacy Policy');
    setMetaTag('og:description', 'Privacy Policy for GetAiPilot (GAP FlowPilot) WhatsApp Automation Workspace.');
    setMetaTag('og:image', 'https://wb.getaipilot.in/logo.png');
    setMetaTag('og:url', 'https://wb.getaipilot.in/privacy-policy');
    setMetaTag('og:type', 'website');
  }, []);



  // Intersection Observer for active section highlighting
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { root: contentRef.current, rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    );

    POLICY_SECTIONS.forEach((section) => {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Scroll listener for back-to-top button
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleScroll = () => {
      setShowBackToTop(container.scrollTop > 600);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = useCallback((id) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileTocOpen(false);
    }
  }, []);

  const scrollToTop = useCallback(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);



  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Search filtering
  const filteredSections = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return POLICY_SECTIONS;
    const q = searchQuery.toLowerCase();
    return POLICY_SECTIONS.filter((section) => {
      if (section.title.toLowerCase().includes(q)) return true;
      return section.content.some((block) => {
        if (block.text && block.text.toLowerCase().includes(q)) return true;
        if (block.items) {
          return block.items.some((item) => {
            if (typeof item === 'string') return item.toLowerCase().includes(q);
            return (item.label?.toLowerCase().includes(q)) || (item.text?.toLowerCase().includes(q));
          });
        }
        if (block.rows) {
          return block.rows.some((row) => row.some((cell) => cell.toLowerCase().includes(q)));
        }
        if (block.title && block.title.toLowerCase().includes(q)) return true;
        if (block.entries) {
          return block.entries.some((e) => e.value?.toLowerCase().includes(q) || e.label?.toLowerCase().includes(q));
        }
        return false;
      });
    });
  }, [searchQuery]);

  const matchCount = searchQuery.length >= 2 ? filteredSections.length : 0;

  return (
    <div className="pp-root">
      <style>{PRIVACY_POLICY_STYLES}</style>

      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <header className="pp-topbar">
        <div className="pp-topbar-inner">
          <div className="pp-topbar-left">
            <Link to="/login" className="pp-back-link">
              <ArrowLeft className="pp-icon-sm" />
              <span className="pp-back-text">Back</span>
            </Link>
            <div className="pp-topbar-divider" />
            <div className="pp-topbar-brand">
              <Shield className="pp-icon-brand" />
              <span className="pp-brand-text">Privacy Policy</span>
            </div>
          </div>
          <div className="pp-topbar-actions">
            {/* Search toggle */}
            <button
              onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}
              className={`pp-action-btn ${searchOpen ? 'pp-action-btn-active' : ''}`}
              title="Search policy"
            >
              {searchOpen ? <X className="pp-icon-sm" /> : <Search className="pp-icon-sm" />}
            </button>
            {/* Print */}
            <button onClick={handlePrint} className="pp-action-btn pp-hide-mobile" title="Print policy">
              <Printer className="pp-icon-sm" />
            </button>
            {/* Mobile TOC toggle */}
            <button
              onClick={() => setMobileTocOpen(!mobileTocOpen)}
              className="pp-action-btn pp-show-mobile"
              title="Table of contents"
            >
              <Menu className="pp-icon-sm" />
            </button>
          </div>
        </div>
        {/* Search bar */}
        {searchOpen && (
          <div className="pp-searchbar">
            <Search className="pp-icon-sm pp-search-icon" />
            <input
              type="text"
              placeholder="Search privacy policy…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pp-search-input"
              autoFocus
            />
            {searchQuery && (
              <span className="pp-search-count">
                {matchCount} section{matchCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
        {/* Mobile TOC dropdown */}
        {mobileTocOpen && (
          <nav className="pp-mobile-toc">
            {POLICY_SECTIONS.map((section, idx) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`pp-mobile-toc-item ${activeSection === section.id ? 'pp-mobile-toc-active' : ''}`}
              >
                <span className="pp-toc-num">{idx + 1}.</span>
                {section.title}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ── Main Layout ─────────────────────────────────────────────── */}
      <div className="pp-layout">
        {/* Sidebar TOC */}
        <aside className="pp-sidebar">
          <div className="pp-sidebar-inner">
            <p className="pp-sidebar-label">Table of Contents</p>
            <nav className="pp-sidebar-nav">
              {POLICY_SECTIONS.map((section, idx) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`pp-toc-item ${isActive ? 'pp-toc-active' : ''}`}
                  >
                    <Icon className="pp-toc-icon" />
                    <span className="pp-toc-num">{idx + 1}.</span>
                    <span className="pp-toc-label">{section.title}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="pp-content" ref={contentRef}>
          {/* Hero */}
          <div className="pp-hero">
            <div className="pp-hero-inner">
              <div className="pp-hero-badge">
                <Shield className="pp-icon-lg" />
              </div>
              <h1 className="pp-hero-title">Privacy Policy</h1>
              <p className="pp-hero-subtitle">
                {COMPANY_NAME} — {PRODUCT_NAME}
              </p>
              <div className="pp-hero-meta">
                <span className="pp-meta-item">
                  <Clock className="pp-icon-xs" />
                  Last Updated: {LAST_UPDATED}
                </span>

              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="pp-sections">
            {filteredSections.map((section, idx) => {
              const Icon = section.icon;
              const sectionNumber = POLICY_SECTIONS.indexOf(section) + 1;
              return (
                <section
                  key={section.id}
                  id={section.id}
                  ref={(el) => { sectionRefs.current[section.id] = el; }}
                  className="pp-section"
                >
                  <div className="pp-section-header">
                    <div className="pp-section-title-row">
                      <span className="pp-section-number">{sectionNumber}</span>
                      <Icon className="pp-section-icon" />
                      <h2 className="pp-section-title">{highlightText(section.title, searchQuery)}</h2>
                    </div>
                    <CopyLinkButton sectionId={section.id} />
                  </div>
                  <div className="pp-section-body">
                    <SectionContent content={section.content} searchQuery={searchQuery} />
                  </div>
                </section>
              );
            })}

            {filteredSections.length === 0 && searchQuery && (
              <div className="pp-no-results">
                <Search className="pp-icon-lg pp-no-results-icon" />
                <p>No sections match "{searchQuery}"</p>
                <button onClick={() => setSearchQuery('')} className="pp-clear-search">
                  Clear search
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="pp-footer">
            <div className="pp-footer-inner">
              <p className="pp-footer-copyright">© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
              <p className="pp-footer-contact">
                Questions? Contact us at{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="pp-footer-link">{SUPPORT_EMAIL}</a>
              </p>
              <p className="pp-footer-legal">
                This privacy policy is effective as of {EFFECTIVE_DATE} and was last updated on {LAST_UPDATED}.
              </p>
            </div>
          </footer>
        </main>
      </div>

      {/* Back to top */}
      {showBackToTop && (
        <button onClick={scrollToTop} className="pp-back-to-top" title="Back to top">
          <ChevronUp className="pp-icon-sm" />
        </button>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const PRIVACY_POLICY_STYLES = `
/* ── Reset & Root ────────────────────────────────────────────── */
.pp-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #f8f9fb;
  color: #1a1a2e;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  z-index: 9999;
}
/* ── Top Bar ─────────────────────────────────────────────────── */
.pp-topbar {
  flex-shrink: 0;
  background: #ffffff;
  border-bottom: 1px solid #e8edf3;
  z-index: 20;
}
.pp-topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  max-width: 100%;
}
.pp-topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pp-back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #666;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: color 0.15s;
}
.pp-back-link:hover { color: #1a1a2e; }
.pp-topbar-divider {
  width: 1px;
  height: 20px;
  background: #e8edf3;
}
.pp-topbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pp-icon-brand { width: 18px; height: 18px; color: #6366f1; }
.pp-brand-text { font-size: 14px; font-weight: 600; color: #1a1a2e; }
.pp-topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pp-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}
.pp-action-btn:hover { background: #f0f2f5; color: #1a1a2e; }
.pp-action-btn-active { background: #eef2ff; color: #6366f1; }

/* ── Search Bar ──────────────────────────────────────────────── */
.pp-searchbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px 10px;
  border-top: 1px solid #e8edf3;
}
.pp-search-icon { color: #999; flex-shrink: 0; }
.pp-search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  background: transparent;
  color: #1a1a2e;
  font-family: inherit;
}
.pp-search-input::placeholder { color: #aaa; }
.pp-search-count { font-size: 12px; color: #999; white-space: nowrap; }
.pp-search-highlight {
  background: rgba(99,102,241,0.15);
  color: #4338ca;
  border-radius: 2px;
  padding: 1px 2px;
}

/* ── Mobile TOC ──────────────────────────────────────────────── */
.pp-mobile-toc {
  display: none;
  flex-direction: column;
  max-height: 60vh;
  overflow-y: auto;
  border-top: 1px solid #e8edf3;
  background: #fff;
  padding: 4px 0;
}
.pp-mobile-toc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  border-bottom: 1px solid #f0f2f5;
  font-family: inherit;
  transition: all 0.15s;
}
.pp-mobile-toc-item:hover { background: #f8f9fb; color: #1a1a2e; }
.pp-mobile-toc-active { background: #eef2ff !important; color: #6366f1 !important; font-weight: 600; }

/* ── Layout ──────────────────────────────────────────────────── */
.pp-layout {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────────── */
.pp-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: #ffffff;
  border-right: 1px solid #e8edf3;
  overflow-y: auto;
  scrollbar-width: thin;
}
.pp-sidebar-inner { padding: 20px 0; }
.pp-sidebar-label {
  padding: 0 20px 12px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #999;
}
.pp-sidebar-nav { display: flex; flex-direction: column; gap: 1px; }
.pp-toc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  line-height: 1.4;
}
.pp-toc-item:hover { background: #f5f6fa; color: #1a1a2e; }
.pp-toc-icon { width: 14px; height: 14px; flex-shrink: 0; color: #bbb; }
.pp-toc-num { font-size: 11px; color: #aaa; font-weight: 600; min-width: 18px; }
.pp-toc-label { flex: 1; }
.pp-toc-active {
  background: #e0e7ff !important;
  color: #3730a3 !important;
  border-left: 5px solid #4f46e5 !important;
  font-weight: 700;
}
.pp-toc-active .pp-toc-icon { color: #4f46e5; }
.pp-toc-active .pp-toc-num { color: #4f46e5; }

/* ── Content ─────────────────────────────────────────────────── */
.pp-content {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  scrollbar-width: thin;
}

/* ── Hero ─────────────────────────────────────────────────────── */
.pp-hero {
  background: linear-gradient(135deg, #f0f2ff 0%, #f8f9fb 50%, #f0f8ff 100%);
  border-bottom: 1px solid #e8edf3;
  padding: 48px 40px;
}
.pp-hero-inner {
  max-width: 780px;
  margin: 0 auto;
}
.pp-hero-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: rgba(99,102,241,0.08);
  border-radius: 16px;
  margin-bottom: 20px;
}
.pp-hero-badge svg { width: 28px; height: 28px; color: #6366f1; }
.pp-hero-title {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #1a1a2e;
  margin: 0 0 6px;
}
.pp-hero-subtitle {
  font-size: 16px;
  color: #666;
  margin: 0 0 16px;
}
.pp-hero-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pp-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: #888;
}
.pp-meta-divider { color: #ccc; font-size: 13px; }

/* ── Sections ────────────────────────────────────────────────── */
.pp-sections {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 40px 60px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.pp-section {
  background: #ffffff;
  border: 1px solid #e8edf3;
  border-radius: 14px;
  overflow: hidden;
  scroll-margin-top: 16px;
  transition: box-shadow 0.2s;
}
.pp-section:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
.pp-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f0f2f5;
}
.pp-section-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pp-section-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #eef2ff;
  color: #6366f1;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.pp-section-icon { width: 18px; height: 18px; color: #6366f1; flex-shrink: 0; }
.pp-section-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
  color: #1a1a2e;
  letter-spacing: -0.2px;
}
.pp-copy-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: #bbb;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.pp-copy-link:hover { background: #f0f2f5; color: #6366f1; }
.pp-section-body { padding: 20px 24px 24px; }

/* ── Text Content ────────────────────────────────────────────── */
.pp-paragraph {
  margin: 0 0 14px;
  color: #444;
  font-size: 14.5px;
  line-height: 1.75;
}
.pp-paragraph:last-child { margin-bottom: 0; }

/* ── Definition Lists ────────────────────────────────────────── */
.pp-def-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pp-def-item {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 14.5px;
  line-height: 1.7;
}
.pp-def-label { color: #1a1a2e; font-weight: 600; }
.pp-def-separator { color: #ccc; }
.pp-def-text { color: #555; }

/* ── Subsections ─────────────────────────────────────────────── */
.pp-subsection {
  margin: 20px 0;
  scroll-margin-top: 80px;
}
.pp-subsection:first-child { margin-top: 0; }
.pp-subsection-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.pp-subsection-title {
  font-size: 14px;
  font-weight: 700;
  color: #333;
  margin: 0;
  letter-spacing: -0.1px;
}
.pp-subsection-header .pp-copy-link {
  opacity: 0;
  width: 24px;
  height: 24px;
  transition: opacity 0.2s, background 0.15s;
}
.pp-subsection-header:hover .pp-copy-link {
  opacity: 1;
}
.pp-bullet-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pp-bullet-item {
  position: relative;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.7;
  color: #555;
}
.pp-bullet-item::before {
  content: "›";
  position: absolute;
  left: 0;
  top: 0;
  color: #6366f1;
  font-weight: 700;
  font-size: 15px;
}

/* ── Tables ──────────────────────────────────────────────────── */
.pp-table-wrapper {
  overflow-x: auto;
  margin: 8px 0;
  border-radius: 10px;
  border: 1px solid #e8edf3;
}
.pp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.pp-table th {
  text-align: left;
  padding: 10px 14px;
  background: #f5f6fa;
  font-weight: 700;
  color: #333;
  border-bottom: 1px solid #e8edf3;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.pp-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f2f5;
  color: #555;
  vertical-align: top;
  line-height: 1.6;
}
.pp-table tr:last-child td { border-bottom: none; }
.pp-table tr:hover td { background: #fafbfc; }

/* ── Callouts ────────────────────────────────────────────────── */
.pp-callout {
  border-radius: 10px;
  padding: 16px 20px;
  margin: 8px 0;
  border-left: 4px solid;
}
.pp-callout p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: #444;
}
.pp-callout-info {
  background: #eef2ff;
  border-left-color: #6366f1;
}
.pp-callout-important {
  background: #fffbeb;
  border-left-color: #f59e0b;
}

/* ── Contact Card ────────────────────────────────────────────── */
.pp-contact-card {
  background: #f5f6fa;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  padding: 20px;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pp-contact-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.pp-contact-label {
  min-width: 130px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #999;
  flex-shrink: 0;
}
.pp-contact-value { font-size: 14px; color: #333; }
.pp-contact-link {
  font-size: 14px;
  color: #6366f1;
  text-decoration: none;
  transition: color 0.15s;
}
.pp-contact-link:hover { color: #4338ca; text-decoration: underline; }
.inline-ml { margin-left: 3px; display: inline; vertical-align: -2px; }

/* ── No Results ──────────────────────────────────────────────── */
.pp-no-results {
  text-align: center;
  padding: 80px 20px;
}
.pp-no-results-icon { color: #ddd; width: 40px; height: 40px; margin: 0 auto 16px; }
.pp-no-results p { color: #888; font-size: 15px; margin-bottom: 16px; }
.pp-clear-search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #e8edf3;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  color: #6366f1;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.pp-clear-search:hover { background: #eef2ff; }

/* ── Footer ──────────────────────────────────────────────────── */
.pp-footer {
  border-top: 1px solid #e8edf3;
  padding: 32px 40px;
  margin-top: 8px;
}
.pp-footer-inner {
  max-width: 780px;
  margin: 0 auto;
  text-align: center;
}
.pp-footer-copyright { font-size: 13px; color: #999; margin: 0 0 4px; }
.pp-footer-contact { font-size: 13px; color: #888; margin: 0 0 4px; }
.pp-footer-link { color: #6366f1; text-decoration: none; }
.pp-footer-link:hover { text-decoration: underline; }
.pp-footer-legal { font-size: 12px; color: #bbb; margin: 8px 0 0; }

/* ── Back to Top ─────────────────────────────────────────────── */
.pp-back-to-top {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  cursor: pointer;
  color: #6366f1;
  z-index: 30;
  transition: all 0.2s;
  animation: ppFadeIn 0.2s ease;
}
.pp-back-to-top:hover { background: #eef2ff; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.1); }

/* ── Icons ────────────────────────────────────────────────────── */
.pp-icon-xs { width: 14px; height: 14px; }
.pp-icon-sm { width: 16px; height: 16px; }
.pp-icon-lg { width: 24px; height: 24px; }

/* ── Utilities ────────────────────────────────────────────────── */
.pp-hide-mobile { display: inline-flex; }
.pp-show-mobile { display: none; }
.pp-back-text { }

/* ── Animations ──────────────────────────────────────────────── */
@keyframes ppFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Responsive ──────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .pp-sidebar { width: 240px; }
}

@media (max-width: 768px) {
  .pp-sidebar { display: none; }
  .pp-show-mobile { display: inline-flex; }
  .pp-hide-mobile { display: none; }
  .pp-mobile-toc { display: flex; }
  .pp-hero { padding: 32px 20px; }
  .pp-hero-title { font-size: 24px; }
  .pp-hero-badge { width: 44px; height: 44px; border-radius: 12px; }
  .pp-hero-badge svg { width: 22px; height: 22px; }
  .pp-sections { padding: 20px 16px 60px; }
  .pp-section-header { padding: 16px 18px; }
  .pp-section-body { padding: 16px 18px 20px; }
  .pp-section-title { font-size: 15px; }
  .pp-footer { padding: 24px 20px; }
  .pp-contact-row { flex-direction: column; gap: 2px; }
  .pp-contact-label { min-width: unset; }
  .pp-table { font-size: 12.5px; }
  .pp-table th, .pp-table td { padding: 8px 10px; }
  .pp-back-text { display: none; }
}

@media (max-width: 480px) {
  .pp-hero-meta { flex-direction: column; gap: 4px; }
  .pp-meta-divider { display: none; }
}

/* ── Print ────────────────────────────────────────────────────── */
@media print {
  .pp-root {
    position: static;
    overflow: visible;
    background: #fff !important;
    color: #000 !important;
  }
  .pp-topbar,
  .pp-sidebar,
  .pp-back-to-top,
  .pp-copy-link,
  .pp-mobile-toc { display: none !important; }
  .pp-layout { display: block; }
  .pp-content { overflow: visible; }
  .pp-section {
    break-inside: avoid;
    border: 1px solid #ddd;
    box-shadow: none !important;
    page-break-inside: avoid;
  }
  .pp-hero {
    background: none !important;
    border-bottom: 2px solid #333;
  }
  .pp-hero-title { color: #000 !important; }
  .pp-hero-badge { background: #eee !important; }
  .pp-hero-badge svg { color: #333 !important; }
  .pp-sections { max-width: 100%; padding: 20px 0; }
  a { color: #333 !important; text-decoration: underline; }
}
`;
