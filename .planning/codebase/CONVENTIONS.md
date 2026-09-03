# Coding & Architectural Conventions

## 1. Module System & TypeScript Standards

### Backend Module Standards
- **ECMAScript Modules (ESM)**: Backend runs with `"type": "module"` in `package.json`.
- **Import Extensions**: All local file imports in TypeScript files **must** include the `.js` extension (e.g., `import { supabase } from '../config/supabase.js';`). Omitting the extension causes runtime resolution failures under `NodeNext` / `ESNext`.
- **TypeScript Compilation**: `tsconfig.json` targets `ES2022` with `moduleResolution: "node"`. Type checking is executed via `npm run build` (`tsc --noEmit`).

### Frontend Standards
- **React 19 Functional Architecture**: Functional components utilizing modern hooks (`useContext`, `useEffect`, `useMemo`, `useCallback`).
- **Data Fetching via TanStack React Query**:
  - Global query client configured with `staleTime: 5 mins`, `gcTime: 10 mins`, and `refetchOnWindowFocus: false`.
  - Mutations handle optimistic updates and query invalidation using `queryClient.invalidateQueries(...)`.
- **Code Splitting**: Route-level components are lazy-loaded using `React.lazy()` with `Suspense` and `PageFallback` spinners.

---

## 2. API Design & Route Conventions

### REST Routing Structure
- All backend API routes reside under `/api/*` except the root health check (`/` and `/api/health`) and the Meta webhook receiver (`/webhook`).
- Pluralized resource endpoints:
  - `/api/contacts`
  - `/api/conversations`
  - `/api/messages`
  - `/api/flows`
  - `/api/broadcasts`
  - `/api/team/members`

### Response Payload Patterns
- **Success responses**: Return JSON objects or arrays with HTTP `200` or `201`:
  ```json
  {
    "success": true,
    "data": { ... }
  }
  ```
- **Error responses**: Return appropriate HTTP status codes (`400`, `401`, `403`, `404`, `500`) with `{ "error": "Descriptive message" }`:
  ```json
  {
    "error": "Subscription expired or plan does not include GAP WhatsApp access."
  }
  ```

### High-Volume Keyset Pagination
- Large list endpoints (such as `GET /api/conversations`) use cursor-based keyset pagination:
  - Parameters: `limit` (clamped 1..100), `cursor` (opaque base64 string).
  - Response contract:
    ```json
    {
      "items": [],
      "next_cursor": "opaque-string-or-null",
      "has_more": false
    }
    ```

---

## 3. Database & Schema Conventions

### Table Naming & Prefixes
- WhatsApp CRM and automation tables utilize the clean `w_*` namespace:
  - `w_wa_accounts`: Connected phone numbers.
  - `w_contacts`: Lead / customer records.
  - `w_conversations`: Chat threads.
  - `w_messages`: Individual messages.
  - `w_flows` & `w_flow_versions`: Visual bot blueprints and immutable releases.
  - `w_flow_sessions`: Active flow execution positions.
  - `w_campaigns` & `w_campaign_recipients`: Broadcast campaigns and recipient delivery status.
  - `w_template_submissions`: Meta template audit trail.

### Primary Keys & Data Types
- **Primary Keys**: Always `uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- **Tenant Isolation**: Every tenant-scoped table references `organizations(id)` with `ON DELETE CASCADE`.
- **Timestamps**: Stored as UTC `timestamptz DEFAULT now()`.
- **Currency & Billing Values**: All monetary values are stored in integer **paise** (`bigint` or `integer`, where ₹1 = 100 paise) to prevent floating-point rounding errors (e.g. `monthly_price_paise`, `balance_paise`, `rate_paise`).
- **Phone Number Normalization**: Phone numbers are normalized using `normalizeIndianPhoneKey` or international E.164 formatting; phone search fields index clean digit strings (`wa_key`).

---

## 4. UI, Styling & Design System

### Utility-First Styling (Tailwind CSS)
- Uses Tailwind CSS utilities with modern dark-mode accents (e.g. emerald/teal brand palette, sleek slate backgrounds).
- Conditional classes merged using `clsx` and `tailwind-merge` (`twMerge`).
- Responsive layouts adapt for mobile/desktop using `sm:`, `md:`, `lg:`, `xl:` breakpoints.

### Iconography & UI Assets
- Primary icon set: `@phosphor-icons/react` (e.g. `ChatCircleText`, `PaperPlaneTilt`, `Lightning`, `Users`).
- Secondary icon set: `lucide-react` for Flow Builder node headers and toolbars.
- Dynamic contact avatars: Generated via `@dicebear/core` and `@dicebear/collection` (avataaars, bottts) with deterministic seeds based on contact ID/phone.
- Micro-interactions: Framer Motion for drawer transitions, modals, and collapsible sidebars.

---

## 5. Security & Cryptography

### Encryption of Sensitive Tokens
- OAuth refresh tokens, access tokens, and sensitive webhook credentials are encrypted at rest using AES-256-CBC (`backend/src/utils/crypto.ts`):
  ```typescript
  export function encryptToken(text: string): string
  export function decryptToken(encryptedText: string): string
  ```
- Requires `ENCRYPTION_KEY` in server environment.

### Webhook Verification
- Meta webhook endpoint `/webhook` verifies HMAC-SHA256 signature using `META_APP_SECRET` against raw request buffer (`req.rawBody`).
- GET verification validates `hub.verify_token` against `META_VERIFY_TOKEN`.
- n8n handoff callbacks verify `X-N8N-Secret` against `N8N_WEBHOOK_SECRET`.

### Role-Based Access Control (RBAC)
- Multi-tier role permissions: `owner` (full workspace + billing), `admin` (management without destructive billing changes), `agent` (restricted live-chat and assigned contact handling).
