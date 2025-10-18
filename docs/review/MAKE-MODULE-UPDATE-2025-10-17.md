# Make.com Module Update - Remove Hardcoded Test Emails

**Date:** October 17, 2025
**Status:** Ready to implement
**Related:** MAKE-INTEGRATION-DEBUG-2025-10-10.md

---

## Summary

The `/api/send/execute` endpoint now includes `emails[]` array in the webhook payload. You need to update Make.com Modules 3 and 4 to use this dynamic data instead of hardcoded `a@example.com` and `b@example.com`.

---

## What Changed in the API

The webhook payload now includes the actual recipient emails:

**Before:**
```json
{
  "job_id": "...",
  "dataset_id": "...",
  "batch_id": "...",
  "count": 1
}
```

**After:**
```json
{
  "job_id": "...",
  "dataset_id": "...",
  "batch_id": "...",
  "count": 1,
  "emails": ["columbus1@myrepresentatives.com"]  // ← NEW
}
```

---

## Make.com Module Updates Required

### Module 3 (HTTP - SendGrid API)

**Current (hardcoded):**
```json
{
  "personalizations": [
    { "to": [ { "email": "a@example.com" } ] }
  ],
  "from": { "email": "fido@myrepresentatives.com", "name": "Your Friend Fido" },
  "subject": "YFF test",
  "content": [
    { "type": "text/plain", "value": "Hello from YFF." }
  ]
}
```

**Update to (dynamic):**
```json
{
  "personalizations": [
    { "to": [ { "email": "{{1.emails[1]}}" } ] }
  ],
  "from": { "email": "fido@myrepresentatives.com", "name": "Your Friend Fido" },
  "subject": "YFF test",
  "content": [
    { "type": "text/plain", "value": "Hello from YFF." }
  ]
}
```

**Note:** Make.com uses **1-based array indexing**, so the first email is `{{1.emails[1]}}`, not `{{1.emails[0]}}`.

---

### Module 4 (HTTP - YFF Callback)

**Current (hardcoded):**
```json
{
  "job_id": "{{1.job_id}}",
  "batch_id": "{{1.batch_id}}",
  "results": [
    {
      "email": "a@example.com",
      "status": "delivered",
      "provider_message_id": "{{3.headers[5].value}}"
    },
    {
      "email": "b@example.com",
      "status": "delivered"
    }
  ]
}
```

**Update to (dynamic, MVP - single recipient):**
```json
{
  "job_id": "{{1.job_id}}",
  "batch_id": "{{1.batch_id}}",
  "results": [
    {
      "email": "{{1.emails[1]}}",
      "status": "delivered",
      "provider_message_id": "{{get(toCollection(3.headers; \"name\"; \"value\"); \"x-message-id\")}}"
    }
  ]
}
```

**Alternative (if provider_message_id formula doesn't work):**
```json
{
  "job_id": "{{1.job_id}}",
  "batch_id": "{{1.batch_id}}",
  "results": [
    {
      "email": "{{1.emails[1]}}",
      "status": "delivered",
      "provider_message_id": "{{3.headers[5].value}}"
    }
  ]
}
```

---

## Step-by-Step Instructions

### 1. Update Module 3 (SendGrid)

1. Open your Make.com scenario
2. Click on **Module 3** (HTTP - Make a request to SendGrid)
3. Find the **Request content** field
4. Replace `"a@example.com"` with `{{1.emails[1]}}`
5. Click **OK** to save

### 2. Update Module 4 (Callback)

1. Click on **Module 4** (HTTP - Make a request to YFF Callback)
2. Find the **Request content** field
3. Replace the entire `results` array with the new version above
4. Try the `toCollection()` formula first; if Make's autocomplete breaks it, use the index-based `{{3.headers[5].value}}`
5. Click **OK** to save

### 3. Save and Test

1. Make.com will autosave your changes
2. Click **Save** on the scenario (bottom right)
3. Run a test (see Testing section below)

---

## Testing

### Clear the Queue First

Before testing, **delete any old queued webhooks** in Make.com:
1. Go to **Webhooks** → **send_execute_webhook** → **Queue**
2. Select all old webhooks
3. Click **Delete**

### Run a Fresh Test

```bash
JOB=$(uuidgen | tr 'A-Z' 'a-z')
curl -sS -X POST https://yff-web.vercel.app/api/send/execute \
  -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id":"'"$JOB"'",
    "mode":"test",
    "emails":["columbus1@myrepresentatives.com"]
  }'
echo
echo "JOB=$JOB"
```

### Expected Results

**Make.com execution:**
- ✅ Module 1 (Webhook): Bundle shows `emails[1] = "columbus1@myrepresentatives.com"`
- ✅ Module 3 (SendGrid): Shows recipient as `columbus1@myrepresentatives.com` (not `a@example.com`)
- ✅ Module 4 (Callback): Shows email as `columbus1@myrepresentatives.com` in results array
- ✅ Status: 200 OK

**Database check:**
```sql
SELECT job_id, email, status, provider_message_id
FROM delivery_history
WHERE job_id = '<JOB_ID>'
ORDER BY email;
```

**Expected:**
```
job_id                                | email                              | status    | provider_message_id
--------------------------------------|------------------------------------|-----------|-----------------------
<JOB_ID>                              | columbus1@myrepresentatives.com    | delivered | <actual_sendgrid_id>
```

**Should NOT see:**
- ❌ `a@example.com`
- ❌ `b@example.com`

---

## Future: Iterator Pattern (Post-MVP)

For production with multiple recipients per send, you'll want to add an **Iterator module**:

**Updated scenario flow:**
1. **Webhooks [1]** - Receive webhook with `emails[]` array
2. **Tools → Iterator [2]** - Iterate over `{{1.emails}}` array
3. **HTTP - SendGrid [3]** - Send to `{{2}}` (one email per iteration)
4. **HTTP - Callback [4]** - Post result for `{{2}}`

**Module 3 (with Iterator):**
```json
{
  "personalizations": [
    { "to": [ { "email": "{{2}}" } ] }
  ],
  "from": { "email": "fido@myrepresentatives.com", "name": "Your Friend Fido" },
  "subject": "YFF test",
  "content": [
    { "type": "text/plain", "value": "Hello from YFF." }
  ]
}
```

**Module 4 (with Iterator):**
```json
{
  "job_id": "{{1.job_id}}",
  "batch_id": "{{1.batch_id}}",
  "results": [
    {
      "email": "{{2}}",
      "status": "delivered",
      "provider_message_id": "{{get(toCollection(3.headers; \"name\"; \"value\"); \"x-message-id\")}}"
    }
  ]
}
```

**Benefits:**
- ✅ Each recipient gets a unique `provider_message_id`
- ✅ No UNIQUE constraint conflicts
- ✅ All `delivery_history` rows update to `delivered` status
- ✅ Proper tracking per recipient

---

## Database Schema Changes

**Migration:** `supabase/migrations/20251017_change_provider_message_id_unique.sql`
**Applied:** October 17, 2025

### What Changed

**Old constraint:**
```sql
UNIQUE(provider_message_id)
```
- One row per SendGrid message ID
- Prevented batch sends (second recipient would violate constraint)

**New constraint:**
```sql
UNIQUE(provider_message_id, email)
```
- Multiple rows can share same message ID if emails differ
- Enables batch sends with 2 credits per batch

### Why This Change Was Needed

SendGrid returns **ONE** `x-message-id` per API call, even with multiple recipients. The old single-column unique constraint prevented us from storing multiple delivery records with the same provider message ID, which blocked batch send support.

### Code Impact

**File:** `src/app/api/provider/callback/route.ts:96`

**Updated upsert to match new composite constraint:**
```typescript
// Before
{ onConflict: 'provider_message_id' }

// After
{ onConflict: 'provider_message_id,email' }
```

This allows the callback API to correctly handle multiple recipients sharing the same SendGrid message ID in a single batch send.

### Benefits

- ✅ Batch sends work with 2 credits (1 SendGrid call + 1 callback)
- ✅ No more unique constraint violations on batch sends
- ✅ Each `(provider_message_id, email)` pair is unique
- ✅ Maintains idempotency for callbacks
- ✅ Backward compatible with single-recipient sends

---

## Troubleshooting

### "Module references non-existing module 'NaN'"
- **Cause:** Webhook bundle is empty
- **Fix:** Trigger `/api/send/execute` immediately after clicking "Run once" OR turn scenario ON

### Email still shows as `a@example.com`
- **Cause:** Make.com cached the old module configuration
- **Fix:**
  1. Clear webhook queue
  2. Re-save Module 3 and Module 4
  3. Run fresh test

### `provider_message_id` shows "undefined" or null
- **Cause:** Formula syntax error or header index wrong
- **Fix:** Use index-based approach: `{{3.headers[5].value}}`
- **Check:** Inspect Module 3 output to see actual header array structure

### Scenario not processing automatically
- **Cause:** Scenario is "On Demand" but not turned ON
- **Fix:** Turn scenario ON and set schedule to "Immediately"

---

## Related Documentation

- [Send Execute Endpoint Spec](../specs/send_execute_endpoint.md)
- [Make Integration Debug Session](MAKE-INTEGRATION-DEBUG-2025-10-10.md)
- [Send Loop Smoke Tests](SEND-LOOP-SMOKE-TESTS.md)

---

## Credits

**Implementation Date:** October 17, 2025
**Code Changes:** `/api/send/execute` now includes `emails[]` in webhook payload
**Make.com Changes:** Replace hardcoded emails with dynamic mappings
