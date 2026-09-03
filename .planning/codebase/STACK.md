# Technology Stack

## 1. Overview & Runtime Environment

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Backend Runtime** | Node.js (ESM) | `>=20.x` | Core API server, webhook ingestion, and background workers |
| **Backend Execution** | `tsx` | `^4.6.2` | TypeScript runtime execution and hot-reloading for server & workers |
| **Frontend Runtime** | React | `^19.2.0` | Single Page Application (SPA) web client |
| **Frontend Build Tool** | Vite | `^7.2.4` | Development bundler and production build tool |
| **Edge Compute** | Deno (Supabase Functions) | `2.x` | Edge functions for Razorpay payment link creation & verification |
| **Database** | PostgreSQL via Supabase | `15.x` | Relational database with Row Level Security (RLS) and Realtime replication |
| **Cache & Queue Broker** | Redis via BullMQ / ioredis | `ioredis ^5.10.1`, `bullmq ^5.79.2` | Distributed queue for large-scale broadcast campaign processing |
| **Realtime WebSockets** | Socket.io | `server ^4.7.2`, `client ^4.8.3` | Low-latency bi-directional messaging, QR codes, agent typing indicators |

---

## 2. Backend Stack Details

### Core Server Framework
- **Express.js (`^4.18.2`)**: HTTP REST API router, webhook receivers, and middleware pipeline.
- **Node HTTP (`http`)**: Underlying HTTP server binding both Express and Socket.io.
- **CORS (`^2.8.5`)**: Multi-origin CORS handling for `localhost`, `*.getaipilot.in`, `*.vercel.app`, and `*.ngrok-free.dev`.

### WhatsApp Protocol Adapters
- **Meta Cloud API (`v21.0`)**: Official WhatsApp Business Platform REST API for templates, business verification, and interactive messages via Graph API.
- **@whiskeysockets/baileys (`^6.6.0`)**: Multi-device WhatsApp Web WebSocket protocol client for QR-code-based personal/business number pairing, socket events (`messages.upsert`, `connection.update`), and auth credentials persistence (`baileys_auth_info/`).

### Queue & Background Jobs
- **BullMQ (`^5.79.2`)**: Distributed job queues (`broadcast-prepare`, `broadcast-send`, `broadcast-reconcile`) for campaign delivery up to 10,000 recipients with worker concurrency and rate limiting.
- **ioredis (`^5.10.1`)**: Redis client supporting standalone/cluster Redis instances with TLS.
- **node-cron (`^4.2.1`)**: Periodic tasks for account health diagnostics (every 6 hours) and legacy broadcast dispatch recovery.

### Storage, File Parsing & Media
- **Multer (`^1.4.5-lts.1`)**: Multipart form data parser with memory storage for media uploads (images, documents, audio).
- **pdf-parse (`^1.1.1`)**: PDF text extraction engine for Knowledge Base document indexing.
- **mammoth (`^1.12.0`)**: `.docx` document parser converting Word files to plain text/markdown for AI knowledge bases.
- **Supabase Storage (`wa-media`)**: Object storage bucket for inbound/outbound WhatsApp media.

### AI, Email & Push Notifications
- **OpenAI API**: GPT models (`gpt-4.1-mini`, `gpt-4o-mini`, custom prompts) for AI Bot Agents, automated FAQ responses, and lead qualification.
- **Supermailbox API / Nodemailer (`9.0.1`)**: Transactional email dispatch for broadcast failures, team invites, and notifications.
- **web-push (`^3.6.7`)**: VAPID Web Push notification protocol for browser notifications when new messages arrive.
- **Twilio SDK (`^6.0.2`)**: Twilio REST API integration for purchasing virtual WhatsApp-capable phone numbers.

---

## 3. Frontend Stack Details

### UI Framework & State
- **React (`^19.2.0`) & React-DOM (`^19.2.0`)**: React 19 component ecosystem.
- **React Router DOM (`^7.11.0`)**: Client-side routing with nested layout hierarchy and lazy-loaded routes (`Suspense`).
- **@tanstack/react-query (`^5.90.12`)**: Server state caching, background refetching, and query invalidation.
- **Context API**: Client global state management:
  - `AuthContext`: Supabase auth session, user profile, organization membership, role detection (`owner`, `admin`, `agent`).
  - `WhatsAppAccountContext`: Active connected WhatsApp number, account selector, health status.
  - `PushContext`: Browser push subscription manager.
  - `PwaInstallContext`: PWA install prompts and state.
  - `DialogContext`: Global confirm/alert modals.

### Flow Builder Engine
- **ReactFlow (`^11.11.4`)**: Visual canvas node-based workflow editor for drag-and-drop WhatsApp chatbot creation.
- **Custom Nodes**: `StartBotFlowNode`, `TextNode`, `ButtonNode`, `UserInputNode`, `AINode`, `AppointmentNode`, `GoogleSheetsNode`, `HTTPAPINode`, `InteractiveNode`, `ListNode`, `LocationNode`, `MediaNode`, `ProductNode`, `WhatsAppFlowNode`.

### Styling & Design System
- **Tailwind CSS (`^3.4.17`) & PostCSS (`^8.5.6`)**: Utility-first CSS engine.
- **Phosphor Icons (`@phosphor-icons/react ^2.1.10`)**: Primary icon system.
- **Lucide React (`^0.562.0`)**: Secondary icon set for editor and control panels.
- **DiceBear (`@dicebear/collection ^9.4.2`, `@dicebear/core ^9.4.2`)**: Dynamic SVG avatar generator for contacts and agents.
- **Framer Motion (`^12.42.2`) & GSAP (`^3.15.0`)**: Smooth micro-interactions, drawer transitions, and landing page animations.
- **Sonner (`^2.0.7`)**: Modern toast notification stack.
- **Driver.js (`^1.4.0`)**: Interactive product onboarding tours.
- **Recharts (`^3.9.2`)**: Data visualization for dashboard metrics and delivery insights.

### PWA & Offline Support
- **vite-plugin-pwa (`^1.3.0`)**: Service Worker generation (`sw.js`), web app manifest, offline caching, and update prompts.
- **idb-keyval (`^6.3.0`)**: IndexedDB key-value store for client-side offline caching.

---

## 4. Database & Cloud Architecture

```
[ Frontend Client (React 19 / Vite) ]
          │                    │ (Supabase JS Client / Realtime)
          │ (HTTP REST / WS)   ▼
          │         [ Supabase PostgreSQL + Auth + Storage ]
          ▼                    ▲
[ Express API Server (Node.js) ]
     │           │
     │           ├─── [ BullMQ Workers ] ─── [ Redis (ioredis) ]
     │           │
     │           ├─── [ Meta WhatsApp Cloud API ] (Graph API v21.0)
     │           ├─── [ Baileys Socket Engine ] (WhatsApp Web Protocol)
     │           ├─── [ OpenAI API ] (LLM Bot Agents & Knowledge Base)
     │           ├─── [ Google Calendar API ] (OAuth 2.0 Appointments)
     │           └─── [ n8n Automation Engine ] (Handoff Webhooks)
     │
[ Supabase Edge Functions (Deno) ] ─── [ Razorpay Payment Gateway ]
```

---

## 5. Development & Tooling

- **TypeScript (`^5.3.3`)**: Strong typing on backend controllers, services, and shared types.
- **ESLint (`^9.39.1`)**: Code linting for frontend and backend.
- **Tailwind Merge (`^3.4.0`) & CLSX (`^2.1.1`)**: Class combination utility for clean JSX.
- **Date-fns (`^4.1.0`)**: Date manipulation and formatting.
- **ExcelJS (`^4.4.0`) & XLSX (`^0.18.5`)**: CSV/Excel parsing and exporting for bulk contact uploads and broadcast recipient lists.
- **Kill-port (`scripts/kill-port.mjs`)**: Dev convenience script ensuring port `3001` is freed prior to starting `tsx watch`.
