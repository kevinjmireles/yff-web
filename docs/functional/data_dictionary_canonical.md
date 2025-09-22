
# Data Dictionary — Canonical (v2.1, MVP + Future-Ready)
_Last updated: 2025-09-22_  
Owner: Kevin Mireles

This is the **single source of truth** for our schema. It merges the prior data dictionary with the new personalization model.

---

## Conventions
- **Type**: Postgres types unless noted.
- **PK**: Primary key. **FK**: Foreign key.
- **RLS**: Row-Level Security policy notes.
- **Who writes**: Which component is the system of record.
- Timestamps are `timestamptz` unless noted.

---

## Profiles & Subscriptions

### `profiles` (source of truth for people)
Stores a user or subscriber record. Replaces the conceptual overlap with `subscribers`.
| Column | Type | Notes |
|---|---|---|
| user_id | uuid, PK, default gen_random_uuid() | |
| email | text, UNIQUE | |
| address | text | raw input |
| zipcode | text | 5-digit, padded |
| ocd_ids | text[] | enriched: country/state/county/city/cd/sldu/sldl as available |
| ocd_last_verified_at | timestamptz | enrichment freshness |
| created_at | timestamptz, default now() | |

**Indexes**: (email), (zipcode), GIN(ocd_ids)  
**Who writes**: signup API, enrichment worker  
**RLS**: admins only; potential per-partner scopes later

---

### `subscriptions`
Tracks list membership per profile.
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | |
| user_id | uuid, FK → profiles.user_id | |
| list_key | text, default 'general' | |
| unsubscribed_at | timestamptz | null = active |
| created_at | timestamptz, default now() | |

**Indexes**: (user_id, list_key unique)  
**Who writes**: preferences UI, unsubscribe handler  
**RLS**: admins; future partner scoping

---

## Content

### `content_items` (**row = complete email**)
Replaces `content_slices`. Each row is a fully renderable email variant.
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | |
| content_id | text | stable slug for dedupe/versioning |
| email_subject | text | inbox subject |
| title | text | headline |
| subtitle | text | optional dek |
| byline | text | optional |
| body_markdown | text | markdown with tokens |
| scope_value | text | OCD ID target; blank = global |
| send_after | timestamptz | optional schedule |
| tags | text | optional, comma-separated |
| status | text | 'ready'/'archived'/'error' (optional, default 'ready') |
| created_at | timestamptz, default now() | |
| updated_at | timestamptz, default now() | |

**Indexes**: (content_id), (scope_value), (status)  
**Who writes**: content importer  
**RLS**: admins; later per-partner

---

## Personalization Data

### `geo_metrics`
- user_id → profiles.user_id (FK)
- metric_key, metric_value, source, effective_at, created_at
- Unique: (user_id, metric_key, metric_value)
- Indexes: metric_key, metric_value

### `v_subscriber_geo` (view)
- user_id, state, county_fips, place (derived from `geo_metrics`)

### `v_recipients` (view)
- user_id, email, address, zipcode, ocd_ids (from `profiles`)

### `v2_content_items` / `v2_content_items_staging`
- dataset_id (FK → content_datasets), row_uid (unique with dataset), subject, body_md, ocd_scope, metadata (jsonb; may include `audience_rule`)

### `ingest_runs`
- dataset run metadata: status, totals, errors

### `send_jobs` / `delivery_attempts`
- `delivery_attempts` unique (user_id, content_item_id)

### `content_items` (update)
- `metadata` (jsonb) may include `audience_rule` (string).  
  **Precedence**: `audience_rule` > `ocd_scope`.
---

### `officials`
| Column | Type | Notes |
|---|---|---|
| official_id | uuid, PK, default gen_random_uuid() | |
| bioguide_id | text, UNIQUE | optional |
| full_name | text | |
| party | text | optional |
| office_type | text | 'us_senate' | 'us_house' |
| state | text | 2-letter |
| district | int | for US House |
| ocd_division_id | text | canonical |
| is_active | bool, default true | |
| openstates_id | text | optional |
| created_at | timestamptz, default now() | |

**Indexes**: (ocd_division_id), (office_type, state, district)  
**Who writes**: ingestion job (OpenStates/Congress data)  
**RLS**: admins only

---

### `official_contacts`
| Column | Type | Notes |
|---|---|---|
| contact_id | uuid, PK, default gen_random_uuid() | |
| official_id | uuid, FK → officials.official_id | |
| method | text | display_header|phone|webform|email|twitter|facebook|address |
| value | text | |
| is_active | bool, default true | |
| display_order | int | for grouped display |
| created_at | timestamptz, default now() | |

**Indexes**: (official_id, is_active, display_order)  
**Who writes**: ingestion job; manual overrides allowed  
**RLS**: admins only

---

## Sending & Events

### `delivery_history`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | |
| subscriber_id | uuid, FK → profiles.user_id | |
| content_id | text | |
| channel | text | 'email' | 'web' |
| batch_id | text | send identifier |
| status | text | 'queued'|'sent'|'failed' |
| provider_message_id | text | optional |
| error | text | optional |
| sent_at | timestamptz, default now() | |
| created_at | timestamptz, default now() | |
| updated_at | timestamptz, default now() | |

**Indexes**: (subscriber_id, content_id), (batch_id), (status)  
**Who writes**: send pipeline  
**RLS**: admins; future partner scoping

---

### `provider_events`
Raw provider payloads (e.g., SendGrid webhooks).
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | |
| provider | text, default 'sendgrid' | |
| received_at | timestamptz, default now() | |
| payload | jsonb | raw data |

**Indexes**: (provider, received_at)  
**Who writes**: provider webhook endpoint  
**RLS**: admins only

---

### `delivery_events` (optional/derived)
Flattened events for reporting.
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | |
| email | text | |
| event_type | text | delivered|open|click|bounce... |
| provider_message_id | text | |
| event_at | timestamptz, default now() | |

**Who writes**: ETL from `provider_events`  
**RLS**: admins only

---

### `campaign_runs` (optional, operational log)
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | |
| campaign_tag | text | |
| article_key | text | content_id alias |
| actor | text | user or system |
| send_batch_id | text | |
| started_at | timestamptz, default now() | |

**Who writes**: send trigger path  
**RLS**: admins only

---

## System Utilities

### `dead_letters`
Captures errors in background jobs (import, send, token expansion).
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | |
| topic | text | 'metrics_import'|'send'|'token_expansion'... |
| payload | jsonb | input payload |
| error | text | message/stack |
| created_at | timestamptz, default now() | |

**Who writes**: background workers  
**RLS**: admins only

### Enumerations (reference)
- `content_datasets.status`: `created|validating|loaded|ready|failed`
- `send_jobs.status`: `pending|running|completed|failed`
- `delivery_attempts.status`: `preview|queued|sent|bounced|failed|skipped`

### `rate_limit_counters` (optional)
Simple buckets for API rate limits.
| Column | Type | Notes |
|---|---|---|
| key | text, PK(1) | with bucket_start |
| bucket_start | timestamptz, PK(2) | |
| count | int, default 1 | |

**Who writes**: API layer  
**RLS**: admins only

---

## Deprecations / Replacements
- `content_slices` → **replaced** by `content_items` (row = complete email).  
- `subscribers` (if present in drafts) → **use `profiles`** as single source of truth.

---

## RLS & Access Model (quick reference)
- **Admins**: full read/write to all tables.  
- **Partners (future)**: scoped reads to their lists and content.  
- **Public**: no direct DB access; via endpoints only.

---

## Notes & Rationale
- We standardized on **generic `geo_metrics`** for extensibility. MVP enables **ZIP** only; new geo types require **data only**, not migrations.  
- Content is authored as **one row per complete email** to keep the MVP simple and maintainable.  
- Token expansion (`[[DELEGATION]]`, `[[ZIP_STATS]]`, `[[ZIP.*]]`) is handled at send-time using `profiles`, `geo_metrics`, and `officials` tables.
