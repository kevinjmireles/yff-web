-- Signup Health Check Queries
-- Purpose: Verify signup functionality and data integrity
-- Run these in Supabase SQL Editor or via psql

-- 1. Latest signups (confirm zipcode + ocd_ids length)
select 
  email, 
  zipcode, 
  array_length(ocd_ids,1) as n_ids, 
  created_at
from profiles
order by created_at desc
limit 10;

-- 2. Confirm unique(email) constraint and no duplicates
select 
  email, 
  count(*) as duplicate_count
from profiles
group by email
having count(*) > 1;

-- 3. Enrichment success rate (last 24 hours)
select 
  count(*) as total_signups,
  count(case when array_length(ocd_ids, 1) > 0 then 1 end) as enriched_signups,
  round(
    100.0 * count(case when array_length(ocd_ids, 1) > 0 then 1 end) / count(*), 
    1
  ) as enrichment_rate_percent
from profiles
where created_at >= now() - interval '24 hours';

-- 4. Geographic distribution (top zipcodes)
select 
  zipcode,
  count(*) as signups,
  avg(array_length(ocd_ids, 1)) as avg_districts
from profiles
where zipcode is not null
group by zipcode
order by signups desc
limit 10;

-- 5. OCD ID distribution (verify realistic district counts)
select 
  array_length(ocd_ids, 1) as district_count,
  count(*) as profiles_with_this_count
from profiles
where ocd_ids is not null
group by array_length(ocd_ids, 1)
order by district_count;

-- Expected results:
-- Query 1: Should show recent signups with zipcode and n_ids > 0
-- Query 2: Should return no rows (no duplicates)
-- Query 3: Should show high enrichment rate (>90% if API working)
-- Query 4: Should show realistic zipcode distribution
-- Query 5: Should show district counts typically 5-12 per profile
