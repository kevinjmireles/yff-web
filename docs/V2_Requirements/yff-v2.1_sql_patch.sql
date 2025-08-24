-- YFF V2.1 — Consolidated SQL (Corrected Policy Syntax)
-- Safe to run multiple times; uses IF NOT EXISTS and DROP POLICY IF EXISTS where helpful.

-- Recommended in Supabase (usually enabled already)
create extension if not exists pgcrypto;

-- =========================
-- PROFILES & SUBSCRIPTIONS
-- =========================

create table if not exists profiles (
  user_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  address text,
  zipcode text,
  ocd_ids text[] default '{}'::text[],
  ocd_last_verified_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  list_key text not null default 'general',
  unsubscribed_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, list_key)
);

-- Enable RLS
alter table profiles enable row level security;
alter table subscriptions enable row level security;

-- Clean up any previous policies to avoid duplicates / bad syntax
drop policy if exists profiles_owner_read   on profiles;
drop policy if exists profiles_owner_update on profiles;
drop policy if exists subscriptions_owner_read   on subscriptions;
drop policy if exists subscriptions_owner_insert on subscriptions;
drop policy if exists subscriptions_owner_update on subscriptions;

-- Owner-only (if ever exposed from client). Service role bypasses RLS.
create policy profiles_owner_read
on profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy profiles_owner_update
on profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy subscriptions_owner_read
on subscriptions
for select
to authenticated
using (auth.uid() = user_id);

create policy subscriptions_owner_insert
on subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy subscriptions_owner_update
on subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =========================
-- CONTENT SLICES (service-only)
-- =========================

create table if not exists content_slices (
  id uuid primary key default gen_random_uuid(),
  article_key text not null,
  section_order int not null default 1,
  is_headline boolean default false,
  title text,
  dek text,
  body_md text,
  link_url text,
  scope_ocd_id text,
  tags text[] default '{}'::text[],
  publish_status text not null default 'draft',  -- draft|published|archived
  publish_at timestamptz,
  expires_at timestamptz,
  sort_index int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_slices_article on content_slices(article_key);
create index if not exists idx_slices_scope  on content_slices(scope_ocd_id);

alter table content_slices enable row level security;
drop policy if exists content_service_only on content_slices;
create policy content_service_only
on content_slices
for all
using (false);

-- Idempotent composite key for importer
create unique index if not exists idx_slice_dedupe
  on content_slices (article_key, section_order, coalesce(scope_ocd_id,''), sort_index);

-- =========================
-- DELIVERY (service-only)
-- =========================

create table if not exists delivery_history (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  campaign_tag text not null,
  send_batch_id text not null,              -- idempotency token
  provider_message_id text,                 -- from SendGrid
  sent_at timestamptz default now(),
  unique (provider_message_id),
  unique (email, campaign_tag, send_batch_id)
);

create table if not exists delivery_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event_type text not null,                 -- delivered|open|click|bounce|spamreport|unsubscribe
  provider_message_id text,
  event_at timestamptz default now()
);

alter table delivery_history enable row level security;
alter table delivery_events  enable row level security;

drop policy if exists hist_service_only on delivery_history;
drop policy if exists ev_service_only   on delivery_events;

create policy hist_service_only
on delivery_history
for all
using (false);

create policy ev_service_only
on delivery_events
for all
using (false);

-- =========================
-- AUDIT & DEAD LETTERS (service-only)
-- =========================

create table if not exists campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_tag text not null,
  article_key text not null,
  actor text not null,           -- admin identity/email
  send_batch_id text not null,
  started_at timestamptz default now()
);

create table if not exists dead_letters (
  id uuid primary key default gen_random_uuid(),
  topic text not null,           -- e.g., 'send'
  payload jsonb not null,
  error text not null,
  created_at timestamptz default now()
);

alter table campaign_runs enable row level security;
alter table dead_letters  enable row level security;

drop policy if exists runs_service_only on campaign_runs;
drop policy if exists dead_service_only on dead_letters;

create policy runs_service_only
on campaign_runs
for all
using (false);

create policy dead_service_only
on dead_letters
for all
using (false);
