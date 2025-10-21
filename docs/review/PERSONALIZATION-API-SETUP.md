# Personalization API Setup Guide

**Date:** October 21, 2025
**Status:** Ready for testing
**Related:** MAKE-MODULE-UPDATE-2025-10-17.md

---

## Summary

New `/api/send/personalize` endpoint enables per-recipient content customization via Make.com iterator pattern. Each recipient gets personalized subject/body content from the database with token resolution for dynamic elements like `[[DELEGATION]]`.

---

## API Endpoint

### GET `/api/send/personalize`

**Query Parameters:**
- `job_id` (required, UUID) - Send job identifier
- `batch_id` (required, UUID) - Batch identifier
- `email` (required, email) - Recipient email address
- `dataset_id` (optional, UUID) - Content dataset ID (auto-resolved from send_jobs if omitted)

**Response:**
```json
{
  "ok": true,
  "job_id": "...",
  "batch_id": "...",
  "email": "user@example.com",
  "subject": "Hello — Your Friend Fido",
  "html": "<p>Personalized HTML content...</p>",
  "text": "Personalized text content..."
}
```

**Features:**
- ✅ Fetches content from `v2_content_items_staging` (matches import flow)
- ✅ Resolves `[[DELEGATION]]` tokens to HTML links
- ✅ Provides both HTML and text versions
- ✅ Fallback content if no dataset content found
- ✅ Auto-resolves dataset_id from send_jobs table

---

## Make.com Configuration

### Updated Flow

```
Webhook (1)
  → Iterator (2)
  → HTTP GET Personalize (3) [NEW]
  → HTTP POST SendGrid (4)
  → HTTP POST Callback (5)
```

---

## Module 3: HTTP GET - Personalize (NEW)

**Module Type:** HTTP - Make a request

**Settings:**
- **URL:**
  ```
  https://yff-web.vercel.app/api/send/personalize?job_id={{1.job_id}}&batch_id={{1.batch_id}}&email={{2.value}}&dataset_id={{1.dataset_id}}
  ```
- **Method:** GET
- **Parse response:** Yes

**Output Available:**
- `{{3.data.subject}}` - Email subject line
- `{{3.data.html}}` - HTML email body
- `{{3.data.text}}` - Plain text email body

---

## Module 4: HTTP POST - SendGrid (UPDATED)

**Module Type:** HTTP - Make a request

**URL:** `https://api.sendgrid.com/v3/mail/send`

**Headers:**
```
Authorization: Bearer {{YOUR_SENDGRID_API_KEY}}
Content-Type: application/json
```

**Body (Raw JSON):**
```json
{
  "personalizations": [
    { "to": [ { "email": "{{2.value}}" } ] }
  ],
  "from": {
    "email": "fido@myrepresentatives.com",
    "name": "Your Friend Fido"
  },
  "subject": "{{3.data.subject}}",
  "content": [
    { "type": "text/html", "value": "{{3.data.html}}" }
  ]
}
```

**Alternative (Plain Text):**
```json
{
  "content": [
    { "type": "text/plain", "value": "{{3.data.text}}" }
  ]
}
```

---

## Module 5: HTTP POST - Callback (UPDATED MODULE NUMBERS)

**Module Type:** HTTP - Make a request

**URL:** `https://yff-web.vercel.app/api/provider/callback`

**Headers:**
```
Content-Type: application/json
X-Shared-Token: {{MAKE_SHARED_TOKEN}}
```

**Body (Raw JSON):**
```json
{
  "job_id": "{{1.job_id}}",
  "batch_id": "{{1.batch_id}}",
  "results": [
    {
      "email": "{{2.value}}",
      "status": "delivered",
      "provider_message_id": "{{4.headers[5].value}}"
    }
  ]
}
```

**Note:** Module numbers shift because personalize becomes Module 3:
- `{{2.value}}` - Email from iterator (was Module X)
- `{{4.headers[5].value}}` - SendGrid message ID (was Module 3)

---

## Token System

### Currently Supported Tokens

| Token | Description | Output |
|-------|-------------|--------|
| `[[DELEGATION]]` | Link to delegate action | `<p>If you can't email right now, you can <a href="...">delegate this action</a>.</p>` |

### Future Tokens (Planned)

| Token | Description | Example |
|-------|-------------|---------|
| `[[FIRST_NAME]]` | Recipient first name | `Maria` |
| `[[ZIP.hazard_flag]]` | Hazard level by ZIP | `High` |
| `[[DELEGATION_REPS]]` | Rep names from OCD IDs | `Sen. Padilla; Sen. Butler; Rep. Sánchez` |

### Adding New Tokens

Edit `src/app/api/send/personalize/route.ts` in the `resolveTokens()` function:

```typescript
function resolveTokens(html: string, ctx: { job_id: string; batch_id: string; email: string }) {
  let out = html ?? ''

  // Existing
  out = out.replace(/\[\[DELEGATION\]\]/g, buildDelegationHTML(ctx))

  // Add new tokens here
  out = out.replace(/\[\[FIRST_NAME\]\]/g, getFirstName(ctx.email))

  return out
}
```

---

## Testing

### 1. Test API Directly

```bash
curl "https://yff-web.vercel.app/api/send/personalize?job_id=$(uuidgen | tr 'A-Z' 'a-z')&batch_id=$(uuidgen | tr 'A-Z' 'a-z')&email=test@example.com"
```

**Expected Response:**
```json
{
  "ok": true,
  "job_id": "...",
  "batch_id": "...",
  "email": "test@example.com",
  "subject": "Update from Your Friend Fido",
  "html": "<p>Thanks for staying engaged.</p>",
  "text": "Thanks for staying engaged."
}
```

### 2. Test with Real Dataset

First, upload content via `/admin/content` page, then:

```bash
# Get dataset_id from content_datasets table
DATASET_ID="..."

curl "https://yff-web.vercel.app/api/send/personalize?job_id=$(uuidgen | tr 'A-Z' 'a-z')&batch_id=$(uuidgen | tr 'A-Z' 'a-z')&email=test@example.com&dataset_id=$DATASET_ID"
```

**Expected:** Returns subject and body_md from `v2_content_items_staging`

### 3. Test End-to-End via Make.com

```bash
# Trigger send/execute with test emails
JOB=$(uuidgen | tr 'A-Z' 'a-z')
curl -sS -X POST https://yff-web.vercel.app/api/send/execute \
  -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id":"'"$JOB"'",
    "mode":"test",
    "emails":["user1@example.com","user2@example.com"]
  }'
```

**Expected Make.com Execution:**
- ✅ Module 1 (Webhook): Receives `emails` array
- ✅ Module 2 (Iterator): Loops through each email
- ✅ Module 3 (Personalize): Returns subject/html for each email
- ✅ Module 4 (SendGrid): Sends personalized email
- ✅ Module 5 (Callback): Updates delivery_history to `delivered`

**Database Check:**
```sql
SELECT job_id, email, status, provider_message_id
FROM delivery_history
WHERE job_id = '<JOB_ID>'
ORDER BY email;
```

**Expected:**
```
job_id    | email              | status    | provider_message_id
----------|--------------------|-----------|-----------------------
<JOB_ID>  | user1@example.com  | delivered | <sendgrid_id>
<JOB_ID>  | user2@example.com  | delivered | <sendgrid_id>
```

---

## Content Authoring with Tokens

### Example Content CSV

```csv
external_id,title,html,topic,geo_level,geo_code,start_date,end_date,priority,source_url
action-2025-10,Take Action Now,"<h2>Contact Your Representatives</h2><p>This is an urgent issue. [[DELEGATION]]</p><p>Thank you for taking action!</p>",environment,state,OH,2025-10-21,2025-11-21,10,https://example.com
```

### Rendered Output

When sent to `user@example.com` with `job_id=abc` and `batch_id=xyz`:

**Subject:** `Take Action Now`

**HTML:**
```html
<h2>Contact Your Representatives</h2>
<p>This is an urgent issue.
  <p>
    If you can't email right now, you can
    <a href="https://yff-web.vercel.app/delegate?job_id=abc&batch_id=xyz&email=user@example.com" target="_blank" rel="noopener noreferrer">
      delegate this action
    </a>.
  </p>
</p>
<p>Thank you for taking action!</p>
```

---

## Architecture Notes

### Why Iterator Pattern?

**Current (Iterator):**
- ✅ Each recipient gets unique subject/body
- ✅ Clear, testable behavior
- ✅ Easy to debug per-recipient issues
- ❌ One SendGrid API call per recipient (higher credits)

**Future (Batch Pre-render):**
- Move personalization into `/api/send/execute`
- Include `recipients[]` array with pre-rendered content in webhook
- Remove personalize HTTP module from Make.com
- ✅ Reduces to 2 credits per batch
- ❌ More complex implementation

**Decision:** Start with iterator for MVP clarity, optimize later.

### Content Table Selection

**Staging vs Production:**
- **Current:** API reads from `v2_content_items_staging`
- **Reason:** Matches import flow, allows testing before promotion
- **Future:** Add `?use_production=true` param to read from `v2_content_items`

**Content Selection Logic:**
- **Current:** First row matching `dataset_id`
- **Missing:** Geographic filtering, priority sorting, audience rules
- **Future:** Add `ocd_scope` filtering based on recipient profile

---

## Troubleshooting

### "INVALID_PARAMS" Error
**Cause:** Missing required query parameters or invalid format
**Fix:** Ensure `job_id`, `batch_id`, and `email` are present and valid

### "JOB_LOOKUP_FAILED" Error
**Cause:** `send_jobs` table has no row with that `job_id`
**Fix:** Ensure `/api/send/execute` created the send_jobs row before Make.com runs

### "NO_DATASET" Error
**Cause:** Could not resolve `dataset_id` from query params or send_jobs
**Fix:** Either pass `dataset_id` explicitly or ensure send_jobs row has valid dataset_id

### "CONTENT_LOOKUP_FAILED" Error
**Cause:** Database error when querying `v2_content_items_staging`
**Fix:** Check Supabase logs for query errors, verify table exists and has data

### Module Numbers Wrong in Make.com
**Cause:** Added personalize module but didn't update downstream references
**Fix:**
- Iterator is Module 2 → use `{{2.value}}`
- Personalize is Module 3 → use `{{3.data.subject}}`
- SendGrid is Module 4 → use `{{4.headers[5].value}}`

### [[DELEGATION]] Link Returns 404
**Status:** Expected - `/delegate` route not yet implemented
**Fix:** Token is ready for future use, no action needed for MVP

---

## Related Documentation

- [Send Execute Endpoint](../specs/send_execute_endpoint.md)
- [Make Module Update Guide](MAKE-MODULE-UPDATE-2025-10-17.md)
- [Token Authoring Guide](../guides/YFF_Token_Authoring_Guide.md)
- [Content Import Guide](../guides/content-import-and-tokens.md)

---

## Credits

**Implementation Date:** October 21, 2025
**API Endpoint:** `/api/send/personalize`
**Make.com Pattern:** Iterator → Personalize → SendGrid → Callback
**Token Support:** `[[DELEGATION]]` (more coming soon)
