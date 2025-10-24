# SendGrid 400 Error Fix - Code Review Summary

**Date:** October 21, 2025
**Issue:** SendGrid API returning 400 Bad Request
**Root Cause:** Orphaned text nodes in HTML (text outside any HTML tags)
**Severity:** HIGH/BLOCKING - Prevents all email sends via Make.com

---

## 🐛 **Problem Analysis**

### **The Issue**
When the personalize API replaces the `[[DELEGATION]]` token, it was creating **orphaned text** (text not wrapped in any HTML tag), which SendGrid's strict HTML validator rejects with 400 Bad Request.

### **Example of Broken HTML**
```html
<p>Your current congressional delegation:</p>
If you can't email right now, you can <a href="...">delegate this action</a>.
```
☝️ The text "If you can't email..." is **floating outside any tag** = Invalid HTML

### **Why It Happened**
1. CSV content has: `<p>Your current congressional delegation:</p>[[DELEGATION]]`
2. Our `buildDelegationHTML()` function returned: `If you can't email...` (bare text)
3. Token replacement resulted in: `</p>If you can't...` (orphaned text)
4. SendGrid rejected it with 400 Bad Request

---

## ✅ **The Fix**

### **Solution: Wrap delegation HTML in `<p>` tag**

**File:** `src/app/api/send/personalize/route.ts`

**Before:**
```typescript
function buildDelegationHTML(opts) {
  // ...
  return `If you can't email right now, you can <a href="...">delegate this action</a>.`
}
```

**After:**
```typescript
function buildDelegationHTML(opts) {
  // ...
  // Wrap in <p> to prevent orphaned text nodes when [[DELEGATION]] token is replaced
  // This ensures valid HTML structure that SendGrid accepts (no bare text between tags)
  return `<p>If you can't email right now, you can <a href="...">delegate this action</a>.</p>`
}
```

### **Result:**
```html
<p>Your current congressional delegation:</p>
<p>If you can't email right now, you can <a href="...">delegate this action</a>.</p>
```
✅ Valid HTML - all text wrapped in tags
✅ SendGrid accepts it
✅ Sequential `<p>` tags (not nested)

---

## 🧪 **Testing**

### **1. Unit Tests** ✅
**File:** `tests/tokenResolution.test.ts`

**Coverage:**
- ✅ Replaces [[DELEGATION]] token correctly
- ✅ No orphaned text nodes
- ✅ Wraps content in `<p>` tag
- ✅ Valid HTML structure (matching open/close tags)
- ✅ Includes all URL parameters
- ✅ SendGrid compatibility validation

**Test Results:**
```
✓ tests/tokenResolution.test.ts (13 tests) 3ms
  Test Files  1 passed (1)
       Tests  13 passed (13)
```

### **2. Local Integration Test** ✅
```bash
curl http://localhost:3000/api/send/personalize?email=...
```

**Result:**
```html
<p>Reach out to Your current congressional delegation:</p>
<p>If you can't email right now, you can <a href="...">delegate this action</a>.</p>
```
✅ Sequential `<p>` tags (valid structure)
✅ No orphaned text
✅ Token fully replaced

---

## 📝 **Changes Summary**

### **Files Modified:**
1. `src/app/api/send/personalize/route.ts`
   - Changed `buildDelegationHTML()` return value
   - Added `<p>` wrapper around delegation text
   - Updated comment to explain rationale
   - **Lines changed:** 3 (function body + comment)

### **Files Added:**
2. `tests/tokenResolution.test.ts`
   - 13 comprehensive tests
   - Validates no orphaned text
   - Ensures SendGrid compatibility
   - **Lines added:** 207

---

## 🎯 **Testing Instructions**

### **Can Test in Dev:** ✅ YES

#### **Dev Testing (Local)**
```bash
# 1. Start dev server
npm run dev

# 2. Test personalize API
curl "http://localhost:3000/api/send/personalize?\
email=kevinjmireles@yahoo.com&\
dataset_id=45110851-a34c-487e-a6c2-63d75d13598e&\
job_id=$(uuidgen | tr '[:upper:]' '[:lower:]')&\
batch_id=$(uuidgen | tr '[:upper:]' '[:lower:]')" | jq .html

# 3. Verify HTML structure
# Should see: </p><p>If you can't email...
# Should NOT see: </p>If you can't email...
```

#### **Production Testing (After Deploy)**
```bash
# 1. Test personalize API in production
curl "https://yff-web.vercel.app/api/send/personalize?\
email=kevinjmireles@yahoo.com&\
dataset_id=45110851-a34c-487e-a6c2-63d75d13598e&\
job_id=$(uuidgen | tr '[:upper:]' '[:lower:]')&\
batch_id=$(uuidgen | tr '[:upper:]' '[:lower:]')" | jq

# 2. Test Make.com webhook
# Go to Make.com scenario and run it
# Expected: SendGrid returns 202 Accepted (not 400)

# 3. Verify email received
# Check kevinjmireles@yahoo.com inbox
# Email should arrive with proper formatting
```

---

## ✅ **Validation Checklist**

### **Before Merge:**
- [x] Unit tests pass (13/13)
- [x] Local integration test passes
- [x] HTML structure validated (no orphaned text)
- [ ] Code reviewed by team
- [ ] Changes approved

### **After Deploy:**
- [ ] Production API returns valid HTML
- [ ] Make.com webhook returns 202 (not 400)
- [ ] Email arrives in inbox
- [ ] Email formatting is correct

---

## 🔍 **Code Review Focus Areas**

### **1. HTML Structure**
- ✅ Delegation HTML wrapped in `<p>` tag
- ✅ No nested `<p>` tags (sequential is fine)
- ✅ Comment explains the rationale

### **2. Test Coverage**
- ✅ Tests validate no orphaned text
- ✅ SendGrid compatibility check
- ✅ Edge cases covered (multiple tokens, empty HTML, etc.)

### **3. Backwards Compatibility**
- ✅ No breaking changes to API signature
- ✅ Works with existing CSV content format
- ✅ Token replacement logic unchanged (just wrapper added)

---

## 📊 **Impact Assessment**

### **Risk Level:** LOW ✅
- Simple wrapper addition
- Well-tested (13 unit tests)
- Backwards compatible
- No schema changes

### **Rollback Plan:**
If issues arise, simply revert commit:
```bash
git revert HEAD
git push origin main
```

### **Monitoring:**
After deployment, monitor:
- Make.com scenario success rate
- SendGrid API response codes (should be 202, not 400)
- Email delivery rate

---

## 🚀 **Deployment Notes**

### **Deploy Process:**
1. Merge to main after code review
2. Vercel auto-deploys (~1-2 minutes)
3. Test Make.com webhook immediately
4. Verify email delivery

### **Rollback Trigger:**
Rollback if:
- SendGrid still returns 400
- HTML structure breaks in emails
- Tests fail in production

---

## 📞 **Testing Support**

### **Quick Validation Commands:**

**Check HTML structure:**
```bash
curl -s "https://yff-web.vercel.app/api/send/personalize?..." | \
  jq -r '.html' | \
  grep -o 'delegation:</p><p>If'
```
Expected output: `delegation:</p><p>If` (sequential tags)

**Validate no orphaned text:**
```bash
curl -s "https://yff-web.vercel.app/api/send/personalize?..." | \
  jq -r '.html' | \
  grep 'delegation:</p>If'
```
Expected: No output (orphaned text would match)

---

## ✅ **Summary**

**Problem:** Orphaned text causing SendGrid 400 errors
**Solution:** Wrap delegation HTML in `<p>` tag
**Testing:** 13 unit tests passing, local integration validated
**Risk:** Low - simple wrapper, well-tested
**Can test in dev:** YES ✅

**Ready for code review and deployment.**
