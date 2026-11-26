alter table public.w_wa_accounts
  add column if not exists offboarding_started_at timestamptz,
  add column if not exists meta_removal_confirmed_at timestamptz,
  add column if not exists meta_removal_confirmed_by uuid;

-- A fresh connection starts a new lifecycle. Stale health writes cannot
-- reactivate a number after its credentials have been removed.
create or replace function public.apply_wa_offboarding_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
     and old.offboarding_started_at is not null then
    raise exception 'This WhatsApp number has retained history in another workspace';
  end if;

  if old.offboarding_started_at is null and new.offboarding_started_at is not null then
    update public.w_campaigns
      set status = case when schema_version >= 2 then 'cancelling' else 'cancelled' end
      where wa_account_id = new.id and organization_id = new.organization_id
        and status in ('scheduled', 'preparing', 'queued', 'processing', 'pausing', 'paused');
  end if;

  if old.offboarding_started_at is not null then
    if new.status = 'connected' and new.access_token_encrypted is not null then
      new.offboarding_started_at := null;
      new.meta_removal_confirmed_at := null;
      new.meta_removal_confirmed_by := null;
    else
      new.status := 'disconnected';
      new.connection_status := 'DISCONNECTED';
      new.token_status := 'MISSING';
      new.has_access_token := false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists apply_wa_offboarding_state on public.w_wa_accounts;
create trigger apply_wa_offboarding_state before update on public.w_wa_accounts
for each row execute function public.apply_wa_offboarding_state();

-- Roll back a reservation if cancellation won the race for the campaign row.
create or replace function public.reject_cancelled_wa_campaign_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('cancelling', 'cancelled')
     and old.billing_status is distinct from 'reserved'
     and new.billing_status = 'reserved' then
    raise exception 'Cannot reserve funds for a cancelled WhatsApp broadcast';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_cancelled_wa_campaign_reservation on public.w_campaigns;
create trigger reject_cancelled_wa_campaign_reservation
before update of billing_status on public.w_campaigns
for each row execute function public.reject_cancelled_wa_campaign_reservation();
