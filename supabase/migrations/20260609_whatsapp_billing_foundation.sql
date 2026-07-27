-- Billing foundation for WhatsApp subscriptions, wallet, and message usage.
-- Platform subscription is separate from WhatsApp/Meta message spend.

create table if not exists public.whatsapp_subscription_plans (
  id text primary key,
  name text not null,
  description text not null,
  monthly_price_paise bigint not null default 0,
  yearly_price_paise bigint,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_rate_cards (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'IN',
  currency text not null default 'INR',
  category text not null check (category in ('marketing', 'utility', 'authentication', 'service')),
  rate_paise bigint not null default 0,
  pass_through_rate_paise bigint not null default 0,
  markup_paise bigint not null default 0,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, currency, category, effective_from)
);

create table if not exists public.whatsapp_wallets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  currency text not null default 'INR',
  low_balance_threshold_paise bigint not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('recharge', 'message_debit', 'refund', 'adjustment', 'failed_debit')),
  amount_paise bigint not null,
  balance_after_paise bigint,
  currency text not null default 'INR',
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  reference_type text,
  reference_id text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_message_usage_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wa_account_id uuid references public.w_wa_accounts(id) on delete set null,
  campaign_id uuid references public.w_campaigns(id) on delete set null,
  conversation_id uuid references public.w_conversations(id) on delete set null,
  contact_id uuid references public.w_contacts(id) on delete set null,
  message_id uuid references public.w_messages(id) on delete set null,
  wa_message_id text,
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  source text check (source is null or source in ('manual', 'broadcast', 'flow', 'ai_agent', 'webhook', 'system')),
  category text not null check (category in ('marketing', 'utility', 'authentication', 'service')),
  template_name text,
  recipient_country text default 'IN',
  rate_paise bigint not null default 0,
  meta_cost_paise bigint not null default 0,
  markup_paise bigint not null default 0,
  charged_amount_paise bigint not null default 0,
  billable boolean not null default true,
  billing_status text not null default 'estimated' check (billing_status in ('estimated', 'charged', 'refunded', 'free', 'failed')),
  delivery_status text,
  delivered_at timestamptz,
  wallet_transaction_id uuid references public.whatsapp_wallet_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_usage_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_date date not null,
  category text not null check (category in ('marketing', 'utility', 'authentication', 'service')),
  message_count integer not null default 0,
  charged_amount_paise bigint not null default 0,
  meta_cost_paise bigint not null default 0,
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, usage_date, category)
);

alter table public.w_campaigns
  add column if not exists billing_category text
    check (billing_category is null or billing_category in ('marketing', 'utility', 'authentication', 'service')),
  add column if not exists estimated_cost_paise bigint not null default 0,
  add column if not exists actual_cost_paise bigint not null default 0,
  add column if not exists wallet_reserved_paise bigint not null default 0,
  add column if not exists billing_status text not null default 'not_started'
    check (billing_status in ('not_started', 'estimated', 'reserved', 'charging', 'charged', 'insufficient_balance', 'failed'));

alter table public.w_messages
  add column if not exists billing_category text
    check (billing_category is null or billing_category in ('marketing', 'utility', 'authentication', 'service')),
  add column if not exists billing_amount_paise bigint not null default 0,
  add column if not exists billing_status text
    check (billing_status is null or billing_status in ('free', 'estimated', 'charged', 'refunded', 'failed'));

create index if not exists idx_whatsapp_rate_cards_active
  on public.whatsapp_rate_cards(market, currency, category, effective_from desc)
  where is_active = true;

create index if not exists idx_whatsapp_wallet_transactions_org_created
  on public.whatsapp_wallet_transactions(organization_id, created_at desc);

create index if not exists idx_whatsapp_message_usage_org_created
  on public.whatsapp_message_usage_logs(organization_id, created_at desc);

create index if not exists idx_whatsapp_message_usage_category
  on public.whatsapp_message_usage_logs(organization_id, category, created_at desc);

create index if not exists idx_whatsapp_message_usage_campaign
  on public.whatsapp_message_usage_logs(campaign_id)
  where campaign_id is not null;

insert into public.whatsapp_subscription_plans
  (id, name, description, monthly_price_paise, yearly_price_paise, sort_order, limits, features)
values
  (
    'starter',
    'Starter',
    'Simple WhatsApp workspace for small shops and service businesses.',
    99900,
    999000,
    20,
    '{"numbers":1,"contacts":1000,"agents":1,"flows":5,"broadcasts_per_month":5,"templates":10,"ai_agents":1,"api_access":false,"webhooks":false}'::jsonb,
    '["1 WhatsApp number","1,000 contacts","5 automation flows","Manual broadcasts","Basic bot replies","Standard support"]'::jsonb
  ),
  (
    'growth',
    'Growth',
    'Best plan for growing teams running campaigns and customer support.',
    199900,
    1999000,
    30,
    '{"numbers":1,"contacts":10000,"agents":5,"flows":-1,"broadcasts_per_month":50,"templates":50,"ai_agents":3,"api_access":false,"webhooks":false}'::jsonb,
    '["10,000 contacts","5 agents included","Unlimited flows","Broadcast campaigns","Tags and attributes","Message spend dashboard","Basic analytics"]'::jsonb
  ),
  (
    'pro',
    'Pro',
    'Advanced automation, campaigns, AI agents, and reporting.',
    349900,
    3499000,
    40,
    '{"numbers":2,"contacts":50000,"agents":10,"flows":-1,"broadcasts_per_month":200,"templates":200,"ai_agents":10,"api_access":true,"webhooks":true}'::jsonb,
    '["2 WhatsApp numbers","50,000 contacts","10 agents included","Campaign scheduler","Advanced AI bot","Reports and CSV export","API and webhooks"]'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom scale, support, governance, and official API migration assistance.',
    0,
    0,
    50,
    '{"numbers":-1,"contacts":-1,"agents":-1,"flows":-1,"broadcasts_per_month":-1,"templates":-1,"ai_agents":-1,"api_access":true,"webhooks":true}'::jsonb,
    '["Custom limits","Multi-number setup","Dedicated support","SLA options","Custom integrations","Compliance reviews","Priority onboarding"]'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_paise = excluded.monthly_price_paise,
  yearly_price_paise = excluded.yearly_price_paise,
  sort_order = excluded.sort_order,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();

delete from public.whatsapp_subscription_plans
where id = 'free' or lower(name) = 'free';

insert into public.whatsapp_rate_cards
  (market, currency, category, rate_paise, pass_through_rate_paise, markup_paise, effective_from, notes)
values
  ('IN', 'INR', 'marketing', 88, 88, 0, '2026-06-09 00:00:00+00', 'Default India marketing template estimate. Keep synced with Meta rate cards.'),
  ('IN', 'INR', 'utility', 13, 13, 0, '2026-06-09 00:00:00+00', 'Default India utility template estimate. Utility replies inside customer window may be free.'),
  ('IN', 'INR', 'authentication', 13, 13, 0, '2026-06-09 00:00:00+00', 'Default India authentication template estimate.'),
  ('IN', 'INR', 'service', 0, 0, 0, '2026-06-09 00:00:00+00', 'Service messages inside the customer service window are shown as free.')
on conflict (market, currency, category, effective_from) do update set
  rate_paise = excluded.rate_paise,
  pass_through_rate_paise = excluded.pass_through_rate_paise,
  markup_paise = excluded.markup_paise,
  notes = excluded.notes,
  updated_at = now();

insert into public.whatsapp_wallets (organization_id, currency)
select id, 'INR'
from public.organizations
on conflict (organization_id) do nothing;

alter table public.whatsapp_subscription_plans enable row level security;
alter table public.whatsapp_rate_cards enable row level security;
alter table public.whatsapp_wallets enable row level security;
alter table public.whatsapp_wallet_transactions enable row level security;
alter table public.whatsapp_message_usage_logs enable row level security;
alter table public.whatsapp_usage_daily_summaries enable row level security;

drop policy if exists "Public can read active whatsapp plans" on public.whatsapp_subscription_plans;
create policy "Public can read active whatsapp plans"
  on public.whatsapp_subscription_plans for select
  using (is_active = true);

drop policy if exists "Public can read active whatsapp rate cards" on public.whatsapp_rate_cards;
create policy "Public can read active whatsapp rate cards"
  on public.whatsapp_rate_cards for select
  using (is_active = true);

drop policy if exists "Org members can read own whatsapp wallet" on public.whatsapp_wallets;
create policy "Org members can read own whatsapp wallet"
  on public.whatsapp_wallets for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = whatsapp_wallets.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )
  );

drop policy if exists "Org members can read own whatsapp wallet transactions" on public.whatsapp_wallet_transactions;
create policy "Org members can read own whatsapp wallet transactions"
  on public.whatsapp_wallet_transactions for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = whatsapp_wallet_transactions.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )
  );

drop policy if exists "Org members can read own whatsapp usage logs" on public.whatsapp_message_usage_logs;
create policy "Org members can read own whatsapp usage logs"
  on public.whatsapp_message_usage_logs for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = whatsapp_message_usage_logs.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )
  );

drop policy if exists "Org members can read own whatsapp usage summaries" on public.whatsapp_usage_daily_summaries;
create policy "Org members can read own whatsapp usage summaries"
  on public.whatsapp_usage_daily_summaries for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = whatsapp_usage_daily_summaries.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )
  );
