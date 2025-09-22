# Requirements — MVP
_Last updated: 2025-09-22_

## Purpose
Capture functional and non-functional requirements for the MVP system. For scope and goals, see [prd.md](./prd.md).

---

## 1. Functional Requirements

### Signup & Profiles
- Collect subscriber email + address.  
- Enrich address to derive ZIP + OCD IDs (district, county, state).  
- Store in `subscribers` and `profiles`.  
- Provide unsubscribe and preference management.  

### Content Import
- Admin can upload CSV/XLSX where **row = full email variant**.  
- Required columns: `content_id`, `email_subject`, `title`, `body_markdown`.  
- Optional: `subtitle`, `byline`, `tags`, `send_after`.  
- Support `scope_value` column for targeting by OCD ID (or left blank for global).  
- Idempotency: dedupe by `content_id`.  

### Metrics Import
- Admin can upload CSV for ZIP-level data.  
- Stored in generic `geo_metrics` table: `(geo_type, geo_id, as_of, metrics jsonb)`.  
- MVP: only `geo_type=zip` enabled.  
- CSV must include `geo_id` column (`zip`). All other columns stored as `metrics`.  
- Import is upsert on `(geo_type, geo_id, as_of)`.  

### Send Pipeline
- Admin triggers a send.  
- For each subscriber:  
  - Select best content row (scope match → fallback).  
  - Expand tokens in `body_markdown`.  
  - Render HTML + plain text with header/footer/unsubscribe.  
  - Send via SendGrid.  
  - Record delivery in `delivery_history`.  
- Ensure idempotency: no duplicate sends for same `content_id + subscriber_id`.  

### Token Expansion
- MVP tokens:  
  - `[[DELEGATION]]` → US Rep + 2 Senators with contacts.  
  - `[[ZIP_STATS]]` → compact block with subscriber ZIP metrics.  
  - `[[ZIP.<field>]]` → value from metrics.  
- Future tokens: `[[COUNTY_STATS]]`, `[[CITY_STATS]]`, `[[DISTRICT_STATS]]`.  

### Test Sends
- Admin can send preview to selected addresses.  
- Can simulate as specific subscriber (token expansion).  

### Delivery Logging
- Record status in `delivery_history`: queued, sent, failed.  
- Record provider message id, error if any.  

### Admin Access
- Simple admin gate (env var or allowed email list).  
- Admin can:  
  - Upload content.  
  - Upload metrics.  
  - Trigger sends.  
  - Run test sends.  

---

## 2. Non-Functional Requirements
- **Compliance**: CAN-SPAM, unsubscribe, privacy.  
- **Idempotency**: Prevent duplicate sends, duplicate imports.  
- **Performance**: Preload unique metrics per batch for speed.  
- **Extensibility**: Schema supports new `geo_type` without migration.  
- **Observability**: Logs for imports, sends, expansions, errors.  

---

## 3. Out of Scope (MVP)
- Multi-article layouts.  
- Analytics dashboards.  
- Multi-tenant customer accounts.  
- Non-ZIP metrics (county, city, district) — schema supports but not enabled.  

---
