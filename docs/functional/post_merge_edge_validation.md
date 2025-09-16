# Post-Merge Edge Function Validation Guide

## Overview

This document describes how to validate that Edge Function authentication is working correctly after merging the authentication implementation PR.

## Quick Start

### 1. Set Environment Variables

```bash
# Required: Your Edge Function shared secret
export EDGE_SHARED_SECRET="your-secret-here"

# Optional: Override defaults
export BASE_URL="https://your-domain.vercel.app"
export FN_BASE="https://your-project.functions.supabase.co"
```

### 2. Run Verification

```bash
pnpm edge:verify
```

## What Gets Tested

### Next.js API Routes (Client Perspective)
- **POST** `/api/profile-address` - Should work without client secrets
- **POST** `/api/subscriptions-toggle` - Should work without client secrets  
- **GET** `/api/unsubscribe` - Should work without client secrets

### Direct Edge Function Calls (Server-to-Server)
- **POST** `/profile-address` - Requires `x-edge-secret` header
- **POST** `/subscriptions-toggle` - Requires `x-edge-secret` header
- **GET** `/unsubscribe` - Requires `x-edge-secret` header

## Acceptance Criteria

### ✅ Success Conditions

#### Next.js API Routes
- **Status**: 200 (or appropriate success code)
- **Behavior**: Work without any secret from client
- **Security**: Next.js server forwards `x-edge-secret` header internally

#### Direct Edge Function Calls
- **Without Header**: 401 "Missing or invalid authorization header"
- **With Valid Header**: 200 (or appropriate success code)
- **Authentication**: Properly validates `x-edge-secret` header

### ❌ Failure Indicators

#### 401 Unauthorized
- **Cause**: Missing or invalid `x-edge-secret` header
- **Action**: Verify `EDGE_SHARED_SECRET` environment variable is set correctly

#### 404 Not Found
- **Cause**: Edge Function not deployed or wrong URL
- **Action**: Deploy Edge Functions to Supabase

#### 500 Internal Server Error
- **Cause**: Edge Function configuration issue
- **Action**: Check Supabase function logs and environment variables

## Troubleshooting Matrix

| Status | Next.js API | Direct Edge Function | Likely Cause | Action |
|--------|-------------|---------------------|--------------|---------|
| 200 | ✅ | ✅ | All working | None needed |
| 401 | ✅ | ❌ | Edge Function auth issue | Check `EDGE_SHARED_SECRET` |
| 404 | ❌ | ❌ | Functions not deployed | Deploy to Supabase |
| 500 | ❌ | ❌ | Configuration error | Check Supabase logs |

## Detailed Test Scenarios

### Scenario 1: Full Authentication Working
```
✅ Next.js API routes: 3/3 endpoints working
✅ Direct Edge Functions: 6/6 endpoints working
✅ Authentication: 3/3 no-header requests properly rejected (401)
✅ Authentication: 3/3 with-header requests succeeded
```

### Scenario 2: Partial Authentication Working
```
✅ Next.js API routes: 3/3 endpoints working
⚠️  Direct Edge Functions: 3/6 endpoints working
❌ Authentication: Some requests not properly rejected
```

### Scenario 3: Authentication Broken
```
❌ Next.js API routes: 0/3 endpoints working
❌ Direct Edge Functions: 0/6 endpoints working
❌ Authentication: All requests failing
```

## Environment Variable Reference

| Variable | Default | Purpose | Required |
|----------|---------|---------|----------|
| `EDGE_SHARED_SECRET` | None | Secret for Edge Function auth | Yes (for full testing) |
| `BASE_URL` | `https://yff-web.vercel.app` | Next.js app URL | No |
| `FN_BASE` | `https://zeypnacddltdtedqxhix.functions.supabase.co` | Supabase functions URL | No |

## Deployment Checklist

After merging the authentication PR:

1. **Deploy Edge Functions** to Supabase:
   ```bash
   supabase functions deploy profile-address --project-ref zeypnacddltdtedqxhix
   supabase functions deploy subscriptions-toggle --project-ref zeypnacddltdtedqxhix
   supabase functions deploy unsubscribe --project-ref zeypnacddltdtedqxhix
   ```

2. **Verify Environment Variables**:
   - `EDGE_SHARED_SECRET` set in Supabase (functions)
   - `EDGE_SHARED_SECRET` set in Vercel (production)

3. **Run Verification Script**:
   ```bash
   export EDGE_SHARED_SECRET="your-secret"
   pnpm edge:verify
   ```

4. **Check Results**:
   - All Next.js API routes return 200
   - Direct Edge Function calls return 401 without header
   - Direct Edge Function calls return 200 with valid header

## Common Issues and Solutions

### Issue: "EDGE_SHARED_SECRET not set"
**Solution**: Set the environment variable before running the script

### Issue: "Request failed: fetch"
**Solution**: Check network connectivity and URL accessibility

### Issue: "Could not read response body"
**Solution**: Response may be malformed; check Edge Function logs

### Issue: All tests returning 401
**Solution**: Verify the secret value matches between Supabase and Vercel

## Integration with CI/CD

The verification script can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Verify Edge Function Authentication
  run: |
    export EDGE_SHARED_SECRET="${{ secrets.EDGE_SHARED_SECRET }}"
    export BASE_URL="${{ secrets.BASE_URL }}"
    export FN_BASE="${{ secrets.FN_BASE }}"
    pnpm edge:verify
```

## Security Notes

- **Never log the actual secret value** - the script shows `[SET]` or `[NOT SET]`
- **Use environment variables** - don't hardcode secrets in scripts
- **Test in staging first** - verify authentication before production deployment
- **Monitor logs** - watch for authentication failures in production

## Support

If verification fails and you need assistance:

1. **Check the troubleshooting matrix** above
2. **Review Supabase function logs** for detailed error information
3. **Verify environment variables** are set correctly
4. **Test with minimal payloads** to isolate the issue



