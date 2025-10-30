# Quick Test Instructions for Codex

## TL;DR - Copy and Run This

```bash
# Navigate to project root
cd /Users/kevinmireles/Documents/yff-web

# Load environment variables from .env.local
set -a && source .env.local && set +a

# Run smoke test
node scripts/test-delegation-token.mjs

# Run type check
pnpm tsc --noEmit
```

**Expected Results**:
- Smoke test: `✅ Database smoke test passed!`
- Type check: No errors (or only pre-existing errors unrelated to this change)

---

## What This Does

1. **`set -a && source .env.local && set +a`**
   - Loads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local file
   - These environment variables are required for the test to connect to database

2. **`node scripts/test-delegation-token.mjs`**
   - Tests that [[DELEGATION]] token implementation works
   - Queries officials and official_contacts tables
   - Validates data exists and queries return expected results

3. **`pnpm tsc --noEmit`**
   - Runs TypeScript compiler to check for type errors
   - Ensures code is type-safe

---

## If Tests Fail

### Error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"

**Solution**: Environment variables didn't load. Try:
```bash
# Check if .env.local exists
ls -la .env.local

# If it exists, try loading again
set -a && source .env.local && set +a

# Verify variables loaded
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### Error: "source: .env.local: file not found"

**Solution**: You're not in the project root. Run:
```bash
cd /Users/kevinmireles/Documents/yff-web
pwd  # Verify you're in correct directory
```

### Error: "Cannot find module '@supabase/supabase-js'"

**Solution**: Install dependencies:
```bash
pnpm install
```

---

## Need More Help?

See comprehensive guide: `docs/review/HOW-TO-RUN-TESTS.md`

---

## Full Review Package

All review documents are in `docs/review/` directory:
- **REVIEWER-START-HERE.md** - Start here for full review process
- **HOW-TO-RUN-TESTS.md** - Detailed testing instructions (you are here, basically)
- **DELEGATION-TOKEN-SUMMARY.md** - Quick summary of changes
- **DELEGATION-TOKEN-IMPLEMENTATION.md** - Comprehensive review doc
- **DELEGATION-TOKEN-TESTING-GUIDE.md** - End-to-end testing guide

---

**Last Updated**: 2025-10-29
