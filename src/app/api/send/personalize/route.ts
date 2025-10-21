// src/app/api/send/personalize/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  safeParseRule,
  evaluateAudienceRuleInMemory,
  matchesOcdScope,
  pickBest,
  type GeoCtx,
  type ContentRow
} from '@/lib/personalize/helpers'

const QuerySchema = z.object({
  job_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  email: z.string().email(),
  dataset_id: z.string().uuid().optional(),
})

// Use Vercel's VERCEL_URL for all environments (production, preview, local)
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

function buildDelegationHTML(opts: { job_id: string; batch_id: string; email: string }) {
  const u = new URL('/delegate', BASE_URL)
  u.searchParams.set('job_id', opts.job_id)
  u.searchParams.set('batch_id', opts.batch_id)
  u.searchParams.set('email', opts.email)
  return `
    <p>
      If you can't email right now, you can
      <a href="${u.toString()}" target="_blank" rel="noopener noreferrer">
        delegate this action
      </a>.
    </p>
  `.trim()
}

/**
 * Replace tokens with dynamic content.
 * Supports: [[DELEGATION]], [[EMAIL]], [[JOB_ID]], [[BATCH_ID]]
 * Extend this later for more tokens (e.g., [[FIRST_NAME]]).
 */
function resolveTokens(html: string, ctx: { job_id: string; batch_id: string; email: string }) {
  let out = html ?? ''
  out = out.replace(/\[\[DELEGATION\]\]/g, buildDelegationHTML(ctx))
  out = out.replace(/\[\[EMAIL\]\]/g, ctx.email)
  out = out.replace(/\[\[JOB_ID\]\]/g, ctx.job_id)
  out = out.replace(/\[\[BATCH_ID\]\]/g, ctx.batch_id)
  return out
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    job_id: searchParams.get('job_id'),
    batch_id: searchParams.get('batch_id'),
    email: searchParams.get('email'),
    dataset_id: searchParams.get('dataset_id') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_PARAMS', details: parsed.error.errors }, { status: 400 })
  }

  const { job_id, batch_id, email, dataset_id } = parsed.data

  // If dataset_id missing, resolve via send_jobs
  let finalDatasetId = dataset_id
  if (!finalDatasetId) {
    const { data: jobRow, error: jobErr } = await supabaseAdmin
      .from('send_jobs')
      .select('dataset_id')
      .eq('id', job_id)
      .single()
    if (jobErr) return NextResponse.json({ ok: false, error: 'JOB_LOOKUP_FAILED' }, { status: 400 })
    finalDatasetId = jobRow?.dataset_id
  }
  if (!finalDatasetId) return NextResponse.json({ ok: false, error: 'NO_DATASET' }, { status: 400 })

  // 1) Load user profile + geo context (O(1) queries)
  const { data: profile, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('user_id, ocd_ids')
    .eq('email', email)
    .maybeSingle()
  if (pErr) return NextResponse.json({ ok: false, error: 'PROFILE_LOOKUP_FAILED', details: pErr.message }, { status: 500 })
  if (!profile) return NextResponse.json({ ok: false, error: 'PROFILE_NOT_FOUND' }, { status: 404 })

  const { data: geo, error: gErr } = await supabaseAdmin
    .from('v_subscriber_geo')
    .select('state, county_fips, place')
    .eq('user_id', profile.user_id)
    .maybeSingle()
  if (gErr) return NextResponse.json({ ok: false, error: 'GEO_LOOKUP_FAILED', details: gErr.message }, { status: 500 })

  const userOcdIds: string[] = Array.isArray(profile.ocd_ids) ? profile.ocd_ids : []
  const geoCtx: GeoCtx = geo ?? {}

  // 2) Load ALL content candidates for dataset (single query)
  const { data: rows, error: cErr } = await supabaseAdmin
    .from('v2_content_items_staging')
    .select('subject, body_html, body_md, ocd_scope, metadata, created_at')
    .eq('dataset_id', finalDatasetId)
    .order('created_at', { ascending: false })
  if (cErr) return NextResponse.json({ ok: false, error: 'CONTENT_LOOKUP_FAILED', details: cErr.message }, { status: 500 })

  // 3) Apply targeting hierarchy (pure in-memory evaluation)
  // Priority 1: audience_rule targeting (most specific)
  const audienceMatches = rows
    .filter(r => !!r.metadata?.audience_rule)
    .filter(r => evaluateAudienceRuleInMemory(safeParseRule(r.metadata.audience_rule), geoCtx))

  // Priority 2: ocd_scope geographic targeting (fallback)
  const ocdMatches = rows
    .filter(r => !!r.ocd_scope && matchesOcdScope(r.ocd_scope!, userOcdIds))

  // Priority 3: global content (no targeting)
  const globalMatches = rows.filter(r => !r.metadata?.audience_rule && !r.ocd_scope)

  // 4) Pick best content deterministically
  const selected: ContentRow | null =
    pickBest(audienceMatches) ??
    pickBest(ocdMatches) ??
    pickBest(globalMatches) ??
    null

  const subject = selected?.subject ?? 'Update from Your Friend Fido'
  // Prefer body_html, fall back to body_md (Option C)
  const baseHtml = selected?.body_html ?? selected?.body_md ?? '<p>Thanks for staying engaged.</p>'

  const resolvedHtml = resolveTokens(baseHtml, { job_id, batch_id, email })
  const text = htmlToText(resolvedHtml)

  return NextResponse.json({ ok: true, job_id, batch_id, email, subject, html: resolvedHtml, text })
}
