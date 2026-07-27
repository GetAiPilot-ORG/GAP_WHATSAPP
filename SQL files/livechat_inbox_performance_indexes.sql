-- LiveChat inbox indexes.
-- Additive and safe to run repeatedly. Run outside peak traffic on very large tables;
-- Supabase's SQL editor transaction does not support CREATE INDEX CONCURRENTLY.

create index if not exists idx_w_conversations_org_last_message
  on public.w_conversations (organization_id, last_message_at desc, id desc);

create index if not exists idx_w_conversations_org_agent_last_message
  on public.w_conversations (organization_id, assigned_agent_id, last_message_at desc, id desc);

create index if not exists idx_w_messages_conversation_unread_inbound
  on public.w_messages (conversation_id, status)
  where direction in ('inbound', 'in') and status <> 'read';

create index if not exists idx_w_conversation_reads_user_conversation
  on public.w_conversation_reads (user_id, conversation_id);

create index if not exists idx_w_wa_accounts_org_active_created
  on public.w_wa_accounts (organization_id, created_at desc)
  where status <> 'disconnected';
