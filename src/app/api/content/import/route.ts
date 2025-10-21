/**
 * POST /api/content/import
 *
 * Purpose: CSV chunk import endpoint for v2_content_items staging (aligned with promote flow)
 *
 * Called by: Admin content page chunked uploader
 *
 * Security:
 * - Requires admin authentication via requireAdmin(req)
 * - Uses query builder for all deletes (no raw SQL)
 * - Validates all input via Zod schema
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdmin } from '@/lib/auth'

const ok = (code: string, data: any) => NextResponse.json({ ok: true, code, data })
const err = (code: string, message: string, details?: any, status = 400) =>
  NextResponse.json({ ok: false, code, message, details }, { status })

const RowSchema = z.object({
  external_id: z.string().optional(),
  title: z.string().trim().min(1),
  html: z.string().trim().min(1),
  topic: z.string().optional().nullable(),
  geo_level: z.string().optional().nullable(),
  geo_code: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  priority: z.coerce.number().int().optional().nullable(),
  source_url: z.union([z.string().url(), z.literal('')]).optional().nullable(),
})

type Row = z.infer<typeof RowSchema>

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const normHtml = (s: string) => s.replace(/\s+/g, ' ').trim()
const isBlank = (s: unknown) => typeof s === 'string' ? s.trim().length === 0 : s == null

export async function POST(req: NextRequest) {
  const maybe = requireAdmin(req)
  if (maybe instanceof NextResponse) return maybe

  const body = await req.json()
  const datasetName = (body?.datasetName ?? '').toString().trim()
  const replaceMode = (body?.replaceMode ?? 'none') as 'surgical' | 'nuclear' | 'none'
  const rows: Row[] = Array.isArray(body?.rows) ? body.rows : []
  const startRow = Number.isFinite(body?.startRow) ? Number(body.startRow) : 0

  if (!datasetName) return err('CONTENT_IMPORT_BAD_REQUEST', 'datasetName required')
  if (!rows.length) return err('CONTENT_IMPORT_BAD_REQUEST', 'rows[] required')

  const supabase = supabaseAdmin

  const { data: existing } = await supabase
    .from('content_datasets')
    .select('id')
    .ilike('name', datasetName)
    .maybeSingle()

  let dataset_id = existing?.id as string | undefined
  if (!dataset_id) {
    const ins = await supabase
      .from('content_datasets')
      .insert({ name: datasetName })
      .select('id')
      .single()

    if (ins.error) {
      if ((ins.error as any).code === '23505') {
        const retry = await supabase
          .from('content_datasets')
          .select('id')
          .ilike('name', datasetName)
          .single()
        dataset_id = retry.data?.id as string | undefined
        if (!dataset_id) {
          return err('CONTENT_IMPORT_DATASET_RACE', 'Dataset race condition - retry failed', retry.error, 500)
        }
      } else {
        return err('CONTENT_IMPORT_DATASET_CREATE', `Failed to create dataset: ${ins.error.message}`, ins.error, 500)
      }
    } else {
      dataset_id = ins.data?.id as string
    }
  }

  if (!dataset_id) return err('CONTENT_IMPORT_DATASET_RESOLVE', 'Failed to resolve dataset', null, 500)

  if (replaceMode === 'nuclear' && startRow === 0) {
    const del = await supabase.from('v2_content_items_staging').delete().eq('dataset_id', dataset_id)
    if (del.error) return err('CONTENT_IMPORT_DELETE', del.error.message, del.error, 500)
  }

  const prepared: any[] = []
  const errors: { row: number; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowIndex = startRow + i + 2

    const parsed = RowSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push({ row: rowIndex, reason: parsed.error.issues.map(x => x.message).join('; ') })
      continue
    }

    const r = parsed.data
    const subject = r.title.trim()
    const bodyHtml = normHtml(r.html)

    const start_date = !isBlank(r.start_date) ? r.start_date : null
    const end_date = !isBlank(r.end_date) ? r.end_date : null
    const topic = !isBlank(r.topic) ? r.topic : null
    const geo_level = !isBlank(r.geo_level) ? r.geo_level : null
    const geo_code = !isBlank(r.geo_code) ? r.geo_code : null
    const priority = r.priority ?? null
    const source_url = !isBlank(r.source_url) ? (r.source_url as string) : null

    const content_hash = sha256(`${subject}\\u0001${bodyHtml}\\u0001${geo_code ?? ''}`)

    const row_uid = !isBlank(r.external_id)
      ? (r.external_id as string).trim()
      : sha256(`${dataset_id}\\u0001${subject}\\u0001${bodyHtml}\\u0001${geo_code ?? ''}`)

    const ocd_scope = (geo_level && geo_code) ? `${geo_level}:${geo_code}` : null

    prepared.push({
      dataset_id,
      row_uid,
      subject,
      body_md: bodyHtml,
      ocd_scope,
      metadata: {
        topic,
        start_date,
        end_date,
        priority,
        source_url,
        geo_level,
        geo_code,
        content_hash,
      },
    })
  }

  if (replaceMode === 'surgical' && prepared.length) {
    const ids = prepared.map(p => p.row_uid)
    const del = await supabase
      .from('v2_content_items_staging')
      .delete()
      .eq('dataset_id', dataset_id)
      .in('row_uid', ids)
    if (del.error) return err('CONTENT_IMPORT_DELETE', del.error.message, del.error, 500)
  }

  if (prepared.length) {
    const up = await supabase
      .from('v2_content_items_staging')
      .upsert(prepared, { onConflict: 'dataset_id,row_uid' })
    if (up.error) {
      errors.push({ row: startRow + 1, reason: `upsert error: ${up.error.message}` })
    }
  }

  return ok('CONTENT_IMPORT_OK', {
    dataset_id,
    inserted_or_updated: prepared.length,
    skipped: errors.length,
    errors,
  })
}
