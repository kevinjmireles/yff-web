-- YFF V2.1 Consolidated SQL Patch
-- Run this in Supabase SQL Editor to create all tables, policies, and indexes

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================

create table if not exists profiles (
  user_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  address text,
  zipcode text,
  ocd_ids text[] default '{}',
  ocd_last_verified_at timestamptz,
  created_at timestamptz default now()
);

-- RLS Policies for Profiles
alter table profiles enable row level security;

-- Only authenticated owner can read/update (if exposed from client)
create policy "profiles_owner_read"
  on profiles for select
  using (auth.uid() = user_id);

create policy "profiles_owner_update"
  on profiles for update
  using (auth.uid() = user_id);

-- Indexes
create unique index if not exists idx_profiles_email_unique on profiles (email);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(user_id) on delete cascade,
  list_key text not null default 'general',
  unsubscribed_at timestamptz
);

-- RLS Policies for Subscriptions
alter table subscriptions enable row level security;

create policy "subscriptions_owner_read"
  on subscriptions for select
  using (auth.uid() = user_id);

create policy "subscriptions_owner_upsert"
  on subscriptions for insert with check (auth.uid() = user_id)
  to authenticated;

-- Indexes
create unique index if not exists idx_subscriptions_unique on subscriptions (user_id, list_key);

-- ============================================================================
-- CONTENT SLICES TABLE
-- ============================================================================

create table if not exists content_slices (
  id uuid primary key default gen_random_uuid(),
  article_key text not null,                -- groups slices into one article
  section_order int not null default 1,     -- vertical order within article
  is_headline boolean default false,        -- scoped headline (optional, V2-friendly)
  title text,
  dek text,
  body_md text,                             -- markdown allowed
  link_url text,
  scope_ocd_id text,                        -- null = global (applies to everyone)
  tags text[] default '{}',
  publish_status text not null default 'draft',  -- draft|published|archived
  publish_at timestamptz,
  expires_at timestamptz,
  sort_index int default 0,
  created_at timestamptz default now()
);

-- RLS: Service role access only (no public access)
alter table content_slices enable row level security;
create policy "content_service_only" on content_slices for all using (false);

-- Indexes
create index if not exists idx_content_slices_article_key on content_slices(article_key);
create index if not exists idx_content_slices_scope_ocd on content_slices(scope_ocd_id);

-- Idempotent key for upserts
create unique index if not exists idx_content_key
  on content_slices (article_key, section_order, coalesce(scope_ocd_id,''), sort_index);

-- ============================================================================
-- DELIVERY TABLES
-- ============================================================================

create table if not exists delivery_history (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  campaign_tag text not null,
  send_batch_id text not null,              -- idempotency token
  provider_message_id text,                 -- from SendGrid
  sent_at timestamptz default now()
);

create table if not exists delivery_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event_type text not null,                 -- delivered|open|click|bounce|spamreport|unsubscribe
  provider_message_id text,
  event_at timestamptz default now()
);

-- RLS: Service role access only (no public access)
alter table delivery_history enable row level security;
alter table delivery_events enable row level security;
create policy "delivery_service_only_history" on delivery_history for all using (false);
create policy "delivery_service_only_events" on delivery_events for all using (false);

-- Indexes
create unique index if not exists idx_delivery_dedupe
  on delivery_history (email, campaign_tag, send_batch_id);
create index if not exists idx_delivery_events_email_type
  on delivery_events (email, event_type);

-- ============================================================================
-- OPTIONAL TABLES (for advanced features)
-- ============================================================================

-- Dead letters table for failed operations
create table if not exists dead_letters (
  id uuid primary key default gen_random_uuid(),
  topic text not null,           -- e.g., 'send'
  payload jsonb not null,
  error text not null,
  created_at timestamptz default now()
);

-- Campaign runs audit trail
create table if not exists campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_tag text not null,
  article_key text not null,
  actor text not null,           -- email/subject of admin
  send_batch_id text not null,
  started_at timestamptz default now()
);

-- Health pings for monitoring
create table if not exists health_pings (
  id uuid primary key default gen_random_uuid(),
  service text not null,         -- 'make', 'edge-function', etc.
  status text not null,          -- 'ok', 'error'
  details jsonb,
  created_at timestamptz default now()
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check that all tables exist
select table_name, table_type 
from information_schema.tables 
where table_schema = 'public' 
and table_name in ('profiles', 'subscriptions', 'content_slices', 'delivery_history', 'delivery_events')
order by table_name;

-- Check RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual
from pg_policies 
where schemaname = 'public'
order by tablename, policyname;

-- Check indexes
select schemaname, tablename, indexname, indexdef
from pg_indexes 
where schemaname = 'public'
and tablename in ('profiles', 'subscriptions', 'content_slices', 'delivery_history', 'delivery_events')
order by tablename, indexname;
