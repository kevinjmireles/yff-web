-- delivery_history: dedupe + delivery status
create table if not exists public.delivery_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.send_jobs(id) on delete set null,
  dataset_id uuid references public.content_datasets(id) on delete set null,
  batch_id uuid,
  email text not null,
  status text not null check (status in ('queued','delivered','failed','bounced','opened','clicked')),
  provider_message_id text null,
  error text null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

-- One dataset per recipient, ever (MVP rule)
create unique index if not exists idx_delivery_history_dataset_email
  on public.delivery_history (dataset_id, email);

-- Idempotency for provider callbacks
create unique index if not exists idx_delivery_history_provider_msg
  on public.delivery_history (provider_message_id)
  where provider_message_id is not null;

create unique index if not exists idx_delivery_history_composite
  on public.delivery_history (job_id, batch_id, email, status)
  where provider_message_id is null;

create index if not exists idx_delivery_history_job on public.delivery_history (job_id);
create index if not exists idx_delivery_history_email on public.delivery_history (email);

