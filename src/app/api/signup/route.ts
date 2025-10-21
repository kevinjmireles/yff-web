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
import { metricRowsFromOcdIds } from '@/lib/geo/fromOcd'

// Ensure this route runs on Node.js runtime (required for supabase admin client)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
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
      // Validate API key format (Google API keys are typically 39+ chars)
      if (civicApiKey.length < 30) {
        console.error('civic_api_key_invalid', { keyLength: civicApiKey.length, keyPrefix: civicApiKey.substring(0, 10) });
      }
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        // CRITICAL: Use divisionsByAddress (NOT representatives) to get OCD IDs
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
          const errorBody = await res.text().catch(() => 'Unable to read error body');
          console.error('civic_api_error', { 
            status: res.status, 
            statusText: res.statusText,
            headers: Object.fromEntries(res.headers.entries()),
            body: errorBody,
            url: url.toString()
          });
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
      console.error('profiles_upsert_failed', { 
        error: profUpErr,
        hasData: !!profRow,
        userId: profRow?.user_id 
      });
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

    // 5) Populate geo_metrics for personalization targeting
    // Delete-then-insert ensures one canonical value per metric_key
    const metricRows = metricRowsFromOcdIds(ocdIds);
    if (metricRows.length > 0) {
      const keys = ['state', 'county_fips', 'place'];

      // Delete existing metrics to ensure canonical values
      const { error: delErr } = await supabaseAdmin
        .from('geo_metrics')
        .delete()
        .eq('user_id', profRow.user_id)
        .in('metric_key', keys);

      if (delErr) {
        console.error('geo_metrics delete failed:', delErr);
        // Non-fatal, continue
      }

      // Insert fresh canonical triplet
      const { error: geoErr } = await supabaseAdmin
        .from('geo_metrics')
        .insert(metricRows.map(r => ({
          user_id: profRow.user_id,
          metric_key: r.metric_key,
          metric_value: r.metric_value,
          source: 'civic_api'
        })));

      if (geoErr) {
        console.error('geo_metrics insert failed:', geoErr);
        // Non-fatal, user signup still succeeded
      } else {
        console.log('geo_metrics_created', { user_id: profRow.user_id, count: metricRows.length });
      }
    }

    // 6) Success monitoring log
    console.log('signup_ok', { email, zipcode, nOcd: ocdIds.length });

    // 7) Response
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
    console.error('signup_failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Signup failed. Please try again.' }, { status: 500 });
  }
}
