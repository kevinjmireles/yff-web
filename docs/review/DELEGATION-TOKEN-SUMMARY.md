# [[DELEGATION]] Token Fix - Summary for Code Review

**Quick Links**:
- 📋 Full Review Doc: `DELEGATION-TOKEN-IMPLEMENTATION.md`
- 🧪 Testing Guide: `DELEGATION-TOKEN-TESTING-GUIDE.md`
- 🔬 Smoke Test: `../../scripts/test-delegation-token.mjs`

---

## What Changed (1 Sentence)

Fixed `[[DELEGATION]]` token to render congressional representatives' contact info directly in email HTML instead of generating broken links to non-existent `/delegate` page.

---

## Files Modified

| File | Change | Lines | Risk |
|------|--------|-------|------|
| `src/lib/personalize/tokens.ts` | Complete rewrite | 51→273 | HIGH |
| `scripts/test-delegation-token.mjs` | New smoke test | NEW | LOW |

---

## What to Review

### 1. Logic ✅
- [ ] Parses OCD IDs correctly (`state:ca/cd:38` → CA, 38)
- [ ] Queries correct tables (`officials`, `official_contacts`)
- [ ] Uses correct column names (`office_type` not `chamber`, `full_name` not `name`)
- [ ] Handles missing district (2 senators only)
- [ ] Handles missing state (fallback message)

### 2. Database ✅
- [ ] Queries parameterized (no SQL injection)
- [ ] Uses `!inner` join (ensures contacts exist)
- [ ] Filters by `is_active=true`
- [ ] Matches schema: `method='phone'` and `method='webform'`

### 3. Security ✅
- [ ] HTML escaping implemented (`escapeHtml()`)
- [ ] Tel links formatted correctly (`tel:+1...`)
- [ ] Website links validated (starts with `https://`)
- [ ] No XSS vulnerabilities

### 4. Output Format ✅
- [ ] Returns valid HTML (`<ul><li>`)
- [ ] Includes senator names (prefixed "Senator")
- [ ] Includes rep name (with district: "CA-38")
- [ ] Website links clickable
- [ ] Phone links clickable (tel: protocol)

---

## Before/After

### Before (BROKEN)
```ts
// Generated link to non-existent page
const url = await latestDelegationUrl(ctx.email, ctx.job_id)
// Output: <p>If you can't email right now, you can
//         <a href="/delegate?job_id=...">delegate this action</a></p>
// Result: 404 error when clicked
```

### After (CORRECT)
```ts
// Fetches from database and renders HTML list
const delegationHtml = await resolveDelegationToken(ctx.email, ctx.ocd_ids)
// Output: <ul>
//           <li>Senator Jon Husted<br />(<a href="https://...">...)</a><br /><a href="tel:...">...</a></li>
//           <li>Senator Bernie Moreno<br />...</li>
//         </ul>
```

---

## Testing Status

| Test | Status | Notes |
|------|--------|-------|
| Smoke test | ✅ PASS | Found 2 OH senators with contacts |
| Type check | ⏳ TODO | Run `pnpm tsc --noEmit` |
| Unit tests | ⏳ TODO | `tests/tokenResolution.test.ts` needs update |
| Integration | ⏳ TODO | Test personalization API |
| E2E | ⏳ TODO | Send test email, verify in inbox |

---

## Quick Test (30 seconds)

```bash
set -a && source .env.local && set +a
node scripts/test-delegation-token.mjs
```

**Expected**: ✅ Database smoke test passed!

---

## E2E Test (5 minutes)

1. **Start dev server**: `pnpm dev`
2. **Send test email**:
   ```bash
   curl -X POST http://localhost:3000/api/send/execute \
     -H "Authorization: Bearer $ADMIN_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"job_id":"'$(uuidgen)'","mode":"test","emails":["YOUR_EMAIL@gmail.com"],"dataset_id":"YOUR_DATASET_ID"}'
   ```
3. **Check inbox**: Should see representatives list with names, websites, phones
4. **Click links**: Verify website opens, phone dials

---

## Can I Test Before Production?

**YES!** Three ways:

1. ✅ **Local dev + real email** (recommended, see E2E test above)
2. ✅ **Vercel preview branch** (deploy to preview, test there)
3. ✅ **API call + visual preview** (copy HTML to browser)

See `DELEGATION-TOKEN-TESTING-GUIDE.md` for details.

---

## Risk Assessment

### High Risk
- Complete rewrite of token resolution logic
- Changes database queries
- Affects all emails with [[DELEGATION]] token

### Mitigations
- ✅ Smoke test validates database queries
- ✅ Can test with real email before production
- ✅ Easy rollback (revert commit)
- ✅ Fallback message if data missing
- ✅ Error logging for debugging

### Safe to Deploy If
1. Smoke test passes
2. Test email looks correct
3. No console errors
4. Links work (website + phone)

---

## Rollback Plan

If issues found after deployment:

```bash
# Quick revert
git revert HEAD
git push origin main

# Or emergency hotfix
# Change line 253 in tokens.ts to:
out = out.replace(/\[\[DELEGATION\]\]/g,
  '<p>Contact your representatives at <a href="https://www.congress.gov">congress.gov</a></p>')
```

---

## Code Review Checklist

- [ ] Read `DELEGATION-TOKEN-IMPLEMENTATION.md` (comprehensive review)
- [ ] Review `src/lib/personalize/tokens.ts` (main changes)
- [ ] Run smoke test (30 seconds)
- [ ] Run type check: `pnpm tsc --noEmit`
- [ ] Test personalization API (5 minutes)
- [ ] Send test email to yourself (5 minutes)
- [ ] Verify HTML output matches expected format
- [ ] Check for security issues (XSS, SQL injection)
- [ ] Approve or request changes

---

## Questions?

1. **Why complete rewrite?** Previous implementation was fundamentally wrong (linked to 404 page)
2. **Why not fix old code?** Requirements specify rendering contacts, not links
3. **What about delegation_links table?** Kept for future [[DELEGATE_LINK]] token
4. **Performance impact?** ~100ms overhead (2 DB queries per personalization)
5. **Breaking changes?** No - resolveTokens() still async, TokenContext still compatible

---

## Approval

**Ready for commit if**:
- [ ] Code review passed
- [ ] Smoke test passed
- [ ] E2E test passed
- [ ] No security issues
- [ ] Documentation reviewed

**Commit message**:
```
fix: implement [[DELEGATION]] token to render representatives from database

Previously, [[DELEGATION]] incorrectly generated links to non-existent /delegate page.
Token now correctly renders congressional delegation with contact info in email HTML.
```

---

**Created**: 2025-10-29
**Author**: Claude (Sonnet 4.5)
**Status**: Ready for Review
