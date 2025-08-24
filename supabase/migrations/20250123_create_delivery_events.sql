-- Migration: Create delivery_events table
-- Date: 2025-01-23
-- Purpose: Standardize ESP events into normalized table structure

-- 1. Create clean delivery_events table (idempotent)
create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event_type text not null,          -- delivered | open | click | bounce | spamreport | unsubscribe
  provider_message_id text,          -- ESP message id
  event_at timestamptz default now()
);

-- 2. Create index for efficient email + event_type queries
create index if not exists idx_delivery_events_email_type
  on public.delivery_events (email, event_type);

-- 3. Enable RLS and set up security policies
alter table public.delivery_events enable row level security;

-- Drop any existing policies to ensure clean state
drop policy if exists "delivery_events_read" on public.delivery_events;
drop policy if exists "delivery_events_write" on public.delivery_events;

-- Note: No explicit policies needed - service role (bypasses RLS) will be used by Edge functions
-- Anonymous users will have no access by default

-- 4. Optional: Check if provider_events exists and create legacy view
-- This will only execute if provider_events table exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'provider_events') then
    
    -- Check if provider_events has mappable columns
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'provider_events' 
      and column_name in ('email', 'event', 'sg_event', 'sg_message_id', 'timestamp')
    ) then
      
      -- Create legacy view for backward compatibility
      create or replace view public.delivery_events_legacy as
      select
        gen_random_uuid() as id,
        email,
        coalesce(event, sg_event)::text as event_type,
        sg_message_id as provider_message_id,
        case
          when pg_typeof("timestamp")::text = 'timestamp with time zone' then "timestamp"
          else to_timestamp(nullif("timestamp"::text, '')::double precision)
        end at time zone 'utc' as event_at
      from public.provider_events;
      
      raise notice 'Created legacy view delivery_events_legacy for backward compatibility';
    else
      raise notice 'provider_events table exists but lacks required columns for legacy view';
    end if;
  else
    raise notice 'No provider_events table found - skipping legacy view creation';
  end if;
end $$;

-- 5. Insert test data to verify table works
insert into public.delivery_events (email, event_type, provider_message_id)
values ('test@example.com', 'delivered', 'sg-test-123')
on conflict do nothing;

-- 6. Verify table structure
comment on table public.delivery_events is 'Normalized events from ESP (delivered, open, click, bounce, spamreport, unsubscribe)';
comment on column public.delivery_events.email is 'Recipient email address';
comment on column public.delivery_events.event_type is 'Type of delivery event';
comment on column public.delivery_events.provider_message_id is 'ESP message identifier';
comment on column public.delivery_events.event_at is 'Timestamp when event occurred';
