create table if not exists public.unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  list_key text not null default 'general',
  reason text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_unsubscribes_email_list
  on public.unsubscribes (email, list_key);
