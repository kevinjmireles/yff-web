
# YFF Token Engine — Implementation Checklist
_Last updated: 2025-02-07_

This document breaks the Token Engine Architecture v3 into concrete implementation steps for Cursor/Claude.  
It is meant to be **actionable**, not theoretical.

---

## 1. Migrations (Supabase / Postgres)

**File:** `supabase/migrations/20250207_token_engine_mvp.sql`

### 1.1 Create `content_token_datasets`

- [ ] CREATE TABLE `public.content_token_datasets`:
  - `dataset_id TEXT PRIMARY KEY`
  - `dataset_description TEXT`
  - `uploaded_at TIMESTAMPTZ DEFAULT now()`

### 1.2 Create `content_token_rows`

- [ ] CREATE TABLE `public.content_token_rows`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `dataset_id TEXT NOT NULL REFERENCES public.content_token_datasets(dataset_id) ON DELETE CASCADE`
  - `row_uid TEXT NOT NULL`
  - `token_key TEXT NOT NULL`
  - `value_html TEXT NOT NULL`
  - `value_text TEXT NOT NULL`
  - `ocd_id TEXT NOT NULL`
  - `senate_position INT NULL`
  - `created_at TIMESTAMPTZ DEFAULT now()`
  - `updated_at TIMESTAMPTZ DEFAULT now()`

### 1.3 Indexes

- [ ] `content_token_rows_token_key_idx` on `(token_key)`
- [ ] `content_token_rows_ocd_id_idx` on `(ocd_id)`
- [ ] `content_token_rows_token_key_ocd_id_idx` on `(token_key, ocd_id)`
- [ ] `content_token_rows_dataset_id_idx` on `(dataset_id)`

### 1.4 Unique Constraint

- [ ] `content_token_rows_dataset_id_row_uid_idx` unique index on `(dataset_id, row_uid)`

---

## 2. Token Logic (src/lib/personalize/tokens.ts)

### 2.1 TokenContext

- [ ] Confirm `TokenContext` type exists and matches:

```ts
export type TokenContext = {
  email: string
  job_id: string
  batch_id?: string
  ocd_ids?: string[] | null
}
```

### 2.2 RESERVED_TOKENS

- [ ] Add:

```ts
export const RESERVED_TOKENS = [
  'DELEGATION',
  'EMAIL',
  'JOB_ID',
  'BATCH_ID',
] as const
```

### 2.3 Extend `resolveTokens`

- [ ] Update signature to:

```ts
export async function resolveTokens(
  input: string,
  ctx: TokenContext,
  mode: 'html' | 'text' = 'html'
): Promise<string>
```

- [ ] Implement:
  - Scan input for `[[TOKEN_KEY]]` patterns
  - Build `Set<string>` of unique token keys
  - For each token key, call `resolveToken(tokenKey, ctx, mode)`
  - Replace all occurrences with resolved value

### 2.4 Add `resolveToken`

- [ ] Implement:

```ts
async function resolveToken(
  tokenKey: string,
  ctx: TokenContext,
  mode: 'html' | 'text'
): Promise<string> {
  if (RESERVED_TOKENS.includes(tokenKey)) {
    return resolveBuiltInToken(tokenKey, ctx)
  }
  return resolveDatasetToken(tokenKey, ctx, mode)
}
```

### 2.5 Add `resolveDatasetToken`

- [ ] Implement:

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

  if (tokenKey.endsWith("_SEN1")) {
    query = query.eq("senate_position", 1)
  } else if (tokenKey.endsWith("_SEN2")) {
    query = query.eq("senate_position", 2)
  }

  const { data: rows, error } = await query
  if (error || !rows || rows.length === 0) return ""

  rows.sort((a, b) => a.row_uid.localeCompare(b.row_uid))
  const row = rows[0]

  return mode === "text" ? row.value_text : row.value_html
}
```

---

## 3. Send Pipeline Integration (src/app/api/send/personalize/route.ts)

### 3.1 Body Resolution

- [ ] Confirm `baseHtml` is computed as:

```ts
const baseHtml =
  selected?.body_html ??
  selected?.body_md ??
  '<p>Thanks for staying engaged.</p>'
```

- [ ] Replace old `resolveTokens` call with:

```ts
const ctx: TokenContext = { job_id, batch_id, email, ocd_ids: userOcdIds }
const resolvedHtml = await resolveTokens(baseHtml, ctx, "html")
```

### 3.2 Subject Resolution

- [ ] Ensure `subject` is loaded:

```ts
const subject = selected?.subject ?? 'Thanks for staying engaged.'
```

- [ ] Resolve subject:

```ts
const resolvedSubject = await resolveTokens(subject, ctx, "text")
```

### 3.3 Response Update

- [ ] Ensure JSON response uses `resolvedSubject`:

```ts
return NextResponse.json({
  ok: true,
  job_id,
  batch_id,
  email,
  subject: resolvedSubject,
  html: resolvedHtml,
  text,
})
```

---

## 4. Admin APIs

All admin routes must call `requireAdmin(req)`.

### 4.1 POST /api/admin/tokens/upload

- [ ] Create handler file.
- [ ] Steps:
  1. `requireAdmin(req)`
  2. Parse CSV from request (multipart or raw text).
  3. Validate:
     - Required columns present
     - token_key matches `/^[A-Z0-9_]+$/`
     - token_key not in `RESERVED_TOKENS`
     - value_text has no `<` / `>`
     - ocd_id starts with `ocd-division/`
     - No duplicate `(dataset_id, row_uid)` in the parsed file
  4. Upsert dataset into `content_token_datasets`.
  5. Upsert each row into `content_token_rows` keyed by `(dataset_id, row_uid)`.
  6. Return `{ ok: true, dataset_id, token_keys, row_count }`.

- [ ] Return error on failures with `{ ok: false, error, details }`.

### 4.2 GET /api/admin/tokens

- [ ] Fetch aggregated data grouped by token_key.
- [ ] Support `?q=` search.
- [ ] Return `{ ok: true, tokens: [...] }` as per architecture example.

### 4.3 GET /api/admin/tokens/:datasetId/download

- [ ] Stream CSV of rows in `content_token_rows` for that dataset.

### 4.4 GET /api/admin/tokens/download-all

- [ ] Return summary CSV aggregating all datasets.

### 4.5 POST /api/admin/tokens/test

- [ ] Input: `{ email, token_key }`
- [ ] Lookup profile by email
- [ ] Build `TokenContext` with profile ocd_ids
- [ ] Call `resolveDatasetToken` in both modes (`html`, `text`)
- [ ] Return `{ ok: true, found, profile_ocd, value_html, value_text }`

---

## 5. Admin UI Pages

### 5.1 /admin/tokens/upload

- [ ] Create new page under `/admin`.
- [ ] UI:
  - File input for CSV.
  - Text input for dataset description.
  - Upload button.
  - After upload:
    - Show dataset_id, dataset_description, token_keys, row_count.
    - Show “Test a token” panel:
      - Dropdown of token_keys in this dataset.
      - Email input.
      - Display returned HTML + text from test API.

### 5.2 /admin/tokens

- [ ] Create listing page under `/admin`.
- [ ] UI:
  - Search box → queries `/api/admin/tokens?q=...`
  - Table:
    - token_key
    - dataset_id
    - row_count
    - uploaded_at
    - dataset_description (truncated or tooltip)
  - Buttons:
    - “Download Dataset” per dataset_id.
    - “Download All Datasets” at top.
    - “Upload New Token Dataset” linking to `/admin/tokens/upload`.

---

## 6. Testing

### 6.1 Unit Tests

**File examples:**
- `tests/tokenEngine.test.ts`
- `tests/tokensUploadValidation.test.ts`

- [ ] Test `resolveTokens` with:
  - No tokens.
  - Single token.
  - Multiple different tokens.
  - mode `"html"` vs `"text"`.

- [ ] Test `resolveDatasetToken`:
  - House vs Senate.
  - `_SEN1` vs `_SEN2` filtering.
  - No `ocd_ids` returns `""`.
  - Multiple rows sorted by `row_uid`.

- [ ] CSV validation tests:
  - Missing columns.
  - Reserved token.
  - Invalid token key.
  - HTML in value_text.
  - Invalid ocd_id prefix.
  - Duplicate `(dataset_id, row_uid)`.

### 6.2 Integration Tests

- [ ] Seed a small dataset and profiles.
- [ ] Call `/api/send/personalize`:
  - Subject containing dataset token.
  - Body containing dataset token.
- [ ] Assert:
  - Subject resolved from `value_text`.
  - Body resolved from `value_html`.
  - Built-in tokens (e.g. `[[EMAIL]]`) still work.

---

## 7. Final QA Checklist

- [ ] Migrations applied successfully in dev.
- [ ] Upload test dataset without errors.
- [ ] Dataset appears in `/admin/tokens`.
- [ ] Test endpoint returns correct HTML/text for known email.
- [ ] Preview via `/api/send/personalize` shows correct personalization.
- [ ] Real test send confirms emails are correct.
- [ ] No regressions in existing DELEGATION / EMAIL tokens.

---

This checklist should allow an engineer (or Cursor agent) to implement the Token Engine MVP in small, verifiable steps, while staying aligned with the Architecture v3 spec.
