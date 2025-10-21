# Send Loop Smoke Tests

**Purpose:** Verify end-to-end send execution, provider callbacks, and unsubscribe flow  
**Date:** October 1, 2025  
**Status:** Ready for Production Testing

---

## Prerequisites

### Environment Variables (Vercel)
```bash
# Required
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
MAKE_WEBHOOK_URL=...
MAKE_SHARED_TOKEN=...
ADMIN_API_TOKEN=...
FEATURE_SEND_EXECUTE=1
UNSUB_SECRET=...
BASE_URL=https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app

# Optional (for testing)
TEST_ACCESS_TOKEN=...
```

### Database Migrations
```bash
✅ 20251001_delivery_history.sql
✅ 20251001_provider_events.sql
✅ 20251001_unsubscribes.sql
✅ 20251006_provider_msgid_unique.sql
✅ 20251006_add_updated_at_delivery_history.sql (temporary column)
```

### Test Data Convention
- **Sentinel Dataset ID:** `00000000-0000-0000-0000-000000000001`
- Auto-created by test mode execute to satisfy FK constraints
- All test jobs use this dataset_id
- Filter test data: `WHERE dataset_id = '00000000-0000-0000-0000-000000000001'`

### Admin Access
- Admin cookie or session required
- Set via `/admin/login` or `/api/test-auth?token=...`

---

## Test 1: Auth Enforcement

**Purpose:** Verify admin guard blocks unauthenticated requests

```bash
# Without admin cookie
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"job-1","dataset_id":"ds-1"}'
```

**Expected:**
```
HTTP/1.1 401 Unauthorized
{
  "ok": false,
  "code": "UNAUTHORIZED",
  "message": "Admin access required"
}
```

---

## Test 2: Feature Flag Disabled

**Purpose:** Verify feature flag gate works

**Setup:**
```bash
# In Vercel, set:
FEATURE_SEND_EXECUTE=0
```

```bash
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{"job_id":"job-1","dataset_id":"ds-1"}'
```

**Expected:**
```
HTTP/1.1 403 Forbidden
{
  "ok": false,
  "code": "FEATURE_DISABLED",
  "message": "Send execute is disabled"
}
```

**Cleanup:**
```bash
# Re-enable feature
FEATURE_SEND_EXECUTE=1
```

---

## Test 3: Execute Test Mode (Creates Rows for Callbacks)

**Purpose:** Verify test mode creates delivery_history rows with sentinel dataset

**Note:** Test mode now writes to database to enable callback testing

```bash
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer '$ADMIN_API_TOKEN \
  -H 'X-Request-Id: smoke-test-3' \
  -d '{
    "job_id": "'$(uuidgen | tr 'A-Z' 'a-z')'",
    "mode": "test",
    "emails": ["alice@example.com", "bob@example.com"]
  }'
```

**Expected:**
```
HTTP/1.1 200 OK
{
  "ok": true,
  "data": {
    "job_id": "test-<uuid>",
    "dataset_id": "00000000-0000-0000-0000-000000000001",
    "batch_id": "<uuid>",
    "selected": 2,
    "queued": 2,
    "deduped": 0
  }
}
```

**Capture the `job_id` and `batch_id` for use in callback tests below.**

**Verify Database:**
```sql
-- Check send_jobs row created
SELECT id, dataset_id, status FROM send_jobs WHERE id = 'test-<uuid>';
-- Expected: 1 row, dataset_id='00000000-0000-0000-0000-000000000001', status='pending'

-- Check delivery_history rows created
SELECT job_id, batch_id, email, status, dataset_id FROM delivery_history
WHERE job_id = 'test-<uuid>';
-- Expected: 2 rows (alice@example.com, bob@example.com), status='queued', dataset_id='00000000-0000-0000-0000-000000000001'

-- Check test dataset exists
SELECT id, name FROM content_datasets WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: 1 row, name='__test__'
```

**Verify Make.com:**
- Check webhook logs for payload:
  ```json
  {
    "job_id": "test-<uuid>",
    "dataset_id": "00000000-0000-0000-0000-000000000001",
    "batch_id": "<uuid>",
    "count": 2
  }
  ```

---

## Test 4: Provider Callback WITH provider_message_id (Idempotent)

**Purpose:** Verify callback updates pre-created rows and is idempotent

**Prerequisites:** Use `job_id` and `batch_id` from Test 3

```bash
# Call 1: With provider_message_id
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/provider/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Shared-Token: $MAKE_SHARED_TOKEN' \
  -d '{
    "job_id":"<JOB_ID_FROM_TEST_3>",
    "batch_id":"<BATCH_ID_FROM_TEST_3>",
    "results":[
      {"email":"alice@example.com","status":"delivered","provider_message_id":"SG-123"},
      {"email":"bob@example.com","status":"failed","provider_message_id":"SG-124","error":"bounce"}
    ]
  }'

# Call 2: Replay same payload (idempotency test)
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/provider/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Shared-Token: $MAKE_SHARED_TOKEN' \
  -d '{
    "job_id":"<JOB_ID_FROM_TEST_3>",
    "batch_id":"<BATCH_ID_FROM_TEST_3>",
    "results":[
      {"email":"alice@example.com","status":"delivered","provider_message_id":"SG-123"},
      {"email":"bob@example.com","status":"failed","provider_message_id":"SG-124","error":"bounce"}
    ]
  }'
```

**Expected (both calls):**
```json
{
  "ok": true,
  "data": {
    "ok": true
  }
}
```

**Verify Database:**
```sql
-- Check delivery_history updated (not inserted)
SELECT job_id, email, status, provider_message_id FROM delivery_history
WHERE job_id = '<JOB_ID_FROM_TEST_3>';
-- Expected: 2 rows
-- alice@example.com, status='delivered', provider_message_id='SG-123'
-- bob@example.com, status='failed', provider_message_id='SG-124'

-- Verify no duplicates created
SELECT COUNT(*) FROM delivery_history WHERE job_id = '<JOB_ID_FROM_TEST_3>';
-- Expected: 2 (not 4)
```

---

## Test 5: Provider Callback WITHOUT provider_message_id (Idempotent)

**Purpose:** Verify fallback path works when provider doesn't supply message ID

**Prerequisites:** Use DIFFERENT `job_id` and `batch_id` from fresh execute (Test 3 again)

```bash
# Call 1: Without provider_message_id
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/provider/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Shared-Token: $MAKE_SHARED_TOKEN' \
  -d '{
    "job_id":"<NEW_JOB_ID>",
    "batch_id":"<NEW_BATCH_ID>",
    "results":[
      {"email":"alice@example.com","status":"delivered"},
      {"email":"bob@example.com","status":"failed","error":"bounce"}
    ]
  }'

# Call 2: Replay same payload (idempotency test)
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/provider/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Shared-Token: $MAKE_SHARED_TOKEN' \
  -d '{
    "job_id":"<NEW_JOB_ID>",
    "batch_id":"<NEW_BATCH_ID>",
    "results":[
      {"email":"alice@example.com","status":"delivered"},
      {"email":"bob@example.com","status":"failed","error":"bounce"}
    ]
  }'
```

**Expected (both calls):**
```json
{
  "ok": true,
  "data": {
    "ok": true
  }
}
```

**Verify Database:**
```sql
-- Check delivery_history updated via composite key
SELECT job_id, batch_id, email, status, provider_message_id FROM delivery_history
WHERE job_id = '<NEW_JOB_ID>';
-- Expected: 2 rows
-- alice@example.com, status='delivered', provider_message_id=NULL
-- bob@example.com, status='failed', provider_message_id=NULL

-- Verify no duplicates created
SELECT COUNT(*) FROM delivery_history WHERE job_id = '<NEW_JOB_ID>';
-- Expected: 2 (not 4)
```

---

## Test 6: Make.com Timeout

**Purpose:** Verify timeout wrapper prevents hanging requests

**Setup:**
```bash
# Temporarily point MAKE_WEBHOOK_URL to slow endpoint
# Or use local delay server: http://httpbin.org/delay/10
```

```bash
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{
    "job_id": "job-timeout",
    "test_emails": ["test@example.com"]
  }'
```

**Expected (after ~5 seconds):**
```
HTTP/1.1 504 Gateway Timeout
{
  "ok": false,
  "code": "DISPATCH_FAILED",
  "message": "timeout"
}
```

**Cleanup:**
```bash
# Restore correct MAKE_WEBHOOK_URL
```

---

## Test 7: Provider Callback (Unauthorized)

**Purpose:** Verify token validation blocks unauthorized callbacks

```bash
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/provider/callback \
  -H 'Content-Type: application/json' \
  -d '{
    "provider_message_id": "sg-123",
    "job_id": "job-test-3",
    "email": "alice@example.com",
    "status": "delivered"
  }'
```

**Expected:**
```
HTTP/1.1 401 Unauthorized
{
  "ok": false,
  "code": "UNAUTHORIZED",
  "message": "Unauthorized"
}
```

---

## Test 8: Provider Callback (Authorized + Idempotent)

**Purpose:** Verify callback updates status and is idempotent

**Setup:**
- Use `job_id` from Test 3 (`job-test-3`)
- Get `MAKE_SHARED_TOKEN` from Vercel env

```bash
# Call 1
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/provider/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Shared-Token: YOUR_MAKE_SHARED_TOKEN' \
  -d '{
    "provider_message_id": "sg-abc-123",
    "job_id": "job-test-3",
    "batch_id": "batch-1",
    "email": "alice@example.com",
    "status": "delivered",
    "meta": {"send_at": "2025-10-01T12:00:00Z"}
  }'

# Call 2 (same payload)
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/provider/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Shared-Token: YOUR_MAKE_SHARED_TOKEN' \
  -d '{
    "provider_message_id": "sg-abc-123",
    "job_id": "job-test-3",
    "batch_id": "batch-1",
    "email": "alice@example.com",
    "status": "delivered",
    "meta": {"send_at": "2025-10-01T12:00:00Z"}
  }'
```

**Expected (both calls):**
```
HTTP/1.1 200 OK
{
  "ok": true,
  "data": {
    "ok": true
  }
}
```

**Verify:**
```sql
-- Check delivery_history updated
SELECT provider_message_id, status, meta FROM delivery_history 
WHERE job_id = 'job-test-3' AND email = 'alice@example.com';
-- Expected: provider_message_id='sg-abc-123', status='delivered', meta present

-- Verify no duplicates
SELECT COUNT(*) FROM delivery_history 
WHERE provider_message_id = 'sg-abc-123';
-- Expected: 1
```

---

## Test 9: Unsubscribe Link

**Purpose:** Verify end-to-end unsubscribe flow

**Setup:**
- Generate HMAC token for test email

```typescript
// Use Node.js REPL or browser console
const crypto = require('crypto')
const email = 'test@example.com'
const listKey = 'general'
const secret = 'YOUR_UNSUB_SECRET'
const token = crypto.createHmac('sha256', secret)
  .update(`${email}:${listKey}`)
  .digest('base64url')
console.log(token)
```

```bash
# Click unsubscribe link
curl -i "https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/unsubscribe?email=test@example.com&list=general&token=YOUR_GENERATED_TOKEN"
```

**Expected:**
```
HTTP/1.1 200 OK
Content-Type: text/html

<h1>You're unsubscribed</h1>
<p>test@example.com will no longer receive emails from this list.</p>
```

**Verify:**
```sql
SELECT email, list_key FROM unsubscribes WHERE email = 'test@example.com';
-- Expected: 1 row, list_key='general'
```

**Test Invalid Token:**
```bash
curl -i "https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/unsubscribe?email=test@example.com&list=general&token=INVALID_TOKEN"
```

**Expected:**
```
HTTP/1.1 400 Bad Request

<h1>Unsubscribe</h1>
<p>Invalid or expired link.</p>
```

---

## Test 10: Invalid Body Handling

**Purpose:** Verify error handling for malformed requests

```bash
# Missing job_id
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{"test_emails":["test@example.com"]}'

# Missing dataset_id AND test_emails
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{"job_id":"job-1"}'

# Invalid JSON
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d 'NOT_JSON'
```

**Expected (all):**
```
HTTP/1.1 400 Bad Request
{
  "ok": false,
  "code": "INVALID_BODY",
  "message": "..."
}
```

---

## Acceptance Checklist

### `/api/send/execute`
- [ ] ✅ 401 without admin cookie
- [ ] ✅ 403 when `FEATURE_SEND_EXECUTE=0`
- [ ] ✅ 200 with valid test mode request
- [ ] ✅ Deduplication works (same job = no re-queue)
- [ ] ✅ Dataset constraint prevents duplicate recipient
- [ ] ✅ Make.com receives correct payload
- [ ] ✅ Timeout returns 504 after ~5s
- [ ] ✅ Error codes match spec: `FEATURE_DISABLED`, `INVALID_BODY`, `DISPATCH_FAILED`, etc.

### `/api/provider/callback`
- [ ] ✅ 401 without `X-Shared-Token` header
- [ ] ✅ 401 with invalid token
- [ ] ✅ 200 with valid callback
- [ ] ✅ Idempotent (duplicate calls don't create duplicate rows)
- [ ] ✅ Updates `delivery_history` status correctly
- [ ] ✅ Handles both `provider_message_id` and composite key

### `/api/unsubscribe`
- [ ] ✅ 200 with valid HMAC token
- [ ] ✅ 400 with invalid/expired token
- [ ] ✅ Records unsubscribe event in database
- [ ] ✅ Returns HTML confirmation page
- [ ] ✅ Captures user agent and IP for audit

---

**Status:** Ready for production smoke testing  
**Last Updated:** October 1, 2025

