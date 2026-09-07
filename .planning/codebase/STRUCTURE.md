# Codebase Structure

## 1. Directory Tree Map

```
GAP_WHATSAPP/
├── .planning/                     # GSD planning directory
│   └── codebase/                  # Codebase architecture & reference maps
├── SQL files/                     # Raw SQL schemas, seed data, and reference migrations
│   ├── WHATSAPP_TABLE_STRUCTURE.md# DB schema documentation
│   ├── combined_schema.sql        # Full consolidated database schema
│   ├── seed_pricing_plans_whatsapp.sql # Seed script for pricing tiers
│   └── *.sql                      # Specialized SQL migration scripts
├── backend/                       # Node.js + TypeScript Backend Service
│   ├── server.ts                  # Server entry point (HTTP + Socket.io + Cron + Baileys)
│   ├── src/
│   │   ├── app.ts                 # Express application, CORS, route registry
│   │   ├── cron.ts                # Scheduled jobs (Health sync, legacy broadcast)
│   │   ├── socket.ts              # Socket.io server instance and initialization
│   │   ├── config/                # Environment, Supabase, Redis, Queue configs
│   │   ├── controllers/           # HTTP Request handlers and business orchestration
│   │   ├── middlewares/           # Auth, role-checking, and maintenance middlewares
│   │   ├── migrations/            # Backend migration SQL files
│   │   ├── routes/                # Express router definitions
│   │   ├── services/              # Core business logic, protocol handlers, third-party APIs
│   │   ├── types/                 # TypeScript declaration files
│   │   ├── utils/                 # Formatting, cryptography, template builders
│   │   └── workers/               # BullMQ background workers (broadcast.worker.ts)
│   ├── scripts/                   # Utility scripts (e.g. kill-port.mjs)
│   ├── package.json               # Backend dependencies and scripts
│   └── tsconfig.json              # TypeScript compiler configuration
├── frontend/                      # React 19 + Vite Frontend Client
│   ├── index.html                 # HTML entry point
│   ├── vite.config.js             # Vite configuration with PWA and React plugins
│   ├── tailwind.config.js         # Tailwind styling tokens and theme extensions
│   ├── src/
│   │   ├── main.jsx               # React DOM root render
│   │   ├── App.jsx                # Root router, query client, context provider tree
│   │   ├── index.css              # Global styles, Tailwind imports, custom utilities
│   │   ├── supabaseClient.js      # Supabase JS client configuration
│   │   ├── sw.js                  # PWA Service worker
│   │   ├── components/            # Reusable UI components
│   │   │   ├── flow-builder/      # ReactFlow visual node builder & custom nodes
│   │   │   ├── insights/          # Recharts visualization cards and tooltip components
│   │   │   ├── Layout.jsx         # App shell (Header, Sidebar, Navigation)
│   │   │   ├── Sidebar.jsx        # Responsive navigation sidebar
│   │   │   └── WhatsAppLogin.jsx  # QR code scanner UI component
│   │   ├── context/               # React Context Providers (Auth, Account, Push, PWA)
│   │   ├── data/                  # Static metadata (Meta languages, template presets)
│   │   ├── hooks/                 # Custom React hooks (e.g. useNotificationSound)
│   │   ├── onboarding/            # Driver.js interactive tour steps and registry
│   │   ├── pages/                 # Route views (Dashboard, LiveChat, FlowBuilder, etc.)
│   │   ├── services/              # Client API call helpers and SDK loaders
│   │   └── utils/                 # Client utilities (formatting, messaging limits, reviews)
│   └── public/                    # Static assets, PWA icons, sound effects
├── supabase/                      # Supabase CLI and Serverless Functions
│   ├── config.toml                # Supabase local/production configuration
│   ├── functions/                 # Deno-based Edge Functions (Razorpay payment & wallet)
│   └── migrations/                # Versioned SQL migrations (20260520 to 20260713)
├── BROADCAST_SCALING.md           # Production broadcast deployment guide
├── LIVE_READINESS_CHANGES.md      # Summary of client-onboarding fixes and live stability
├── README.md                      # Project introduction
└── test-contacts-upload.csv       # Test CSV for bulk contact imports
```

---

## 2. Backend Component Breakdown

### Controllers (`backend/src/controllers/`)
- `agents.controller.ts`: Bot agent CRUD, instructions, prompt templates.
- `appointments.controller.ts`: Appointment scheduling and Google Calendar sync.
- `billing.controller.ts`: Plan status, wallet balance, transaction ledger, limits.
- `broadcast.controller.ts`: Campaign creation, audience filtering, CSV upload, queue dispatch.
- `contacts.controller.ts`: Contact listing, search, profile photo resolution, custom names.
- `conversations.controller.ts`: Chat thread retrieval, cursor pagination, assignment, closing.
- `dashboard.controller.ts`: Analytics aggregation (messages sent/received, delivery rate, active chats).
- `flows.controller.ts`: Visual flow CRUD, draft saving, validation, publishing, session management.
- `googleAuth.controller.ts`: Google OAuth consent generation and callback token exchange.
- `messages.controller.ts`: Message sending (text/media), reaction handling, summaries, mark-as-read.
- `settings.controller.ts`: Organization settings, Knowledge Base upload/parse, OpenAI API keys.
- `team.controller.ts`: Team member invitations, role updates (`admin`/`agent`), agent online presence.
- `twilio.controller.ts`: Phone number inventory search and purchasing.
- `wa.controller.ts`: Meta embedded signup OAuth start & callback.
- `webhook.controller.ts`: Inbound Meta Webhook processor (`POST /webhook`), HMAC validation.
- `whatsapp.controller.ts`: WhatsApp account connection, WABA profiles, templates, diagnostics.

### Services (`backend/src/services/`)
- `accountHealth.service.ts`: Health diagnostics, token validation, WABA verification checks.
- `ai.service.ts`: Knowledge Base matching, prompt formatting, OpenAI completions, auto-handoff.
- `assignment.service.ts`: Auto-assignment rules (round-robin, manual, agent availability).
- `baileys.service.ts`: Baileys WhatsApp Web socket manager, QR generation, message listeners.
- `billing.service.ts`: Plan rank normalization, feature limits, wallet balance deductions.
- `broadcastQueue.service.ts`: BullMQ queue orchestrator, campaign preparation, window dispatcher.
- `broadcast.service.ts`: Legacy synchronous campaign dispatch engine.
- `contacts.service.ts`: Contact deduplication, phone normalization, custom field mapping.
- `ecosystemSync.service.ts`: Cross-service sync between GAP modules.
- `flows.service.ts`: Runtime flow execution engine, node evaluators, session state tracking.
- `googleCalendar.service.ts`: Google Calendar API integration, free/busy slot queries, event creation.
- `messages.sender.ts`: Multi-protocol message sender (Meta Cloud API vs Baileys).
- `messages.service.ts`: Message persistence, thread update helpers, read receipts.
- `meta.service.ts`: Meta Graph API client, backoff retry handler, template APIs.
- `n8n.service.ts`: Handoff webhook dispatcher to n8n workflow engine.
- `push.service.ts`: Web Push (VAPID) notification sender for active browser clients.
- `supermailbox.service.ts`: Transactional email dispatcher for alerts and notifications.

### Workers (`backend/src/workers/`)
- `broadcast.worker.ts`: Dedicated BullMQ worker processing `broadcast-prepare`, `broadcast-send`, and `broadcast-reconcile` queues.

---

## 3. Frontend Component Breakdown

### Core Pages (`frontend/src/pages/`)
| Page | Route | Description |
|---|---|---|
| `HomePage.jsx` | `/` | Marketing landing page |
| `Dashboard.jsx` | `/dashboard` | Metrics, recent chats, campaign stats |
| `LiveChat.jsx` | `/live-chat` | Multi-agent shared inbox, chat transcript, contact drawer |
| `FlowBuilder.jsx` | `/flow-builder` | ReactFlow visual chatbot editor |
| `Broadcast.jsx` | `/broadcast`, `/broadcast/history` | Campaign creator (CSV/tags), delivery stats |
| `Templates.jsx` | `/templates`, `/templates/industries` | Meta template manager & industry template library |
| `TemplateWizard.jsx` | `/templates/new` | Step-by-step Meta template creator with category advice |
| `Contacts.jsx` | `/contacts` | Contact CRM table with bulk import & tagging |
| `BotAgents.jsx` | `/bot-agents` | AI Bot personality & Knowledge Base configuration |
| `WhatsAppConnect.jsx` | `/whatsapp-connect` | QR Code scanner for Baileys connection |
| `WhatsAppNumberPage.jsx` | `/whatsapp-number` | Twilio number purchase & Meta WABA onboarding |
| `BillingPage.jsx` | `/billing` | Plan subscriptions, wallet recharges, invoices |
| `TeamMembers.jsx` | `/team-members` | Agent invites, roles, online presence tracking |
| `ScheduledMeetings.jsx` | `/scheduled-meetings` | Google Calendar synced appointment bookings |
| `Settings.jsx` | `/settings` | Org settings, OpenAI keys, Auto-assign rules |

### Flow Builder Nodes (`frontend/src/components/flow-builder/`)
- `StartBotFlowNode`: Keyword/trigger listener.
- `TextNode` / `EnhancedTextNode`: Outbound text response with variable interpolation.
- `ButtonNode` / `EnhancedButtonNode`: WhatsApp quick-reply buttons (up to 3).
- `UserInputNode`: Captures user reply into session memory.
- `EnhancedConditionNode`: Conditional branching based on variables or regex.
- `AINode`: Delegates turn to OpenAI Bot Agent.
- `AppointmentNode`: Shows available Google Calendar slots and books meetings.
- `HTTPAPINode`: Makes outbound HTTP webhook requests to external APIs.
- `GoogleSheetsNode`: Ingests/appends rows to Google Sheets.
- `MediaNode` / `EnhancedMediaNode`: Sends image/video/audio/document.
- `LocationNode`: Sends Google Maps coordinates.

---

## 4. Database Schema Structure (`SQL files/` & `supabase/migrations/`)

| Table Prefix / Name | Purpose |
|---|---|
| `organizations` | Tenant accounts, plan ID, settings, broadcast pause flags |
| `organization_members` | User-to-organization mapping with roles (`owner`, `admin`, `agent`) |
| `w_wa_accounts` | Connected WhatsApp numbers (Meta WABA or Baileys) |
| `w_contacts` | CRM contacts per organization, normalized phone keys |
| `w_conversations` | Chat threads, assignment, handoff status, unread counts |
| `w_messages` | Inbound/outbound message history, delivery statuses |
| `w_conversation_reads` | Per-agent read timestamps for unread badges |
| `w_conversation_notes` | Internal private agent notes |
| `w_conversation_summaries` | AI / n8n generated conversation summaries |
| `w_flows` | Visual Flow Builder drafts (nodes & edges JSON) |
| `w_flow_versions` | Immutable published flow versions for runtime execution |
| `w_flow_sessions` | Active customer flow sessions & variable state |
| `w_flow_runs` / `w_flow_run_steps` | Detailed execution traces and node logs |
| `w_campaigns` | Broadcast campaign records and aggregate counters |
| `w_campaign_recipients` | Recipient-level delivery queue and status tracking |
| `w_template_submissions` | Meta template audit trail and sync state |
| `whatsapp_subscription_plans` | Tier definitions (Starter, Growth, Pro, Enterprise) |
| `whatsapp_wallets` / `whatsapp_wallet_transactions` | Prepaid conversation credit balance and ledger |
| `push_subscriptions` | Browser Web Push VAPID endpoints |
| `google_integrations` | Encrypted Google OAuth tokens for calendar sync |
