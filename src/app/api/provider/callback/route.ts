// src/app/api/provider/callback/route.ts
import { NextRequest } from 'next/server'
import { jsonOk, jsonErrorWithId } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { z } from 'zod'

const SHARED = process.env.MAKE_SHARED_TOKEN
const PG_UNIQUE_VIOLATION = '23505'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-shared-token')
  if (!token || token !== SHARED) {
    return jsonErrorWithId(req, 'UNAUTHORIZED', 'Unauthorized', 401)
  }

  let raw: any
  try { raw = await req.json() } catch { return jsonErrorWithId(req, 'INVALID_BODY', 'Body must be valid JSON', 400) }

  const Single = z.object({
    job_id: z.string().uuid(),
    batch_id: z.string().uuid(),
    email: z.string().email(),
    status: z.enum(['delivered','failed']),
    provider_message_id: z.string().optional(),
    error: z.string().nullish(),
    meta: z.any().optional(),
  })
  const Batch = z.object({
    job_id: z.string().uuid(),
    batch_id: z.string().uuid(),
    results: z.array(z.object({
      email: z.string().email(),
      status: z.enum(['delivered','failed']),
      provider_message_id: z.string().optional(),
      error: z.string().nullish(),
      meta: z.any().optional(),
    }))
  })

  function parseCompat(input: unknown): { job_id: string, batch_id: string, results: Array<{ email:string, status:'delivered'|'failed', provider_message_id?:string, error?:string|null, meta?: any }> } | null {
    if (Batch.safeParse(input).success) {
      const v = Batch.parse(input); return v
    }
    if (Single.safeParse(input).success) {
      const v = Single.parse(input); return { job_id: v.job_id, batch_id: v.batch_id, results: [{ email: v.email, status: v.status, provider_message_id: v.provider_message_id, error: v.error ?? null, meta: v.meta }] }
    }
    return null
  }

  const parsed = parseCompat(raw)
  if (!parsed) return jsonErrorWithId(req, 'INVALID_BODY', 'Invalid body', 400)

  const { job_id, batch_id, results } = parsed
  const sb = supabaseAdmin

  // Idempotent write for each result
  for (const r of results) {
    const email = r.email.toLowerCase().trim()
    const status = r.status
    const meta = r.meta ?? (r.error ? { error: r.error } : null)
    const pmid = r.provider_message_id ?? null

    // 1) UPDATE-FIRST by (job_id, batch_id, email) to touch the row created by /execute
    {
      const { error: updErr, count } = await sb
        .from('delivery_history')
        .update(
          { status, meta, provider_message_id: pmid },
          { count: 'exact' }
        )
        .eq('job_id', job_id)
        .eq('batch_id', batch_id)
        .eq('email', email)

      if (updErr) {
        if ((updErr as any)?.code === PG_UNIQUE_VIOLATION) {
          // Another row already holds this provider_message_id — treat as idempotent success
          console.warn('provider_callback: unique race on provider_message_id', { job_id, batch_id, email, pmid })
          continue
        }
        return jsonErrorWithId(req, 'UPDATE_ERROR', updErr.message, 500)
      }

      if ((count ?? 0) > 0) {
        // Successfully updated the pre-created row — done
        continue
      }
    }

    // 2) No row to update; if we have pmid, UPSERT by provider_message_id (idempotent)
    if (pmid) {
      const { error: upsertErr } = await sb
        .from('delivery_history')
        .upsert(
          [{ job_id, batch_id, email, status, meta, provider_message_id: pmid }],
          { onConflict: 'provider_message_id' }
        )

      if (upsertErr && (upsertErr as any)?.code !== PG_UNIQUE_VIOLATION) {
        return jsonErrorWithId(req, 'INSERT_ERROR', upsertErr.message, 500)
      }

      // either inserted, updated, or collided idempotently — done
      continue
    }

    // 3) Final fallback (no pmid and no matching row) — minimal INSERT
    {
      const { error: insErr } = await sb
        .from('delivery_history')
        .insert([{ job_id, batch_id, email, status, meta }])

      if (insErr) {
        return jsonErrorWithId(req, 'INSERT_ERROR', insErr.message, 500)
      }
    }
  }

  return jsonOk({ ok: true })
}
