# Send Execute Endpoint Specification

**Endpoint:** `POST /api/send/execute`  
**Purpose:** Batch, dedupe, and enqueue email sends to Make.com  
**Auth:** Admin only (via middleware + `requireAdmin`)  
**Feature Flag:** `FEATURE_SEND_EXECUTE` (default ON, set `=0` to disable)

---

## Request

### Headers
- `Cookie: admin=<admin_cookie>` - Required for admin authentication
- `Content-Type: application/json`
- `X-Request-Id: <uuid>` - Optional, for request tracking

### Body

**Test Mode** (explicit email list):
```json
{
  "job_id": "uuid",
  "test_emails": ["user@example.com", "admin@example.com"]
}
```

**Cohort Mode** (dataset-based audience):
```json
{
  "job_id": "uuid",
  "dataset_id": "uuid"
}
```

### Validation Rules
- `job_id` is required (UUID string)
- Either `dataset_id` OR `test_emails[]` is required (mutually exclusive)
- `test_emails[]` must be array of valid email addresses
- Emails are normalized: lowercased and trimmed
- **Note:** No `mode` parameter needed - mode is auto-detected based on which parameter is present

---

## Response

### Success (200)
```json
{
  "ok": true,
  "data": {
    "job_id": "uuid",
    "dataset_id": "uuid",
    "queued": 42,
    "deduped": 8
  }
}
```

**Fields:**
- `queued` - Number of emails successfully enqueued
- `deduped` - Number of emails skipped due to deduplication

### Error Responses

#### 401 Unauthorized
```json
{
  "ok": false,
  "code": "UNAUTHORIZED",
  "message": "Admin access required"
}
```

#### 403 Feature Disabled
```json
{
  "ok": false,
  "code": "FEATURE_DISABLED",
  "message": "Send execute is disabled"
}
```

#### 400 Invalid Body
```json
{
  "ok": false,
  "code": "INVALID_BODY",
  "message": "Require job_id and (dataset_id or test_emails[])",
  "requestId": "optional-request-id"
}
```

#### 500 Database Errors
```json
{
  "ok": false,
  "code": "AUDIENCE_ERROR|HISTORY_ERROR|INSERT_ERROR",
  "message": "Error message from Supabase",
  "requestId": "optional-request-id"
}
```

#### 502/504 Dispatch Errors
```json
{
  "ok": false,
  "code": "DISPATCH_FAILED",
  "message": "Make returned 500 | Make webhook timeout | etc",
  "requestId": "optional-request-id"
}
```

---

## Behavior

### Deduplication Strategy

**Two-level deduplication:**

1. **Dataset-level** (unique constraint):
   - One recipient per dataset, ever
   - Enforced by unique index: `(dataset_id, email)`
   - Prevents duplicate sends across all jobs for same dataset

2. **Job-level** (in-memory):
   - Skip recipients already `queued` or `delivered` for same `job_id`
   - Prevents re-enqueuing if same job is triggered multiple times

### Audience Selection

Mode is **auto-detected** based on which parameter is present:

**Test Mode** (when `test_emails[]` provided):
- Uses explicit email list from request body
- No database query for audience
- Normalizes emails (lowercase, trim)
- Deduplicates within provided list
- `dataset_id` will be `null` in response

**Cohort Mode** (when `dataset_id` provided):
- Queries `profiles` table with `dataset_id` filter
- Limit: 1000 recipients (TODO: replace with `v_recipients` view)
- Future: Will support audience rule targeting
- `test_emails` must not be provided

### Make.com Dispatch

**Payload sent to `MAKE_WEBHOOK_URL`:**
```json
{
  "job_id": "uuid",
  "dataset_id": "uuid",
  "count": 42
}
```

**Headers:**
- `Content-Type: application/json`
- `X-Request-Id: <propagated-from-request>`

**Timeout:** 5 seconds
- Uses `AbortController` with timeout wrapper
- Returns 504 `DISPATCH_FAILED` on timeout
- Returns 502 `DISPATCH_FAILED` if Make returns non-2xx

**Idempotency:**
- DB writes happen BEFORE dispatch
- If dispatch fails, `delivery_history` rows remain in `queued` status
- Retry: Call endpoint again with same `job_id` - deduplication prevents duplicates

---

## Database Side Effects

### `delivery_history` Table

**Rows inserted:**
```sql
INSERT INTO delivery_history (job_id, dataset_id, email, status)
VALUES
  ('job-uuid', 'dataset-uuid', 'user@example.com', 'queued'),
  ('job-uuid', 'dataset-uuid', 'admin@example.com', 'queued')
ON CONFLICT (dataset_id, email) DO NOTHING
```

**Columns:**
- `job_id` - Send job UUID
- `dataset_id` - Content dataset UUID (null for test mode)
- `email` - Recipient email (normalized)
- `status` - Always `'queued'` on insert
- `created_at` - Timestamp

---

## Unsubscribe URL Format

**Generated for each recipient** (by Make.com, using `UNSUB_SECRET` and `BASE_URL`):

```
https://your-app.vercel.app/api/unsubscribe?email=user@example.com&list=general&token=HMAC_BASE64URL
```

**Token Generation:**
```typescript
import crypto from 'crypto'

const SECRET = process.env.UNSUB_SECRET
const data = `${email}:${listKey}` // e.g., "user@example.com:general"
const token = crypto.createHmac('sha256', SECRET)
  .update(data)
  .digest('base64url')
```

**Token Validation:**
- Timing-safe comparison (`crypto.timingSafeEqual`)
- Invalid/expired tokens return 400
- Valid tokens insert to `unsubscribes` table

---

## Environment Variables

**Required:**
- `SUPABASE_URL` - Supabase project URL (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)
- `MAKE_WEBHOOK_URL` - Make.com webhook endpoint
- `FEATURE_SEND_EXECUTE` - Feature flag (default `1`)

**Optional:**
- `X-Request-Id` - Request tracking header (propagated to logs)

---

## Testing

See `docs/review/SEND-LOOP-SMOKE-TESTS.md` for complete test suite.

**Quick smoke test:**
```bash
curl -X POST https://your-app.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-admin-cookie>' \
  -d '{
    "job_id": "job-test-1",
    "test_emails": ["test@example.com"]
  }'
```

**Expected:**
```json
{
  "ok": true,
  "data": {
    "job_id": "job-test-1",
    "dataset_id": null,
    "queued": 1,
    "deduped": 0
  }
}
```

---

## Security Considerations

1. **Admin Guard:** `requireAdmin` enforced in route handler
2. **Middleware:** Additional check in Next.js middleware
3. **Feature Flag:** Can disable entirely with `FEATURE_SEND_EXECUTE=0`
4. **Rate Limiting:** TODO - add rate limiter for production
5. **Input Validation:** Email normalization, array filtering
6. **Database Constraints:** Unique indexes prevent duplicates at DB level

---

## Future Enhancements

- [ ] Replace `profiles` query with `v_recipients` view
- [ ] Add audience rule support for cohort targeting
- [ ] Add rate limiting (e.g., max N calls per minute)
- [ ] Add retry queue for failed dispatches
- [ ] Add send preview/simulation mode (no DB writes, no Make dispatch)
- [ ] Add pagination for large audiences (>1000 recipients)
- [ ] Add batch splitting (chunk large sends into multiple Make payloads)

---

**Last Updated:** October 1, 2025  
**Status:** ✅ Implemented & Ready for Production
