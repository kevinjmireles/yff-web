
# Post-Deploy Edge Checks — v2.1
_Last updated: 2025-09-22_

Use this runbook immediately after deployment to verify the system end-to-end.

## 1) Schema Checks (SQL)
```sql
-- profiles exists + indexes
SELECT 1 FROM information_schema.tables WHERE table_name='profiles';
-- content_items exists
SELECT 1 FROM information_schema.tables WHERE table_name='content_items';
-- geo_metrics exists
SELECT 1 FROM information_schema.tables WHERE table_name='geo_metrics';
-- officials + official_contacts exist
SELECT 1 FROM information_schema.tables WHERE table_name='officials';
SELECT 1 FROM information_schema.tables WHERE table_name='official_contacts';
-- delivery_history exists
SELECT 1 FROM information_schema.tables WHERE table_name='delivery_history';
```

## 2) Seed/Insert Probes (Non-Prod)
```sql
-- Insert a demo ZIP metric (safe if already present)
INSERT INTO public.geo_metrics(geo_type, geo_id, as_of, metrics)
VALUES ('zip','90604','2025-09-01','{"hazard_flag":"high","hazard_notes":"Demo row"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Insert a demo content row
INSERT INTO public.content_items(content_id,email_subject,title,body_markdown,scope_value)
VALUES ('demo-zip-001','Demo subject','Demo title','Local status: [[ZIP.hazard_flag]]\nDetails: [[ZIP.hazard_notes]]', NULL);

-- Create a demo profile
INSERT INTO public.profiles(email,address,zipcode,ocd_ids)
VALUES ('demo+90604@example.com','123 Main St, Whittier, CA 90604','90604','{}'::text[])
ON CONFLICT (email) DO NOTHING;
```

## 3) API Checks
- Upload a tiny **ZIP CSV** with headers: `zip,as_of,hazard_flag,hazard_notes` and one row for `90604`.  
- Upload a **content CSV** with one row using the tokens above.  
- Call **Preview** for `demo+90604@example.com` and verify tokens expand.

## 4) Send Check
- Trigger a **test send** to yourself for the demo profile.  
- Confirm: subject, title, body token expansion, unsubscribe link.

## 5) Logs & Events
- Verify a new row in `delivery_history` with `status='sent'` (or 'queued' → 'sent').  
- If SendGrid webhooks are wired, check `provider_events` received within a few minutes.

## 6) V2.1 Targeting Checks
- `select to_regclass('public.geo_metrics')` and `to_regclass('public.v_subscriber_geo')` are not null.
- Random `content_items` row with `metadata->>'audience_rule'` is preserved after Promote.
- In staging env: create a tiny dataset with `state == 'OH'` and verify at least one OH subscriber is matched in preview.

## 7) Rollback Plan
- Keep the prior release DB snapshot around for 24–48h.  
- If critical, revert to snapshot and disable new imports temporarily.
