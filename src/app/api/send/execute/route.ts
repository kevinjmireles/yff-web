// src/app/api/send/execute/route.ts
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { jsonOk, jsonErrorWithId } from '@/lib/api'
import { FEATURE_SEND_EXECUTE } from '@/lib/features'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ensureDelegationLink } from '@/lib/delegation/links'

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL
const TEST_DATASET_ID = '00000000-0000-0000-0000-000000000001'

function withTimeout(signal: AbortSignal, ms = 5000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort('timeout'), ms)
  const cleanup = () => clearTimeout(t)
  signal?.addEventListener?.('abort', () => ctrl.abort('upstream aborted'))
  return { signal: ctrl.signal, cleanup }
}

/**
 * Ensures test dataset exists for test mode jobs.
 * Idempotent: if row exists, does nothing; otherwise creates minimal row.
 */
async function ensureTestDataset(sb: any) {
  const { error } = await sb
    .from('content_datasets')
    .upsert(
      [{ id: TEST_DATASET_ID, name: '__test__', created_at: new Date().toISOString() }],
      { onConflict: 'id', ignoreDuplicates: true }
    )
  if (error) throw new Error(`Failed to ensure test dataset: ${error.message}`)
}

/**
 * Ensures a send_jobs row exists for the given job_id to satisfy FK constraints.
 * Idempotent: if row exists, does nothing; otherwise creates minimal row.
 * dataset_id is required (NOT NULL constraint).
 */
async function ensureSendJob(sb: any, job_id: string, dataset_id: string) {
  const { error } = await sb
    .from('send_jobs')
    .upsert(
      [{ id: job_id, dataset_id, status: 'pending', created_at: new Date().toISOString() }],
      { onConflict: 'id', ignoreDuplicates: true }
    )
  if (error) throw new Error(`Failed to ensure send_jobs row: ${error.message}`)
}

export async function POST(req: NextRequest) {
  // protected route guard (in addition to middleware)
  const unauth = requireAdmin(req)
  if (unauth) return unauth

  if (!FEATURE_SEND_EXECUTE) {
    return jsonErrorWithId(req, 'FEATURE_DISABLED', 'Send execute is disabled', 403)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonErrorWithId(req, 'INVALID_BODY', 'Body must be valid JSON', 400)
  }

  // Reject explicitly empty test emails for modern and legacy shapes
  if (body?.mode === 'test') {
    const emails = Array.isArray(body.emails) ? body.emails.filter(Boolean) : []
    if (emails.length === 0) {
      return jsonErrorWithId(req, 'INVALID_BODY', 'Test mode requires non-empty emails array', 400)
    }
  }
  if (!body?.mode && Array.isArray(body?.test_emails) && body.test_emails.length === 0) {
    return jsonErrorWithId(req, 'INVALID_BODY', 'Legacy test_emails cannot be empty', 400)
  }

  // Compatibility parser: accept new and legacy shapes
  const LegacyA = z.object({ job_id: z.string().uuid(), test_emails: z.array(z.string().email()) })
  const LegacyB = z.object({ job_id: z.string().uuid(), dataset_id: z.string().uuid() })
  const NewTest = z.object({ job_id: z.string().uuid(), mode: z.literal('test'), emails: z.array(z.string().email()), dataset_id: z.string().uuid().optional() })
  const NewCohort = z.object({ job_id: z.string().uuid(), mode: z.literal('cohort'), dataset_id: z.string().uuid().optional() })

  type Norm = { job_id: string; mode: 'test'|'cohort'; emails?: string[]; dataset_id?: string }
  function parseBodyCompat(raw: any): Norm | null {
    if (NewTest.safeParse(raw).success) { const v = NewTest.parse(raw); return { job_id: v.job_id, mode: 'test', emails: v.emails, dataset_id: v.dataset_id } }
    if (NewCohort.safeParse(raw).success) { const v = NewCohort.parse(raw); return { job_id: v.job_id, mode: 'cohort', dataset_id: v.dataset_id } }
    if (LegacyA.safeParse(raw).success) { const v = LegacyA.parse(raw); return { job_id: v.job_id, mode: 'test', emails: v.test_emails } }
    if (LegacyB.safeParse(raw).success) { const v = LegacyB.parse(raw); return { job_id: v.job_id, mode: 'cohort', dataset_id: v.dataset_id } }
    return null
  }

  const norm = parseBodyCompat(body)
  if (!norm) return jsonErrorWithId(req, 'INVALID_BODY', 'Body must be one of the supported shapes', 400)

  const job_id = norm.job_id
  let dataset_id = norm.dataset_id
  const batch_id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

  const sb = supabaseAdmin

  // For test mode, use sentinel dataset to satisfy NOT NULL constraint
  const datasetForJob = dataset_id || TEST_DATASET_ID

  // Ensure test dataset exists if using sentinel
  if (!dataset_id) {
    try {
      await ensureTestDataset(sb)
    } catch (e: any) {
      return jsonErrorWithId(req, 'TEST_DATASET_ERROR', e.message, 500)
    }
  }

  // Ensure send_jobs row exists to prevent FK violations in callbacks
  try {
    await ensureSendJob(sb, job_id, datasetForJob)
  } catch (e: any) {
    return jsonErrorWithId(req, 'SEND_JOB_ERROR', e.message, 500)
  }

  // Resolve dataset_id for cohort mode if absent via send_jobs
  if (norm.mode === 'cohort' && !dataset_id) {
    const { data: jobRow, error: jobErr } = await sb
      .from('send_jobs')
      .select('dataset_id')
      .eq('id', job_id)
      .single()
    if (jobErr) return jsonErrorWithId(req, 'JOB_NOT_FOUND', 'send_job not found', 404)
    dataset_id = jobRow?.dataset_id ?? null
  }

  // MVP placeholder / or swap to v_recipients when wired:
  // NOTE: for MVP we support either explicit test_emails[] or a simple capped pull.
  let recipients: { email: string }[] = []
  if (norm.mode === 'test' && Array.isArray(norm.emails) && norm.emails.length > 0) {
    recipients = norm.emails.map((e: string) => ({ email: e.toLowerCase().trim() }))
  } else {
    // MVP: simple deterministic capped pull from profiles (no dataset filter)
    const cap = Number(process.env.MAX_SEND_PER_RUN ?? 100)
    const { data, error } = await sb
      .from('profiles')
      .select('email')
      .order('email', { ascending: true })
      .limit(cap)
    if (error) return jsonErrorWithId(req, 'AUDIENCE_ERROR', 'Failed to load audience', 500)
    recipients = (data ?? []).filter((r) => r.email)
  }

  if (recipients.length === 0) {
    return jsonOk({ job_id, dataset_id, batch_id, selected: 0, queued: 0, deduped: 0 })
  }

  // Test mode: write to delivery_history for callback testing, then dispatch
  if (norm.mode === 'test') {
    const unique = Array.from(new Set(recipients.map(r => r.email)))
    const selected = recipients.length
    const queued = unique.length
    const deduped = selected - queued

    // Write queued rows to delivery_history so callbacks have rows to update
    const rows = unique.map((email) => ({
      job_id,
      dataset_id: datasetForJob,
      batch_id,
      email,
      status: 'queued' as const,
    }))

    const { error: insertErr } = await sb
      .from('delivery_history')
      .insert(rows)

    if (insertErr) return jsonErrorWithId(req, 'INSERT_ERROR', insertErr.message, 500)

    // Pre-create delegation links for all recipients (idempotent)
    const linkResults = await Promise.allSettled(
      unique.map(email => ensureDelegationLink(email, batch_id, job_id))
    )
    // Log any failed link creations (but don't block send)
    const linkFailures = linkResults.filter(r => r.status === 'rejected')
    if (linkFailures.length > 0) {
      console.error(`[execute] Failed to create ${linkFailures.length}/${unique.length} delegation links for job ${job_id}:`,
        linkFailures.map(r => r.status === 'rejected' ? r.reason : null))
    }

    // Dispatch to Make (best effort) with batch_id
    if (!MAKE_WEBHOOK_URL) {
      return jsonErrorWithId(req, 'DISPATCH_FAILED', 'MAKE_WEBHOOK_URL missing', 500)
    }
    try {
      const { signal } = new AbortController()
      const { signal: timeoutSignal, cleanup } = withTimeout(signal, 5000)
      const res = await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': req.headers.get('x-request-id') ?? '',
        },
        body: JSON.stringify({ job_id, dataset_id: datasetForJob, batch_id, count: queued, emails: unique }),
        signal: timeoutSignal,
      })
      cleanup()
      if (!res.ok) return jsonErrorWithId(req, 'DISPATCH_FAILED', `Make returned ${res.status}`, 502)
    } catch (e: any) {
      return jsonErrorWithId(req, 'DISPATCH_FAILED', String(e?.message ?? e), 504)
    }

    return jsonOk({ job_id, dataset_id: datasetForJob, batch_id, selected, queued, deduped })
  }

  // cohort mode → idempotent insert to delivery_history by (dataset_id,email)
  const rows = recipients.map((r) => ({
    job_id,
    dataset_id: dataset_id ?? null,
    batch_id,
    email: r.email,
    status: 'queued' as const,
  }))

  // Additional dedupe against same job_id to avoid double enqueue for same job
  const { data: existingForJob, error: existingErr } = await sb
    .from('delivery_history')
    .select('email')
    .eq('job_id', job_id)
    .in('status', ['queued', 'delivered'])

  if (existingErr) return jsonErrorWithId(req, 'HISTORY_ERROR', existingErr.message, 500)

  const existingSet = new Set((existingForJob ?? []).map((r) => r.email))
  const toInsert = rows.filter((r) => !existingSet.has(r.email))

  if (toInsert.length === 0) {
    return jsonOk({ job_id, dataset_id, batch_id, selected: recipients.length, queued: 0, deduped: recipients.length })
  }

  const { data: inserted, error: insertErr } = await sb
    .from('delivery_history')
    .upsert(toInsert, { onConflict: 'dataset_id,email', ignoreDuplicates: true })
    .select('email')

  if (insertErr) return jsonErrorWithId(req, 'INSERT_ERROR', insertErr.message, 500)

  const insertedSet = new Set((inserted ?? []).map((r) => r.email))
  const dedupedCount = recipients.length - insertedSet.size

  // Pre-create delegation links for all successfully queued recipients (idempotent)
  const linkResults = await Promise.allSettled(
    Array.from(insertedSet).map(email => ensureDelegationLink(email, batch_id, job_id))
  )
  // Log any failed link creations (but don't block send)
  const linkFailures = linkResults.filter(r => r.status === 'rejected')
  if (linkFailures.length > 0) {
    console.error(`[execute] Failed to create ${linkFailures.length}/${insertedSet.size} delegation links for job ${job_id}:`,
      linkFailures.map(r => r.status === 'rejected' ? r.reason : null))
  }

  // Dispatch to Make (best effort with 5s timeout)
  if (!MAKE_WEBHOOK_URL) {
    return jsonErrorWithId(req, 'DISPATCH_FAILED', 'MAKE_WEBHOOK_URL missing', 500)
  }
  try {
    const { signal } = new AbortController()
    const { signal: timeoutSignal, cleanup } = withTimeout(signal, 5000)
    const res = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': req.headers.get('x-request-id') ?? '',
      },
      body: JSON.stringify({ job_id, dataset_id, batch_id, count: insertedSet.size, emails: Array.from(insertedSet) }),
      signal: timeoutSignal,
    })
    cleanup()
    if (!res.ok) {
      return jsonErrorWithId(req, 'DISPATCH_FAILED', `Make returned ${res.status}`, 502)
    }
  } catch (e: any) {
    return jsonErrorWithId(req, 'DISPATCH_FAILED', String(e?.message ?? e), 504)
  }

  return jsonOk({ job_id, dataset_id, batch_id, selected: recipients.length, queued: insertedSet.size, deduped: dedupedCount })
}
