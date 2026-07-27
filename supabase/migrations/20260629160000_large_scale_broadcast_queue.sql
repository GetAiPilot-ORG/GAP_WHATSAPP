 n -- Durable, multi-tenant broadcast processing for campaigns up to 10K recipients.
-- Workers use the service role; authenticated users receive read-only, tenant-scoped access.

alter table public.w_campaigns
  add column if not exists schema_version integer not null default 1,
  add column if not exists audience_type text,
  add column if not exists prepared_count integer not null default 0,
  add column if not exists queued_count integer not null default 0,
  add column if not exists processing_count integer not null default 0,
  add column if not exists accepted_count integer not null default 0,
  add column if not exists delivered_count integer not null default 0,
  add column if not exists read_count integer not null default 0,
  add column if not exists cancelled_count integer not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_progress_at timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists queue_error text;

alter table public.organizations
  add column if not exists broadcasts_paused boolean not null default false;
alter table public.w_wa_accounts
  add column if not exists broadcasts_paused boolean not null default false;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.w_campaigns'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%processing%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.w_campaigns drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.w_campaigns
  add constraint w_campaigns_status_check
  check (status in (
    'draft', 'preparing', 'queued', 'processing', 'pausing', 'paused',
    'cancelling', 'cancelled', 'completed', 'failed', 'scheduled'
  ));

create unique index if not exists uq_w_campaigns_org_idempotency
  on public.w_campaigns(organization_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_w_campaigns_queue
  on public.w_campaigns(status, scheduled_at, created_at);

create table if not exists public.w_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.w_campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wa_account_id uuid not null references public.w_wa_accounts(id) on delete cascade,
  contact_id uuid references public.w_contacts(id) on delete set null,
  normalized_phone text not null,
  contact_name text,
  frozen_variables jsonb not null default '{}'::jsonb,
  rendered_payload jsonb not null default '{}'::jsonb,
  status text not null default 'prepared'
    check (status in (
      'prepared', 'queued', 'processing', 'retrying', 'accepted',
      'sent', 'delivered', 'read', 'failed', 'cancelled'
    )),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  wa_message_id text,
  meta_request_id text,
  error_class text,
  error_code text,
  error_message text,
  retry_after timestamptz,
  billing_category text
    check (billing_category is null or billing_category in ('marketing', 'utility', 'authentication', 'service')),
  reserved_paise bigint not null default 0,
  settled_paise bigint not null default 0,
  refunded_paise bigint not null default 0,
  billing_status text not null default 'pending'
    check (billing_status in ('pending', 'reserved', 'settled', 'released', 'refunded', 'free', 'failed')),
  queued_at timestamptz,
  processing_started_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, normalized_phone)
);

create unique index if not exists uq_w_campaign_recipients_wa_message
  on public.w_campaign_recipients(wa_message_id)
  where wa_message_id is not null;
create index if not exists idx_w_campaign_recipients_campaign_status
  on public.w_campaign_recipients(campaign_id, status, created_at);
create index if not exists idx_w_campaign_recipients_dispatch
  on public.w_campaign_recipients(wa_account_id, status, retry_after, created_at);
create index if not exists idx_w_campaign_recipients_org_phone
  on public.w_campaign_recipients(organization_id, normalized_phone);

alter table public.whatsapp_wallet_transactions
  add column if not exists idempotency_key text;
create unique index if not exists uq_whatsapp_wallet_tx_idempotency
  on public.whatsapp_wallet_transactions(idempotency_key)
  where idempotency_key is not null;

-- Existing check constraints differ across installations. Extend the transaction vocabulary safely.
do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.whatsapp_wallet_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%type%'
    and pg_get_constraintdef(oid) ilike '%message_debit%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.whatsapp_wallet_transactions drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.whatsapp_wallet_transactions
  add constraint whatsapp_wallet_transactions_type_check
  check (type in (
    'recharge', 'message_debit', 'refund', 'adjustment', 'failed_debit',
    'campaign_reserve', 'campaign_release', 'campaign_settlement'
  ));

alter table public.w_campaign_recipients enable row level security;

drop policy if exists "Org members can read campaign recipients" on public.w_campaign_recipients;
create policy "Org members can read campaign recipients"
  on public.w_campaign_recipients for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid())
    )
  );

grant select on public.w_campaign_recipients to authenticated;
grant select, insert, update, delete on public.w_campaign_recipients to service_role;

-- Reserve estimated campaign spend under a row lock. The wallet's visible balance becomes
-- the available balance; the campaign keeps the reserved amount until settle/release.
create or replace function public.reserve_broadcast_campaign(
  p_campaign_id uuid,
  p_amount_paise bigint,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.w_campaigns%rowtype;
  v_balance bigint;
begin
  if p_amount_paise < 0 then
    raise exception 'Reservation amount cannot be negative';
  end if;

  select * into v_campaign
  from public.w_campaigns
  where id = p_campaign_id
  for update;
  if not found then raise exception 'Campaign not found'; end if;

  if v_campaign.billing_status in ('reserved', 'charging', 'charged') then
    return jsonb_build_object('reserved', true, 'amount_paise', v_campaign.wallet_reserved_paise);
  end if;

  select balance_paise into v_balance
  from public.whatsapp_wallets
  where organization_id = v_campaign.organization_id
  for update;

  if v_balance is null or v_balance < p_amount_paise then
    update public.w_campaigns
      set billing_status = 'insufficient_balance', queue_error = 'Insufficient wallet balance'
      where id = p_campaign_id;
    return jsonb_build_object('reserved', false, 'available_paise', coalesce(v_balance, 0));
  end if;

  update public.whatsapp_wallets
    set balance_paise = balance_paise - p_amount_paise, updated_at = now()
    where organization_id = v_campaign.organization_id;

  insert into public.whatsapp_wallet_transactions (
    organization_id, type, amount_paise, balance_after_paise, currency,
    status, reference_type, reference_id, description, metadata, idempotency_key
  ) values (
    v_campaign.organization_id, 'campaign_reserve', -p_amount_paise,
    v_balance - p_amount_paise, 'INR', 'completed', 'broadcast',
    p_campaign_id::text, 'Broadcast campaign wallet reservation',
    jsonb_build_object('campaign_id', p_campaign_id), p_idempotency_key
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;

  update public.w_campaigns
    set wallet_reserved_paise = p_amount_paise,
        estimated_cost_paise = p_amount_paise,
        billing_status = 'reserved',
        last_progress_at = now()
    where id = p_campaign_id;
  update public.w_campaign_recipients
    set billing_status = case when reserved_paise = 0 then 'free' else 'reserved' end,
        updated_at = now()
    where campaign_id = p_campaign_id and billing_status = 'pending';

  return jsonb_build_object('reserved', true, 'amount_paise', p_amount_paise);
end;
$$;

create or replace function public.settle_broadcast_recipient(
  p_recipient_id uuid,
  p_wa_message_id text,
  p_meta_request_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient public.w_campaign_recipients%rowtype;
begin
  select * into v_recipient
  from public.w_campaign_recipients
  where id = p_recipient_id
  for update;
  if not found then return false; end if;
  if v_recipient.status in ('accepted', 'sent', 'delivered', 'read') then return true; end if;
  if v_recipient.status <> 'processing' then return false; end if;

  update public.w_campaign_recipients
    set status = 'accepted', wa_message_id = p_wa_message_id,
        meta_request_id = p_meta_request_id, accepted_at = now(), updated_at = now(),
        billing_status = case when reserved_paise = 0 then 'free' else 'settled' end,
        settled_paise = reserved_paise
    where id = p_recipient_id;

  update public.w_campaigns
    set processing_count = greatest(processing_count - 1, 0),
        accepted_count = accepted_count + 1,
        sent_count = sent_count + 1,
        wallet_reserved_paise = greatest(wallet_reserved_paise - v_recipient.reserved_paise, 0),
        actual_cost_paise = actual_cost_paise + v_recipient.reserved_paise,
        last_progress_at = now()
    where id = v_recipient.campaign_id;
  return true;
end;
$$;

create or replace function public.release_broadcast_recipient(
  p_recipient_id uuid,
  p_status text,
  p_error_class text default null,
  p_error_code text default null,
  p_error_message text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient public.w_campaign_recipients%rowtype;
  v_balance bigint;
  v_release_amount bigint;
begin
  if p_status not in ('failed', 'cancelled') then
    raise exception 'Invalid terminal release status';
  end if;
  select * into v_recipient from public.w_campaign_recipients where id = p_recipient_id for update;
  if not found then return false; end if;
  if v_recipient.status in ('failed', 'cancelled', 'accepted', 'sent', 'delivered', 'read') then return true; end if;

  v_release_amount := case when v_recipient.billing_status = 'reserved' then v_recipient.reserved_paise else 0 end;
  update public.whatsapp_wallets
    set balance_paise = balance_paise + v_release_amount, updated_at = now()
    where organization_id = v_recipient.organization_id
    returning balance_paise into v_balance;

  insert into public.whatsapp_wallet_transactions (
    organization_id, type, amount_paise, balance_after_paise, currency,
    status, reference_type, reference_id, description, metadata, idempotency_key
  ) values (
    v_recipient.organization_id, 'campaign_release', v_release_amount,
    v_balance, 'INR', 'completed', 'broadcast', v_recipient.campaign_id::text,
    'Release unused campaign reservation',
    jsonb_build_object('campaign_id', v_recipient.campaign_id, 'recipient_id', p_recipient_id),
    'broadcast-release-' || p_recipient_id::text
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;

  update public.w_campaign_recipients
    set status = p_status, error_class = p_error_class, error_code = p_error_code,
        error_message = p_error_message, billing_status = 'released',
        failed_at = case when p_status = 'failed' then now() else failed_at end,
        cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
        updated_at = now()
    where id = p_recipient_id;

  update public.w_campaigns
    set queued_count = greatest(queued_count - case when v_recipient.status in ('prepared','queued','retrying') then 1 else 0 end, 0),
        processing_count = greatest(processing_count - case when v_recipient.status = 'processing' then 1 else 0 end, 0),
        failed_count = failed_count + case when p_status = 'failed' then 1 else 0 end,
        cancelled_count = cancelled_count + case when p_status = 'cancelled' then 1 else 0 end,
        wallet_reserved_paise = greatest(wallet_reserved_paise - v_recipient.reserved_paise, 0),
        last_progress_at = now()
    where id = v_recipient.campaign_id;
  return true;
end;
$$;

create or replace function public.claim_broadcast_recipient(p_recipient_id uuid)
returns setof public.w_campaign_recipients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  update public.w_campaign_recipients
    set status = 'processing', processing_started_at = now(),
        attempt_count = attempt_count + 1, updated_at = now()
    where id = p_recipient_id and status in ('queued', 'retrying')
    returning campaign_id into v_campaign_id;
  if v_campaign_id is null then return; end if;
  update public.w_campaigns
    set queued_count = greatest(queued_count - 1, 0),
        processing_count = processing_count + 1,
        last_progress_at = now()
    where id = v_campaign_id;
  return query select * from public.w_campaign_recipients where id = p_recipient_id;
end;
$$;

create or replace function public.retry_broadcast_recipient(
  p_recipient_id uuid,
  p_error_class text,
  p_error_code text,
  p_error_message text,
  p_retry_after timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  update public.w_campaign_recipients
    set status = 'retrying', error_class = p_error_class, error_code = p_error_code,
        error_message = p_error_message, retry_after = p_retry_after, updated_at = now()
    where id = p_recipient_id and status = 'processing'
    returning campaign_id into v_campaign_id;
  if v_campaign_id is null then return false; end if;
  update public.w_campaigns
    set processing_count = greatest(processing_count - 1, 0), last_progress_at = now()
    where id = v_campaign_id;
  return true;
end;
$$;

create or replace function public.update_broadcast_recipient_delivery(
  p_wa_message_id text,
  p_status text,
  p_error_message text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient public.w_campaign_recipients%rowtype;
  v_new_status text;
  v_balance bigint;
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return null; end if;
  select * into v_recipient
  from public.w_campaign_recipients
  where wa_message_id = p_wa_message_id
  for update;
  if not found then return null; end if;

  if p_status = 'failed' and v_recipient.status not in ('failed', 'cancelled') then
    update public.whatsapp_wallets
      set balance_paise = balance_paise + greatest(v_recipient.settled_paise - v_recipient.refunded_paise, 0),
          updated_at = now()
      where organization_id = v_recipient.organization_id
      returning balance_paise into v_balance;
    insert into public.whatsapp_wallet_transactions (
      organization_id, type, amount_paise, balance_after_paise, currency, status,
      reference_type, reference_id, description, metadata, idempotency_key
    ) values (
      v_recipient.organization_id, 'refund',
      greatest(v_recipient.settled_paise - v_recipient.refunded_paise, 0),
      v_balance, 'INR', 'completed', 'broadcast', v_recipient.campaign_id::text,
      'Refund asynchronously failed broadcast message',
      jsonb_build_object('campaign_id', v_recipient.campaign_id, 'recipient_id', v_recipient.id),
      'broadcast-refund-' || v_recipient.id::text
    ) on conflict (idempotency_key) where idempotency_key is not null do nothing;

    update public.w_campaign_recipients
      set status = 'failed', error_class = 'meta_delivery', error_message = p_error_message,
          failed_at = now(), billing_status = 'refunded',
          refunded_paise = settled_paise, updated_at = now()
      where id = v_recipient.id;
    update public.w_campaigns
      set failed_count = failed_count + 1,
          actual_cost_paise = greatest(actual_cost_paise - v_recipient.settled_paise, 0),
          last_progress_at = now()
      where id = v_recipient.campaign_id;
    return v_recipient.id;
  end if;

  if v_recipient.status in ('failed', 'cancelled', 'read') then return v_recipient.id; end if;
  v_new_status := case
    when p_status = 'read' then 'read'
    when p_status = 'delivered' and v_recipient.status <> 'read' then 'delivered'
    when p_status = 'sent' and v_recipient.status in ('accepted', 'sent') then 'sent'
    else v_recipient.status
  end;

  update public.w_campaign_recipients
    set status = v_new_status,
        delivered_at = case when p_status = 'delivered' and delivered_at is null then now() else delivered_at end,
        read_at = case when p_status = 'read' and read_at is null then now() else read_at end,
        updated_at = now()
    where id = v_recipient.id;

  update public.w_campaigns
    set delivered_count = delivered_count + case when p_status = 'delivered' and v_recipient.delivered_at is null then 1 else 0 end,
        read_count = read_count + case when p_status = 'read' and v_recipient.read_at is null then 1 else 0 end,
        last_progress_at = now()
    where id = v_recipient.campaign_id;
  return v_recipient.id;
end;
$$;

revoke all on function public.reserve_broadcast_campaign(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.settle_broadcast_recipient(uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_broadcast_recipient(uuid) from public, anon, authenticated;
revoke all on function public.retry_broadcast_recipient(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.release_broadcast_recipient(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_broadcast_recipient_delivery(text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_broadcast_campaign(uuid, bigint, text) to service_role;
grant execute on function public.settle_broadcast_recipient(uuid, text, text) to service_role;
grant execute on function public.claim_broadcast_recipient(uuid) to service_role;
grant execute on function public.retry_broadcast_recipient(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.release_broadcast_recipient(uuid, text, text, text, text) to service_role;
grant execute on function public.update_broadcast_recipient_delivery(text, text, text) to service_role;
