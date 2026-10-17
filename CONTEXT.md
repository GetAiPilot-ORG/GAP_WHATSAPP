# GAP WhatsApp Domain

Multi-tenant WhatsApp communication platform supporting automated conversational flows, AI bot agents, shared team inboxes, and high-throughput broadcast campaigns across dual transport protocols.

## Language

**Account**:
A connected WhatsApp phone number identity, operating via either Meta Cloud API (WABA) or a Baileys Web socket session.
_Avoid_: Channel, phone line, connection

**Organization**:
A tenant workspace that owns accounts, team members, contacts, conversations, and billing subscriptions.
_Avoid_: Company, workspace, tenant

**Contact**:
An external WhatsApp user identified by a verified phone number or JID, associated with an organization.
_Avoid_: Lead, customer, subscriber, recipient (except within campaigns)

**Conversation**:
A unified 1:1 or group communication thread between an organization's account and a contact.
_Avoid_: Chat, thread, room, ticket

**Message**:
A discrete inbound or outbound piece of content (text, media, interactive buttons, list, template, reaction) within a conversation.
_Avoid_: Bubble, packet, payload

**Transport**:
The underlying wire protocol mechanism (Meta Cloud API Graph endpoint or Baileys WebSocket connection) used to deliver or receive messages.
_Avoid_: Carrier, provider, driver

**Flow Session**:
The active runtime state of a contact progressing through an automated visual flow graph.
_Avoid_: Bot session, flow state, sequence

**Campaign**:
A bulk broadcast transmission targeting a segment of contacts with an approved template message.
_Avoid_: Blast, broadcast job, batch send
