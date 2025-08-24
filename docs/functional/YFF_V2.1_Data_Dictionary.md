# YFF V2.1 — Data Dictionary (Markdown)
_Generated: 2025-08-24 21:41 UTC_

This document describes the YFF V2.1 database tables, their fields, who writes them, and how they are used. It also summarizes keys/constraints and RLS posture for each table.

---

## Legend
- **Who writes**: Author (your team), System (Edge/Make/Jobs), Client (subscriber UI via your API), Read‑only (no edits after write).
- **Subscriber change?**: Whether the subscriber can change the value (typically **via UI → server**).

---

## Table of Contents
- [profiles](#profiles)
- [subscriptions](#subscriptions)
- [content_slices](#content_slices)
- [delivery_history](#delivery_history)
- [delivery_events](#delivery_events)
- [campaign_runs](#campaign_runs)
- [dead_letters](#dead_letters)

---

## profiles
**Purpose:** Subscriber identity and address → OCD IDs (source of truth).

| Column | Type | Who writes | Subscriber change? | Notes |
|---|---|---|---|---|
| `user_id` | uuid (PK) | System | No | Internal ID used by RLS owner checks and FKs. |
| `email` | text (unique) | System | No (support-only) | Primary identity; used for profile upserts and dedupe. |
| `address` | text | System (via UI → server) | **Yes** | Subscriber provides new address; server validates and stores. |
| `zipcode` | text | System | No | From Civic `normalizedInput`. |
| `ocd_ids` | text[] | System | No | Keys from Civic `divisionsByAddress` for personalization. |
| `ocd_last_verified_at` | timestamptz | System | No | Timestamp of last OCD refresh. |
| `created_at` | timestamptz | System | Read‑only | Creation time for audit. |

**Keys/Constraints:** `email` unique.  
**RLS:** Enabled. _Owner-only_ policies (client may read/update their row if exposed). Service role bypasses RLS.

---

## subscriptions
**Purpose:** List membership; toggle `unsubscribed_at` for a given `(user_id, list_key)`.

| Column | Type | Who writes | Subscriber change? | Notes |
|---|---|---|---|---|
| `id` | uuid (PK) | System | No | Row identifier. |
| `user_id` | uuid (FK → profiles.user_id) | System | No | Owner of the subscription row. |
| `list_key` | text | System | Indirectly | Which list (e.g., `general`). UI offers choices; server writes value. |
| `unsubscribed_at` | timestamptz | System (via UI → server) | **Yes** | Null = subscribed; timestamp = unsubscribed. |
| `created_at` | timestamptz | System | Read‑only | Creation time for audit. |

**Keys/Constraints:** Unique `(user_id, list_key)`.  
**RLS:** Enabled. Typically **server-only writes** via Edge function (unsubscribe token). You may allow owner read if you provide a “manage my subscription” page.

---

## content_slices
**Purpose:** Authored content slices for an article; personalization by OCD ID.

| Column | Type | Who writes | Subscriber change? | Notes |
|---|---|---|---|---|
| `id` | uuid (PK) | System | No | Row identifier. |
| `article_key` | text | Author | No | Groups slices into a single article (e.g., `funding-2025-08`). |
| `section_order` | int | Author | No | Vertical order within article. |
| `is_headline` | boolean | Author | No | Scoped headline override for matching recipients. |
| `title` | text | Author | No | Slice headline (optional). |
| `dek` | text | Author | No | Subheading. |
| `body_md` | text (Markdown) | Author | No | Body content; Markdown allowed. |
| `link_url` | text | Author | No | Optional CTA / link. |
| `scope_ocd_id` | text (nullable) | Author | No | Canonical OCD ID this slice applies to; null = global. |
| `tags` | text[] | Author | No | Labels for filters/analytics. |
| `publish_status` | text enum | Author | No | `draft | published | archived`. |
| `publish_at` | timestamptz | Author | No | Visibility start. |
| `expires_at` | timestamptz | Author | No | Visibility end. |
| `sort_index` | int | Author | No | Tie-breaker within section/scope. |
| `created_at` | timestamptz | System | Read‑only | Audit. |

**Keys/Constraints:** Unique composite index on `(article_key, section_order, coalesce(scope_ocd_id,''), sort_index)` for idempotent imports.  
**RLS:** Enabled. **Service-only** (`USING(FALSE)`): no client read/write; imported by Make/service role.

---

## delivery_history
**Purpose:** One row per attempted send (idempotency + audit).

| Column | Type | Who writes | Subscriber change? | Notes |
|---|---|---|---|---|
| `id` | uuid (PK) | System | No | Row identifier. |
| `email` | text | System | No | Recipient email. |
| `campaign_tag` | text | System | No | Campaign label (e.g., `funding-2025-08`). |
| `send_batch_id` | text | System | No | Idempotency token for a run; prevents duplicates. |
| `provider_message_id` | text (nullable) | System | No | Returned by provider; null if failed before provider. |
| `sent_at` | timestamptz | System | Read‑only | When send initiated. |

**Keys/Constraints:** Unique `(email, campaign_tag, send_batch_id)` and unique `provider_message_id`.  
**RLS:** Enabled. **Service-only**: only service role can access.

---

## delivery_events
**Purpose:** Provider events (delivered/open/click/bounce/unsubscribe).

| Column | Type | Who writes | Subscriber change? | Notes |
|---|---|---|---|---|
| `id` | uuid (PK) | System | No | Row identifier. |
| `email` | text | System | No | Recipient email. |
| `event_type` | text enum | System | No | `delivered | open | click | bounce | spamreport | unsubscribe`. |
| `provider_message_id` | text | System | No | Correlates to `delivery_history`. |
| `event_at` | timestamptz | System | Read‑only | When event occurred. |

**Keys/Constraints:** None beyond PK.  
**RLS:** Enabled. **Service-only**: ingested by webhook with service role.

---

## campaign_runs
**Purpose:** Audit of admin-triggered sends (who/when/what).

| Column | Type | Who writes | Subscriber change? | Notes |
|---|---|---|---|---|
| `id` | uuid (PK) | System | No | Row identifier. |
| `campaign_tag` | text | System | No | Campaign label. |
| `article_key` | text | System | No | Article being sent. |
| `actor` | text | System | No | Admin identity (email) who triggered the run. |
| `send_batch_id` | text | System | No | Idempotency token per run. |
| `started_at` | timestamptz | System | Read‑only | When the run started. |

**RLS:** Enabled. **Service-only**.

---

## dead_letters
**Purpose:** Permanent failures captured for investigation.

| Column | Type | Who writes | Subscriber change? | Notes |
|---|---|---|---|---|
| `id` | uuid (PK) | System | No | Row identifier. |
| `topic` | text | System | No | Area of failure (e.g., `send`). |
| `payload` | jsonb | System | No | Original payload at time of failure. |
| `error` | text | System | No | Error message/stack. |
| `created_at` | timestamptz | System | Read‑only | Timestamp. |

**RLS:** Enabled. **Service-only**.

---

## Access posture — Option A vs. Option B

- **Option A (client can write some fields):** Keep owner INSERT/UPDATE policies on `profiles` and `subscriptions`. Less server code, but more validation risk.
- **Option B (recommended): Server-only writes:** Remove client INSERT/UPDATE on `subscriptions` (and optionally `profiles`), and route changes via Edge functions:
  - `POST /api/profile/address` — validate input, call `divisionsByAddress`, update `profiles.address/zipcode/ocd_ids/ocd_last_verified_at`.
  - `POST /api/subscriptions/toggle` — set/unset `unsubscribed_at` for {{ user_id, list_key }}.
  - HMAC unsubscribe link: `/unsubscribe?token=<signed>` (idempotent).

Choose B for MVP to keep validation and side‑effects centralized; add narrow client policies later if needed.

---

## Common flows (field‑level view)

- **Signup:** create/update `profiles (email, address, zipcode, ocd_ids, ocd_last_verified_at)`; ensure `subscriptions(user_id, 'general')` exists with `unsubscribed_at = NULL`.
- **Address update:** user submits address → server validates → refreshes `ocd_ids` and timestamps.
- **Unsubscribe:** set `subscriptions.unsubscribed_at = NOW()` for `(user_id, list_key)`.
- **Import article:** upsert `content_slices` by composite key; tombstone by setting `publish_status = archived`.
- **Send:** read `profiles.ocd_ids` + `content_slices`; assemble one article; write `delivery_history`; ingest `delivery_events` from provider.

---

_End of document_
