# Code Review: [[DELEGATION]] Token - START HERE

## For the Reviewer (Human or LLM)

This directory contains everything you need to review and test the [[DELEGATION]] token implementation.

---

## 📚 Documents (Read in Order)

### 1. **DELEGATION-TOKEN-SUMMARY.md** ⭐ START HERE
- Quick overview (5 min read)
- What changed, why, and risk level
- Quick checklist of what to review

### 2. **DELEGATION-TOKEN-IMPLEMENTATION.md** 📋 DEEP DIVE
- Comprehensive review document (15 min read)
- Before/after code comparison
- Schema details
- Security analysis
- Performance considerations
- Rollback plan

### 3. **DELEGATION-TOKEN-TESTING-GUIDE.md** 🧪 HANDS-ON
- Step-by-step testing instructions (15 min)
- How to test in browser before production
- Pass/fail criteria
- Troubleshooting

### 4. **HOW-TO-RUN-TESTS.md** 🔧 FOR CODEX/LLMs
- How to load environment variables from .env.local
- Multiple methods (pick the easiest)
- Troubleshooting common errors
- Quick copy-paste commands

---

## 🎯 Quick Start (For Impatient Reviewers)

### Option A: Trust But Verify (5 minutes)
```bash
# 1. Run smoke test (loads env vars from .env.local)
set -a && source .env.local && set +a
node scripts/test-delegation-token.mjs

# 2. Type check
pnpm tsc --noEmit

# 3. Review code
code src/lib/personalize/tokens.ts
```

**Need help with env vars?** See `HOW-TO-RUN-TESTS.md`

**If all pass**: Probably safe to approve (but read security section!)

### Option B: Full Review (30 minutes)
1. Read `DELEGATION-TOKEN-SUMMARY.md` (5 min)
2. Skim `DELEGATION-TOKEN-IMPLEMENTATION.md` (10 min)
3. Run smoke test (1 min)
4. Test personalization API (5 min)
5. Send test email to yourself (5 min)
6. Review security checklist (4 min)

**If all pass**: Safe to approve

---

## 📁 Files to Review

### Primary Changes
- ✅ `src/lib/personalize/tokens.ts` - **Main file** (complete rewrite)
  - Lines changed: 51 → 273 (+222 lines)
  - Risk level: HIGH
  - Review focus: Logic, security, database queries

### New Files
- ✅ `scripts/test-delegation-token.mjs` - Smoke test
  - Risk level: LOW
  - Can ignore (testing only)

### Documentation (These Files)
- `docs/review/DELEGATION-TOKEN-SUMMARY.md` (this helps you review)
- `docs/review/DELEGATION-TOKEN-IMPLEMENTATION.md` (comprehensive)
- `docs/review/DELEGATION-TOKEN-TESTING-GUIDE.md` (how to test)
- `docs/review/REVIEWER-START-HERE.md` (this file)

### Unchanged (Safe to Ignore)
- ✅ `src/lib/delegation/links.ts` - Kept for future use
- ✅ `supabase/migrations/20251027_delegation_links.sql` - Kept for future
- ✅ `src/app/api/send/personalize/route.ts` - Already calls resolveTokens (no changes needed)
- ✅ `src/app/api/send/execute/route.ts` - Already pre-creates delegation links (still works, just unused now)

---

## ✅ Review Checklist

### Code Quality
- [ ] Read `src/lib/personalize/tokens.ts`
- [ ] Logic makes sense (parses OCD IDs, queries database, formats HTML)
- [ ] No obvious bugs or edge cases
- [ ] Error handling present
- [ ] Types correct (TypeScript)

### Security
- [ ] HTML escaping implemented (`escapeHtml()` function)
- [ ] No SQL injection (uses Supabase query builder)
- [ ] No XSS vulnerabilities
- [ ] Proper URL validation

### Testing
- [ ] Smoke test passes: `node scripts/test-delegation-token.mjs`
- [ ] Type check passes: `pnpm tsc --noEmit`
- [ ] Test email sent and received correctly
- [ ] Links work (website + phone)

### Database
- [ ] Queries match schema (`office_type`, `full_name`, not `chamber`, `name`)
- [ ] Uses `!inner` join (ensures contacts exist)
- [ ] Filters by `is_active=true`
- [ ] Method names correct (`'phone'`, `'webform'`)

### Documentation
- [ ] Changes documented
- [ ] Testing instructions clear
- [ ] Rollback plan exists

---

## 🚨 Red Flags (Stop and Investigate)

- ❌ Smoke test fails
- ❌ Type errors in build
- ❌ Test email shows "Representative information unavailable" for valid profiles
- ❌ HTML output contains `[[DELEGATION]]` (token not replaced)
- ❌ Links broken or point to wrong URLs
- ❌ Console errors in Next.js logs
- ❌ XSS vulnerabilities (unescaped HTML)

---

## 🟢 Green Flags (Safe to Proceed)

- ✅ Smoke test passes
- ✅ No type errors
- ✅ Test email shows representative names
- ✅ Website links open correctly
- ✅ Phone links work (tel: protocol)
- ✅ HTML well-formed (`<ul><li>` structure)
- ✅ No console errors

---

## 💬 Questions for Developer

If you have questions after review:

1. **HTML Format**: Does `<ul><li>` match SendGrid template styling?
2. **Contact Method**: Why `method='webform'` not `method='website'`? (Confirm schema)
3. **Missing Districts**: How to handle at-large districts?
4. **Caching**: Should we cache official data?
5. **Performance**: Is 2 queries per personalization acceptable?

---

## 📊 Key Metrics

| Metric | Value |
|--------|-------|
| Files changed | 1 primary + 1 test |
| Lines added | ~222 |
| Lines removed | ~50 |
| Risk level | Medium-High |
| Testing time | 15 minutes |
| Rollback time | <5 minutes |

---

## 🎓 Background Context

### Why This Change?
- **Previous implementation** generated links to `/delegate` page (404 error)
- **User requirement** (per email screenshot) shows representative contact info directly in email
- **Token guide** specifies: "Inserts Rep + two Senators based on subscriber's OCD IDs"

### What It Does Now
- Parses user's OCD IDs to extract state + congressional district
- Queries `officials` table for 2 senators + 1 house rep
- Joins `official_contacts` for phone + website
- Renders HTML list with clickable links
- Handles missing data gracefully

### Why Complete Rewrite?
- Old implementation was fundamentally wrong (wrong requirement)
- No way to salvage link-based approach
- Database schema already existed for officials
- User confirmed tables fully populated

---

## 📞 Support

**Questions?**
- Read comprehensive doc: `DELEGATION-TOKEN-IMPLEMENTATION.md`
- Check testing guide: `DELEGATION-TOKEN-TESTING-GUIDE.md`

**Issues?**
1. Run smoke test to isolate problem
2. Check database has officials data
3. Verify env vars set
4. Review Next.js logs

**Stuck?**
- Ask Kevin (user confirmed tables populated)
- Check `officials` and `official_contacts` tables in Supabase

---

## 🏁 Ready to Approve?

**If all these are true**:
- ✅ Read summary document
- ✅ Reviewed code changes
- ✅ Smoke test passed
- ✅ Test email looked correct
- ✅ No security issues
- ✅ No red flags

**Then**: Approve and commit!

**Commit message**:
```
fix: implement [[DELEGATION]] token to render representatives from database

Previously, [[DELEGATION]] incorrectly generated links to non-existent /delegate page.
Token now correctly renders congressional delegation with contact info in email HTML.

Tested: Smoke test passing, test email verified
```

---

## 🔄 After Commit

### Before Pushing to Production
1. Test on Vercel preview branch (optional but recommended)
2. Send test email from preview
3. Verify no console errors in Vercel logs
4. Check database query performance in Supabase dashboard

### After Production Deploy
1. Monitor error logs for first 24 hours
2. Check sample emails sent
3. Verify no increase in API response times
4. Collect user feedback (if any)

### If Issues Found
1. Check rollback plan in `DELEGATION-TOKEN-IMPLEMENTATION.md`
2. Quick revert: `git revert HEAD && git push`
3. Or apply emergency hotfix (see rollback section)

---

**Happy Reviewing!** 🎉

---

**Created**: 2025-10-29
**Last Updated**: 2025-10-29
**Document Version**: 1.0
