-- ============================================================================
-- V2.1 CONSOLIDATED (add-only) SCHEMA: geo metrics + content v2 + send engine
-- Canonical user: profiles.user_id (we ignore subscribers entirely).
-- ============================================================================

-- ---------- Geo metrics (keyed to profiles.user_id) -------------------------
create table if not exists geo_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  metric_key text not null,            -- 'state' | 'county_fips' | 'place' | ...
  metric_value text not null,          -- 'OH' | '39049' | 'columbus,oh'
  source text default 'resolver',
  effective_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index if not exists uq_geo_metrics
  on geo_metrics(user_id, metric_key, metric_value);
create index if not exists idx_geo_metrics_key on geo_metrics(metric_key);
create index if not exists idx_geo_metrics_val on geo_metrics(metric_value);

create or replace view v_subscriber_geo as
select
  user_id,
  max(metric_value) filter (where metric_key='state')       as state,
  max(metric_value) filter (where metric_key='county_fips') as county_fips,
  max(metric_value) filter (where metric_key='place')       as place
from geo_metrics
group by user_id;

create or replace view v_recipients as
select
  p.user_id,
  p.email,
  p.address,
  p.zipcode,
  p.ocd_ids
from profiles p;

-- ---------- Content ingest (v2 to avoid collisions with existing tables) ----
-- We reuse existing content_datasets(id); its status semantics remain unchanged.
create table if not exists v2_content_items (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references content_datasets(id) on delete cascade,
  row_uid text not null,                      -- idempotency key within dataset
  subject text,
  body_md text,
  ocd_scope text,                             -- 'us' | 'state:oh' | 'county:franklin,oh' | 'place:columbus,oh'
  metadata jsonb default '{}'::jsonb,         -- may contain { audience_rule: "state == 'OH'" }
  created_at timestamptz not null default now()
);
create unique index if not exists v2_uniq_content_row on v2_content_items(dataset_id, row_uid);

create table if not exists v2_content_items_staging (like v2_content_items including all);

-- Optional: runs table for operator visibility
create table if not exists ingest_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references content_datasets(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running|succeeded|failed
  total_rows int default 0,
  inserted int default 0,
  updated int default 0,
  failed int default 0,
  error_sample text
);

-- Idempotent promotion from staging -> final
create or replace function promote_dataset_v2(p_dataset uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into v2_content_items as ci (id, dataset_id, row_uid, subject, body_md, ocd_scope, metadata, created_at)
  select gen_random_uuid(), s.dataset_id, s.row_uid, s.subject, s.body_md, s.ocd_scope, coalesce(s.metadata, '{}'::jsonb), now()
  from v2_content_items_staging s
  where s.dataset_id = p_dataset
  on conflict (dataset_id, row_uid) do update
    set subject   = excluded.subject,
        body_md   = excluded.body_md,
        ocd_scope = excluded.ocd_scope,
        metadata  = excluded.metadata;
end;
$$;

-- ---------- Send engine (keyed to profiles.user_id; dedupe enforced) --------
create table if not exists send_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references content_datasets(id) on delete restrict,
  created_by uuid,
  status text not null default 'pending', -- pending|running|completed|failed
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  totals jsonb default '{}'::jsonb
);

create table if not exists delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  send_job_id uuid not null references send_jobs(id) on delete cascade,
  user_id uuid not null references profiles(user_id),
  content_item_id uuid not null references v2_content_items(id),
  status text not null default 'queued', -- preview|queued|sent|bounced|failed|skipped
  message_id text,
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists uniq_delivery_once on delivery_attempts(user_id, content_item_id);
create index if not exists idx_delivery_status on delivery_attempts(status);

-- ---------- Rate limiting naming consistency (hits vs counters) -------------
-- If rate_limit_counters already exists (legacy), expose a compatibility VIEW
-- named rate_limit_hits. Otherwise, create the hits table.
do $$
begin
  if to_regclass('public.rate_limit_hits') is null then
    if to_regclass('public.rate_limit_counters') is not null then
      execute $v$
        create or replace view rate_limit_hits as
        select key, bucket_start, count from rate_limit_counters
      $v$;
    else
      execute $v$
        create table rate_limit_hits (
          key text not null,
          bucket_start timestamptz not null,
          count integer not null default 1,
          primary key (key, bucket_start)
        )
      $v$;
    end if;
  end if;
end$$;

