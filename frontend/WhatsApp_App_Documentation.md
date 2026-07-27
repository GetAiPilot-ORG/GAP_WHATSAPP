  # WhatsApp Automation App - Complete Documentation

## Overview

This document explains the complete working process of the WhatsApp Automation application, including how WhatsApp connects, how data flows, and how contacts and messages are stored and displayed.

---

## 1. WhatsApp Connection (QR Code Scanning)

### Flow Diagram
```
User clicks "Connect WhatsApp" 
    → Server creates Baileys socket 
    → QR code generated 
    → User scans with phone 
    → Connection established 
    → Session saved
```

### Key Components
| Component | File | Purpose |
|-----------|------|---------|
| Frontend UI | `src/pages/WhatsAppConnect.jsx` | Shows QR code to user |
| Backend | `server/server.ts` | Uses Baileys library to connect |
| Session Storage | `server/baileys_auth_info/` | Stores credentials for auto-reconnect |

### How It Works

1. **User Action**: User opens the app and navigates to WhatsApp Connect page
2. **Socket Creation**: Server creates a Baileys WhatsApp socket connection
3. **QR Generation**: Baileys generates a QR code (similar to WhatsApp Web)
4. **QR Transmission**: QR code is sent to frontend via Socket.io using `io.emit('qr', qrCode)`
5. **User Scan**: User scans QR code with their phone's WhatsApp app
6. **Session Save**: Once authenticated, session credentials are saved locally in `server/baileys_auth_info/session_xxxxx/`
7. **Auto-Reconnect**: Next time server starts, it auto-reconnects using saved session (no QR needed)

### Session Files Stored
- `creds.json` - Main credentials
- `app-state-sync-key-*.json` - App state keys
- `pre-key-*.json` - Pre-keys for encryption

---

## 2. Receiving Messages (Incoming WhatsApp Messages)

### Flow Diagram
```
Someone sends WhatsApp message 
    → Baileys receives it 
    → Server processes 
    → Saves to Supabase 
    → Emits via Socket.io 
    → Frontend updates LiveChat
```

### Code Location
`server/server.ts` - Event handler: `sock.ev.on('messages.upsert', ...)`

### Step-by-Step Process

#### Step 1: Baileys Event Triggers
When a new message arrives on WhatsApp, the Baileys library fires the `messages.upsert` event.

#### Step 2: Extract Message Data
The server extracts key information:
- `remoteJid` = sender's WhatsApp ID (e.g., `919876543210@s.whatsapp.net`)
- `pushName` = sender's WhatsApp profile name
- Message content (text, image, audio, video, document, etc.)

#### Step 3: Upsert Contact
The `upsertContact()` function handles contact creation/update:

```typescript
async function upsertContact(organization_id, wa_account_id, wa_id, name) {
    // 1. Normalize the WhatsApp ID to a phone key
    const wa_key = normalizeIndianPhoneKey(wa_id);
    
    // 2. Check if contact exists by wa_key or wa_id
    // 3. If exists → update last_active, maybe update name
    // 4. If not exists → create new contact
}
```

**Contact Data Stored:**
| Field | Example | Description |
|-------|---------|-------------|
| `wa_id` | `919876543210@s.whatsapp.net` | Full WhatsApp ID |
| `wa_key` | `919876543210` | Normalized phone key |
| `phone` | `+919876543210` | Formatted phone number |
| `name` | `John Doe` | WhatsApp profile name |
| `custom_name` | `My Friend John` | User-set alias |
| `contact_type` | `individual` | Type: individual/group/channel |

#### Step 4: Upsert Conversation
The `upsertConversation()` function creates or updates conversation:
- Creates new conversation if first message from this contact
- Increments `unread_count` for inbound messages
- Updates `last_message_at` timestamp

#### Step 5: Save Message
Message is saved to `messages` table with:
- `conversation_id` - Link to conversation
- `direction` - 'inbound' for received messages
- `content` - Message text/media info
- `wa_message_id` - WhatsApp's message ID

#### Step 6: Emit to Frontend
Server sends real-time update via Socket.io:
```javascript
io.emit('new_message', { message, conversation });
```

---

## 3. Sending Messages (Outgoing)

### Flow Diagram
```
User types in LiveChat 
    → POST /api/messages/send 
    → Server sends via Baileys 
    → Baileys delivers to WhatsApp 
    → Save to DB 
    → Update frontend
```

### API Endpoint
`POST /api/messages/send`

### Request Body
```json
{
    "conversation_id": "uuid",
    "content": "Hello!",
    "media_type": "text"
}
```

### Process
1. Frontend sends message via API
2. Server retrieves contact's WhatsApp ID from conversation
3. Baileys sends message to WhatsApp servers
4. Message saved to database with `direction: 'outbound'`
5. Conversation `unread_count` set to 0 (user replied)
6. Frontend updated via Socket.io

---

## 4. Live Chat Display - Names & IDs

### Frontend File
`src/pages/LiveChat.jsx`

### LiveChat inbox loading contract

- `GET /api/whatsapp/accounts` is the authoritative connection check. The UI remains in a loading skeleton until this request succeeds; transport failures render a retry state and are never treated as a disconnected account.
- `GET /api/conversations?limit=50&cursor=<opaque>` returns:

```json
{
  "items": [],
  "next_cursor": "opaque-or-null",
  "has_more": false
}
```

- `limit` is clamped to `1..100`. An invalid cursor returns HTTP `400`.
- The cursor is opaque to clients and must be sent back unchanged. Pagination is scoped by the authenticated organization and agent role on the server.
- Apply `SQL files/livechat_inbox_performance_indexes.sql` to production before measuring large-inbox latency.

### Name Display Priority

The app shows contact names in this priority order:

```
1. custom_name (user-set alias)     → "My Friend John"
        ↓ if empty
2. name (WhatsApp profile name)     → "John Doe"
        ↓ if empty or just digits
3. phone (formatted number)         → "+91 98765 43210"
        ↓ if empty
4. Fallback                         → "Unknown"
```

### Code Implementation
```javascript
function getDisplayName(convo) {
    // 1. First check custom_name (user-set alias)
    if (convo.contacts?.custom_name) {
        return convo.contacts.custom_name;
    }
    
    // 2. Then check WhatsApp profile name (if not just digits)
    if (convo.contacts?.name && !/^\d+$/.test(convo.contacts.name)) {
        return convo.contacts.name;
    }
    
    // 3. Finally show formatted phone number
    return formatPhoneForDisplay(convo.contacts?.phone || convo.contacts?.wa_id);
}
```

### Phone Display Formatting

```javascript
function formatPhoneForDisplay(phone) {
    // Skip group/channel IDs - they don't have phone numbers
    if (phone?.includes('@g.us') || phone?.includes('@newsletter')) {
        return null;
    }
    
    // Extract digits only
    const digits = phone?.replace(/\D/g, '');
    
    // Indian 10-digit number → "+91 98765 43210"
    if (digits?.length === 10) {
        return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`;
    }
    
    // 12-digit with 91 prefix → "+91 98765 43210"  
    if (digits?.length === 12 && digits.startsWith('91')) {
        return `+91 ${digits.slice(2,7)} ${digits.slice(7)}`;
    }
    
    return phone;
}
```

### WhatsApp ID Formats

| Type | Format | Example |
|------|--------|---------|
| Individual | `{phone}@s.whatsapp.net` | `919876543210@s.whatsapp.net` |
| Group | `{id}@g.us` | `120363123456789@g.us` |
| Channel | `{id}@newsletter` | `120363987654321@newsletter` |
| LID (new) | `{lid}@lid` | `123456789012345@lid` |

---

## 5. Contact Saving Process

### When Contacts Are Saved

| Trigger | Action | Function |
|---------|--------|----------|
| New message received | Create/update contact | `upsertContact()` |
| WhatsApp contacts sync | Bulk sync on connection | `contacts.upsert` event |
| User edits custom name | Update custom_name | `PUT /api/contacts/:id` |

### Database Schema: `contacts` Table

```sql
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    wa_account_id   UUID NOT NULL REFERENCES wa_accounts(id),
    wa_id           TEXT NOT NULL,           -- Full WhatsApp ID
    wa_key          TEXT,                    -- Normalized phone key
    phone           TEXT,                    -- Formatted phone number
    name            TEXT,                    -- WhatsApp profile name
    custom_name     TEXT,                    -- User-set alias (editable)
    contact_type    TEXT DEFAULT 'individual', -- individual/group/channel
    last_active     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(organization_id, wa_id)
);
```

### Contact Type Detection

```typescript
function getContactType(wa_id: string): string {
    if (wa_id.includes('@g.us')) return 'group';
    if (wa_id.includes('@newsletter')) return 'channel';
    return 'individual';
}
```

### Phone Normalization

```typescript
function normalizeIndianPhoneKey(wa_id: string): string | null {
    // Only process individual contacts (not groups/channels)
    if (!wa_id.includes('@s.whatsapp.net')) return null;
    
    // Extract phone part: "919876543210@s.whatsapp.net" → "919876543210"
    const phone = wa_id.split('@')[0];
    
    // Return digits only
    return phone.replace(/\D/g, '');
}
```

---

## 6. Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER'S PHONE                               │
│                    (WhatsApp Mobile App)                             │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ WhatsApp Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        WHATSAPP SERVERS                              │
│                   (Meta's Cloud Infrastructure)                      │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ WebSocket Connection
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER (Express.js)                          │
│                        server/server.ts                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Baileys        │  │  Socket.io      │  │  REST APIs          │  │
│  │  (WA Client)    │  │  (Real-time)    │  │  (CRUD Operations)  │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │              │
│           └────────────────────┼──────────────────────┘              │
│                                │                                     │
└────────────────────────────────┼─────────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│   Supabase      │    │   Frontend      │    │   File Storage      │
│   (PostgreSQL)  │    │   (React)       │    │   (Uploads)         │
│                 │    │                 │    │                     │
│  • contacts     │    │  • LiveChat     │    │  • Images           │
│  • conversations│◄───│  • Contacts     │    │  • Audio            │
│  • messages     │    │  • Dashboard    │    │  • Documents        │
│  • wa_accounts  │    │  • Settings     │    │                     │
└─────────────────┘    └─────────────────┘    └─────────────────────┘
```

---

## 7. Socket.io Events Reference

### Server → Client Events

| Event | Data | Purpose |
|-------|------|---------|
| `qr` | `{ qr: 'base64_qr_code' }` | Send QR code for scanning |
| `connection_update` | `{ status: 'open'/'close' }` | WhatsApp connection status |
| `new_message` | `{ message, conversation }` | New message received |
| `message_update` | `{ message_id, status }` | Message status update (sent/delivered/read) |
| `contact_updated` | `{ contact }` | Contact info changed |
| `conversation_updated` | `{ conversation }` | Conversation updated |

### Client → Server Events

| Event | Data | Purpose |
|-------|------|---------|
| `join_room` | `{ conversation_id }` | Join conversation room |
| `leave_room` | `{ conversation_id }` | Leave conversation room |
| `typing` | `{ conversation_id }` | User is typing |

---

## 8. Key Files Reference

### Backend Files

| File | Purpose |
|------|---------|
| `server/server.ts` | Main backend - WhatsApp connection, message handling, all APIs |
| `server/supabaseAuth.ts` | Supabase client configuration |
| `server/openai.ts` | OpenAI integration for AI features |

### Frontend Files

| File | Purpose |
|------|---------|
| `src/pages/LiveChat.jsx` | Main chat interface - shows conversations & messages |
| `src/pages/Contacts.jsx` | Contact list management page |
| `src/pages/WhatsAppConnect.jsx` | QR code scanning UI |
| `src/components/ContactProfileDrawer.jsx` | Contact details sidebar with edit |
| `src/components/Sidebar.jsx` | Navigation sidebar |

### Configuration Files

| File | Purpose |
|------|---------|
| `server/baileys_auth_info/` | Saved WhatsApp session for auto-reconnect |
| `.env` | Environment variables (Supabase URL, API keys) |
| `vite.config.js` | Frontend build configuration |
| `server/tsconfig.json` | TypeScript configuration |

---

## 9. API Endpoints Reference

### Contacts

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/contacts` | List all contacts |
| GET | `/api/contacts/:id` | Get single contact |
| PUT | `/api/contacts/:id` | Update contact (custom_name, etc.) |
| DELETE | `/api/contacts/:id` | Delete contact |

### Conversations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/conversations` | List all conversations |
| GET | `/api/conversations/:id` | Get single conversation |
| PUT | `/api/conversations/:id/read` | Mark as read |

### Messages

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/conversations/:id/messages` | Get messages for conversation |
| POST | `/api/messages/send` | Send new message |

### WhatsApp

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/whatsapp/status` | Get connection status |
| POST | `/api/whatsapp/connect` | Initiate connection |
| POST | `/api/whatsapp/disconnect` | Disconnect WhatsApp |

---

## 10. Database Tables Overview

### Tables Relationship

```
organizations
    │
    ├── wa_accounts (WhatsApp accounts linked to org)
    │       │
    │       ├── contacts (people/groups who message)
    │       │       │
    │       │       └── conversations (chat threads)
    │       │               │
    │       │               └── messages (individual messages)
    │       │
    │       └── templates (message templates)
    │
    └── users (app users/agents)
```

### Quick Schema Reference

```sql
-- Organizations (Companies/Teams)
organizations: id, name, created_at

-- WhatsApp Accounts (Connected phone numbers)
wa_accounts: id, organization_id, phone_number, status

-- Contacts (People who message)
contacts: id, organization_id, wa_account_id, wa_id, wa_key, 
          phone, name, custom_name, contact_type, last_active

-- Conversations (Chat threads)
conversations: id, organization_id, wa_account_id, contact_id,
               unread_count, last_message_at, status

-- Messages (Individual messages)
messages: id, conversation_id, direction, content, media_type,
          media_url, wa_message_id, status, created_at
```

---

## 11. Troubleshooting Guide

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| QR code not showing | Server not running | Start server: `npm run dev` |
| Messages not appearing | Socket.io disconnected | Refresh page |
| Contact showing numbers only | No WhatsApp profile name | Edit custom_name via pencil icon |
| Duplicate key error | Race condition in upsert | Fixed with upsert conflict handling |
| Groups showing in contacts | contact_type filter missing | Filter by `contact_type='individual'` |

### Debug Commands

```bash
# Check server logs
npm run dev (in server folder)

# Check database
# Go to Supabase Dashboard → SQL Editor

# Clear all data (fresh start)
DELETE FROM messages;
DELETE FROM conversations;
DELETE FROM contacts;
```

---

## 12. Summary

This WhatsApp Automation app:

1. **Connects** to WhatsApp using Baileys library (WhatsApp Web protocol)
2. **Receives** messages in real-time and stores them in Supabase
3. **Sends** messages through the connected WhatsApp account
4. **Manages** contacts with automatic syncing and manual customization
5. **Updates** the frontend in real-time using Socket.io
6. **Persists** session data for automatic reconnection

The entire system is designed to provide a seamless WhatsApp CRM experience with proper contact management, conversation tracking, and real-time messaging capabilities.

---

*Document generated on: January 26, 2026*
*App Version: 1.0.0*
