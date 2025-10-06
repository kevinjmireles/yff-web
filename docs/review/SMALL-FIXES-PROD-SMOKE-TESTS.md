# 🧪 Production Smoke Tests - Post Deploy

**Date:** 2025-10-01  
**Deployment:** Main branch commits 380d92b..a8f855a  
**Status:** ⏳ Waiting for Vercel deployment

---

## 📦 What Was Deployed

### **7 Commits Pushed:**
1. `380d92b` - fix: /api/test-auth cookie semantics
2. `4c63b8d` - fix: add admin guard to /api/admin/content/promote
3. `1e5eecd` - chore: add Cache-Control header and legacy redirect
4. `a1a98db` - chore: add flags shim and env example
5. `7505d45` - docs: update env vars and add feature flags documentation
6. `40a87da` - docs: deprecate outdated guides and add review artifacts
7. `a8f855a` - docs: add code review artifacts

### **Key Changes:**
- ✅ test-auth cookie logic fixed
- ✅ Admin guard added to promote endpoint
- ✅ Cache-Control headers added
- ✅ Feature flags shim added
- ✅ Documentation updated
- ✅ .env.example created

---

## 🎯 Smoke Test Checklist

Replace `<app>` with your Vercel deployment URL (e.g., `your-app.vercel.app`)

### **1. Health Check** ✅
```bash
curl -i https://<app>/api/health
```

**Expected:**
- Status: `200 OK`
- Headers: `Cache-Control: no-store`
- Body: `{ "ok": true, "service": "yff-web", "timestamp": "..." }`

---

### **2. Echo IP** ✅
```bash
curl -i https://<app>/api/echo-ip
```

**Expected:**
- Status: `200 OK`
- Body: Contains your IP address

---

### **3. Unauthenticated Send (Security Check)** ✅
```bash
curl -i -X POST https://<app>/api/send/start \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**Expected:**
- Status: `401 Unauthorized`
- Body: `{ "ok": false, "code": "UNAUTHORIZED", "message": "..." }`

---

### **4. Admin Login Flow** ✅

**Step 1: Visit login page**
```
https://<app>/admin/login
```

**Expected:**
- Login form loads
- No errors

**Step 2: Login with ADMIN_PASSWORD**
- Enter password from Vercel env vars
- Submit form

**Expected:**
- Redirects to /admin/send (or /admin)
- Admin cookie set

**Step 3: Verify admin access**
```
https://<app>/admin/send
```

**Expected:**
- Page loads successfully
- No redirect to login
- Admin UI visible

---

### **5. Test Access Cookie (Optional - Only if TEST_ACCESS_TOKEN set)** ⚠️

**Only test if TEST_ACCESS_TOKEN is configured in Vercel**

```bash
# Get token from Vercel env vars
curl -i "https://<app>/api/test-auth?token=YOUR_TEST_TOKEN"
```

**Expected:**
- Status: `200 OK`
- Headers: `Cache-Control: no-store`
- Body: `{ "ok": true, "message": "cookie set" }`
- Cookie: `test_access=YOUR_TEST_TOKEN; HttpOnly; Secure; Path=/`

**Clear cookie:**
```bash
curl -i "https://<app>/api/test-auth"
```

**Expected:**
- Status: `200 OK`
- Body: `{ "ok": true, "message": "cookie cleared" }`

---

### **6. Legacy Redirect** ✅
```
https://<app>/admin/campaigns
```

**Expected:**
- Redirects to `/admin/send`
- No errors

---

### **7. Promote Endpoint (Auth Required)** ✅

**Without auth:**
```bash
curl -i -X POST https://<app>/api/admin/content/promote \
  -H 'Content-Type: application/json' \
  -d '{"dataset_id":"00000000-0000-0000-0000-000000000000"}'
```

**Expected:**
- Status: `401 Unauthorized`
- Confirms admin guard is working

---

## 🔍 Verification Summary

Run all tests and mark completion:

- [ ] Health endpoint: 200 OK + Cache-Control header
- [ ] Echo IP: 200 OK
- [ ] Unauthenticated send: 401 JSON
- [ ] Admin login: Successful login flow
- [ ] Admin send page: Loads after login
- [ ] Legacy campaigns redirect: Works
- [ ] Promote endpoint: Requires auth (401 without cookie)
- [ ] Test-auth: Cookie semantics work correctly (if token configured)

---

## 📊 Expected Results

### **All Tests Should Show:**
✅ Security: Unauthorized requests properly blocked  
✅ Auth: Login flow works with ADMIN_PASSWORD  
✅ Caching: Cache-Control headers present  
✅ Redirects: Legacy paths work  
✅ Guards: Admin endpoints protected

### **Common Issues & Fixes:**

**If health check fails:**
- Check Vercel deployment logs
- Verify build succeeded
- Check for runtime errors

**If admin login fails:**
- Verify ADMIN_PASSWORD set in Vercel env vars
- Check browser console for errors
- Verify cookie is being set

**If test-auth fails:**
- Verify TEST_ACCESS_TOKEN is set (if testing this feature)
- Check if TEST_ACCESS_ENFORCE_PROD_ONLY=true
- Verify middleware is deployed

---

## 🚀 Deployment Checklist

**Before Running Smoke Tests:**
- [ ] Vercel deployment completed successfully
- [ ] Build logs show no errors
- [ ] All environment variables set in Vercel:
  - [ ] NEXT_PUBLIC_SUPABASE_URL
  - [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_SERVICE_ROLE_KEY
  - [ ] CIVIC_API_KEY
  - [ ] ADMIN_PASSWORD
  - [ ] UNSUB_SECRET
  - [ ] EDGE_SHARED_SECRET
  - [ ] TEST_ACCESS_TOKEN (optional)
  - [ ] TEST_ACCESS_ENFORCE_PROD_ONLY (optional, default: true)

**After Smoke Tests Pass:**
- [ ] Document any issues found
- [ ] Verify all critical paths work
- [ ] Monitor logs for errors
- [ ] Notify team of successful deployment

---

## 📝 Test Results Template

```
## Smoke Test Results - [Date]

**Deployment URL:** https://_____.vercel.app
**Tester:** _____
**All Tests:** ✅ PASS / ❌ FAIL

### Results:
1. Health: ✅/❌ 
2. Echo IP: ✅/❌
3. Unauth send: ✅/❌
4. Admin login: ✅/❌
5. Admin send: ✅/❌
6. Campaigns redirect: ✅/❌
7. Promote auth: ✅/❌
8. Test-auth: ✅/❌/N/A

### Issues Found:
- [List any issues]

### Notes:
- [Any additional observations]
```

---

## ⏭️ Next Steps After Smoke Tests

**If all tests pass:**
1. ✅ Mark deployment as successful
2. ✅ Update team
3. ✅ Monitor production for 24h
4. ✅ Close related tickets/issues

**If tests fail:**
1. ❌ Document failures
2. ❌ Check Vercel logs
3. ❌ Rollback if critical
4. ❌ Create hotfix PR if needed

---

**Status:** ⏳ Awaiting Vercel deployment completion  
**Next:** Run smoke tests against production URL

