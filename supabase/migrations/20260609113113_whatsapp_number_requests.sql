-- Assisted new WhatsApp business number requests.
-- Users request a fresh/dedicated number; the operations team handles sourcing and official Meta onboarding support.

create table if not exists public.whatsapp_number_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  business_name text not null,
  country text not null default 'India',
  preferred_region text,
  use_case text not null,
  expected_monthly_messages integer check (expected_monthly_messages is null or expected_monthly_messages >= 0),
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'requested'
    check (status in ('requested', 'in_review', 'number_arranged', 'meta_onboarding_pending', 'connected', 'cancelled')),
  admin_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_number_requests_org_created
  on public.whatsapp_number_requests(organization_id, created_at desc);

create index if not exists idx_whatsapp_number_requests_status
  on public.whatsapp_number_requests(status, created_at desc);

alter table public.whatsapp_number_requests enable row level security;

drop policy if exists "Org members can read own whatsapp number requests" on public.whatsapp_number_requests;
create policy "Org members can read own whatsapp number requests"
  on public.whatsapp_number_requests for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = whatsapp_number_requests.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )
  );

grant select, insert, update on public.whatsapp_number_requests to authenticated;
