// src/app/api/send/personalize/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
 * Replace [[DELEGATION]] tokens with HTML.
 * Note: /delegate route not yet implemented — link will 404 until you add it.
 * Extend this later for more tokens (e.g., [[FIRST_NAME]]).
 */
function resolveTokens(html: string, ctx: { job_id: string; batch_id: string; email: string }) {
  let out = html ?? ''
  out = out.replace(/\[\[DELEGATION\]\]/g, buildDelegationHTML(ctx))
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

  // Pull content from staging (matches your import flow)
  const { data: contentRow, error: contentErr } = await supabaseAdmin
    .from('v2_content_items_staging')
    .select('subject, body_md')
    .eq('dataset_id', finalDatasetId)
    .limit(1)
    .maybeSingle()
  if (contentErr) return NextResponse.json({ ok: false, error: 'CONTENT_LOOKUP_FAILED' }, { status: 500 })

  const subject = contentRow?.subject || 'Update from Your Friend Fido'
  const baseHtml = contentRow?.body_md || '<p>Thanks for staying engaged.</p>'

  const resolvedHtml = resolveTokens(baseHtml, { job_id, batch_id, email })
  const text = htmlToText(resolvedHtml)

  return NextResponse.json({ ok: true, job_id, batch_id, email, subject, html: resolvedHtml, text })
}
