
# YFF Token Engine — Architecture v2 (Developer-Ready Specification)
_Last updated: 2025-02-07_

This is the **canonical technical specification** for implementing the YFF Token Engine MVP.  
It is designed for Cursor/Claude to use as a **source of truth** when writing migrations, API routes, TypeScript logic, UI screens, and tests.

It incorporates:
- All system behaviors validated against the existing YFF codebase
- All decisions made through the ADR process
- All feedback from architectural review

---

# 📌 0. Architecture Decision Records (ADRs)

## **ADR‑01 — Token Syntax**
All tokens use the format:

```
[[TOKEN_KEY]]
```

We do **not** use `{{TOKEN_KEY}}`.

This ensures full compatibility with the existing token system (`resolveTokens()`).

---

## **ADR‑02 — Dual Token System (Built-in + Dataset-Driven)**
Token resolution must follow this precedence:

1. **Built-in tokens** (`DELEGATION`, `EMAIL`, `JOB_ID`, `BATCH_ID`, etc.)
2. **Dataset-driven tokens** (e.g., `CV_HR4405_2025_11_18`)

Reserved tokens:

```ts
export const RESERVED_TOKENS = [
  'DELEGATION',
  'EMAIL',
  'JOB_ID',
  'BATCH_ID',
] as const;
```

Dataset uploads must **reject** token_key values that match reserved names.

---

## **ADR‑03 — Canonical Geography Source**
Geo matching uses:

```
profiles.ocd_ids[0]
```

No logic references `subscribers`.

---

## **ADR‑04 — Newsletter Fields**
Tokens may appear in:
- `subject`
- `body_html` (preferred)
- `body_md` (fallback)

Subject resolution always uses `value_text`.  
Body resolution always uses `value_html`.

---

## **ADR‑05 — Separate Token Tables**
Token Engine adds **two new tables**:

- `content_token_datasets`
- `content_token_rows`

These do NOT modify:
- `content_datasets`
- `content_items`
- `v2_content_items`
- `content_blocks`

They are logically separate.

---

# 1. System Overview

The Token Engine extends the existing YFF token resolver so it can handle **dynamic geo-personalized content** uploaded by admins as CSV datasets.

At send-time, tokens embedded inside newsletter content are replaced with:
- HTML (for body)
- Plain text (for subject)

Resolution uses profile geography.

---

# 2. Database Schema

## 2.1 Table: `content_token_datasets`

```sql
CREATE TABLE public.content_token_datasets (
  dataset_id TEXT PRIMARY KEY,
  dataset_description TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2.2 Table: `content_token_rows`

```sql
CREATE TABLE public.content_token_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id TEXT NOT NULL REFERENCES public.content_token_datasets(dataset_id) ON DELETE CASCADE,

  row_uid TEXT NOT NULL,
  token_key TEXT NOT NULL,
  value_html TEXT NOT NULL,
  value_text TEXT NOT NULL,
  ocd_id TEXT NOT NULL,

  senate_position INT, -- NULL for House or non-Senate

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes

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

# 3. CSV Format (Strict)

Required columns:

```
dataset_id
row_uid
token_key
value_html
value_text
ocd_id
```

Optional:

```
senate_position
```

### Validation Rules
- `token_key` must match `/^[A-Z0-9_]+$/`
- Must NOT be in `RESERVED_TOKENS`
- `value_text` must NOT contain `<` or `>`
- `ocd_id` must start with `ocd-division/`
- Extra columns ignored
- Missing required fields → upload fails

---

# 4. Token Resolution (Developer-Level Detail)

## 4.1 Token Scanning

Regex:

```ts
const tokenPattern = /\[\[([A-Z0-9_]+)\]\]/g
```

---

## 4.2 Resolver Flow

```ts
async function resolveToken(tokenKey: string, ctx: TokenContext, mode = 'html') {
  if (RESERVED_TOKENS.includes(tokenKey)) {
    return resolveBuiltInToken(tokenKey, ctx);
  }
  return resolveDatasetToken(tokenKey, ctx, mode);
}
```

---

## 4.3 Dataset Resolver

```ts
async function resolveDatasetToken(tokenKey, ctx, mode) {
  const primaryOcd = ctx.ocd_ids?.[0];
  if (!primaryOcd) return "";

  let { data: rows } = await db
    .from("content_token_rows")
    .select("*")
    .eq("token_key", tokenKey)
    .eq("ocd_id", primaryOcd);

  if (!rows || rows.length === 0) return "";

  rows.sort((a, b) => a.row_uid.localeCompare(b.row_uid));

  const row = rows[0];
  return mode === "text" ? row.value_text : row.value_html;
}
```

---

## 4.4 Subject vs Body

### Body resolution

```ts
resolveTokens(bodyHtml, ctx, "html");
```

### Subject resolution

```ts
resolveTokens(subject, ctx, "text");
```

---

# 5. Integration in Send Pipeline

Modify file:

```
src/app/api/send/personalize/route.ts
```

### Replace body logic:

```ts
const resolvedHtml = await resolveTokens(baseHtml, ctx, "html");
```

### Add subject logic:

```ts
const resolvedSubject = await resolveTokens(subject, ctx, "text");
```

Ensure downstream functions use `resolvedSubject`.

---

# 6. Admin API Routes

## 6.1 Upload Dataset  
`POST /api/admin/tokens/upload`

Flow:
1. Parse CSV
2. Validate columns
3. Upsert into `content_token_datasets`
4. Upsert rows into `content_token_rows` keyed by `(dataset_id, row_uid)`
5. Return summary

---

## 6.2 Token Library  
`GET /api/admin/tokens`

Returns:
- token_key
- dataset_id
- row_count
- dataset_description
- uploaded_at

Supports `?q=` search.

---

## 6.3 Download Dataset  
`GET /api/admin/tokens/:datasetId/download`

---

## 6.4 Download All  
`GET /api/admin/tokens/download-all`

---

## 6.5 Test Token  
`POST /api/admin/tokens/test`

Returns:
- value_html
- value_text
- profile ODC ID used
- found flag

---

# 7. Admin UI Spec

## 7.1 `/admin/tokens/upload`
- CSV file input
- Dataset description input
- Post-upload summary
- Token test control panel

## 7.2 `/admin/tokens`
- Search bar
- Token table (token_key, dataset_id, rows, uploaded_at)
- Dataset description tooltip or truncated preview
- Download links

---

# 8. Testing Requirements

## 8.1 Unit Tests
- Token scanning
- Built-in token branch
- Dataset token branch
- Subject vs body behavior
- CSV validation errors

## 8.2 Integration Tests
- Upload CSV → send personalized email → verify resolved values.

---

# 9. Out of Scope (MVP)
- Token editing UI
- Token deletion UI
- Geo fallback (county/state) resolution
- Multi-row newsletter support
- WYSIWYG preview
- Congressional API ingestion

---

# 10. Developer Checklist

### Pre-Implementation
- Confirm admin auth (requireAdmin)
- Locate send personalization code

### Implementation Steps
1. Add migrations
2. Implement upload API
3. Extend resolveTokens
4. Create admin UI pages
5. Implement dataset token test endpoint
6. Add subject resolution
7. Add tests

### Post-Implementation
- End-to-end test of: upload → newsletter → personalized send

---

# End of Developer Specification
