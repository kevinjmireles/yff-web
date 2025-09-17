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

    // 3) Enrichment via Google Civic API directly (non-blocking if it fails)
    let ocdIds: string[] = [];
    let zipcode = zipFromAddress(address);

    // Sanitize address a bit (strip "Address:" prefix)
    const cleanedAddress = address.replace(/^\s*address[:\s]*/i, '').trim();

    // Require CIVIC_API_KEY in prod; optional in dev
    const civicApiKey = process.env.CIVIC_API_KEY;
    if (process.env.NODE_ENV === 'production' && !civicApiKey) {
      console.error('CIVIC_API_KEY missing in production');
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    if (civicApiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const url = new URL('https://www.googleapis.com/civicinfo/v2/divisionsByAddress');
        url.searchParams.set('address', cleanedAddress);
        url.searchParams.set('key', civicApiKey);

        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const civic = await res.json();
          // divisions is an object whose keys are OCD IDs
          const divisions = civic?.divisions ?? {};
          ocdIds = Object.keys(divisions);
          // Prefer normalizedInput.zip if present
          zipcode = civic?.normalizedInput?.zip ?? zipcode;
        } else {
          console.error('civic_error', { status: res.status });
        }
      } catch (err: any) {
        console.error('civic_exception', err?.message || String(err));
        // continue without enrichment
      }
    } else {
      console.warn('CIVIC_API_KEY not set; skipping Civic enrichment in non-prod');
    }

    // 4) Create or update profile by email, then attach subscription
    const nowIso = new Date().toISOString();
    const { data: profRow, error: profUpErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          email,
          address: cleanedAddress,
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
