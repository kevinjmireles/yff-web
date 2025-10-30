# Quick Testing Guide: [[DELEGATION]] Token

**Target Audience**: Code reviewer / QA tester
**Estimated Time**: 15 minutes

---

## TL;DR - Can I Test in Browser Before Production?

**YES!** Three ways:

1. ✅ **Best**: Test send to your own email (see "Quick E2E Test" below)
2. ✅ **Fast**: Call personalization API and view JSON response
3. ✅ **Visual**: Deploy to Vercel preview branch and test there

---

## Quick E2E Test (Recommended)

### 1. Start Dev Server
```bash
pnpm dev
```

### 2. Send Test Email to Yourself
```bash
curl -X POST http://localhost:3000/api/send/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -d '{
    "job_id": "'$(uuidgen)'",
    "mode": "test",
    "emails": ["YOUR_EMAIL@example.com"],
    "dataset_id": "YOUR_DATASET_ID"
  }'
```

### 3. Check Your Email Inbox
Look for:
- ✅ Representatives list with 2-3 names
- ✅ Website links (click to verify they work)
- ✅ Phone numbers (click to verify tel: links work on mobile)
- ✅ No 404 errors or broken links
- ✅ No "delegation link unavailable" messages

**Expected appearance**:
```
• Senator Jon Husted
  (https://www.husted.senate.gov)
  (202) 224-3353

• Senator Bernie Moreno
  (https://www.moreno.senate.gov)
  (202) 224-2315

• Rep. Troy Balderson (OH-12)
  (https://balderson.house.gov)
  (202) 225-5355
```

---

## Quick Smoke Test (2 minutes)

```bash
# Load env vars and run
set -a && source .env.local && set +a
node scripts/test-delegation-token.mjs
```

**Expected output**:
```
✅ Found profile: test+ohio@example.com
✅ Found 2 senators
✅ All officials have phone + website
✅ Database smoke test passed!
```

**If it fails**: Check database has officials data or ask Kevin.

---

## Quick API Test (Browser-Friendly)

### 1. Get a Test Profile Email
```bash
# Find a profile with ocd_ids
curl http://localhost:3000/api/profiles | jq '.[] | select(.ocd_ids != null) | .email' | head -1
```

Or use: `test+ohio@example.com`

### 2. Call Personalization API in Browser

Open in Chrome/Firefox:
```
http://localhost:3000/api/send/personalize?job_id=00000000-0000-0000-0000-000000000000&batch_id=00000000-0000-0000-0000-000000000000&email=test+ohio@example.com&dataset_id=YOUR_DATASET_ID
```

### 3. View JSON Response

Look for `html` field containing:
```json
{
  "ok": true,
  "html": "...<ul><li>Senator Jon Husted<br />(<a href=\"https://www.husted.senate.gov\"..."
}
```

### 4. Validate
- ✅ `html` contains `<ul>` and `<li>`
- ✅ NO `[[DELEGATION]]` token visible
- ✅ Contains senator names
- ✅ Contains phone numbers
- ✅ Contains website URLs

### 5. Visual Preview (Optional)

Copy `html` value and paste into this template:
```html
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <!-- PASTE HTML HERE -->
</body>
</html>
```

Save as `test.html` and open in browser. Click links to verify they work.

---

## What Could Go Wrong?

### Issue: "Representative information unavailable"
**Cause**: No state found in ocd_ids
**Fix**: Use profile with valid ocd_ids containing state

### Issue: Only 2 senators, no rep
**Cause**: Profile has state but no congressional district
**Fix**: Normal behavior OR use profile with `cd:` in ocd_ids

### Issue: Query returns empty
**Cause**: Database missing officials data
**Fix**: Ask Kevin to verify officials tables populated

### Issue: Phone/website missing
**Cause**: official_contacts table missing data
**Fix**: Check `method='phone'` and `method='webform'` exist for officials

### Issue: 404 on delegate links
**Cause**: Old delegation link code still in use
**Fix**: Verify you're testing the NEW code (after commit)

---

## Vercel Preview Testing (Before Production)

### 1. Create Preview Branch
```bash
git checkout -b test/delegation-token
git add .
git commit -m "test: delegation token implementation"
git push origin test/delegation-token
```

### 2. Vercel Auto-Deploys
Wait ~2 minutes. Vercel comments on PR with preview URL:
```
https://yff-web-git-test-delegation-token-kevin.vercel.app
```

### 3. Test on Preview
Use preview URL instead of localhost:
```bash
curl "https://yff-web-git-test-delegation-token-kevin.vercel.app/api/send/personalize?..."
```

### 4. Send Test Email from Preview
Same as E2E test but use preview URL:
```bash
curl -X POST https://yff-web-git-test-delegation-token-kevin.vercel.app/api/send/execute ...
```

### 5. Verify Email Sent from Preview
Check inbox - email should look identical to local dev test.

---

## Pass/Fail Criteria

### ✅ PASS if:
1. Smoke test passes
2. Personalization API returns HTML with `<ul><li>` list
3. Test email received with representative names
4. Website links clickable and work
5. Phone links clickable (tel: protocol)
6. No "delegation link unavailable" messages
7. No 404 errors
8. No console errors in Next.js logs

### ❌ FAIL if:
1. Smoke test fails (database issue)
2. `[[DELEGATION]]` token not replaced
3. Email shows "Representative information unavailable" for valid profiles
4. Links broken or point to wrong URLs
5. HTML malformed (unclosed tags, XSS issues)
6. Query errors in logs
7. Type errors on build

---

## Time Estimates

| Task | Time |
|------|------|
| Smoke test | 30 seconds |
| API test (browser) | 2 minutes |
| E2E test (real email) | 5 minutes |
| Visual HTML preview | 3 minutes |
| Vercel preview test | 10 minutes |
| **Total** | ~15 minutes |

---

## Support

**Questions?** Check full review doc: `docs/review/DELEGATION-TOKEN-IMPLEMENTATION.md`

**Issues?**
1. Check database has officials data
2. Verify env vars set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
3. Check profile has ocd_ids with state
4. Review Next.js logs for query errors

---

**Last Updated**: 2025-10-29
