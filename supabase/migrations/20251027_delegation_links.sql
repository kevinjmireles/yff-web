-- Phase 1: Delegation links table
-- Single source of truth for delegation URLs
-- Enables idempotent upsert by (email, job_id)

create table if not exists public.delegation_links (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  url text not null,
  batch_id uuid,
  job_id uuid not null,
  created_at timestamptz not null default now()
);

-- one link per (email, job) – enables idempotent upsert
create unique index if not exists delegation_links_email_job_uniq
  on public.delegation_links (email, job_id);

create index if not exists delegation_links_email_created_idx
  on public.delegation_links (email, created_at desc);

-- RLS: service role only
alter table public.delegation_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='delegation_links'
      and policyname='Service role only (delegation_links)'
  ) then
    create policy "Service role only (delegation_links)"
    on public.delegation_links
    for all to service_role
    using (true) with check (true);
  end if;
end $$;
