-- Post-migration validation checks
select to_regclass('public.geo_metrics'),
       to_regclass('public.v_subscriber_geo'),
       to_regclass('public.v_recipients'),
       to_regclass('public.v2_content_items'),
       to_regclass('public.v2_content_items_staging'),
       to_regclass('public.send_jobs'),
       to_regclass('public.delivery_attempts'),
       to_regclass('public.rate_limit_hits');

-- Dedupe invariant in place
select indexname from pg_indexes
where tablename='delivery_attempts' and indexname='uniq_delivery_once';
