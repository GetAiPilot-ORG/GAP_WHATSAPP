# GetAiPilot Mobile App — Design & Implementation Guide

> Move the GetAiPilot pilot into a native mobile app built with **Expo (React Native)**.

**Scope (MVP):** Live Chat only — real-time WhatsApp conversations for agents and admins on the go.
**Target users:** Both agents (support staff replying on mobile) and admins/owners (conversation oversight, assignment, bot control).

---

## 1. Verdict: Yes, Expo works

The existing backend is already fully mobile-compatible. GetAiPilot's architecture is:

- **Backend:** Node.js/TypeScript (Express) + Socket.io + Supabase + Baileys/Meta WhatsApp — `backend/`
- **Web frontend:** React + Vite + Tailwind — `frontend/`
- **DB/Realtime:** Supabase (PostgreSQL + Realtime)

None of the backend needs to change for the Live Chat MVP. Only a handful of **web-only UI libraries** need native replacements.

### 1.1 Compatibility matrix

| Layer | Works in Expo? | Notes |
|---|---|---|
| `@supabase/supabase-js` | ✅ | Same client, same anon key. Persist session with `expo-secure-store` instead of `localStorage` |
| Backend REST (`/api/conversations`, `/messages`, `/send`, `/send-media`, `/read`, `/assign`) | ✅ | Same `Authorization: Bearer <token>` + `X-Auth-Portal` headers |
| `socket.io-client` | ✅ | Force `transports: ['websocket']` — polling/XHR is unreliable in React Native |
| Supabase Realtime | ✅ | Best source of truth for new inbound messages (matches web app strategy) |
| `@tanstack/react-query` | ✅ | Reuse the same query keys/patterns already used in `frontend/src` |
| Tailwind styling | ✅ | Use **NativeWind** to reuse existing Tailwind class names and the WhatsApp look (chat wallpaper, green accents, bubbles) |
| `lucide-react` / `@phosphor-icons/react` icon set | ⚠️ | Use `lucide-react-native` (pixel-identical to web) |
| `expo-router` navigation | ✅ | File-based routing; replaces `react-router-dom` |

### 1.2 Must rework (web-only libs)

| Web lib | Replacement | Impact |
|---|---|---|
| `react-qr-code` | `qrcode` + `react-native-svg` (or `expo-qr-code`) | WhatsApp connect QR scan (admin-only screen) |
| `URL.createObjectURL` / `File` / `Blob` | `expo-image-picker` + `expo-file-system` + `FormData` | `send-media` route already accepts multer multipart — **no backend change** |
| Web Audio API (`AudioMessageBubble`) | `expo-av` (`useAudioPlayer`, `expo-audio`) | Voice-note record/playback |
| `localStorage` / `idb-keyval` | `@react-native-async-storage/async-storage` or MMKV | Caches, broken-photo list, selected account, sidebar prefs |
| `reactflow` | ❌ skip | Flow Builder is out of MVP scope |
| `gsap`, `framer-motion`, `motion`, `driver.js`, `xlsx`, `exceljs`, `react-datepicker`, `@headlessui/react` | ❌ skip / replace with RN equivalents | Out of MVP scope |

---

## 2. Native push notification caveat (plan now, ship later)

The existing push service (`backend/src/routes/push.routes.ts`) is **Web Push (VAPID subscription endpoints)** — browser-only.

Expo uses **APNs / FCM device tokens**, a completely different mechanism. Two options:

- **Phase 1 (MVP):** In-app notification only — Supabase Realtime/Socket.io listener updates the inbox live. No lock-screen banner.
- **Phase 2:** Add `POST /api/push/expo` storing an `expo_push_token` per user/org (reuse `push.service.ts` storage pattern with a new `mobile_devices` table), then send via `expo-server-sdk`. Add `expo-notifications` + `expo-device` for token retrieval and foreground banner.

Do **not** try to reuse VAPID for the app.

---

## 3. Recommended project structure

New, standalone Expo project (SDK 54, TypeScript, `expo-router`) in a `mobile/` directory. Do not wedge it into the existing Vite app.

```
mobile/
  app/
    _layout.tsx                    # Root stack: AuthProvider + SafeArea + QueryClientProvider
    (auth)/
      _layout.tsx
      login.tsx                    # Supabase login (email/OTP), picks agent vs admin portal
      connect-whatsapp.tsx         # (admin) QR scan — fetches web QR, polls status
    (tabs)/
      _layout.tsx                  # Bottom tabs: Inbox | Settings
      inbox.tsx                    # Conversation list — search, filters, account picker
      settings.tsx                 # Profile, role, online status, WA accounts, logout
    chat/
      _layout.tsx                  # Stack with transparent header over chat wallpaper
      [conversationId].tsx         # Thread: bubbles, media, audio, reply, assign, bot toggle, notes
  src/
    lib/
      supabase.ts                  # createClient (same URL/anon key as web)
      api.ts                       # typed fetch wrapper (auth headers, X-Auth-Portal)
      socket.ts                    # socket.io-client singleton (websocket-only transport)
      queryClient.ts               # TanStack Query setup (retry, staleTime)
      secureStore.ts               # session + token persistence helpers
    hooks/
      useConversations.ts          # react-query query + realtime subscription (list)
      useMessages.ts               # react-query paginated messages + optimistic send
      useSocketEvents.ts           # ephemeral events (typing, status ack)
      useOnlineStatus.ts           # PATCH /api/team/status
      usePushRegistration.ts       # (phase 2) expo-notifications token → backend
    components/
      ConversationListItem.tsx
      MessageBubble.tsx            # text / image / video / document / audio / note / stickers
      MediaMessageBubble.tsx
      AudioMessageBubble.tsx       # expo-av waveform + play/pause
      ComposerBar.tsx              # text input, emoji, attachments, voice note, internal-note toggle
      ReplyPreview.tsx
      ChatWallpaper.tsx
      Avatar.tsx                   # DiceBear-style initials avatar (pure RN, no @dicebear)
      QrScannerView.tsx            # admin connect screen
    types/
      conversation.ts              # mirrors API DTOs
      message.ts                   # mirrors API DTOs + optimistic client_message_id
      socket.ts
    utils/
      format.ts                    # phone/date formatting copied from LiveChat.jsx
      mergeMessages.ts             # de-dupe/merge logic ported from LiveChat.jsx
      constants.ts                 # 24h window regex, QUICK_REACTIONS, emoji set
  app.json                        # expo config: name, slug, icons, notifications
  .env                            # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
                                  # EXPO_PUBLIC_BACKEND_URL, EXP NO backend CORS needed for native
```

---

## 4. Auth flow

Copy the web auth model (`frontend/src/context/AuthContext.jsx`):

1. **Supabase sign-in** (`supabase.auth.signInWithPassword` / OTP) — same Anon key.
2. **Persist session** in `expo-secure-store` (`AsyncStorage` is acceptable but secure-store is safer for tokens).
3. On launch, restore session, **refresh** if expired (`supabase.auth.refreshSession()`), then fetch profile:
   - `GET /api/team/my-profile` with headers `Authorization: Bearer <token>` and **`X-Auth-Portal: owner|agent`** (AuthContext.jsx:88).
   - Store `userRole`, `memberProfile { organization_id, ... }`, `loginType`.
4. **Role gating:** agents see Inbox + Profile. Admins additionally see QR connect (WhatsApp account status) and assign/bot/auto-assign controls inline in the chat. (`isAdmin = userRole === 'admin' || userRole === 'owner'`, LiveChat.jsx:211)
5. Logout = `supabase.auth.signOut()` + clear stored session + close socket.

The `X-Auth-Portal` header MUST be sent on every API call (mirrors `authHeaders` in LiveChat.jsx:214).

---

## 5. Data layer

### 5.1 Conversation list (Inbox)

Consume exactly the web contract (`GET /api/conversations?limit=50`):

- Query params: `cursor` (pagination), `wa_account_id` (account filter).
- Response body: `{ items: [...] , next_cursor }` or bare array — handle both like `LiveChat.jsx:1036`.
- Sort by `last_message_at` desc (client-side re-sort like web, LiveChat.jsx:1059).
- Unread badge: prefer `unread_for_user` if present, else `unread_count` (LiveChat.jsx:1048).
- Profile photos: lazily fetch `GET /api/contacts/:id/profile-photo` for rows without one; keep a broken-URL denylist in AsyncStorage (`LiveChat.jsx:776`).

**Realtime:** subscribe to Supabase Realtime `postgres_changes` on `messages` + `conversations` (per org) to bump `last_message_preview` / unread / move-to-top, exactly as the web `architecture_design.md` prescribes.

### 5.2 Message thread

- `GET /api/conversations/:id/messages` — paginated (older messages on scroll up).
- `POST /api/conversations/:conversationId/send` — body includes `{ content, client_message_id? }` etc.;
  send optimistically, then reconcile by `client_message_id` using the ported `mergeMessages` logic (LiveChat.jsx:885).
- `POST /api/conversations/:conversationId/send-media` — **multipart FormData** key `file` (already multer-compatible). Preview locally first with `expo-image-picker`, upload, then reconcile.
- `POST /api/conversations/:id/read` — mark as read on open / on view (inbox) to drive unread.
- `POST /api/conversations/:id/clear` + `DELETE /api/conversations/:id` — keep behind a confirm sheet.
- `POST /api/messages/:messageId/reaction` — quick emoji reactions (6 preset — LiveChat.jsx:68).

### 5.3 Actions per message (map from web)

| Web action | Mobile | Endpoint |
|---|---|---|
| Reply | Inline reply preview above composer | (client-side quote context) |
| Forward | Sheet picker of conversations | uses `send` with `content.forwarded` |
| Delete | Confirm + delete | `DELETE /api/messages/:messageId` |
| Copy text | `expo-clipboard` | — |
| Internal note | Composer toggle → type `note` | `send` with note type |
| Reaction | Quick-reaction sheet (6 emoji) | `reaction` endpoint |

### 5.4 Conversation actions (per chat header / item menu)

| Web action | Mobile | Endpoint |
|---|---|---|
| Assign agent | Inline picker (agents/admin) | `PATCH /api/conversations/:id/assign` |
| Bot on/off | Toggle switch | `PATCH /api/conversations/:id/bot` |
| Mark unread | List context menu | `POST /api/conversations/:id/unread` |
| Auto-assign settings | Admin-only screen | `GET/POST /api/settings/auto-assign` |
| Agent online/pause status | Admin-only | `PATCH /api/team/status`, `/api/team/agents` |
| Team member list (for assign) | Lazy fetch | `GET /api/team/members` |

### 5.5 Styling

- **NativeWind** for Tailwind-on-mobile so class names match the web UI.
- Theme constants copied from web: WhatsApp green `#25D366` / dark `#075E54`, chat wallpaper `#efeae2` (light) / `#0b141a` (dark), bubble backgrounds, accent `#008069`, `text-[#667781]` for timestamps.

---

## 6. Screen design

### 6.1 `(auth)/login.tsx`
- Logo + email/password (or OTP) — mirrors web `Login.jsx`.
- On success: resolve portal role automatically (no manual picker needed; use `my-profile` role).
- Handle invite flows later (AgentLogin / SSOLogin in web).

### 6.2 `(auth)/connect-whatsapp.tsx` — admin
- Lists connected WhatsApp accounts (`GET /api/whatsapp/accounts`).
- For unconnected: `GET /api/wa/connect/start` → render returned QR with `qrcode` + `react-native-svg`, poll status (reuse web `WhatsAppConnect.jsx` logic) → `POST /api/wa/connect/callback` to bind to org.
- Show connector account state (loading/connected/disconnected) like web LiveChat header.

### 6.3 `(tabs)/inbox.tsx`
- Header: search bar, account picker (All / specific number), filter chip row (All / Unassigned / Unread / Bots on).
- FlatList of `ConversationListItem`: avatar, name, preview, timestamp, unread badge, urgency styling when approaching the 24h CS window (LiveChat.jsx constants).
- Pull-to-refresh + infinite scroll using `next_cursor`.
- Bottom nav reaches Settings.

### 6.4 `chat/[conversationId].tsx`
- Header: contact avatar+name, status line, menu (`MoreVertical`): assign, bot toggle, mark unread, clear, contact profile.
- Body: `FlatList` (inverted) of message rows with date separators, "You"/agent names for outbound, bot-reply pill, forwarded/reply indicators, reactions row.
- Composer: attachment (+), text input, emoji picker sheet, mic (voice note with `expo-av`), internal-note toggle, send.
- Bottom: KeyboardAvoidingView + keyboard padding on iOS; jump-to-latest FAB when scrolled up (web LiveChat.jsx:261). Track "user near bottom" to auto-scroll on new messages (LiveChat.jsx:452).

### 6.5 `(tabs)/settings.tsx`
- Profile card (DiceBear-style initials avatar, name, email, role).
- Online status toggle (admin sees member pause states).
- Connected WhatsApp accounts list + link to Connect screen (admin).
- App settings: notifications (phase 2), broken-photo cache clear, logout.

---

## 7. Real-time strategy (same as web)

1. **Supabase Realtime** = source of truth for data (new message insert, conversation update, message status `sent→delivered→read`) — subscribe to `postgres_changes` for the org's tables.
2. **Socket.io** = ephemeral (user typing) + fallback push of inbound message for non-open threads.
3. Socket connect with `authHeaders` (`Authorization`, `X-Auth-Portal`); force websocket transport; `reconnectionAttempts: Infinity`, exponential backoff (LiveChat.jsx:48).
4. Disconnect socket on logout; reconnect on session refresh.

---

## 8. Implementation phases

| Phase | Deliverable | Done when |
|---|---|---|
| **1 — Scaffold & Auth** | `mobile/` Expo app, supabase+secure-store, login, role resolution, query client, socket singleton | Login → Inbox with real org data |
| **2 — Inbox** | Conversation list, pagination, search/filter/account picker, realtime new-message bump, unread badges, profile photos | Live list mirrors web inbox |
| **3 — Thread** | Messages w/ pagination, optimistic send, mark-read, bubbles (text/image/video/doc/sticker/note), reply, copy, delete, reactions, date separators | Full 2-way, low-latency send |
| **4 — Media & Voice** | `expo-image-picker` attachments via multipart `send-media`, `expo-av` voice-note record/playback, document send | Image + audio round-trips |
| **5 — Admin controls** | Assign agent, bot toggle, auto-assign settings, online status, QR connect screen | Admins can run the chat from mobile |
| **6 — (later) Native push** | `mobile_devices` table, `POST /api/push/expo`, `expo-notifications` foreground banner + lock-screen | Lock-screen alert on new inbound while app closed |

---

## 9. Environment config (`mobile/.env`)

```
EXPO_PUBLIC_SUPABASE_URL=<same as frontend .env>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<same as frontend .env>
EXPO_PUBLIC_BACKEND_URL=<https://...getaipilot.in or LAN host for dev>
```

Notes:
- Native apps send no `Origin` header, so the backend CORS allowlist does not restrict them; server.ts already `callback(null, true)` when no origin (server.ts:10).
- File upload limit is 100 MB (messages.routes.ts:7).