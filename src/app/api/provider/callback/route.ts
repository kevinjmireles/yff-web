// src/app/api/provider/callback/route.ts
import { NextRequest } from 'next/server'
import { jsonOk, jsonErrorWithId } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { z } from 'zod'

const SHARED = process.env.MAKE_SHARED_TOKEN

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
    const meta = r.error ? { error: r.error } : (r as any).meta ?? null

    if (r.provider_message_id) {
      // Keep provider_message_id upsert path (idempotent by provider id)
      const { error } = await sb
        .from('delivery_history')
        .upsert(
          [{ provider_message_id: r.provider_message_id, job_id, batch_id, email, status: r.status, meta }],
          { onConflict: 'provider_message_id', ignoreDuplicates: true }
        )
      if (error) return jsonErrorWithId(req, 'INSERT_ERROR', error.message, 500)
      continue
    }

    // Fallback: update-or-insert without relying on ON CONFLICT unique
    const { data: updRows, error: updErr } = await sb
      .from('delivery_history')
      .update({ status: r.status, meta })
      .eq('job_id', job_id)
      .eq('batch_id', batch_id)
      .eq('email', email)
      .select('id')

    if (updErr) {
      return jsonErrorWithId(req, 'UPDATE_ERROR', `Failed to update history for ${email}`, 500)
    }

    if (!updRows || updRows.length === 0) {
      const { error: insErr } = await sb
        .from('delivery_history')
        .insert([{ job_id, batch_id, email, status: r.status, meta }])
      if (insErr && (insErr as any).code !== '23505') {
        return jsonErrorWithId(req, 'INSERT_ERROR', `Failed to insert history for ${email}`, 500)
      }
    }
  }

  return jsonOk({ ok: true })
}
