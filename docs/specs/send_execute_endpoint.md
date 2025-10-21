# Send Execute Endpoint Specification

**Endpoint:** `POST /api/send/execute`  
**Purpose:** Batch, dedupe, and enqueue email sends to Make.com  
**Auth:** Admin only (via middleware + `requireAdmin`)  
**Feature Flag:** `FEATURE_SEND_EXECUTE` (default ON, set `=0` to disable)

---

## Request

### Headers
- `Authorization: Bearer <ADMIN_API_TOKEN>` or `X-Admin-Token: <ADMIN_API_TOKEN>` - Required for admin authentication (alternatively use admin cookie)
- `Cookie: admin=<admin_cookie>` - Alternative admin session auth
- `Content-Type: application/json`
- `X-Request-Id: <uuid>` - Optional, for request tracking

### Body

Two compatible request shapes are supported.

- Modern (recommended)
  - Test Mode:
    ```json
    {
      "job_id": "uuid",
      "mode": "test",
      "emails": ["user@example.com", "admin@example.com"]
    }
    ```
  - Cohort Mode:
    ```json
    {
      "job_id": "uuid",
      "mode": "cohort",
      "dataset_id": "uuid"
    }
    ```

- Legacy (still accepted)
  - Test Mode:
    ```json
    {
      "job_id": "uuid",
      "test_emails": ["user@example.com", "admin@example.com"]
    }
    ```
  - Cohort Mode:
    ```json
    {
      "job_id": "uuid",
      "dataset_id": "uuid"
    }
    ```

### Validation Rules
- `job_id` is required (UUID string)
- Provide either test recipients or a dataset:
  - Modern: `mode` is required (`"test" | "cohort"`); `emails[]` required for `test`, `dataset_id` required for `cohort`
  - Legacy: `test_emails[]` or `dataset_id` (mutually exclusive)
- Emails are normalized: lowercased and trimmed

---

## Response

### Success (200)
```json
{
  "ok": true,
  "data": {
    "job_id": "uuid",
    "dataset_id": "uuid",
    "batch_id": "uuid",
    "selected": 42,
    "queued": 42,
    "deduped": 0
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

Both modern and legacy shapes are accepted (see Request Body). The execution mode is derived from the presence of `mode`, `emails[]`/`test_emails[]`, and/or `dataset_id`:

**Test Mode**
- Uses the explicit email list from the request body
- Normalizes emails (lowercase, trim)
- Deduplicates within the provided list
- Uses a sentinel dataset to satisfy FK constraints:
  - Sentinel dataset id: `00000000-0000-0000-0000-000000000001`
  - Auto-created as `content_datasets(id, name='__test__')` on first use
  - Response includes `dataset_id` set to the sentinel value

**Cohort Mode**
- Queries `profiles` (MVP) to build the audience
- Limit is controlled by `MAX_SEND_PER_RUN` (default 100)
- Future: will use `v_recipients` and audience rules

### Make.com Dispatch

**Payload sent to `MAKE_WEBHOOK_URL`:**
```json
{
  "job_id": "uuid",
  "dataset_id": "uuid",
  "batch_id": "uuid",
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

Test mode inserts one `queued` row per unique email with the sentinel `dataset_id`; cohort mode upserts by `(dataset_id,email)` and dedupes within the same `job_id` against existing `queued`/`delivered` rows.

Relevant constraints and indexes:
- Unique: `(dataset_id, email)` — cohort mode idempotency
- Unique: `provider_message_id` — idempotent provider callbacks (plain UNIQUE; NULLs allowed)
- Index: `(job_id, batch_id, email)` — accelerates callback update-first path

---

## Unsubscribe URL Format

**Generated for each recipient** (by Make.com, using `UNSUBSCRIBE_SIGNING_SECRET` and `BASE_URL`):

```
https://your-app.vercel.app/api/unsubscribe?email=user@example.com&list=general&token=HMAC_BASE64URL
```

**Token Generation:**
```typescript
import crypto from 'crypto'

const SECRET = process.env.UNSUBSCRIBE_SIGNING_SECRET
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
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side)
- `ADMIN_API_TOKEN` - Bearer token for admin APIs (Authorization or X-Admin-Token)
- `MAKE_WEBHOOK_URL` - Make.com webhook endpoint
- `MAKE_SHARED_TOKEN` - Shared secret for provider callback (`X-Shared-Token`)
- `FEATURE_SEND_EXECUTE` - Feature flag (default `1`)

**Optional:**
- `MAX_SEND_PER_RUN` - Cap cohort audience size (default 100)
- `SENDGRID_TEMPLATE_ID` - Reserved for provider integration
- `X-Request-Id` - Request tracking header (propagated to logs)

---

## Testing

See `docs/review/SEND-LOOP-SMOKE-TESTS.md` for complete test suite.

**Quick smoke test:**
```bash
curl -X POST https://your-app.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer '$ADMIN_API_TOKEN \
  -d '{
    "job_id": "job-test-1",
    "mode": "test",
    "emails": ["test@example.com"]
  }'
```

**Expected:**
```json
{
  "ok": true,
  "data": {
    "job_id": "job-test-1",
    "dataset_id": "00000000-0000-0000-0000-000000000001",
    "batch_id": "<uuid>",
    "selected": 1,
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
