-- Production-grade subscription plan change support.
-- Additive only: keeps existing WhatsApp billing/payment flows intact.

alter table public.whatsapp_subscription_plans
  add column if not exists plan_rank integer not null default 0;

update public.whatsapp_subscription_plans
set plan_rank = case id
  when 'starter' then 10
  when 'growth' then 20
  when 'pro' then 30
  when 'enterprise' then 40
  else coalesce(plan_rank, sort_order, 0)
end;

alter table public.organizations
  add column if not exists scheduled_plan_id text,
  add column if not exists scheduled_change_type text
    check (scheduled_change_type is null or scheduled_change_type in ('downgrade', 'cancel')),
  add column if not exists scheduled_effective_at timestamptz,
  add column if not exists scheduled_change_requested_at timestamptz,
  add column if not exists scheduled_change_metadata jsonb not null default '{}'::jsonb;

alter table public.app_user_subscriptions
  add column if not exists status text not null default 'active'
    check (status in ('active', 'past_due', 'scheduled_downgrade', 'canceled')),
  add column if not exists billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'yearly')),
  add column if not exists scheduled_plan_id text,
  add column if not exists scheduled_change_type text
    check (scheduled_change_type is null or scheduled_change_type in ('downgrade', 'cancel')),
  add column if not exists scheduled_effective_at timestamptz,
  add column if not exists scheduled_change_requested_at timestamptz,
  add column if not exists scheduled_change_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  subscription_user_id uuid references public.app_user_subscriptions(user_id) on delete set null,
  type text not null check (type in ('new_subscription', 'renewal', 'upgrade', 'adjustment')),
  status text not null default 'draft' check (status in ('draft', 'pending_payment', 'paid', 'failed', 'void')),
  current_plan_id text,
  target_plan_id text not null,
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'yearly')),
  period_start timestamptz,
  period_end timestamptz,
  subtotal_paise bigint not null default 0 check (subtotal_paise >= 0),
  credit_applied_paise bigint not null default 0 check (credit_applied_paise >= 0),
  total_paise bigint not null default 0 check (total_paise >= 0),
  currency text not null default 'INR',
  idempotency_key text not null unique,
  gateway text,
  gateway_payment_link_id text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.subscription_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  invoice_id uuid references public.subscription_invoices(id) on delete set null,
  type text not null check (type in ('unused_plan_credit', 'applied_to_invoice', 'manual_adjustment')),
  amount_paise bigint not null,
  balance_after_paise bigint,
  currency text not null default 'INR',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.subscription_invoices(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  gateway text not null default 'razorpay',
  gateway_order_id text,
  gateway_payment_id text,
  gateway_payment_link_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  amount_paise bigint not null default 0,
  currency text not null default 'INR',
  idempotency_key text not null unique,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_payments
  add column if not exists invoice_id uuid references public.subscription_invoices(id) on delete set null,
  add column if not exists change_type text
    check (change_type is null or change_type in ('new_subscription', 'upgrade')),
  add column if not exists idempotency_key text;

create unique index if not exists idx_whatsapp_payments_idempotency_key
  on public.whatsapp_payments(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_subscription_invoices_user_created
  on public.subscription_invoices(user_id, created_at desc);

create index if not exists idx_subscription_invoices_org_created
  on public.subscription_invoices(organization_id, created_at desc)
  where organization_id is not null;

create index if not exists idx_subscription_credit_ledger_user_created
  on public.subscription_credit_ledger(user_id, created_at desc);

create index if not exists idx_subscription_payment_transactions_invoice
  on public.subscription_payment_transactions(invoice_id);

alter table public.subscription_invoices enable row level security;
alter table public.subscription_credit_ledger enable row level security;
alter table public.subscription_payment_transactions enable row level security;

drop policy if exists "Users can view own subscription invoices" on public.subscription_invoices;
create policy "Users can view own subscription invoices"
  on public.subscription_invoices for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = subscription_invoices.organization_id
        and om.user_id = (select auth.uid())
        and coalesce(om.is_active, true) = true
    )
  );

drop policy if exists "Users can view own subscription credit ledger" on public.subscription_credit_ledger;
create policy "Users can view own subscription credit ledger"
  on public.subscription_credit_ledger for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = subscription_credit_ledger.organization_id
        and om.user_id = (select auth.uid())
        and coalesce(om.is_active, true) = true
    )
  );

drop policy if exists "Users can view own subscription payment transactions" on public.subscription_payment_transactions;
create policy "Users can view own subscription payment transactions"
  on public.subscription_payment_transactions for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = subscription_payment_transactions.organization_id
        and om.user_id = (select auth.uid())
        and coalesce(om.is_active, true) = true
    )
  );
