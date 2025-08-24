# Handoff Notes — Your Friend Fido
Last updated: 2025-08-23  
Owner: Kevin Mireles  

This doc explains how to run, deploy, and extend the system.

---

## 1. Environments
- **Vercel (Next.js web app)**  
  - Env vars:  
    - NEXT_PUBLIC_BASE_URL  
    - SUPABASE_URL  
    - SUPABASE_ANON_KEY  
    - NEXT_PUBLIC_RECAPTCHA_SITE_KEY  

- **Supabase (Edge Functions + DB)**  
  - Env vars:  
    - SUPABASE_SERVICE_ROLE_KEY (server-only)  
    - SENDGRID_WEBHOOK_SECRET (optional)  

- **Make.com**  
  - Requires: Supabase API key + SendGrid API key  

- **SendGrid**  
  - Requires: API key + verified sender domain  

---

## 2. Key Components

### Next.js app
- `/app/page.tsx`: signup form  
- `/app/preferences/page.tsx`: manage subscriptions  
- `/app/unsubscribe/page.tsx`: unsubscribe UX  
- `/app/admin/campaigns/page.tsx`: admin send trigger  

### Supabase Edge Functions
- `/unsubscribe`: sets `subscriptions.unsubscribed_at`  
- `/ingest-sendgrid`: maps events → `delivery_events`  
- `/log-delivery`: logs campaign sends  

---

## 3. Database Schema
- `profiles` — stores users (email, address, consent)  
- `subscriptions` — tracks list membership/unsubscribes  
- `audience_members` — campaign targeting (upserted via Make; unique email+campaign_tag)  
- `delivery_history` — log of sends  
- `delivery_events` — bounces, opens, clicks, unsubscribes  

---

## 4. Make.com Scenarios
- **#1 CSV Import → Upsert Audience** (dedupe, upsert)  
- **#2 Campaign Send** (admin trigger, OCD filters)  
- **#3 Test Send** (to test_recipients only)  
- **#4 SendGrid Events → Supabase** (map events → delivery_events)  
- **#5 Suppression Sync (Optional)** (daily suppression list from SendGrid)  

---

## 5. Ops Runbook
- **Daily**: Check Make scenario runs; review delivery_events anomalies  
- **Before send**: Generate new send_batch_id; test send to yourself; confirm suppression prefiltering  
- **Weekly**: Export delivery summary; check unsubscribe/bounce rates  
- **Quarterly**: Rotate API keys; review RLS rules  

---

## 6. Compliance Notes
- Email footer must include: unsubscribe link + physical mailing address (CAN-SPAM).  
- Privacy Policy: no sale of data, unsubscribe rights, retention policy.  
- Terms of Service: disclaimer that information is “reliable but not guaranteed.”  

---

## 7. Future Enhancements
- Templating/preview in admin UI  
- Multi-tenant customer support  
- BI dashboards from Supabase  

---

## 8. References
- **[V2.1 Signup & Enrichment](../V2_Requirements/yff-v2.1-01-signup.md)** - Complete signup flow specification
- **[V2.1 Content Import](../V2_Requirements/yff-v2.1-02-content-import.md)** - CSV import and validation system
- **[V2.1 Assembly & Send](../V2_Requirements/yff-v2.1-03-send.md)** - Newsletter assembly and delivery engine
- **[V2.1 Overall Plan](../V2_Requirements/yff-v2.1-04-overall-plan.md)** - Complete architecture and implementation guide
- **[V2.1 SQL Patch](../V2_Requirements/yff-v2.1_sql_patch.sql)** - Database schema and RLS policies
