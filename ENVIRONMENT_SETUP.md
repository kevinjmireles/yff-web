# Environment Variables Setup Guide

## 🚀 **Production Environment Variables**

### **Required for Vercel Deployment:**

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google Civic API (Server-side only)
CIVIC_API_KEY=your_google_civic_api_key

# Application Configuration
NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app
NEXT_PUBLIC_ADMIN_EMAILS=your-email@example.com

# Feature Flags
FEATURE_DELEGATION_TOKENS=false
FEATURE_ADMIN_IMPORTS=false

# reCAPTCHA Configuration
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key

# Edge Functions (unused by signup, kept for other functions)
EDGE_SHARED_SECRET=your_edge_shared_secret

# Make.com Webhook
NEXT_PUBLIC_MAKE_WEBHOOK_URL=your_make_webhook_url
```

### **Local Development (.env.local):**

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Civic API (Optional in dev)
CIVIC_API_KEY=

# Application Configuration
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_EMAILS=you@example.com

# Feature Flags
FEATURE_DELEGATION_TOKENS=false
FEATURE_ADMIN_IMPORTS=false

# reCAPTCHA Configuration (Optional in dev)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=

# Edge Functions (unused by signup, kept for other functions)
EDGE_SHARED_SECRET=

# Make.com Webhook (Optional in dev)
NEXT_PUBLIC_MAKE_WEBHOOK_URL=
```

## 🔧 **Setup Instructions:**

### **1. Vercel Deployment:**
1. Go to Project → Settings → Environment Variables
2. Add each variable above (including new CIVIC_API_KEY for address enrichment)
3. **IMPORTANT**: Do NOT set CIVIC_API_KEY as NEXT_PUBLIC_* (server-side only)
4. Redeploy from the latest commit

### **2. Local Development:**
1. Copy `.env.local.example` to `.env.local`
2. Fill in required values
3. Restart development server

### **3. Security Notes:**
- ✅ **Never commit** `.env.local` to git
- ✅ **Use environment variables** in Vercel
- ✅ **No service role keys** in web app
- ✅ **CIVIC_API_KEY server-side only** (never NEXT_PUBLIC_*)
- ✅ **reCAPTCHA optional** in development
- ✅ **EDGE_SHARED_SECRET unused by signup** but kept for other Edge Functions

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
