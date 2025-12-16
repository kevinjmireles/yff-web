
# YFF Token Engine — Architecture v3 (Developer-Ready Specification)
_Last updated: 2025-02-07_

This is the **canonical technical specification** for implementing the YFF Token Engine MVP.  
It is designed for Cursor/Claude to use as a **source of truth** when writing migrations, API routes, TypeScript logic, UI screens, and tests.

It incorporates:
- All system behaviors validated against the existing YFF codebase
- All decisions made through the ADR process
- All feedback from architectural review and code inspection (v2 → v3)

---

# 📌 0. Architecture Decision Records (ADRs)

## **ADR-01 — Token Syntax**
All tokens use the format:

```text
[[TOKEN_KEY]]
```

We do **not** use `{{TOKEN_KEY}}`.

This ensures full compatibility with the existing token system (`resolveTokens()` in `src/lib/personalize/tokens.ts`).

---

## **ADR-02 — Dual Token System (Built-in + Dataset-Driven)**

Token resolution must follow this precedence:

1. **Built-in tokens** (code-defined), such as:
   - `DELEGATION`
   - `EMAIL`
   - `JOB_ID`
   - `BATCH_ID`
2. **Dataset-driven tokens** (CSV-defined), e.g.:
   - `CV_HR4405_2025_11_18`
   - `CV_HR4405_2025_11_18_SEN1`
   - `CV_HR4405_2025_11_18_SEN2`

Reserved tokens are:

```ts
export const RESERVED_TOKENS = [
  'DELEGATION',
  'EMAIL',
  'JOB_ID',
  'BATCH_ID',
] as const;
```

Dataset uploads must **reject** any `token_key` equal to a reserved token.

---

## **ADR-03 — Canonical Geography Source**

Geo matching uses:

```ts
profiles.ocd_ids[0]
```

Notes:

- `profiles` is the canonical user entity.
- `subscribers` is not used in token resolution.
- For MVP, only the **first** OCD ID is used.

---

## **ADR-04 — Newsletter Fields**

Tokens may appear in:

- `subject`
- `body_html` (preferred)
- `body_md` (fallback if `body_html` is missing)

Subject resolution always uses **plain text** (`value_text` from dataset rows).  
Body resolution always uses **HTML** (`value_html` from dataset rows).

---

## **ADR-05 — Separate Token Tables**

Token Engine introduces **two new tables**:

- `content_token_datasets`
- `content_token_rows`

These are **separate** from and do **not** modify:

- `content_datasets`
- `content_items`
- `v2_content_items`
- `content_blocks`

This reduces coupling and keeps rollback straightforward.

---

# 1. System Overview

The Token Engine extends the existing YFF token resolver so it can handle **dynamic geo-personalized content** uploaded by admins as CSV datasets.

At send-time, tokens embedded inside newsletter content are replaced with:

- HTML fragments (for email body)
- Plain text fragments (for subject line and plain text fallback)

Resolution uses each profile’s **primary OCD ID** (`profiles.ocd_ids[0]`).

High-level flow:

1. Admin uploads a **token dataset** as CSV.
2. Data is stored in `content_token_datasets` and `content_token_rows`.
3. A newsletter includes tokens like `[[CV_HR4405_2025_11_18]]`.
4. `/api/send/personalize` calls `resolveTokens()` for subject and body.
5. For each token:
   - If built-in → handled by existing logic.
   - Else → resolved via token dataset rows.

---

# 2. Database Schema

## 2.0 Migration File Naming

Create a new migration file:

```text
supabase/migrations/20250207_token_engine_mvp.sql
```

Follow the existing naming convention: `YYYYMMDD_description.sql`.

---

## 2.1 Table: `content_token_datasets`

```sql
CREATE TABLE public.content_token_datasets (
  dataset_id TEXT PRIMARY KEY,
  dataset_description TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `dataset_id` is supplied by the CSV (e.g. `CV_HR4405_2025_11_18`).
- This table stores dataset-level metadata only.

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

  senate_position INT, -- 1 or 2 for Senate; NULL for House/other

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

### Constraints

Ensure no duplicate `row_uid` within a dataset:

```sql
CREATE UNIQUE INDEX content_token_rows_dataset_id_row_uid_idx
  ON public.content_token_rows (dataset_id, row_uid);
```

This enforces uniqueness at the DB level in addition to CSV validation.

---

# 3. CSV Format (Strict Contract)

CSV required columns:

```text
dataset_id
row_uid
token_key
value_html
value_text
ocd_id
```

Optional column:

```text
senate_position
```

### 3.1 Validation Rules

At upload time:

- `token_key` must match `/^[A-Z0-9_]+$/`.
- `token_key` must **not** be in `RESERVED_TOKENS`.
- `value_text` must **not** contain `<` or `>` (no HTML).
- `ocd_id` must start with `ocd-division/`.
- Within a single CSV file, `(dataset_id, row_uid)` combinations must be **unique**.
- Extra CSV columns are ignored.
- Missing any required column → upload fails.

---

# 4. Token Context & Resolution

## 4.0 Token Context Type

Use the existing `TokenContext` from `src/lib/personalize/tokens.ts`:

```ts
export type TokenContext = {
  email: string
  job_id: string
  batch_id?: string
  ocd_ids?: string[] | null
}
```

No changes to this type are required for MVP.

---

## 4.1 Token Scanning

Tokens are scanned from any text input (subject, body) using:

```ts
const tokenPattern = /\[\[([A-Z0-9_]+)\]\]/g
```

---

## 4.2 Resolver Flow (`resolveTokens` entry point)

The entry point is **`resolveTokens` (plural)**, which:

1. Scans the input string for all `[[TOKEN_KEY]]` patterns.
2. Calls `resolveToken` (singular) for each **unique** token.
3. Replaces all occurrences of each token with its resolved value.

Updated signature to support text vs HTML modes:

```ts
export async function resolveTokens(
  input: string,
  ctx: TokenContext,
  mode: 'html' | 'text' = 'html'
): Promise<string> {
  let out = input ?? ''
  const tokenPattern = /\[\[([A-Z0-9_]+)\]\]/g
  const tokensFound = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(input)) !== null) {
    tokensFound.add(match[1])
  }

  for (const tokenKey of tokensFound) {
    const resolved = await resolveToken(tokenKey, ctx, mode)
    if (!resolved) continue

    const tokenRegex = new RegExp(`\[\[${tokenKey}\]\]`, 'g')
    out = out.replace(tokenRegex, resolved)
  }

  return out
}
```

---

## 4.3 `resolveToken` (singular) and Built-in vs Dataset

```ts
async function resolveToken(
  tokenKey: string,
  ctx: TokenContext,
  mode: 'html' | 'text' = 'html'
): Promise<string> {
  if (RESERVED_TOKENS.includes(tokenKey)) {
    return resolveBuiltInToken(tokenKey, ctx)
  }
  return resolveDatasetToken(tokenKey, ctx, mode)
}
```

> `resolveBuiltInToken` should encapsulate existing logic for `DELEGATION`, `EMAIL`, `JOB_ID`, `BATCH_ID`, etc.

---

## 4.4 Dataset Resolver (with Senate support)

```ts
async function resolveDatasetToken(
  tokenKey: string,
  ctx: TokenContext,
  mode: 'html' | 'text'
): Promise<string> {
  const primaryOcd = ctx.ocd_ids?.[0]
  if (!primaryOcd) return ""

  let query = db
    .from("content_token_rows")
    .select("*")
    .eq("token_key", tokenKey)
    .eq("ocd_id", primaryOcd)

  // Senate position filtering for _SEN1 and _SEN2 tokens
  if (tokenKey.endsWith("_SEN1")) {
    query = query.eq("senate_position", 1)
  } else if (tokenKey.endsWith("_SEN2")) {
    query = query.eq("senate_position", 2)
  }

  const { data: rows, error } = await query

  if (error || !rows || rows.length === 0) return ""

  // Deterministic tie-breaker in case of data issues
  rows.sort((a, b) => a.row_uid.localeCompare(b.row_uid))

  const row = rows[0]
  return mode === "text" ? row.value_text : row.value_html
}
```

---

## 4.5 Subject vs Body Modes

The `mode` parameter determines which value is returned:

- `"html"` → `row.value_html` (for email body)
- `"text"` → `row.value_text` (for subject lines and text-only fallbacks)

Default is `"html"` for **backward compatibility** and for use in body rendering.

---

# 5. Integration in Send Pipeline

Modify:

```text
src/app/api/send/personalize/route.ts
```

### 5.1 Current (simplified) behavior

Today, the route:

- Selects content (`subject`, `body_html` / `body_md`).
- Resolves tokens in **body** only using `resolveTokens`.
- Returns JSON with `subject` (unresolved), `html`, and `text`.

### 5.2 Updated Behavior

We must:

1. Resolve tokens in the body using **HTML mode**.
2. Resolve tokens in the subject using **TEXT mode**.
3. Return the **resolved subject** in the JSON response.

Example update:

```ts
const ctx: TokenContext = { job_id, batch_id, email, ocd_ids: userOcdIds }

const baseHtml =
  selected?.body_html ??
  selected?.body_md ??
  '<p>Thanks for staying engaged.</p>'

const subject = selected?.subject ?? 'Thanks for staying engaged.'

const resolvedHtml = await resolveTokens(baseHtml, ctx, "html")
const resolvedSubject = await resolveTokens(subject, ctx, "text")
const text = htmlToText(resolvedHtml)

return NextResponse.json({
  ok: true,
  job_id,
  batch_id,
  email,
  subject: resolvedSubject,  // use resolved subject
  html: resolvedHtml,
  text,
})
```

---

# 6. Admin API Endpoints

All admin endpoints must:

- Use `requireAdmin` auth gate.
- Return JSON in a consistent `{ ok, ... }` envelope.
- Handle errors using a standard error format.

## 6.0 Auth Pattern (`requireAdmin`)

Pattern to use in all admin routes:

```ts
import { requireAdmin } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  // ... handler logic ...
}
```

---

## 6.1 Upload Dataset — `POST /api/admin/tokens/upload`

### Responsibilities

1. Parse CSV upload.
2. Validate:
   - Required columns present.
   - `token_key` format and **not reserved**.
   - `value_text` has no `<` or `>`.
   - `ocd_id` starts with `ocd-division/`.
   - No duplicate `(dataset_id, row_uid)` in the file.
3. Upsert into `content_token_datasets`.
4. Upsert rows into `content_token_rows` keyed by `(dataset_id, row_uid)`.
5. Return summary of the dataset and token keys.

### Error Handling

Errors must return:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "details": "Human-readable message"
}
```

Expected `error` codes:

- `INVALID_CSV` — Failed parsing or missing required columns.
- `RESERVED_TOKEN` — `token_key` in `RESERVED_TOKENS`.
- `INVALID_TOKEN_KEY` — `token_key` fails regex.
- `VALUE_TEXT_HAS_HTML` — `value_text` contains `<` or `>`.
- `INVALID_OCD_ID` — `ocd_id` does not start with `ocd-division/`.
- `DUPLICATE_ROW_UID` — duplicate `(dataset_id, row_uid)` in the same CSV.
- `MISSING_REQUIRED_COLUMN` — required column not present.

---

## 6.2 Token Library — `GET /api/admin/tokens`

### Behavior

Returns aggregated list of tokens and dataset info.

Fields:

- `token_key`
- `dataset_id`
- `row_count`
- `dataset_description`
- `uploaded_at`

Supports search via `?q=` against:

- `token_key ILIKE`
- `dataset_id ILIKE`
- `dataset_description ILIKE`

### Example Response

```json
{
  "ok": true,
  "tokens": [
    {
      "token_key": "CV_HR4405_2025_11_18",
      "dataset_id": "CV_HR4405_2025_11_18",
      "row_count": 435,
      "dataset_description": "House vote on HR 4405 (Epstein Files)",
      "uploaded_at": "2025-02-07T14:33:00Z"
    },
    {
      "token_key": "CV_HR4405_2025_11_18_SEN1",
      "dataset_id": "CV_HR4405_2025_11_18",
      "row_count": 50,
      "dataset_description": "House vote on HR 4405 (Epstein Files)",
      "uploaded_at": "2025-02-07T14:33:00Z"
    }
  ]
}
```

---

## 6.3 Download Dataset — `GET /api/admin/tokens/:datasetId/download`

Returns full `content_token_rows` for the given `datasetId` as a CSV stream.

---

## 6.4 Download All Datasets — `GET /api/admin/tokens/download-all`

Returns a summary CSV across all datasets, with columns like:

- `dataset_id`
- `dataset_description`
- `uploaded_at`
- `token_key`
- `row_count`

---

## 6.5 Test Token — `POST /api/admin/tokens/test`

### Input

```json
{
  "email": "someone@example.com",
  "token_key": "CV_HR4405_2025_11_18"
}
```

### Behavior

1. Look up profile by email.
2. Use `profiles.ocd_ids[0]` as primary OCD.
3. Call `resolveDatasetToken(token_key, ctx, "html" / "text")`.
4. Return both HTML and text variants.

### Output

```json
{
  "ok": true,
  "found": true,
  "profile_ocd": "ocd-division/country:us/state:oh/cd:3",
  "value_html": "<p>Rep X voted YES</p>",
  "value_text": "Rep X voted YES"
}
```

If no match:

```json
{
  "ok": true,
  "found": false,
  "profile_ocd": "ocd-division/... (or null)",
  "value_html": "",
  "value_text": ""
}
```

---

## 6.6 Error Responses (Global)

For all admin endpoints, use:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "details": "Human-readable message"
}
```

(See upload endpoint for canonical error codes.)

---

# 7. Admin UI Specification

## 7.1 `/admin/tokens/upload`

Elements:

- CSV file input
- Dataset description text input
- Submit button
- Post-upload summary:
  - dataset_id
  - dataset_description
  - token_keys created
  - row count
- Token test panel:
  - Token select (dropdown: token_keys in that dataset)
  - Email input
  - Result preview (HTML rendered + text shown)

---

## 7.2 `/admin/tokens`

Elements:

- Search bar (`q` → `/api/admin/tokens?q=...`)
- Table of tokens:
  - token_key
  - dataset_id
  - row_count
  - uploaded_at
  - dataset_description (truncated or tooltip)
- Actions:
  - Download dataset (per dataset)
  - Download all datasets (top-level button)
- Link: “Upload New Token Dataset” → `/admin/tokens/upload`

---

# 8. Testing Requirements

## 8.1 Unit Tests (Vitest)

### Token Logic

- `resolveTokens`:
  - No tokens → returns input unchanged.
  - Single token → resolves correctly.
  - Multiple tokens, multiple occurrences → all replaced.
  - `mode = "html"` vs `mode = "text"` behavior.
- `resolveToken`:
  - Built-in tokens route to existing logic.
  - Reserved tokens are not passed to dataset resolver.
- `resolveDatasetToken`:
  - Correct query for House (no senate_position).
  - Correct query for Senate with `_SEN1` and `_SEN2`.
  - Empty `ocd_ids` results in empty string.
  - Multiple rows → deterministic tie-breaking by `row_uid`.

### CSV Validation

- Missing required column → `MISSING_REQUIRED_COLUMN`.
- Reserved token → `RESERVED_TOKEN`.
- Invalid token_key pattern → `INVALID_TOKEN_KEY`.
- value_text with `<` or `>` → `VALUE_TEXT_HAS_HTML`.
- Invalid ocd_id prefix → `INVALID_OCD_ID`.
- Duplicate `(dataset_id, row_uid)` in file → `DUPLICATE_ROW_UID`.

---

## 8.2 Integration Tests

- Seed a small `content_token_datasets` + `content_token_rows` dataset.
- Seed profiles with known `ocd_ids`.
- Call `/api/send/personalize` with:
  - subject containing dataset token
  - body containing dataset token
- Assert:
  - Subject resolved using `value_text`.
  - Body resolved using `value_html`.
  - Built-in tokens (like `[[EMAIL]]`) still behave correctly.

---

# 9. Out of Scope (MVP)

- Token editing UI.
- Token deletion / archiving flows.
- Geo fallback logic (county/state fallback if district missing).
- Multi-row newsletter support.
- WYSIWYG preview in the editor.
- Automated ingestion from external legislative/vote APIs.

These can be added later with **no changes** to the core Token Engine architecture.

---

# 10. Developer Checklist (High-Level)

## Pre-Implementation

- [ ] Confirm `requireAdmin` usage pattern for admin routes.
- [ ] Confirm `/api/send/personalize` is the canonical personalization endpoint.
- [ ] Confirm `profiles` is the canonical entity for `ocd_ids`.

## Implementation Steps

1. **Migrations**
   - [ ] Add `content_token_datasets` table.
   - [ ] Add `content_token_rows` table.
   - [ ] Add indexes.
   - [ ] Add unique index on `(dataset_id, row_uid)`.

2. **Token Logic**
   - [ ] Update `resolveTokens` signature to accept `mode`.
   - [ ] Implement `resolveToken` with built-in vs dataset split.
   - [ ] Implement `resolveDatasetToken` with Senate suffix handling.

3. **Send Pipeline**
   - [ ] Update `/api/send/personalize` to:
     - [ ] Resolve body with mode `"html"`.
     - [ ] Resolve subject with mode `"text"`.
     - [ ] Return `subject: resolvedSubject`.

4. **Admin APIs**
   - [ ] Implement `POST /api/admin/tokens/upload`.
   - [ ] Implement `GET /api/admin/tokens`.
   - [ ] Implement `GET /api/admin/tokens/:datasetId/download`.
   - [ ] Implement `GET /api/admin/tokens/download-all`.
   - [ ] Implement `POST /api/admin/tokens/test`.

5. **Admin UI**
   - [ ] Create `/admin/tokens/upload` page.
   - [ ] Create `/admin/tokens` page.

6. **Tests**
   - [ ] Add unit tests for token resolution logic.
   - [ ] Add unit tests for CSV validation.
   - [ ] Add integration tests for send pipeline.

## Post-Implementation

- [ ] Run migrations in dev.
- [ ] Upload a small test dataset.
- [ ] Verify:
  - [ ] Tokens appear in Token Library.
  - [ ] Test endpoint returns expected values.
  - [ ] `/api/send/personalize` returns personalized subject + body.
- [ ] Trigger a full test send and confirm email renders as expected.

---

# End of Architecture v3
