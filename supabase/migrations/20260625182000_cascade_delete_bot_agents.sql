-- Migration to allow deletion of bot agents by adding ON DELETE SET NULL to referencing foreign keys.

-- Drop existing constraints
alter table public.w_messages drop constraint if exists w_messages_bot_agent_id_fkey;
alter table public.w_conversations drop constraint if exists w_conversations_active_bot_agent_id_fkey;
alter table public.w_conversations drop constraint if exists w_conversations_assigned_bot_id_fkey;

-- Re-create constraints with ON DELETE SET NULL
alter table public.w_messages
  add constraint w_messages_bot_agent_id_fkey
  foreign key (bot_agent_id) references public.bot_agents(id)
  on delete set null;

alter table public.w_conversations
  add constraint w_conversations_active_bot_agent_id_fkey
  foreign key (active_bot_agent_id) references public.bot_agents(id)
  on delete set null;

alter table public.w_conversations
  add constraint w_conversations_assigned_bot_id_fkey
  foreign key (assigned_bot_id) references public.bot_agents(id)
  on delete set null;
