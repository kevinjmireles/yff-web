-- Signup optimization migrations
-- Purpose: Add performance indexes and admin monitoring views
-- Safe to run multiple times

-- Email index for fast profile lookups (if not exists)
create index if not exists idx_profiles_email on profiles(email);

-- OCD IDs array length index for analytics
create index if not exists idx_profiles_ocd_length on profiles(array_length(ocd_ids, 1)) 
where ocd_ids is not null;

-- Recent signups index for monitoring
create index if not exists idx_profiles_created_at on profiles(created_at desc);

-- Admin monitoring view for recent signups
create or replace view v_recent_signups as
select 
  email,
  address,
  zipcode,
  array_length(ocd_ids, 1) as n_ids,
  ocd_last_verified_at,
  created_at
from profiles
order by created_at desc;

-- Admin view for signup analytics
create or replace view v_signup_analytics as
select 
  date_trunc('day', created_at) as signup_date,
  count(*) as signups,
  count(case when array_length(ocd_ids, 1) > 0 then 1 end) as enriched_signups,
  avg(array_length(ocd_ids, 1)) as avg_districts,
  count(distinct zipcode) as unique_zipcodes
from profiles
where created_at >= current_date - interval '30 days'
group by date_trunc('day', created_at)
order by signup_date desc;

-- Comment the tables for better documentation
comment on table profiles is 'User profiles with address enrichment from Google Civic API';
comment on column profiles.ocd_ids is 'Open Civic Data IDs from Google Civic divisionsByAddress endpoint';
comment on column profiles.ocd_last_verified_at is 'Last time OCD IDs were refreshed from Civic API';

comment on table subscriptions is 'Email subscription preferences by list type';
comment on column subscriptions.list_key is 'Subscription list identifier (e.g., general, alerts)';
comment on column subscriptions.unsubscribed_at is 'When user unsubscribed (null = active)';

comment on view v_recent_signups is 'Admin view: Recent signups with district count for monitoring';
comment on view v_signup_analytics is 'Admin view: Daily signup analytics with enrichment success rates';
