-- Local cache/audit trail for WhatsApp template submissions and Meta status webhooks.

create table if not exists public.w_template_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wa_account_id uuid references public.w_wa_accounts(id) on delete set null,
  waba_id text,
  template_id text,
  name text not null,
  language text not null default 'en_US',
  category text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  status text not null default 'PENDING',
  quality_score text,
  rejection_reason text,
  components jsonb not null default '[]'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  validation_issues jsonb not null default '[]'::jsonb,
  risk_score integer not null default 0,
  meta_response jsonb not null default '{}'::jsonb,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, wa_account_id, name, language)
);

create index if not exists idx_w_template_submissions_org_status
  on public.w_template_submissions(organization_id, status, updated_at desc);

create index if not exists idx_w_template_submissions_template_id
  on public.w_template_submissions(template_id)
  where template_id is not null;

alter table public.w_template_submissions enable row level security;

drop policy if exists "Org members can read own template submissions" on public.w_template_submissions;
create policy "Org members can read own template submissions"
  on public.w_template_submissions for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = w_template_submissions.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )
  );
