# System Architecture

## 1. High-Level Architectural Overview

GAP WhatsApp is an enterprise WhatsApp CRM and automation platform built for multi-tenant customer communication, visual chatbot building, large-scale broadcast campaigns, and multi-agent customer support.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER                                    │
│  React 19 SPA (Vite)  •  ReactFlow Visual Editor  •  PWA Service Worker     │
│  @tanstack/react-query  •  Socket.io Client  •  Supabase Realtime Client    │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │ HTTP / REST / WebSockets    │ Supabase Realtime (WS)
                        ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION SERVER LAYER                          │
│                                                                             │
│  Express.js REST API (/api/*)                 Socket.io Hub (server.ts)    │
│  ├── Auth & Multi-Tenancy Guard               ├── QR Code Stream            │
│  ├── Live Chat & Contacts API                 ├── Typing Indicators         │
│  ├── Flow Builder Compiler & Versioning       └── Realtime Notifications    │
│  ├── Broadcast Orchestrator & Validator                                     │
│  └── AI Agents & Knowledge Base Engine        Node-Cron Scheduler           │
│                                               ├── Health Sync (6hr)         │
│  Webhook Ingestion Pipeline                   └── Recovery Sweepers         │
│  ├── Meta Cloud API Ingestion (/webhook)                                    │
│  └── Baileys Socket Engine (Baileys Service)                                │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
                        ▼                             ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     BACKGROUND QUEUE ENGINE          │  │       DATA & STORAGE LAYER        │
│                                      │  │                                   │
│  BullMQ Workers (broadcast.worker)   │  │  Supabase PostgreSQL (15.x)       │
│  ├── broadcast-prepare Queue         │  │  ├── Multi-Tenant Schema (w_*)    │
│  ├── broadcast-send Queue (10 req/s) │  │  ├── RLS Policies & GIN Indexes   │
│  └── broadcast-reconcile Queue       │  │  └── Database Triggers            │
│                                      │  │                                   │
│  Redis Broker (ioredis + TLS)        │  │  Supabase Storage (wa-media)      │
│  └── Distributed Locks & Windows     │  │  Supabase Auth (JWT & Roles)      │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## 2. Multi-Tenancy & Authorization Model

### Multi-Tenancy Hierarchy
```
Organizations (w_organizations / organizations)
  ├── Subscriptions (whatsapp_subscription_plans / app_user_subscriptions)
  ├── Wallets (whatsapp_wallets, whatsapp_wallet_transactions)
  ├── Members (organization_members) ──> Roles: 'owner', 'admin', 'agent'
  ├── WhatsApp Accounts (w_wa_accounts)
  │     ├── Contacts (w_contacts)
  │     ├── Conversations (w_conversations)
  │     │     ├── Messages (w_messages)
  │     │     ├── Notes (w_conversation_notes)
  │     │     ├── Summaries (w_conversation_summaries)
  │     │     └── Reads (w_conversation_reads)
  │     └── Campaigns (w_campaigns, w_campaign_recipients)
  └── Automation Assets (w_flows, w_flow_versions, bot_agents)
```

### Authentication & Role Flow
1. **JWT Verification**: `authMiddleware` extracts Bearer JWT and verifies against Supabase Auth (`supabase.auth.getUser`).
2. **Organization Resolution**: User membership is checked in `organization_members`. If an owner has no organization, an automatic provisioning flow creates a workspace organization.
3. **Portal Distinction**:
   - `x-auth-portal: owner` — Full administrative and billing access.
   - `x-auth-portal: agent` — Strict agent portal enforcing `role: 'agent'` and active membership status (`is_active: true`).
4. **Subscription Gate**: `checkSubscription` verifies that the organization's owner holds an active subscription (`starter`, `growth`, `pro`, `enterprise`) before allowing access to non-whitelisted routes.

---

## 3. Dual-Protocol WhatsApp Layer

The platform abstracts WhatsApp transport into two unified protocols:

```
                  ┌───────────────────────────────────────┐
                  │          Inbound Message Event        │
                  └──────────────────┬────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
  [ Meta Cloud Webhook ]                    [ Baileys Socket Engine ]
  • POST /webhook                           • sock.ev.on('messages.upsert')
  • HMAC Signature Verification             • Decrypts multi-device protobuf
  • Graph API Payload Parsing               • Extracts text, buttons, media
                 │                                       │
                 └───────────────────┬───────────────────┘
                                     ▼
                   [ Unified Normalization Pipeline ]
                   • normalizeIndianPhoneKey()
                   • upsertContact(orgId, waAccountId, phone, name)
                   • upsertConversation(orgId, waAccountId, contactId)
                                     │
                   ┌─────────────────┴─────────────────┐
                   ▼                                   ▼
          [ Flow Execution Check ]             [ AI Agent Auto-Reply ]
          • Check active flow session          • Query knowledge base
          • Evaluate keywords & nodes          • Generate LLM answer
                   │                                   │
                   └─────────────────┬─────────────────┘
                                     ▼
                      [ Persist Message to Database ]
                      • Insert w_messages (direction: 'inbound'/'outbound')
                      • Update w_conversations last_message_at
                                     │
                   ┌─────────────────┴─────────────────┐
                   ▼                                   ▼
         [ Socket.io Broadcast ]             [ Web Push Dispatch ]
         • io.emit('new_message')            • sendPushNotificationToUsers()
```

---

## 4. Shared Live Chat Inbox Architecture

### Multi-Agent Read State
To allow multiple human agents to collaborate without clobbering unread indicators:
- **Global Unread Count (`w_conversations.unread_count`)**: Increments on inbound messages; resets to 0 when an outbound reply is sent.
- **Per-Agent Read Tracking (`w_conversation_reads`)**:
  - Contains `(conversation_id, user_id, last_read_at, last_read_message_id)`.
  - Calculated column `is_unread_by_user = (cr.last_read_at IS NULL OR cr.last_read_at < c.last_message_at)`.
  - When an agent opens a conversation, `POST /api/conversations/:id/read` updates their personal `last_read_at`.

### High-Performance Cursor Pagination
- The inbox endpoint `GET /api/conversations?limit=50&cursor=<opaque>` utilizes keyset pagination on `(last_message_at DESC, id DESC)`.
- Supported by database index: `CREATE INDEX idx_conversations_org_last_msg ON conversations(organization_id, last_message_at DESC);`.

---

## 5. Visual Flow Builder & Execution Engine

```
[ Frontend: ReactFlow Editor ]
  │ User designs node tree (Triggers, Buttons, AI, HTTP, Appointments)
  ▼
[ Save Draft ] ───> w_flows (stores raw nodes & edges JSON)
  ▼
[ Publish Flow ] ───> Creates immutable w_flow_versions snapshot
                       Sets w_flows.current_version_id
  ▼
[ Inbound Message Arrives ]
  │
  ├── 1. Check w_flow_sessions: Is contact in an active waiting session?
  │      ├── Yes: Resume flow from current node, evaluate user input
  │      └── No: Check triggers/keywords across active flows
  │
  ├── 2. flows.service.ts Execution Loop:
  │      ├── Step 1: Start Node / Match Keyword
  │      ├── Step 2: Render & Send Node Content (Text, Buttons, Media)
  │      ├── Step 3: Execute Action (HTTP API call, Google Calendar booking, AI prompt)
  │      ├── Step 4: Evaluate Condition branches
  │      └── Step 5: Save State & Session (w_flow_sessions) or Complete (End Node)
  │
  └── 3. Telemetry & Auditing:
         └── Logs execution traces to w_flow_runs and w_flow_run_steps
```

---

## 6. High-Throughput Broadcast Engine (BullMQ + Redis)

For large broadcast campaigns up to 10,000 recipients:

```
[ User Creates Campaign (CSV or Segment) ]
  │ POST /api/broadcasts
  ▼
[ w_campaigns Insert (status: 'scheduled' / 'queued') ]
  │
  ├── 1. Prepare Queue (BROADCAST_PREPARE_QUEUE)
  │      • Validates template approval on Meta
  │      • Checks and reserves organization wallet balance
  │      • Bulk-inserts recipient rows into w_campaign_recipients
  │      • Updates w_campaigns.status = 'processing'
  │
  ├── 2. Send Queue (BROADCAST_SEND_QUEUE)
  │      • Dispatches bounded windows (100 recipients at a time)
  │      • Token bucket rate limiter: 10 requests/sec per Meta phone number
  │      • Dispatches via fetchWithMetaBackoff
  │      • Updates recipient status ('delivered', 'failed', 'retrying')
  │
  ├── 3. Reconcile Queue & Cron (BROADCAST_RECONCILE_QUEUE)
  │      • Sweeps stale 'processing' jobs older than 15 minutes
  │      • Auto-refunds failed message spend to wallet
  │      • Emits finalization status & email alert via Supermailbox
  │
  └── Kill Switches:
         • Platform-wide: BROADCAST_GLOBAL_PAUSED=true
         • Organization-level: organizations.broadcasts_paused
         • Phone-level: w_wa_accounts.broadcasts_paused
```

---

## 7. AI Bot Agents & Knowledge Base Engine

1. **Knowledge Base Ingestion**:
   - Files (`.pdf`, `.docx`, `.txt`, `.md`) are uploaded via `/api/settings/knowledge-base`.
   - Backend extracts text using `pdf-parse` / `mammoth`, chunks content, and stores text blocks in `organizations.settings.knowledge_base`.
2. **Context Assembly**:
   - Inbound message text is searched against knowledge base chunks.
   - Top matching segments (up to 10,000 characters) are assembled into an LLM context window.
3. **Execution**:
   - System prompt incorporates agent persona, tone, business rules, and extracted knowledge.
   - OpenAI API returns completion. If bot detects inability to answer or explicit human request, it triggers human handoff (`w_conversations.handoff_status = 'agent_requested'`).
