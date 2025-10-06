# Environment Variables Setup Guide

## 🚀 **Production Environment Variables**

### **Required for Vercel Deployment:**

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google Civic API (Server-side only) - REQUIRED for address enrichment
# Uses divisionsByAddress endpoint directly in API route (not Edge Functions)
CIVIC_API_KEY=your_google_civic_api_key

# Application Configuration
NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app
NEXT_PUBLIC_ADMIN_EMAILS=your-email@example.com

# Feature Flags (defaults to ON, use =0 to disable)
FEATURE_ADMIN_SEND=1
FEATURE_ADMIN_AUTH=1
FEATURE_SEND_RUN=1
FEATURE_SEND_PREVIEW=1
FEATURE_CONTENT_PROMOTE=1

# Send Execution Flags (MVP)
FEATURE_SEND_EXECUTE=1
FEATURE_TEST_SEND=on
FEATURE_FULL_SEND=off
MAX_SEND_PER_RUN=100

# reCAPTCHA Configuration
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key

# Edge Functions (DEPRECATED for signup - now uses direct API route)
# Kept for other functions that may still use profile-address Edge Function
EDGE_SHARED_SECRET=your_edge_shared_secret

# Make.com Webhook
NEXT_PUBLIC_MAKE_WEBHOOK_URL=your_make_webhook_url

# Server-side Make.com integration for enqueue/execute
MAKE_WEBHOOK_URL=your_make_webhook_url
MAKE_SHARED_TOKEN=shared_secret_between_yff_and_make
SENDGRID_TEMPLATE_ID=your_sendgrid_dynamic_template_id
MAX_SEND_PER_RUN=100
```

### **Local Development (.env.local):**

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Google Civic API (Required for address enrichment testing)
CIVIC_API_KEY=

# Application Configuration
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_EMAILS=you@example.com

# Feature Flags (defaults to ON, use =0 to disable)
FEATURE_ADMIN_SEND=1
FEATURE_ADMIN_AUTH=1
FEATURE_SEND_RUN=1
FEATURE_SEND_PREVIEW=1
FEATURE_CONTENT_PROMOTE=1

# Send Execution Flags (MVP)
FEATURE_SEND_EXECUTE=1
FEATURE_TEST_SEND=on
FEATURE_FULL_SEND=off
MAX_SEND_PER_RUN=100

# reCAPTCHA Configuration (Optional in dev)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=

# Edge Functions (DEPRECATED for signup, kept for other functions)
EDGE_SHARED_SECRET=

# Make.com Webhook (Optional in dev)
NEXT_PUBLIC_MAKE_WEBHOOK_URL=
```

## 🔐 **Admin & Security Configuration:**

```bash
# Admin Password Authentication (optional)
ADMIN_PASSWORD=your_secure_password

# Test Access Tokens (for automated testing in production)
# Leave UNSET in production for normal operation
# Set only when running controlled production tests, then unset after
TEST_ACCESS_TOKEN=your_test_token
TEST_ACCESS_ENFORCE_PROD_ONLY=true

# Email Unsubscribe HMAC Secret (used by API route /api/unsubscribe)
UNSUBSCRIBE_SIGNING_SECRET=your_secure_signing_secret_min_32_chars

# Public URL for generating unsubscribe links
BASE_URL=https://your-domain.vercel.app
```

### **Security Notes:**
- ✅ **ADMIN_PASSWORD** should be a strong password for admin login
- ✅ In development, set **ADMIN_PASSWORD** in `.env.local` and restart the dev server. Example: `ADMIN_PASSWORD=admin123 pnpm dev`
- ✅ **TEST_ACCESS_TOKEN** should only be set temporarily for production testing
- ✅ **UNSUBSCRIBE_SIGNING_SECRET** should be a strong secret (min 32 chars) for HMAC signing
- ✅ **BASE_URL** must match your production domain for unsubscribe links to work correctly
- ✅ **TEST_ACCESS_ENFORCE_PROD_ONLY** default is `true` (only enforced in production)
- ✅ **UNSUB_SECRET** must be at least 32 characters for HMAC security
- ✅ **SUPABASE_URL** needed for server-side admin client (same as NEXT_PUBLIC_SUPABASE_URL)

## 🔧 **Setup Instructions:**

### **1. Vercel Deployment:**
1. Go to Project → Settings → Environment Variables
2. Add each variable above (CIVIC_API_KEY is **REQUIRED** for signup functionality)
3. **IMPORTANT**: Do NOT set CIVIC_API_KEY as NEXT_PUBLIC_* (server-side only)
4. **NOTE**: Signup now uses direct API route integration (not Edge Functions)
5. Redeploy from the latest commit

### **2. Local Development:**
1. Copy `.env.local.example` to `.env.local`
2. Fill in required values
3. Restart development server

### **3. Security Notes:**
- ✅ **Never commit** `.env.local` to git
- ✅ **Use environment variables** in Vercel
- ✅ **No service role keys** in web app
- ✅ **CIVIC_API_KEY server-side only** (never NEXT_PUBLIC_*) - **REQUIRED for signup**
- ✅ **reCAPTCHA optional** in development
- ✅ **EDGE_SHARED_SECRET deprecated for signup** (direct API route used instead)
- ✅ **Edge Functions kept** for compatibility with other features

## 🧪 **Testing Commands:**

```bash
# Health check
curl http://localhost:3000/api/health

# Signup test (success)
curl -X POST http://localhost:3000/api/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@example.com","address":"123 Main St, Columbus, OH 43215"}'

# Signup test (validation error)
curl -X POST http://localhost:3000/api/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com"}'
# Expected: 400 status
```
