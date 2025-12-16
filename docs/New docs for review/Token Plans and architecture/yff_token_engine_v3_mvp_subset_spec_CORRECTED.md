# YFF Token Engine — Architecture v3 (MVP Subset Specification) — CORRECTED

Version: 2025-12-08
Status: Authoritative MVP Implementation Guide
Replaces: yff_token_engine_v3_mvp_subset_spec.md

## Purpose
Define the **minimal subset** of Architecture v3 required for the MVP Token Engine.
Ensures:
- Full compatibility with Architecture v3
- Full compatibility with existing YFF codebase
- Minimal implementation complexity
- Clear rules for TDD
- Zero misalignment for Cursor or Claude

---

# 1. Database Schema (MVP Subset)

## 1.1 Tables

### content_token_datasets
```sql
CREATE TABLE IF NOT EXISTS content_token_datasets (
  dataset_id TEXT PRIMARY KEY,
  dataset_description TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### content_token_rows
```sql
CREATE TABLE IF NOT EXISTS content_token_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id TEXT NOT NULL REFERENCES content_token_datasets(dataset_id) ON DELETE CASCADE,
  row_uid TEXT NOT NULL,
  token_key TEXT NOT NULL,
  value_html TEXT NOT NULL,
  value_text TEXT NOT NULL,
  ocd_id TEXT NOT NULL,
  senate_position INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 1.2 Indexes
```sql
CREATE INDEX IF NOT EXISTS content_token_rows_token_key_idx
  ON content_token_rows (token_key);

CREATE INDEX IF NOT EXISTS content_token_rows_ocd_id_idx
  ON content_token_rows (ocd_id);

CREATE INDEX IF NOT EXISTS content_token_rows_token_key_ocd_id_idx
  ON content_token_rows (token_key, ocd_id);

CREATE INDEX IF NOT EXISTS content_token_rows_dataset_id_idx
  ON content_token_rows (dataset_id);

CREATE UNIQUE INDEX IF NOT EXISTS content_token_rows_dataset_id_row_uid_idx
  ON content_token_rows (dataset_id, row_uid);
```

## 1.3 Constraints
```sql
-- Token key format: uppercase letters, digits, underscores only
ALTER TABLE content_token_rows
  ADD CONSTRAINT IF NOT EXISTS token_key_format
  CHECK (token_key ~ '^[A-Z0-9_]+$');

-- OCD ID must start with ocd-division/
ALTER TABLE content_token_rows
  ADD CONSTRAINT IF NOT EXISTS ocd_id_format
  CHECK (ocd_id LIKE 'ocd-division/%');

-- Value text must not contain HTML
ALTER TABLE content_token_rows
  ADD CONSTRAINT IF NOT EXISTS value_text_no_html
  CHECK (value_text !~ '[<>]');

-- Senate position must be NULL, 1, or 2
ALTER TABLE content_token_rows
  ADD CONSTRAINT IF NOT EXISTS senate_position_valid
  CHECK (senate_position IS NULL OR senate_position IN (1, 2));
```

## 1.4 Triggers
```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_content_token_rows_updated_at
  BEFORE UPDATE ON content_token_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

# 2. Token Resolution Algorithm (MVP)

## 2.1 Reserved Tokens (Built-in)

These tokens are **hardcoded in the application** and do NOT query the database:

```typescript
export const RESERVED_TOKENS = [
  'DELEGATION',
  'EMAIL',
  'JOB_ID',
  'BATCH_ID',
] as const;
```

**Location**: `src/lib/personalize/tokens.ts` (existing file)

## 2.2 Token Context

```typescript
export type TokenContext = {
  email: string
  job_id: string
  batch_id?: string
  ocd_ids?: string[] | null
}
```

**Location**: `src/lib/personalize/tokens.ts` (existing type)

## 2.3 Resolution Flow

```typescript
async function resolveToken(
  tokenKey: string,
  ctx: TokenContext,
  mode: 'html' | 'text' = 'html'
): Promise<string> {
  // STEP 1: Check if this is a reserved/built-in token
  if (RESERVED_TOKENS.includes(tokenKey)) {
    return resolveBuiltInToken(tokenKey, ctx); // Existing logic
  }

  // STEP 2: Resolve as dataset token
  return resolveDatasetToken(tokenKey, ctx, mode);
}
```

## 2.4 Dataset Token Resolution (NEW CODE)

```typescript
async function resolveDatasetToken(
  tokenKey: string,
  ctx: TokenContext,
  mode: 'html' | 'text'
): Promise<string> {
  // Get primary OCD ID from profile
  const primaryOcd = ctx.ocd_ids?.[0];
  if (!primaryOcd) return "";

  // Build base query
  let query = db
    .from("content_token_rows")
    .select("*")
    .eq("token_key", tokenKey)
    .eq("ocd_id", primaryOcd);

  // Add senate position filter if token ends with _SEN1 or _SEN2
  if (tokenKey.endsWith("_SEN1")) {
    query = query.eq("senate_position", 1);
  } else if (tokenKey.endsWith("_SEN2")) {
    query = query.eq("senate_position", 2);
  }

  // Execute query
  const { data: rows, error } = await query;

  // Handle errors and missing data
  if (error || !rows || rows.length === 0) {
    return ""; // Missing tokens return blank
  }

  // If multiple rows match (data quality issue), pick deterministic first
  rows.sort((a, b) => a.row_uid.localeCompare(b.row_uid));
  const row = rows[0];

  // Return appropriate value based on mode
  return mode === "text" ? row.value_text : row.value_html;
}
```

## 2.5 SQL Equivalent (for reference)

```sql
-- Base query
SELECT * FROM content_token_rows
WHERE token_key = $1 AND ocd_id = $2

-- If token ends with _SEN1, add:
AND senate_position = 1

-- If token ends with _SEN2, add:
AND senate_position = 2

-- Then:
ORDER BY row_uid ASC
LIMIT 1;
```

## 2.6 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Token not found in database | Return "" |
| Profile has no ocd_ids | Return "" |
| Multiple rows match (shouldn't happen) | Pick first alphabetically by row_uid |
| Database error | Return "" |
| Token is reserved (DELEGATION, etc.) | Use built-in logic, never query database |

---

# 3. Integration Points (CRITICAL)

## 3.1 Extend Existing Token Resolver

**File**: `src/lib/personalize/tokens.ts`
**Current function**: `resolveTokens(template: string, context: TokenContext): Promise<string>`

**Required changes**:
1. Keep all existing built-in token logic (DELEGATION, EMAIL, JOB_ID, BATCH_ID)
2. Add new `resolveDatasetToken()` function (from Section 2.4)
3. Modify existing `resolveToken()` to check reserved tokens first, then query database
4. Add mode parameter: `resolveTokens(template, context, mode = 'html')`

**DO NOT**: Create a separate token resolver. Must extend the existing one.

## 3.2 Add Subject Resolution to Send Pipeline

**File**: `src/app/api/send/personalize/route.ts`
**Current location**: Line 133

**Current code**:
```typescript
// Line 133
const resolvedHtml = await resolveTokens(baseHtml, ctx);
```

**Required addition** (BEFORE line 133):
```typescript
// Add subject resolution
const resolvedSubject = await resolveTokens(subject, ctx, "text");
```

**Then update response object** to use `resolvedSubject` instead of raw `subject`.

## 3.3 Newsletter Content Fields

**Source table**: `v2_content_items` or `v2_content_items_staging`
**Fields to resolve tokens in**:
- `subject` → use mode="text" → returns `value_text`
- `body_html` (preferred) → use mode="html" → returns `value_html`
- `body_md` (fallback) → use mode="html" → returns `value_html`

**DO NOT** reference `title` or generic `html` fields. They don't exist in the schema.

---

# 4. CSV Import Rules

## 4.1 Required Columns

```
dataset_id
row_uid
token_key
value_html
value_text
ocd_id
```

## 4.2 Optional Columns

```
senate_position
```

## 4.3 Validation Rules

- `dataset_id`: Must be consistent across all rows in the CSV
- `row_uid`: Unique identifier for each row (e.g., bioguide_id)
- `token_key`: Must match `^[A-Z0-9_]+$`
- `token_key`: Must NOT be in RESERVED_TOKENS list
- `value_html`: Trusted HTML content (no sanitization in MVP)
- `value_text`: Plain text only (no `<` or `>` characters)
- `ocd_id`: Must start with `ocd-division/`
- `senate_position`: Must be NULL, 1, or 2

## 4.4 Upload Behavior

**Mode**: UPSERT only (no replace mode)

**Upsert key**: `(dataset_id, row_uid)`

**Process**:
1. Validate all rows against rules above
2. If any validation fails → reject entire upload
3. Upsert dataset metadata into `content_token_datasets`
4. Upsert all rows into `content_token_rows`
5. Return summary of inserted/updated rows

---

# 5. API Routes (MVP Scope)

## 5.1 Upload Dataset

**Route**: `POST /api/admin/tokens/upload`
**Auth**: Requires `requireAdmin()` from `src/lib/auth.ts`
**Input**: Multipart form with CSV file + dataset_description
**Output**: JSON summary with dataset_id, row counts, token_keys

## 5.2 List Tokens

**Route**: `GET /api/admin/tokens`
**Auth**: Requires `requireAdmin()`
**Query params**: `?q=` for search
**Output**: JSON array of token metadata

## 5.3 Download Dataset

**Route**: `GET /api/admin/tokens/:datasetId/download`
**Auth**: Requires `requireAdmin()`
**Output**: CSV file with all rows for that dataset

## 5.4 Download All Datasets

**Route**: `GET /api/admin/tokens/download-all`
**Auth**: Requires `requireAdmin()`
**Output**: CSV summary of all datasets

## 5.5 Test Token

**Route**: `POST /api/admin/tokens/test`
**Auth**: Requires `requireAdmin()`
**Input**: `{ tokenKey, email }`
**Output**: `{ value_html, value_text, ocd_id, found }`

---

# 6. Admin UI (MVP Scope)

## 6.1 Token Upload Page

**Route**: `/admin/tokens/upload`
**Features**:
- CSV file upload
- Dataset description input
- Upload summary display
- Token test panel (dropdown + email input)

## 6.2 Token Library Page

**Route**: `/admin/tokens`
**Features**:
- Search bar (filters by token_key, dataset_id, description)
- Table showing: token_key, dataset_id, row count, uploaded_at
- Download links per dataset
- Download All button

---

# 7. End-to-End Flow

```
1. Admin uploads CSV via /admin/tokens/upload
   ↓
2. System validates and upserts into content_token_datasets + content_token_rows
   ↓
3. Content creator writes newsletter with [[TOKEN_KEY]] in subject and body_html
   ↓
4. Content creator uploads newsletter CSV
   ↓
5. System creates send job
   ↓
6. For each recipient:
   a. Load profile → get ocd_ids[0]
   b. Build TokenContext { email, job_id, batch_id, ocd_ids }
   c. Resolve subject: resolveTokens(subject, ctx, "text")
   d. Resolve body: resolveTokens(body_html, ctx, "html")
   e. Send personalized email
   ↓
7. Missing tokens are replaced with "" (blank)
```

---

# 8. Acceptance Criteria

MVP is complete when:

1. ✅ Migration creates schema with all tables, indexes, constraints, triggers
2. ✅ CSV importer validates and rejects invalid rows
3. ✅ CSV importer upserts valid rows by (dataset_id, row_uid)
4. ✅ Reserved token check prevents database query for DELEGATION, EMAIL, etc.
5. ✅ Dataset token resolver passes TDD tests:
   - Returns value_html when mode="html"
   - Returns value_text when mode="text"
   - Returns "" when no match found
   - Returns "" when profile has no ocd_ids
   - Filters by senate_position for _SEN1/_SEN2 tokens
6. ✅ Subject resolution works in /api/send/personalize
7. ✅ Body resolution works in /api/send/personalize
8. ✅ Missing tokens return blank without errors
9. ✅ All 5 admin API routes work
10. ✅ Both admin UI pages work

---

# 9. Out of Scope (MVP)

- Geo fallback (county → state → national)
- Token priority or aliasing
- Token caching
- Multi-row newsletters
- Token editing UI
- Token deletion UI
- WYSIWYG preview
- Automated congressional API ingestion

---

# 10. Migration File

**Path**: `supabase/migrations/20250208_token_engine_mvp.sql`

**Must be idempotent** (use `IF NOT EXISTS`, `DO $` blocks for constraints)

**Full migration provided separately in conversation with Claude.**

---

# 11. Test Requirements

## 11.1 Unit Tests

**File**: `tests/tokenResolution.dataset.test.ts` (new file)

**Required test cases**:
1. Resolve House token with exact OCD match
2. Resolve SEN1 token with senate_position=1 filter
3. Resolve SEN2 token with senate_position=2 filter
4. Return "" when no match found
5. Return "" when profile has no ocd_ids
6. Reserved token bypasses database query
7. Mode="text" returns value_text
8. Mode="html" returns value_html

**Pattern to follow**: See `tests/tokenResolution.test.ts` for vi.mock() patterns

## 11.2 Integration Tests

**Required test**:
1. Upload CSV dataset
2. Create newsletter with tokens in subject + body
3. Send to test profile with known ocd_id
4. Verify resolved subject contains value_text
5. Verify resolved body contains value_html

---

# 12. Key Architecture Decisions (ADRs)

## ADR-01: Token Syntax
Use `[[TOKEN_KEY]]` (not `{{TOKEN_KEY}}`)
**Reason**: Matches existing resolveTokens() implementation

## ADR-02: Dual Token System
Built-in tokens (DELEGATION, EMAIL, etc.) checked BEFORE database tokens
**Reason**: Preserves all existing functionality, prevents database lookups for hardcoded tokens

## ADR-03: Canonical Geography Source
Use `profiles.ocd_ids[0]` (not subscribers table)
**Reason**: Profiles is canonical user entity per consolidated schema

## ADR-04: Newsletter Fields
Tokens appear in `subject` and `body_html` (not `title` or generic `html`)
**Reason**: Matches actual v2_content_items schema

## ADR-05: Separate Token Tables
Token system uses NEW tables (`content_token_datasets`, `content_token_rows`)
**Reason**: Keeps token logic separate from content ingestion tables

---

# 13. Critical Don'ts (Common Mistakes to Avoid)

❌ **DON'T** create a separate token resolver. Extend the existing one.
❌ **DON'T** use `{{TOKEN}}` syntax. Use `[[TOKEN]]`.
❌ **DON'T** query database for reserved tokens (DELEGATION, EMAIL, etc.).
❌ **DON'T** use `subscribers` table. Use `profiles`.
❌ **DON'T** reference `title` or `html` fields. Use `subject` and `body_html`.
❌ **DON'T** use `geo_level`/`geo_code` fields. Use `ocd_id`.
❌ **DON'T** filter by `dataset_id` in resolution query. Only filter by `token_key` + `ocd_id`.
❌ **DON'T** apply senate_position filter AFTER query. Add it to WHERE clause.
❌ **DON'T** create `content_delivery` table. Use existing `delivery_history`.
❌ **DON'T** use `bigint IDENTITY` IDs. Use `uuid DEFAULT gen_random_uuid()`.

---

# END OF DOCUMENT

This specification is the **authoritative guide** for MVP implementation.
All code, tests, and documentation should align with this spec.
Any conflicts between this spec and other documents should be resolved in favor of this spec.
