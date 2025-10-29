# RLS QA Tests

Simple scripts to verify Row Level Security (RLS) policies are working correctly.

## Run Instructions

These scripts require environment variables to be loaded. You can run them directly:

```bash
# Load environment variables and run tests
source .env.local 2>/dev/null || true
node tests/rls/profiles.anon.test.mjs
node tests/rls/profiles.service.test.mjs
```

Or if you have a `.env.local` file with your Supabase credentials:

```bash
# Option 1: Load env manually
export $(cat .env.local | xargs)
node tests/rls/profiles.anon.test.mjs
node tests/rls/profiles.service.test.mjs
```

## Test Files

### `profiles.anon.test.mjs`
Verifies that anonymous users receive no rows when querying the `profiles` table (RLS blocks public access).

**Expected**: `✅ PASS – RLS blocked anon access as expected.`

### `profiles.service.test.mjs`
Verifies that the service role key bypasses RLS and can read rows from the `profiles` table.

**Expected**: `✅ PASS – Service role returned N rows.`

## What These Confirm

✅ `profiles` RLS is **blocking public reads** (good)  
✅ The **service role** client (used by API routes, Make.com, etc.) still works normally  

## Related

- See `supabase/policies/canonical_v2_1_policies.sql` for RLS policy definitions
- These test scripts can be extended for other tables (`geo_metrics`, `subscriptions`, etc.)
