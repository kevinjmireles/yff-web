-- Provider events for idempotent callbacks
create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.send_jobs(id) on delete set null,
  batch_id uuid,
  email text not null,
  status text not null check (status in ('delivered','failed')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

-- Idempotency
create unique index if not exists uq_provider_events_msg
  on public.provider_events (provider_message_id)
  where provider_message_id is not null;

create unique index if not exists uq_provider_events_fallback
  on public.provider_events (job_id, batch_id, email, status)
  where provider_message_id is null;

create index if not exists idx_provider_events_job on public.provider_events (job_id);
create index if not exists idx_provider_events_email on public.provider_events (email);
