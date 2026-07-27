-- WhatsApp clean structure migration.
-- Purpose: make message ownership, bot/human handoff, summaries, and notes explicit for n8n.
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- 1) Conversations: one clear place for assignment, bot state, handoff state, and latest summary.
alter table public.w_conversations
  add column if not exists assigned_to uuid,
  add column if not exists assigned_agent_id uuid,
  add column if not exists active_bot_agent_id uuid,
  add column if not exists bot_enabled boolean not null default true,
  add column if not exists assigned_bot_id uuid,
  add column if not exists handoff_status text not null default 'bot_active',
  add column if not exists handoff_reason text,
  add column if not exists handoff_requested_at timestamp with time zone,
  add column if not exists handoff_by_message_id uuid,
  add column if not exists last_customer_message_id uuid,
  add column if not exists last_bot_message_id uuid,
  add column if not exists last_human_message_id uuid,
  add column if not exists summary_status text not null default 'not_started',
  add column if not exists latest_summary_id uuid;

-- Keep old UI column and clean column in sync for now.
update public.w_conversations
set assigned_agent_id = coalesce(assigned_agent_id, assigned_to)
where assigned_agent_id is null
  and assigned_to is not null;

update public.w_conversations
set assigned_to = coalesce(assigned_to, assigned_agent_id)
where assigned_to is null
  and assigned_agent_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_conversations_handoff_status_check') then
    alter table public.w_conversations
      add constraint w_conversations_handoff_status_check
      check (handoff_status in ('bot_active', 'handoff_requested', 'human_active', 'closed'))
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'w_conversations_summary_status_check') then
    alter table public.w_conversations
      add constraint w_conversations_summary_status_check
      check (summary_status in ('not_started', 'pending', 'ready', 'failed'))
      not valid;
  end if;
end $$;

-- 2) Messages: explicit sender identity. Do not depend on content JSON for analytics/n8n.
alter table public.w_messages
  add column if not exists sender_type text,
  add column if not exists sender_user_id uuid,
  add column if not exists bot_agent_id uuid,
  add column if not exists is_bot_reply boolean not null default false,
  add column if not exists is_internal_note boolean not null default false,
  add column if not exists automation_source text,
  add column if not exists handoff_triggered boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.w_messages
set
  is_bot_reply = true,
  bot_agent_id = case
    when content->>'bot_agent_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (content->>'bot_agent_id')::uuid
    else bot_agent_id
  end,
  automation_source = coalesce(automation_source, case when content @> '{"is_flow": true}'::jsonb then 'flow' else 'ai_agent' end)
where
  direction = 'outbound'
  and (
    coalesce(is_bot_reply, false) = true
    or content @> '{"is_flow": true}'::jsonb
    or content ? 'bot_agent_id'
    or content ? 'is_bot_reply'
  );

update public.w_messages
set sender_type = case
  when is_internal_note = true then 'system'
  when direction = 'inbound' then 'customer'
  when is_bot_reply = true or bot_agent_id is not null then 'ai_agent'
  when direction = 'outbound' then 'human_agent'
  else 'system'
end
where sender_type is null;

alter table public.w_messages
  alter column sender_type set default 'customer';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_messages_sender_type_check') then
    alter table public.w_messages
      add constraint w_messages_sender_type_check
      check (sender_type in ('customer', 'human_agent', 'ai_agent', 'system'))
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'w_messages_automation_source_check') then
    alter table public.w_messages
      add constraint w_messages_automation_source_check
      check (automation_source is null or automation_source in ('flow', 'ai_agent', 'broadcast', 'manual', 'webhook', 'n8n', 'system'))
      not valid;
  end if;
end $$;

-- 3) n8n summary table: one row per generated handoff/refresh summary.
create table if not exists public.w_conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null references public.w_conversations(id) on delete cascade,
  summary_text text not null,
  customer_intent text,
  customer_stage text,
  lead_quality text,
  next_best_action text,
  open_questions jsonb not null default '[]'::jsonb,
  important_facts jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  products_discussed jsonb not null default '[]'::jsonb,
  summary_from_message_id uuid,
  summary_to_message_id uuid,
  generated_by text not null default 'n8n',
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

-- 4) Notes table: human notes and n8n/AI handoff notes stay separate from WhatsApp messages.
create table if not exists public.w_conversation_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null references public.w_conversations(id) on delete cascade,
  note_type text not null default 'human_note',
  body text not null,
  created_by_user_id uuid,
  created_by_bot_agent_id uuid,
  source text not null default 'human',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_conversation_notes_note_type_check') then
    alter table public.w_conversation_notes
      add constraint w_conversation_notes_note_type_check
      check (note_type in ('human_note', 'ai_summary', 'handoff_note', 'system_note'))
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'w_conversation_notes_source_check') then
    alter table public.w_conversation_notes
      add constraint w_conversation_notes_source_check
      check (source in ('human', 'n8n', 'ai_agent', 'system'))
      not valid;
  end if;
end $$;

-- 5) Helpful indexes for n8n + LiveChat.
create index if not exists idx_w_messages_conversation_created
  on public.w_messages(conversation_id, created_at);

create index if not exists idx_w_messages_sender_type
  on public.w_messages(conversation_id, sender_type, created_at);

create index if not exists idx_w_messages_bot_agent
  on public.w_messages(bot_agent_id)
  where bot_agent_id is not null;

create index if not exists idx_w_messages_sender_user
  on public.w_messages(sender_user_id)
  where sender_user_id is not null;

create index if not exists idx_w_conversations_assignment
  on public.w_conversations(organization_id, assigned_agent_id, last_message_at desc);

create index if not exists idx_w_conversations_handoff
  on public.w_conversations(organization_id, handoff_status, last_message_at desc);

create index if not exists idx_w_conversation_summaries_conversation_created
  on public.w_conversation_summaries(conversation_id, created_at desc);

create index if not exists idx_w_conversation_notes_conversation_created
  on public.w_conversation_notes(conversation_id, created_at desc);

-- 6) Foreign keys added as NOT VALID so existing messy data does not block the cleanup.
do $$
begin
  -- Always ensure bot_agents foreign keys have ON DELETE SET NULL to allow agent deletion
  alter table public.w_messages drop constraint if exists w_messages_bot_agent_id_fkey;
  alter table public.w_messages
    add constraint w_messages_bot_agent_id_fkey
    foreign key (bot_agent_id) references public.bot_agents(id)
    on delete set null
    not valid;

  alter table public.w_conversations drop constraint if exists w_conversations_active_bot_agent_id_fkey;
  alter table public.w_conversations
    add constraint w_conversations_active_bot_agent_id_fkey
    foreign key (active_bot_agent_id) references public.bot_agents(id)
    on delete set null
    not valid;

  alter table public.w_conversations drop constraint if exists w_conversations_assigned_bot_id_fkey;
  alter table public.w_conversations
    add constraint w_conversations_assigned_bot_id_fkey
    foreign key (assigned_bot_id) references public.bot_agents(id)
    on delete set null
    not valid;

  if not exists (select 1 from pg_constraint where conname = 'w_conversations_latest_summary_id_fkey') then
    alter table public.w_conversations
      add constraint w_conversations_latest_summary_id_fkey
      foreign key (latest_summary_id) references public.w_conversation_summaries(id)
      not valid;
  end if;
end $$;

comment on column public.w_messages.sender_type is 'Who created the message: customer, human_agent, ai_agent, or system.';
comment on column public.w_messages.sender_user_id is 'Human sales/support agent user id when sender_type = human_agent.';
comment on column public.w_messages.bot_agent_id is 'AI bot id when sender_type = ai_agent.';
comment on table public.w_conversation_summaries is 'n8n/AI generated conversation summaries for sales handoff.';
comment on table public.w_conversation_notes is 'Private notes and handoff notes; not WhatsApp messages.';
