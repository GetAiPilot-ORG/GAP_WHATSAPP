# External & Internal Integrations

## 1. Meta WhatsApp Cloud API (Official WhatsApp Business Platform)

### Overview & Protocol
The application integrates with Meta's Graph API (`v21.0`) to provide enterprise-grade WhatsApp messaging, verified template dispatch, and interactive message payloads.

### Key Capabilities
- **Embedded Signup**: Integrated via Facebook JavaScript SDK (`frontend/src/services/facebookSdkLoader.js`) allowing business owners to onboard their WhatsApp Business Accounts (WABA) and phone numbers seamlessly.
- **Message Dispatch**: Dispatches template messages, text messages, interactive quick-reply buttons, list messages, and media headers via `backend/src/services/meta.service.ts` and `messages.sender.ts`.
- **Media Handling**: Inbound media is fetched from Meta servers using `downloadMetaMedia` and stored into Supabase Storage (`wa-media` bucket). Outbound media is uploaded directly to Meta or sent via hosted URLs.
- **Template Management**: Creates and validates templates with category detection (`MARKETING`, `UTILITY`, `AUTHENTICATION`) and syncs status (`PENDING`, `APPROVED`, `REJECTED`) with Meta via `backend/src/controllers/whatsapp.controller.ts` and `w_template_submissions` table.
- **Account Health & Diagnostics**: Periodic health checking (`AccountHealthService`) queries Meta Graph API for WABA status, payment issues, business verification status, and quality ratings.
- **Resilience & Rate Limiting**: `fetchWithMetaBackoff` implements exponential backoff with jitter on HTTP `429` (Too Many Requests) and network exceptions.

---

## 2. Baileys Multi-Device WhatsApp Protocol (Web Protocol)

### Overview
For small businesses or numbers not registered on Meta Cloud API, the platform provides a direct WhatsApp Web bridge using `@whiskeysockets/baileys`.

### Key Capabilities
- **QR Code Pairing**: Generates base64 QR codes sent in realtime to `frontend/src/pages/WhatsAppConnect.jsx` via Socket.io (`io.emit('qr', qrCode)`).
- **Session Persistence**: Auth credentials and encryption keys (`creds.json`, `app-state-sync-key-*.json`, `pre-key-*.json`) are stored per session in `baileys_auth_info/`.
- **Auto-Reconnect**: Server startup dynamically checks existing sessions and auto-restores connections.
- **Bi-directional Message Handling**: Listens on `sock.ev.on('messages.upsert')` and emits `sock.ev.on('connection.update')`.
- **Flow Engine & Bot Triggering**: Inbound Baileys messages are fed directly into `flows.service.ts` and `ai.service.ts`.

---

## 3. Razorpay Payment Gateway & Wallet Infrastructure

### Architecture
Billing and wallet recharges run through serverless **Supabase Edge Functions** (Deno) for maximum security and PCI compliance.

### Components & Edge Functions
1. **`create-whatsapp-payment-link`**: Creates a Razorpay payment link for plan upgrades (Starter: ₹999/mo, Growth: ₹1,999/mo, Pro: ₹3,499/mo) with monthly/yearly interval options.
2. **`verify-whatsapp-subscription`**: Verifies payment signatures (`razorpay_payment_id`, `razorpay_signature`), provisions subscription in `app_user_subscriptions`, and updates `organizations.plan_id`.
3. **`create-whatsapp-wallet-recharge-link`**: Generates payment links for WhatsApp conversation wallet recharges (min ₹100, max ₹1,00,000).
4. **`verify-whatsapp-wallet-recharge`**: Verifies signature, credits `whatsapp_wallets.balance_paise`, and records immutable transaction logs in `whatsapp_wallet_transactions`.
5. **Dual Mode Credentials**: Supports automatic fallback between `RAZORPAY_LIVE_*` and `RAZORPAY_TEST_*` credentials.
6. **Failed Message Refunds**: Supabase migration `20260713000000_failed_message_refund.sql` introduces automated message debit refunds with unique idempotency keys when Meta message delivery fails.

---

## 4. Supabase Infrastructure (PostgreSQL, Auth, Realtime, Storage)

### Modules Used
- **Supabase Auth**: JWT-based authentication supporting email/password, invitation tokens, Google SSO, and metadata-driven organization assignment.
- **PostgreSQL Database**: Relational schema with Foreign Keys, JSONB fields, GIN indexes, and triggers for auto-updating timestamps.
- **Supabase Realtime**: Postgres change replication on `w_messages` and `w_conversations` ensuring instant UI updates across multi-agent shared inboxes.
- **Supabase Storage**: Public bucket `wa-media` for uploaded media assets, voice notes, PDFs, and conversation attachments.
- **Row Level Security (RLS)**: Scoped access control policies ensuring tenant data isolation across organizations.

---

## 5. OpenAI API (LLMs & Knowledge Base RAG)

### Capabilities
- **Bot Agents (`bot_agents` table)**: Configurable AI personas with customized prompt instructions, temperature controls, and model selection (`gpt-4.1-mini`, `gpt-4o-mini`).
- **Knowledge Base Ingestion**: Parses uploaded `.txt`, `.pdf`, `.docx`, and `.md` files, chunking and extracting textual context stored in `organizations.settings.knowledge_base`.
- **Dynamic Context Injection**: When customer queries arrive, matching knowledge base snippets (up to 10,000 characters) are injected into the LLM system prompt for grounded, hallucination-resistant answers.
- **Auto-Handoff Detection**: Bot detects customer frustration or explicit human agent requests and transitions `w_conversations.handoff_status` to `'agent_requested'`.

---

## 6. Google Calendar API (OAuth 2.0 & Appointment Booking)

### Capabilities
- **OAuth 2.0 Flow**: Users authenticate their Google account via popup (`/api/integrations/google/auth-url`).
- **Token Security**: Google Refresh and Access tokens are encrypted using AES-256 (`backend/src/utils/crypto.ts`) before being stored in `google_integrations` table.
- **Free/Busy Slot Querying**: Real-time querying of Google Calendar `freeBusy` endpoint to find available meeting slots.
- **Automated Event Booking**: In Flow Builder, the `AppointmentNode` allows WhatsApp leads to select a slot, automatically creating a Google Calendar event with Google Meet link and returning confirmation to the user.

---

## 7. Web Push Notifications (VAPID Protocol)

### Capabilities
- **Standards-Compliant Push**: Implemented via `web-push` using VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
- **Device Management**: Stores browser subscription endpoints (`endpoint`, `p256dh`, `auth`) in `push_subscriptions` table.
- **Targeted Notification Dispatch**: Sends instant browser notifications to assigned agents or all organization members when new inbound WhatsApp messages arrive.
- **Stale Subscription Cleanup**: Automatically prunes expired endpoints on HTTP `404`/`410` responses.

---

## 8. Twilio Virtual Phone Numbers

### Capabilities
- **Number Search & Purchase**: Allows organizations to search available geographic/toll-free phone numbers in Twilio inventory via `/api/twilio/available-numbers`.
- **Automated Provisioning**: Purchases numbers via `/api/twilio/buy-number` and registers them into the tenant's number pool for Meta Cloud onboarding.

---

## 9. Supermailbox / Transactional Email

### Capabilities
- **Centralized Email Dispatch**: Dispatches critical administrative alerts, invite tokens, and failure notifications via `sendTransactionalEmail`.
- **Broadcast Failure Notifications**: Automatically emails organization admins if a large-scale broadcast campaign fails during preparation or delivery.
- **Idempotency**: Prevents duplicate email delivery using unique `idempotencyKey` values.

---

## 10. n8n Workflow Automation (AI Handoff Summaries)

### Capabilities
- **Handoff Trigger Webhook**: Posts structured conversation payloads (last 50 messages, contact details, custom fields, flow session metadata) to `N8N_HANDOFF_WEBHOOK_URL`.
- **Asynchronous Callback**: n8n processes the transcript with external AI models and posts back structured summaries to `/api/n8n/conversations/:id/summary`.
- **Security**: Protected with shared secret verification via `X-N8N-Secret` header.
- **CRM Enrichment**: Inserts structured summary notes (`customer_intent`, `customer_stage`, `lead_quality`, `next_best_action`, `important_facts`) directly into `w_conversation_summaries` and `w_conversation_notes`.
