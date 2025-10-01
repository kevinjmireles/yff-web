# Overall Plan (v2.1)

_Last updated: 2025-09-22_

## Purpose
Provide a high-level view of the MVP architecture and workflow, showing how signup, content import, metrics import, sending, and personalization all connect.

---

## 1. Architecture Overview
**Core components:**
- **Signup & Profiles**  
  - Subscribers captured with email + address.  
  - Address enriched → ZIP + OCD IDs (district, county, state).  
  - Stored in `subscribers` and `profiles`.  

- **Content Import**  
  - Admin uploads CSV/XLSX (row = one complete email).  
  - Stored in `content_items`.  
  - Each row may target a specific `scope_value` (OCD ID) or global fallback.  

- **Metrics Import**  
  - Admin uploads CSV of metrics (e.g., hazards, income).  
  - Stored in `geo_metrics` table.  
  - MVP: only `geo_type=zip`. Future: county, city, district, state.  
  - Arbitrary fields stored in `metrics` JSONB.  

- **Send Pipeline**  
  - Admin triggers send.  
  - System selects best-matching content row for each subscriber.  
  - Expands tokens (`[[DELEGATION]]`, `[[ZIP_STATS]]`, `[[ZIP.<field>]]`).  
  - Renders email, applies template, logs delivery, and sends via provider (SendGrid).  

---

## 2. Workflow

## Flow (Phase 1)
1) Upload CSV in `/admin/content` (columns: dataset_name,row_uid,subject,body_md,ocd_scope, **audience_rule?**).
2) Make.com → `v2_content_items_staging` + `ingest_runs` (no parsing of rules).
3) Operator clicks **Promote** → `promote_dataset_v2(dataset_id)` → upsert into `v2_content_items`.
4) Operator creates **Send Job** → `/api/send/run` expands recipients:
   - If `metadata.audience_rule` → translate to SQL on `v_subscriber_geo`.
   - Else use `ocd_scope` fallback.
   - Write attempts to `delivery_attempts (user_id, content_item_id)` with dedupe.
5) (Later) Add Vercel Cron every 10 minutes as a bounded sweep.

## Why this is simple
- `audience_rule` lives as a plain string (author-facing), parsed only in the send path.
- `geo_metrics` is append-only + idempotent; we can backfill safely from existing data.
- We keep Make thin; DB constraints + Promote RPC enforce correctness.

---

## 3. Data Model (Simplified)
- **profiles**: user_id, email, address, ocd_ids[], zipcode.
- **geo_metrics**: user_id, metric_key, metric_value.
- **v2_content_items**: dataset_id, row_uid, subject, body_md, ocd_scope, metadata (for audience_rule).
- **send_jobs**: links a dataset to a send operation.
- **delivery_attempts**: tracks sends per user and content item.
- **officials** + **official_contacts**: used for delegation tokens.

---

## 4. Token System
- **Delegation**:  
  - `[[DELEGATION]]` → subscriber’s congressional delegation (1 Rep + 2 Senators).  

- **ZIP metrics**:  
  - `[[ZIP_STATS]]` → compact block with fields from metrics.  
  - `[[ZIP.<field>]]` → single field lookup.  

- **Future-ready**:  
  - Support for county/city/district metrics via same `geo_metrics` table.  
  - Token prefixes mapped to `geo_type` (e.g. `[[COUNTY_STATS]]`).  

---

## 5. Fallback Hierarchy
- Content rows: district/city/county → state → country → global (blank scope).  
- Metrics: if missing, token omitted or neutral fallback inserted.  

---

## 6. Success Criteria (MVP)
- Subscribers can sign up and receive personalized emails.  
- Admins can import content + ZIP metrics.  
- Delegation and ZIP tokens expand correctly.  
- Unsubscribe flow works.  
- At least one pilot campaign sent successfully.  

---

## 7. Future Extensions
- Enable new `geo_type` in metrics (county, city, districts).  
- Partner attribution (`partner_id`) for reporting.  
- Multi-article layouts.  
- Automated scheduling (cron jobs).  
- Analytics dashboard.  

