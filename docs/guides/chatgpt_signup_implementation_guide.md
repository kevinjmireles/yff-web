# ChatGPT Implementation Guide - Enhanced Signup Flow

**Purpose:** This document provides ChatGPT with the correct implementation details for enhancing the YFF signup flow with database writes.

---

## **🎯 CURRENT STATE SUMMARY**

### **Existing Implementation**
- **Signup Form**: `src/app/page.tsx` - collects name, email, address (full address)
- **API Route**: `src/app/api/signup/route.ts` - handles reCAPTCHA validation
- **Database**: Model B (auth-keyed) with FK constraints
- **Edge Functions**: profile-address, subscriptions-toggle, unsubscribe (ACTIVE)
- **Civic API**: Address → OCD ID mapping already implemented

### **Goal**
- Enhance current signup to write to database
- Keep existing functionality (reCAPTCHA validation)
- Maintain address → OCD ID mapping via Edge Functions
- Add subscription creation when user_id exists

---

## **🔧 CORRECTED IMPLEMENTATION**

### **1. Server-Side Admin Client**

**File:** `src/lib/supabaseAdmin.ts`
```typescript
// Purpose: Server-side Supabase admin client for bypassing RLS
// Called by: API routes that need to write to database without user authentication
// Note: This client uses service role key and bypasses RLS policies

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Server-side Supabase env not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Project Settings'
  );
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
```

### **2. Enhanced API Route**

**File:** `src/app/api/signup/route.ts`
```typescript
/**
 * Enhanced signup with database writes, Civic API enrichment, and reCAPTCHA validation
 * 
 * Flow:
 * 1. Validate input and reCAPTCHA
 * 2. Call Edge Function for address → OCD ID mapping
 * 3. Write to database (profiles + subscriptions if user_id exists)
 * 4. Return success with district count
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkRateLimit } from '@/lib/rateLimiter'

const BodySchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  address: z.string().min(6, 'Address seems too short'),
  recaptchaToken: z.string().nullable().optional()
});

// Try JSON first; fall back to form-data
async function parseBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    const fd = await req.formData();
    const obj: Record<string, any> = {};
    for (const [k, v] of fd.entries()) obj[k] = typeof v === 'string' ? v : undefined;
    // common alt name from reCAPTCHA widgets
    if (!obj.recaptchaToken && obj['g-recaptcha-response']) obj.recaptchaToken = obj['g-recaptcha-response'];
    return obj;
  }
}

async function verifyRecaptcha(token: string | null | undefined) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;               // dev mode: allow when not configured
  if (!token) return false;
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const data = await res.json();
  return !!data.success;
}

function zipFromAddress(address: string): string | null {
  const m = address.match(/\b\d{5}(?:-\d{4})?\b/);
  return m?.[0]?.slice(0, 5) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    // 0) Rate limit: 5 req/min per IP
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    try {
      if (!checkRateLimit(clientIP, 5, 60_000)) {
        return NextResponse.json(
          { success: false, error: 'Too many requests. Please try again later.' },
          { status: 429 }
        );
      }
    } catch (rateLimitError) {
      console.error('Rate limiting failed:', rateLimitError);
      // Continue without rate limiting - don't block the request
    }

    // 1) Parse + validate
    const raw = await parseBody(req);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    const { name, email, address, recaptchaToken } = parsed.data;

    // 2) reCAPTCHA (enforce if configured; allow in dev if not)
    const captchaOK = await verifyRecaptcha(recaptchaToken);
    if (!captchaOK) {
      return NextResponse.json({ success: false, error: 'reCAPTCHA verification failed' }, { status: 400 });
    }

    // 3) Enrichment via Edge Function (fail-closed prod, skip in dev)
    let ocdIds: string[] = [];
    let zipcode = zipFromAddress(address);

    const edgeSecret = process.env.EDGE_SHARED_SECRET;
    if (process.env.NODE_ENV === 'production' && !edgeSecret) {
      console.error('Server configuration error: EDGE_SHARED_SECRET required in production');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (edgeSecret) {
      try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const { data, error } = await supabaseAdmin.functions.invoke('profile-address', {
          body: { email, address },
          headers: { 'x-edge-secret': edgeSecret },
          signal: controller.signal  // CRITICAL: Add abort signal
        });
        
        clearTimeout(timeoutId);
        
        if (!error && data?.data?.ocd_ids?.length) ocdIds = data.data.ocd_ids;
        if (!error && data?.data?.zipcode) zipcode = data.data.zipcode;
      } catch (err) {
        console.error('profile-address invoke failed:', err);
        // Continue without enrichment
      }
    } else {
      console.warn('EDGE_SHARED_SECRET missing; skipping profile-address enrichment in non-prod');
    }

    // 4) DB writes (Model B): only if profiles.user_id exists for this email
    const { data: prof, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();
    
    if (profErr) {
      console.error('profiles lookup failed:', profErr);
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
    }

    if (prof?.user_id) {
      // Update profile with address data
      const { error: updErr } = await supabaseAdmin
        .from('profiles')
        .update({
          address,
          zipcode,
          ocd_ids: ocdIds,
          ocd_last_verified_at: new Date().toISOString(),
        })
        .eq('user_id', prof.user_id);
      
      if (updErr) {
        console.error('profiles update failed:', updErr);
        return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
      }

      // Create default subscription
      const { error: subErr } = await supabaseAdmin
        .from('subscriptions')
        .upsert(
          { 
            user_id: prof.user_id, 
            list_key: 'general', 
            unsubscribed_at: null,
            created_at: new Date().toISOString()
          },
          { onConflict: 'user_id,list_key' }
        );
      
      if (subErr) {
        console.error('subscriptions upsert failed:', subErr);
        return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
      }
    }
    // If no user_id yet, we skip subscription due to FK. Can attach later on first auth.

    // 5) Response
    return NextResponse.json({
      success: true,
      message: 'Thanks for signing up!',
      data: {
        districtsFound: ocdIds.length,
        email,
        zipcode,
        hasSubscription: !!prof?.user_id,
      },
    });
  } catch (error) {
    console.error('Signup API failed:', error);
    return NextResponse.json({ success: false, error: 'Signup failed. Please try again.' }, { status: 500 });
  }
}
```

---

## **🔑 CRITICAL IMPLEMENTATION DETAILS**

### **1. Edge Function Authentication**
**CRITICAL:** The `profile-address` Edge Function requires authentication:
```typescript
// Must include this header:
headers: {
  'x-edge-secret': process.env.EDGE_SHARED_SECRET!
}
```

### **2. Edge Function Timeout Protection**
**CRITICAL:** Always implement timeout protection using Promise.race to prevent hanging requests:
```typescript
async function invokeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Edge Function timeout')), timeoutMs);
  });
  
  return Promise.race([fn(), timeoutPromise]);
}

// Usage with timeout:
try {
  const result = await invokeWithTimeout(async () => {
    return await supabaseAdmin.functions.invoke('profile-address', {
      body: { email, address },
      headers: { 'x-edge-secret': edgeSecret }
    });
  }, 10000); // 10 second timeout
  
  const { data, error } = result;
  if (!error && data?.data?.ocd_ids?.length) ocdIds = data.data.ocd_ids;
} catch (err) {
  if (err.message === 'Edge Function timeout') {
    console.error('Edge Function timed out after 10 seconds');
  } else {
    console.error('profile-address invoke failed:', err);
  }
  // Continue without enrichment
}
```

### **3. Edge Function Response Format**
**CRITICAL:** The Edge Function returns wrapped response:
```typescript
// Correct parsing:
if (!error && data?.data?.ocd_ids?.length) {
  ocdIds = data.data.ocd_ids;
}
// NOT: data.ocd_ids (this will be undefined)
```

### **4. Environment Variables Required**
**Vercel Project Settings:**
- `SUPABASE_URL` (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side)
- `EDGE_SHARED_SECRET` (for Edge Function auth)
- `RECAPTCHA_SECRET_KEY` (for reCAPTCHA validation)

### **5. Database Constraints**
- `subscriptions.user_id → profiles.user_id` (FK constraint)
- `UNIQUE (user_id, list_key)` (prevents duplicate subscriptions)
- Only create subscriptions when `profiles.user_id` exists

---

## **📋 ACCEPTANCE CRITERIA**

### **✅ Functionality**
- Form submits exactly as before; no UI change
- `/api/signup` returns `{ success: true, data: { districtsFound } }`
- If `profiles.user_id` exists for that email:
  - `profiles.address` and `profiles.zipcode` are updated
  - `subscriptions` upserts a `general` row (unique on `user_id,list_key`)
- No calls to Make.com anywhere in the route

### **✅ Error Handling**
- reCAPTCHA validation works (if configured)
- Edge Function failures don't break signup
- Database errors are properly handled
- Rate limiting is preserved

### **✅ Data Flow**
1. User submits form → API route
2. API validates input + reCAPTCHA
3. API calls Edge Function for address enrichment
4. API writes to database (if user_id exists)
5. API returns success with district count

---

## **🚨 COMMON PITFALLS TO AVOID**

### **1. Missing Authentication**
```typescript
// WRONG - will return 401:
const { data, error } = await supabaseAdmin.functions.invoke('profile-address', {
  body: { email, address }
});

// CORRECT - includes auth header:
const { data, error } = await supabaseAdmin.functions.invoke('profile-address', {
  body: { email, address },
  headers: { 'x-edge-secret': process.env.EDGE_SHARED_SECRET! }
});
```

### **2. Missing Timeout Protection**
```typescript
// WRONG - can hang indefinitely:
const { data, error } = await supabaseAdmin.functions.invoke('profile-address', {
  body: { email, address },
  headers: { 'x-edge-secret': edgeSecret }
});

// CORRECT - with timeout protection:
const result = await invokeWithTimeout(async () => {
  return await supabaseAdmin.functions.invoke('profile-address', {
    body: { email, address },
    headers: { 'x-edge-secret': edgeSecret }
  });
}, 10000); // 10 second timeout
```

### **3. Wrong Response Parsing**
```typescript
// WRONG - will be undefined:
if (data?.ocd_ids?.length) { ... }

// CORRECT - wrapped response:
if (data?.data?.ocd_ids?.length) { ... }
```

### **4. Missing Environment Variables**
```typescript
// WRONG - will throw error:
const url = process.env.SUPABASE_URL!;

// CORRECT - with validation:
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Server configuration error');
}
```

---

## **🎯 NEXT STEPS**

1. **Set Environment Variables** in Vercel Project Settings
2. **Deploy the enhanced API route**
3. **Test signup flow** with and without user_id
4. **Verify database writes** are working correctly
5. **Test Edge Function integration** with proper authentication

**This implementation preserves all existing functionality while adding the requested database writes!**
