create table if not exists public.w_onboarding_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    wa_account_id uuid null references public.w_wa_accounts(id) on delete set null,
    event_name text not null check (char_length(event_name) between 1 and 80),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists w_onboarding_events_user_created_idx
    on public.w_onboarding_events (user_id, created_at desc);

create index if not exists w_onboarding_events_event_created_idx
    on public.w_onboarding_events (event_name, created_at desc);

alter table public.w_onboarding_events enable row level security;

drop policy if exists "Users can record their onboarding events" on public.w_onboarding_events;
create policy "Users can record their onboarding events"
    on public.w_onboarding_events
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can read their onboarding events" on public.w_onboarding_events;
create policy "Users can read their onboarding events"
    on public.w_onboarding_events
    for select
    to authenticated
    using (auth.uid() = user_id);
