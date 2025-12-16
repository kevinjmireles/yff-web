# YFF Token Engine — Overall Architecture Plan (v1)

_Last updated: 2025-02-07_

This document describes the **end-to-end architecture** for the YFF Token Engine MVP so Claude / Cursor can:

- Validate it against the **existing schema & code**
- Identify integration points
- Implement changes in **small, low-risk increments**

It assumes:
- **Next.js (App Router)** frontend
- Supabase/Postgres backend
- Existing YFF content import + send pipelines

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. Enable **geo-personalized content** via **token datasets**:
   - First dataset: **congressional votes** (House + Senate)
   - Future datasets: ZIP, city, county, state, other OCD-based scopes
2. Allow admins/content creators to:
   - Upload token datasets via CSV
   - View available tokens
   - Test tokens against real profiles
   - Insert token keys into newsletters (HTML + title)
3. Resolve tokens **at send-time** per profile using:
   - `profiles.ocd_ids[0]` as the primary geography

### 1.2 Non-Goals (MVP)

- No token editing UI
- No multi-row newsletters
- No final WYSIWYG editor
- No automated ingestion of external vote APIs
- No complex geo fallback logic (OCD only for now)
- No changes to the existing newsletter CSV content import, beyond using tokens in title/body

---

## 2. Existing System (Relevant Pieces)

### 2.1 Profiles & Geography

**Table: `public.profiles`**

Key fields:

- `user_id uuid PK`
- `email text UNIQUE`
- `zipcode text`
- `ocd_ids text[]` (validated via `validate_ocd_ids_format`)
- `created_at timestamptz`

> **This is the canonical user entity for personalization.**  
> The first OCD ID (`ocd_ids[0]`) will be used for token resolution in MVP.

### 2.2 Subscribers

**Table: `public.subscribers`**

Legacy / parallel subscription model with its own `ocd_ids[]`.  
For MVP, we will **not** use this table for token resolution; we rely on `profiles`.

### 2.3 Content & Sending

Relevant tables:

- `content_datasets`
- `content_items` / `v2_content_items`
- `send_jobs`
- `delivery_attempts`
- `delivery_history`
- `provider_events`

These support:

- Newsletter ingestion (CSV → content tables)
- Send jobs (who gets what)
- Delivery tracking and outcomes

**Important:**  
Token Engine does **not** replace these systems. It enhances the **rendering** path by injecting personalized fragments into the existing newsletter body/title.

---

## 3. New Components Overview

### 3.1 New Tables

1. **`content_token_datasets`** — token dataset metadata  
2. **`content_token_rows`** — individual tokenized rows per geography

(Names can be adjusted to match existing naming, but conceptually they are separate from `content_datasets` and `v2_content_items`.)

### 3.2 New Backend APIs

- `POST /api/admin/tokens/upload`
  - Accepts CSV upload for token datasets
- `GET  /api/admin/tokens`
  - Lists token_keys + dataset metadata
- `GET  /api/admin/tokens/:datasetId/download`
  - Downloads full dataset as CSV
- `GET  /api/admin/tokens/download-all`
  - Download summary CSV of all datasets
- `POST /api/admin/tokens/test`
  - Test a token for a given profile email

### 3.3 New Frontend Admin Screens

- `/admin/tokens`
  - Token Library (list/search/download)
- `/admin/tokens/upload`
  - Token Upload (CSV + description + test)

### 3.4 New Core Logic

- `resolveToken(tokenKey: string, profile: Profile): Promise<{ html: string; text: string }>`
- `renderNewsletterForProfile(newsletter, profile) → { title, html }`
  - Finds all token markers and replaces them using `resolveToken`.

---

## 4. Data Model (New Tables)

### 4.1 `content_token_datasets`

Purpose: metadata for each token dataset.

```sql
CREATE TABLE public.content_token_datasets (
  dataset_id text PRIMARY KEY,
  dataset_description text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
```

- `dataset_id` comes from CSV (e.g. `CV_HR4405_2025_11_18`)
- `dataset_description` is provided at upload (optional)
- `uploaded_at` is managed by DB default

### 4.2 `content_token_rows`

Purpose: individual geo-personalized token rows.

```sql
CREATE TABLE public.content_token_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id text NOT NULL REFERENCES public.content_token_datasets(dataset_id) ON DELETE CASCADE,
  row_uid text NOT NULL,        -- e.g. bioguide_id, or stable external id
  token_key text NOT NULL,      -- e.g. CV_HR4405_2025_11_18, CV_HR4405_2025_11_18_SEN1
  value_html text NOT NULL,
  value_text text NOT NULL,
  ocd_id text NOT NULL,
  senate_position int,          -- 1 or 2 for Senate datasets; NULL for House/other
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 4.3 Indexes

```sql
CREATE INDEX content_token_rows_token_key_idx
  ON public.content_token_rows (token_key);

CREATE INDEX content_token_rows_ocd_id_idx
  ON public.content_token_rows (ocd_id);

CREATE INDEX content_token_rows_token_key_ocd_id_idx
  ON public.content_token_rows (token_key, ocd_id);

CREATE INDEX content_token_rows_dataset_id_idx
  ON public.content_token_rows (dataset_id);
```

---

## 5. Token Dataset Upload Flow

### 5.1 CSV Contract (Token Dataset)

Required columns:

- `dataset_id`
- `row_uid`
- `token_key`
- `value_html`
- `value_text`
- `ocd_id`

Optional:

- `senate_position` (for SEN1/SEN2 splits)

Extra columns:
- Ignored for MVP.

### 5.2 Upload API Flow (`POST /api/admin/tokens/upload`)

1. Parse CSV server-side.
2. Validate required columns & basic constraints:
   - `token_key` matches `^[A-Z0-9_]+$` (or clear error)
   - `value_text` contains **no `<`** (must be plain text)
   - `ocd_id` is non-empty and starts with `ocd-division/` (soft validation)
3. Extract `dataset_id` (must all match within file).
4. Upsert into `content_token_datasets`:
   - `dataset_id`
   - `dataset_description`
   - `uploaded_at = now()`
5. Upsert rows into `content_token_rows` keyed on `(dataset_id, row_uid)`:
   - If row exists → update all fields
   - If not → insert new row
6. Return summary:
   - `dataset_id`
   - `dataset_description`
   - `uploaded_at`
   - List of `token_key` values and row counts (e.g., House, SEN1, SEN2)

> **Note:** There is **no replace mode**. All uploads are idempotent upserts.

---

## 6. Token Library & Download

### 6.1 Token Library API (`GET /api/admin/tokens`)

Returns list of tokens aggregated by token_key:

- token_key
- dataset_id
- rows (count)
- dataset_description
- uploaded_at

Search behavior:
- Single `q` parameter, matched against:
  - token_key ILIKE
  - dataset_id ILIKE
  - dataset_description ILIKE

### 6.2 Downloads

1. `GET /api/admin/tokens/:datasetId/download`
   - Returns full `content_token_rows` for that dataset as CSV.

2. `GET /api/admin/tokens/download-all`
   - Returns summary CSV with:
     - dataset_id
     - dataset_description
     - uploaded_at
     - token_key
     - row_count

---

## 7. Token Resolution

### 7.1 Profile Geography

We use:

- `profiles.email` → look up profile
- `profiles.ocd_ids[0]` as **primary geography** for MVP.

If:
- No profile found → token test returns `subscriber_not_found`.
- No `ocd_ids` or empty → resolution returns empty string.

### 7.2 Function: `resolveToken(tokenKey, profile)`

Pseudocode:

```ts
async function resolveToken(tokenKey: string, profile: Profile) {
  const primaryOcd = profile.ocd_ids?.[0];
  if (!primaryOcd) return { html: "", text: "" };

  let rows = await db
    .from("content_token_rows")
    .select("*")
    .eq("token_key", tokenKey)
    .eq("ocd_id", primaryOcd);

  if (!rows || rows.length === 0) return { html: "", text: "" };

  // If multiple matches (data problem), pick deterministic first:
  rows.sort((a, b) => a.row_uid.localeCompare(b.row_uid));
  const row = rows[0];

  return {
    html: row.value_html,
    text: row.value_text,
  };
}
```

> For Senate-specific tokens (`*_SEN1`, `*_SEN2`), we can further filter by `senate_position` if the dataset encodes it. That is an additive filter on the same table and does not change the architecture.

### 7.3 Failure & Edge Cases

- Vacant seats or territories with no matches:
  - No row found ⇒ return `{ html: "", text: "" }`.
- Multiple rows for same `ocd_id` + `token_key`:
  - Deterministic first-row wins (sorted by `row_uid`).
- Future: we can log an event into `dead_letters` if we want observability.

---

## 8. Newsletter Rendering Integration

### 8.1 Current Assumption

There is an existing path that:

1. Takes a `content_item` / `v2_content_item` row (title/body or subject/body_md).
2. Creates a send job (`send_jobs`).
3. Iterates over the target audience (via `profiles` / `subscriptions` / `delivery_attempts`).

We will integrate token resolution **right before sending each email**.

### 8.2 New Helper: `renderNewsletterForProfile`

Signature:

```ts
async function renderNewsletterForProfile(
  newsletter: { title: string; html: string },
  profile: Profile
): Promise<{ title: string; html: string }> {
  // 1. Find all tokens {{TOKEN_KEY}} in title and html
  // 2. For each unique token, call resolveToken
  // 3. Replace occurrences in html with value_html
  // 4. Replace in title with value_text
}
```

Implementation details:

- Use regex to find `{{SOME_TOKEN}}` patterns:
  - `const tokenRegex = /{{([A-Z0-9_]+)}}/g;`
- Build a `Set` of unique token keys to avoid repeated DB calls.
- For each tokenKey:
  - Call `resolveToken(tokenKey, profile)`
  - Replace all matches in:
    - `html` with `htmlValue`
    - `title` with `textValue`

---

## 9. Admin UI Flows

### 9.1 `/admin/tokens/upload`

- File input for CSV
- Text input for `dataset_description` (optional)
- Submit to `/api/admin/tokens/upload`
- After success:
  - Show dataset summary
  - Show list of token_keys + row counts
  - Show Test panel:
    - Dropdown of token_keys
    - Email input
    - On submit: POST `/api/admin/tokens/test`
    - Show:
      - value_html rendered
      - value_text as plain text

### 9.2 `/admin/tokens`

- Table of rows:
  - token_key
  - dataset_id
  - rows
  - description (truncated)
  - uploaded_at (timestamp string)
  - Actions:
    - Download Dataset
- “Download All Datasets” button
  - Links to `/api/admin/tokens/download-all`
- Search bar:
  - Sends `q` param to `/api/admin/tokens` API
  - Filters by token_key/dataset_id/dataset_description

---

## 10. Validation & Data Quality Rules

- **token_key format**: uppercase letters, digits, underscores only.
- **value_text**: must be plain text (no `<`), enforced at upload.
- **value_html**: trusted admin HTML (no sanitization in MVP).
- **ocd_id**:
  - Required for each row.
  - Must start with `ocd-division/` (soft check).
- Extra CSV columns:
  - Ignored for MVP; do not cause upload failure.

---

## 11. Integration Checklist for Claude / Cursor

When reviewing this architecture against the existing repo, Claude / Cursor should verify:

1. **Profiles vs Subscribers**
   - Confirm that **profiles** are the canonical entity used in the **send pipeline**.
   - Confirm we can efficiently lookup profiles by `email`.

2. **Send Pipeline**
   - Identify the function / route that currently renders email content per recipient.
   - Decide where to call `renderNewsletterForProfile`.

3. **Content Import**
   - Confirm that the current single-row newsletter import maps to a table that includes:
     - `title` / `subject`
     - `html` / `body`
   - Ensure those fields can contain tokens like `{{CV_HR4405_2025_11_18}}`.

4. **New Tables**
   - Validate that adding:
     - `content_token_datasets`
     - `content_token_rows`
   - Does **not** conflict with any existing naming conventions or logic.

5. **Permissions**
   - Confirm that `/admin/...` routes reuse existing admin auth/middleware.
   - Ensure only admins can upload token datasets or view tokens.

6. **Testing Stories**
   - Ensure we can seed:
     - A few `profiles` with known `ocd_ids`
     - A sample token dataset
   - And write Vitest tests for `resolveToken` + `renderNewsletterForProfile`.

---

## 12. Future Extensions (Post-MVP)

- Add geo fallback logic using `geo_level` + `geo_code`.
- Add support for non-congressional datasets (city, county, state).
- Add richer debugging/logging when resolution fails.
- Add token editing UI and versioning.
- Add multi-row newsletters & tokenized blocks.

---

## 13. Summary

This architecture:

- Respects existing YFF tables and flows
- Introduces **minimal new schema** (two small tables)
- Keeps token logic **decoupled** from newsletter ingestion
- Uses `profiles.ocd_ids[0]` as the primary geo selector
- Enables personalization for **congressional votes first**, and **any geographic layer later** without schema changes.

Claude / Cursor should use this as the **reference blueprint** to:
- Confirm assumptions,
- Identify real integration points,
- And then drive implementation via small, testable changes.
