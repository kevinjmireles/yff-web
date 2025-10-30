# How to Run Tests (For Codex/Other LLMs)

**Problem**: Tests require environment variables from `.env.local`

**Solution**: Multiple methods below (pick the easiest)

---

## Method 1: Source .env.local (Recommended)

This loads all environment variables from `.env.local` into your current shell session.

### For Bash/Zsh (Mac/Linux)

```bash
# Load environment variables
set -a && source .env.local && set +a

# Run smoke test
node scripts/test-delegation-token.mjs

# Run type check
pnpm tsc --noEmit
```

**Explanation**:
- `set -a` = automatically export all variables
- `source .env.local` = load variables from file
- `set +a` = stop auto-exporting
- `&&` = chain commands (run next if previous succeeds)

### For Fish Shell

```fish
# Load environment variables
set -gx (cat .env.local | grep -v '^#' | xargs)

# Run smoke test
node scripts/test-delegation-token.mjs
```

---

## Method 2: Inline Environment Variables

Run the test with variables defined inline (one command):

```bash
SUPABASE_URL="your-url" \
SUPABASE_SERVICE_ROLE_KEY="your-key" \
node scripts/test-delegation-token.mjs
```

**To get actual values**:

```bash
# Extract values from .env.local and run test
eval $(grep -v '^#' .env.local | xargs) node scripts/test-delegation-token.mjs
```

---

## Method 3: Use a Wrapper Script

Create a helper script that loads env vars automatically.

### Create: `scripts/run-with-env.sh`

```bash
#!/bin/bash
# Load .env.local and run command

set -a
source .env.local
set +a

exec "$@"
```

### Make it executable:

```bash
chmod +x scripts/run-with-env.sh
```

### Use it:

```bash
# Run smoke test
./scripts/run-with-env.sh node scripts/test-delegation-token.mjs

# Run any other command
./scripts/run-with-env.sh pnpm tsc --noEmit
```

---

## Method 4: Using dotenv-cli (If Installed)

If `dotenv-cli` is available:

```bash
# Install (if needed)
npm install -g dotenv-cli

# Run with dotenv
dotenv -e .env.local -- node scripts/test-delegation-token.mjs
```

---

## Method 5: Manual Environment Variables

If none of the above work, manually export each variable:

```bash
# Read .env.local and manually set variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"

# Run test
node scripts/test-delegation-token.mjs
```

**To see what variables are needed**:

```bash
# Show variables from .env.local
cat .env.local | grep -v '^#' | grep '='
```

---

## Required Environment Variables

The test script needs:
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Check if they're set**:

```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

If both show values, you're ready to run tests.

---

## Step-by-Step for Codex

### Step 1: Verify .env.local exists

```bash
ls -la .env.local
```

**Expected**: File exists (not a symlink)

### Step 2: Load environment variables

```bash
set -a && source .env.local && set +a
```

**No output = success**

### Step 3: Verify variables loaded

```bash
echo "SUPABASE_URL: ${SUPABASE_URL:0:30}..."
echo "SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:0:30}..."
```

**Expected**: Should show first 30 characters of each variable

### Step 4: Run smoke test

```bash
node scripts/test-delegation-token.mjs
```

**Expected output**:
```
🧪 Testing [[DELEGATION]] token resolution

1️⃣  Looking for test profile...
   ✅ Found profile: test+ohio@example.com
   📍 OCD IDs: [...]
   🗺️  Extracted: state=OH, district=null

2️⃣  Querying senators...
   ✅ Found 2 senators
      - Jon Husted
        📞 (202) 224-3353
        🌐 https://www.husted.senate.gov
      - Bernie Moreno
        📞 (202) 224-2315
        🌐 https://www.moreno.senate.gov

3️⃣  Querying house representative...
   ⚠️  No congressional district found, skipping house rep

4️⃣  Validating data for token resolution...
   ✅ Found 2 total officials
   ✅ Expected: 2 (2 senators only)
   ✅ All officials have phone + website

✅ Database smoke test passed!
```

---

## Troubleshooting

### Error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"

**Cause**: Environment variables not loaded

**Fix**:
```bash
# Method 1: Try sourcing again
set -a && source .env.local && set +a

# Method 2: Check file exists
cat .env.local | grep SUPABASE

# Method 3: Manually export
export SUPABASE_URL="$(grep SUPABASE_URL .env.local | cut -d '=' -f2)"
export SUPABASE_SERVICE_ROLE_KEY="$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d '=' -f2)"
```

### Error: "source: .env.local: file not found"

**Cause**: Wrong directory

**Fix**:
```bash
# Make sure you're in project root
pwd  # Should show: /Users/kevinmireles/Documents/yff-web

# If not, cd to project root
cd /Users/kevinmireles/Documents/yff-web

# Try again
set -a && source .env.local && set +a
```

### Error: "Cannot find module '@supabase/supabase-js'"

**Cause**: Dependencies not installed

**Fix**:
```bash
pnpm install
# Then try test again
```

### Test runs but shows different data

**Expected**: Normal - database may have different test profiles

**Validate**:
- ✅ Test finds a profile with ocd_ids
- ✅ Test finds 2+ officials
- ✅ Test passes at the end

---

## All Tests to Run

### 1. Smoke Test (Database Queries)
```bash
set -a && source .env.local && set +a
node scripts/test-delegation-token.mjs
```
**Time**: 30 seconds
**Expected**: ✅ Database smoke test passed!

### 2. Type Check (TypeScript)
```bash
pnpm tsc --noEmit
```
**Time**: 10 seconds
**Expected**: No errors (or only pre-existing errors)

### 3. Unit Tests (Optional - needs updates)
```bash
pnpm vitest run tests/tokenResolution.test.ts
```
**Note**: This test currently mocks old delegation link logic and will need updates

### 4. Build Check
```bash
pnpm build
```
**Time**: 30-60 seconds
**Expected**: Build succeeds

---

## Quick Copy-Paste Commands

### Run All Tests at Once
```bash
# Load env vars and run all tests
set -a && source .env.local && set +a && \
echo "=== Smoke Test ===" && \
node scripts/test-delegation-token.mjs && \
echo -e "\n=== Type Check ===" && \
pnpm tsc --noEmit && \
echo -e "\n✅ All tests passed!"
```

### Verify Environment Setup
```bash
# Check env vars loaded correctly
set -a && source .env.local && set +a && \
echo "SUPABASE_URL is $([ -n "$SUPABASE_URL" ] && echo '✅ SET' || echo '❌ NOT SET')" && \
echo "SUPABASE_SERVICE_ROLE_KEY is $([ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && echo '✅ SET' || echo '❌ NOT SET')"
```

---

## For Codex: Recommended Test Flow

```bash
# 1. Navigate to project root
cd /Users/kevinmireles/Documents/yff-web

# 2. Load environment variables
set -a && source .env.local && set +a

# 3. Verify variables loaded
echo "Variables loaded: SUPABASE_URL=${SUPABASE_URL:0:30}..."

# 4. Run smoke test
node scripts/test-delegation-token.mjs

# 5. Run type check
pnpm tsc --noEmit

# 6. If both pass, code is ready to commit
echo "✅ Tests passed - ready to commit"
```

**Copy these commands one-by-one or all at once (separated by &&).**

---

## Notes for LLMs

1. **Always load .env.local first** - Tests will fail without environment variables
2. **Use `set -a && source .env.local && set +a`** - This is the most reliable method
3. **Run from project root** - Scripts expect to be run from `/Users/kevinmireles/Documents/yff-web`
4. **Check for errors** - If test fails, read error message carefully
5. **Variables persist in shell** - Once loaded, variables stay loaded until you close terminal

---

**Last Updated**: 2025-10-29
