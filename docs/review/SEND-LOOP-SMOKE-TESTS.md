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
```

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

## Test 3: Test Mode (Explicit Emails)

**Purpose:** Verify test mode with explicit email list

**Note:** No `mode` parameter needed - auto-detected from presence of `test_emails[]`

```bash
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -H 'X-Request-Id: smoke-test-3' \
  -d '{
    "job_id": "job-test-3",
    "test_emails": ["alice@example.com", "bob@example.com", "alice@example.com"]
  }'
```

**Expected:**
```
HTTP/1.1 200 OK
{
  "ok": true,
  "data": {
    "job_id": "job-test-3",
    "dataset_id": null,
    "queued": 2,
    "deduped": 1
  }
}
```

**Verify:**
```sql
-- Check delivery_history
SELECT job_id, email, status FROM delivery_history WHERE job_id = 'job-test-3';
-- Expected: 2 rows (alice@example.com, bob@example.com), status='queued'
```

**Verify Make.com:**
- Check webhook logs for payload:
  ```json
  {
    "job_id": "job-test-3",
    "dataset_id": null,
    "count": 2
  }
  ```

---

## Test 4: Idempotency (Same Job)

**Purpose:** Verify job-level deduplication prevents re-enqueuing

```bash
# Call 1
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{
    "job_id": "job-idem-4",
    "test_emails": ["test@example.com"]
  }'

# Call 2 (same job_id)
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{
    "job_id": "job-idem-4",
    "test_emails": ["test@example.com"]
  }'
```

**Expected Call 1:**
```json
{
  "ok": true,
  "data": {
    "queued": 1,
    "deduped": 0
  }
}
```

**Expected Call 2:**
```json
{
  "ok": true,
  "data": {
    "queued": 0,
    "deduped": 1
  }
}
```

**Verify:**
```sql
-- Should only have 1 row
SELECT COUNT(*) FROM delivery_history WHERE job_id = 'job-idem-4';
-- Expected: 1
```

---

## Test 5: Dataset-Level Deduplication

**Purpose:** Verify dataset constraint prevents duplicate recipient across jobs

**Setup:**
```sql
-- Manually insert a row (simulating previous send)
INSERT INTO delivery_history (job_id, dataset_id, email, status)
VALUES ('old-job', 'ds-nyc', 'nyc-resident@example.com', 'delivered');
```

```bash
# Try to send to same recipient with different job
curl -i -X POST https://yff-jp7s8zksi-kevinjmireles-projects.vercel.app/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{
    "job_id": "new-job",
    "dataset_id": "ds-nyc",
    "test_emails": ["nyc-resident@example.com"]
  }'
```

**Expected:**
```json
{
  "ok": true,
  "data": {
    "queued": 0,
    "deduped": 1
  }
}
```

**Verify:**
```sql
-- Should still only have 1 row (the old one)
SELECT job_id, dataset_id, email FROM delivery_history 
WHERE dataset_id = 'ds-nyc' AND email = 'nyc-resident@example.com';
-- Expected: 1 row, job_id='old-job'
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

