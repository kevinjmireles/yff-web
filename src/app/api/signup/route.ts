/**
 * file: app/api/signup/route.ts
 * purpose: Enhanced signup with database writes, Civic API enrichment, and reCAPTCHA validation
 * calledBy: app/page.tsx -> SignupForm
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

async function invokeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Edge Function timeout')), timeoutMs);
  });
  
  return Promise.race([fn(), timeoutPromise]);
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
        const result = await invokeWithTimeout(async () => {
          return await supabaseAdmin.functions.invoke('profile-address', {
            body: { email, address },
            headers: { 'x-edge-secret': edgeSecret }
          });
        }, 10000); // 10 second timeout
        
        const { data, error } = result;
        if (!error && data?.data?.ocd_ids?.length) ocdIds = data.data.ocd_ids;
        if (!error && data?.data?.zipcode) zipcode = data.data.zipcode;
      } catch (err) {
        if (err instanceof Error && err.message === 'Edge Function timeout') {
          console.error('Edge Function timed out after 10 seconds');
        } else {
          console.error('profile-address invoke failed:', err);
        }
        // Continue without enrichment
      }
    } else {
      console.warn('EDGE_SHARED_SECRET missing; skipping profile-address enrichment in non-prod');
    }

    // 4) Create or update profile by email, then attach subscription
    const nowIso = new Date().toISOString();
    const { data: profRow, error: profUpErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          email,
          address,
          zipcode,
          ocd_ids: ocdIds,
          ocd_last_verified_at: nowIso,
          created_at: nowIso,          // harmless if DB already defaults this
        },
        { onConflict: 'email' }
      )
      .select('user_id')
      .single();

    if (profUpErr || !profRow?.user_id) {
      console.error('profiles upsert failed or missing user_id:', profUpErr);
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
    }

    // Ensure default subscription (idempotent)
    const { error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          user_id: profRow.user_id,
          list_key: 'general',
          unsubscribed_at: null,
          created_at: nowIso,          // optional if DB has DEFAULT now()
        },
        { onConflict: 'user_id,list_key' }
      );

    if (subErr) {
      console.error('subscriptions upsert failed:', subErr);
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
    }

    // 5) Response
    return NextResponse.json({
      success: true,
      message: 'Thanks for signing up!',
      data: {
        districtsFound: ocdIds.length,
        email,
        zipcode,
        hasSubscription: true,  // Always true now since we always create subscription
      },
    });
  } catch (error) {
    console.error('Signup API failed:', error);
    return NextResponse.json({ success: false, error: 'Signup failed. Please try again.' }, { status: 500 });
  }
}
