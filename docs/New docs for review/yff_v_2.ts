// =============================
// FILE 1/4: supabase/migrations/20251010_content_import_mvp.sql
// Idempotent migration to support CSV content import MVP
// CORRECTED VERSION - addresses schema drift and case-insensitive uniqueness
// =============================

-- 1) content_datasets
CREATE TABLE IF NOT EXISTS public.content_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- case-insensitive uniqueness on dataset name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='content_datasets_name_lower'
  ) THEN
    CREATE UNIQUE INDEX content_datasets_name_lower ON public.content_datasets (LOWER(name));
  END IF;
END$$;

-- 2) content_items
CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.content_datasets(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL,
  html text NOT NULL,
  topic text,
  geo_level text,
  geo_code text,
  start_date date,
  end_date date,
  priority int,
  source_url text,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- upsert key within dataset
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_content_item_dataset_external'
  ) THEN
    CREATE UNIQUE INDEX uniq_content_item_dataset_external
      ON public.content_items(dataset_id, external_id);
  END IF;
END$$;

-- optional advisory index for hash lookups/warnings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_content_items_content_hash'
  ) THEN
    CREATE INDEX idx_content_items_content_hash ON public.content_items(content_hash);
  END IF;
END$$;

-- trigger to update updated_at on row change
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='trg_content_items_updated_at'
  ) THEN
    CREATE TRIGGER trg_content_items_updated_at
    BEFORE UPDATE ON public.content_items
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END$$;

-- 3) unsubscribes table (matches existing schema)
-- CORRECTED: Now includes list_key, user_agent, ip to match /api/unsubscribe/route.ts
CREATE TABLE IF NOT EXISTS public.unsubscribes (
  email text PRIMARY KEY,
  list_key text NOT NULL DEFAULT 'general',
  unsubscribed_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip text
);

-- RLS left to existing project conventions (keep consistent)


-- =============================
// FILE 2/4: src/app/api/content/import/route.ts
// Next.js App Router API handler for CSV chunk imports
// CORRECTED VERSION - eliminates SQL injection, fixes auth signature, respects case-insensitive dataset names
// =============================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Minimal server helpers — adapt to your project imports
import { requireAdmin } from '@/lib/auth' // must throw on failure

const RowSchema = z.object({
  external_id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  html: z.string().trim().min(1),
  topic: z.string().trim().optional().nullable(),
  geo_level: z.string().trim().optional().nullable(),
  geo_code: z.string().trim().optional().nullable(),
  start_date: z.string().trim().optional().nullable(),
  end_date: z.string().trim().optional().nullable(),
  priority: z.coerce.number().int().optional().nullable(),
  source_url: z.string().url().optional().nullable(),
})

type Row = z.infer<typeof RowSchema>

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function normalizeHtml(html: string) {
  return html.replace(/\s+/g, ' ').trim()
}

export async function POST(req: NextRequest) {
  // CORRECTED: Pass req to requireAdmin (it throws on failure)
  requireAdmin(req)

  const body = await req.json()
  // Expected body shape from client chunk uploader
  // { datasetName: string, replaceMode?: 'surgical'|'nuclear'|'none', rows: Row[], startRow: number }

  const datasetName = (body?.datasetName ?? '').toString().trim()
  const replaceMode = (body?.replaceMode ?? 'none') as 'surgical'|'nuclear'|'none'
  const rows: Row[] = Array.isArray(body?.rows) ? body.rows : []
  const startRow = Number.isFinite(body?.startRow) ? Number(body.startRow) : 0

  if (!datasetName) {
    return NextResponse.json({ error: 'datasetName required' }, { status: 400 })
  }
  if (!rows.length) {
    return NextResponse.json({ error: 'rows[] required' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1) CORRECTED: Case-insensitive dataset lookup respecting LOWER(name) unique index
  const { data: existing } = await supabase
    .from('content_datasets')
    .select('id')
    .ilike('name', datasetName)
    .maybeSingle()

  let dataset_id = existing?.id as string | undefined

  if (!dataset_id) {
    const { data: ds, error } = await supabase
      .from('content_datasets')
      .insert({ name: datasetName })
      .select('id')
      .single()
    if (error) {
      return NextResponse.json({ error: `Failed to create dataset: ${error.message}` }, { status: 500 })
    }
    dataset_id = ds?.id as string
  }

  if (!dataset_id) {
    return NextResponse.json({ error: 'Failed to resolve dataset' }, { status: 500 })
  }

  // 2) CORRECTED: Replace handling using query builder (no SQL injection)
  // Nuclear delete: remove all items in dataset on first chunk
  if (replaceMode === 'nuclear' && startRow === 0) {
    await supabase
      .from('content_items')
      .delete()
      .eq('dataset_id', dataset_id)
  }

  // Validate + prepare rows
  const prepared: any[] = []
  const errors: { row: number; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowIndex = startRow + i + 2 // +2 accounts for CSV header and 0-index

    const parse = RowSchema.safeParse(raw)
    if (!parse.success) {
      errors.push({ row: rowIndex, reason: parse.error.issues.map(s=>s.message).join('; ') })
      continue
    }

    const r = parse.data
    const htmlNorm = normalizeHtml(r.html)

    // CORRECTED: Proper Unicode sentinel escaping (becomes \u0001 at runtime)
    const content_hash = sha256(`${r.title}\u0001${htmlNorm}\u0001${r.geo_code ?? ''}`)

    const external_id = (r.external_id && r.external_id.trim())
      ? r.external_id.trim()
      : sha256(`${dataset_id}\u0001${r.title}\u0001${htmlNorm}\u0001${r.geo_code ?? ''}`)

    prepared.push({
      dataset_id,
      external_id,
      title: r.title,
      html: htmlNorm,
      topic: r.topic ?? null,
      geo_level: r.geo_level ?? null,
      geo_code: r.geo_code ?? null,
      start_date: r.start_date ?? null,
      end_date: r.end_date ?? null,
      priority: r.priority ?? null,
      source_url: r.source_url ?? null,
      content_hash,
    })
  }

  // CORRECTED: Surgical delete using query builder (no SQL injection)
  if (replaceMode === 'surgical' && prepared.length) {
    const externalIds = prepared.map(p => p.external_id)
    await supabase
      .from('content_items')
      .delete()
      .eq('dataset_id', dataset_id)
      .in('external_id', externalIds)
  }

  // Upsert chunk
  if (prepared.length) {
    const { error } = await supabase
      .from('content_items')
      .upsert(prepared, { onConflict: 'dataset_id,external_id' })
    if (error) {
      errors.push({ row: startRow + 1, reason: `upsert error: ${error.message}` })
    }
  }

  return NextResponse.json({
    dataset_id,
    inserted: prepared.length, // simplified — real split insert/update would need RETURN columns
    updated: 0,
    skipped: errors.length,
    errors,
  })
}


// =============================
// FILE 3/4: src/app/admin/content/page.tsx
// Admin CSV upload with Papa Parse streaming + 3x parallel chunk uploads
// CORRECTED VERSION - captures dataset ID, reliable error reporting, test send integration
// =============================

'use client'

import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'

const CHUNK_SIZE = 500
const CONCURRENCY = 3

type ImportResp = {
  dataset_id: string
  inserted: number
  updated: number
  skipped: number
  errors: { row: number; reason: string }[]
}

export default function AdminContentPage() {
  const [datasetName, setDatasetName] = useState('')
  const [replaceMode, setReplaceMode] = useState<'none'|'surgical'|'nuclear'>('surgical')
  const [progress, setProgress] = useState({ total: 0, done: 0 })
  const [results, setResults] = useState<ImportResp[]>([])
  const [reportCsvUrl, setReportCsvUrl] = useState<string | null>(null)
  // CORRECTED: Track dataset ID from first chunk response
  const [datasetId, setDatasetId] = useState<string | null>(null)
  const allRowsRef = useRef<any[]>([])

  // CORRECTED: Move error report generation to useEffect for reliability
  useEffect(() => {
    if (progress.total > 0 && progress.done === progress.total) {
      const allErrors = results.flatMap(r => r.errors).sort((a, b) => a.row - b.row)
      if (allErrors.length) {
        const csv = Papa.unparse(allErrors)
        const blob = new Blob([csv], { type: 'text/csv' })
        setReportCsvUrl(URL.createObjectURL(blob))
      }
    }
  }, [progress, results])

  const handleFile = (file: File) => {
    allRowsRef.current = []
    setProgress({ total: 0, done: 0 })
    setResults([])
    setReportCsvUrl(null)
    setDatasetId(null) // Reset on new upload

    Papa.parse(file, {
      header: true,
      worker: true,
      skipEmptyLines: true,
      step: (row, parser) => {
        allRowsRef.current.push(row.data)
        if (allRowsRef.current.length % 1000 === 0) {
          // yield back to keep UI responsive
        }
      },
      complete: () => {
        const total = allRowsRef.current.length
        setProgress({ total, done: 0 })
        void uploadInChunks()
      },
      error: (err) => {
        alert(`CSV parse error: ${err.message}`)
      },
    })
  }

  async function uploadChunk(rows: any[], startRow: number) {
    const res = await fetch('/api/content/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetName, replaceMode, rows, startRow }),
    })
    if (!res.ok) throw new Error(await res.text())
    const json: ImportResp = await res.json()
    return json
  }

  async function uploadInChunks() {
    const rows = allRowsRef.current
    const total = rows.length
    const chunks: { start: number; end: number }[] = []
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, total) })
    }

    let done = 0
    const next = async (): Promise<void> => {
      const c = chunks.shift()
      if (!c) return
      try {
        const resp = await uploadChunk(rows.slice(c.start, c.end), c.start)
        // CORRECTED: Capture dataset_id from first response
        setResults(prev => {
          if (!datasetId) setDatasetId(resp.dataset_id)
          return [...prev, resp]
        })
      } finally {
        done += (c.end - c.start)
        setProgress({ total, done })
        await next()
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => next()))
  }

  // CORRECTED: Test send now passes dataset_id and uses existing admin cookie auth
  async function sendTestToMe() {
    if (!datasetId) {
      alert('No dataset loaded yet')
      return
    }
    const res = await fetch('/api/send/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: datasetId, mode: 'test' })
    })
    if (res.ok) {
      alert('Test send triggered! Check your email and delivery_history.')
    } else {
      alert(`Failed: ${await res.text()}`)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Content Import</h1>

      {/* CORRECTED: Add CSV template download link */}
      <p className="text-sm mb-4">
        <a href="/yff-content-template.csv" download className="underline">
          Download CSV template
        </a>
      </p>

      <label className="block mb-2 text-sm">Dataset name</label>
      <input className="border rounded p-2 w-full mb-4" value={datasetName} onChange={e=>setDatasetName(e.target.value)} placeholder="e.g., October 2025 – Civic Updates" />

      <label className="block mb-2 text-sm">Replace mode</label>
      <select className="border rounded p-2 w-full mb-4" value={replaceMode} onChange={e=>setReplaceMode(e.target.value as any)}>
        <option value="surgical">Surgical (only rows present in CSV)</option>
        <option value="nuclear">Nuclear (delete all rows in dataset then load)</option>
        <option value="none">None (pure upsert)</option>
      </select>

      <input type="file" accept=".csv" onChange={e=>e.target.files && handleFile(e.target.files[0])} className="mb-4" />

      <div className="h-2 bg-gray-200 rounded overflow-hidden mb-2">
        <div className="h-full bg-gray-600" style={{ width: progress.total ? `${Math.round(progress.done/progress.total*100)}%` : '0%' }} />
      </div>
      <div className="text-sm mb-4">{progress.done} / {progress.total} rows</div>

      {/* CORRECTED: Show import completion summary */}
      {datasetId && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          <h2 className="font-semibold">Import Complete</h2>
          <p className="text-sm">Dataset ID: <code>{datasetId}</code></p>
          <p className="text-sm">Total rows: {progress.total}</p>
          <p className="text-sm">Errors: {results.flatMap(r => r.errors).length}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button className="border rounded px-4 py-2" onClick={sendTestToMe}>Send test to me</button>
        {reportCsvUrl && <a className="underline" href={reportCsvUrl} download="import-errors.csv">Download error report</a>}
      </div>
    </div>
  )
}


// =============================
// FILE 4/4: public/yff-content-template.csv
// Sample CSV template for content import
// =============================

external_id,title,html,geo_level,geo_code,topic,start_date,end_date,priority,source_url
sample-001,Community Garden Opening,"<p>Join us for the grand opening of the new community garden on <strong>Saturday, Oct 15</strong> at 10 AM.</p>",city,Boise,community,2025-10-15,2025-10-31,1,https://example.com/garden


// =============================
// EMAIL FOOTER SNIPPET
// Add to SendGrid template; wire {{unsubscribe_url}} via generateUnsubscribeUrl() from @/lib/unsubscribe
// =============================

<footer style="font-size:12px; color:#666; margin-top:40px; border-top:1px solid #ddd; padding-top:20px;">
  <p>You're receiving this because you subscribed to Your Friendly Farmer updates.</p>
  <p>
    <a href="{{unsubscribe_url}}" style="color:#0066cc;">Unsubscribe</a> |
    <a href="https://yourfriendfido.com/privacy" style="color:#0066cc;">Privacy Policy</a>
  </p>
  <p style="margin-top:10px;">
    <strong>Your Friendly Farmer</strong><br>
    9169 W. State St #606<br>
    Garden City, ID 83714
  </p>
</footer>


// =============================
// IMPLEMENTATION NOTES
// =============================

// CORRECTIONS APPLIED (Claude Code review 2025-10-10):
// 1. Migration: unsubscribes schema now matches existing /api/unsubscribe route (list_key, user_agent, ip)
// 2. API: Eliminated SQL injection by replacing exec_sql with Supabase query builder
// 3. API: Fixed requireAdmin signature to requireAdmin(req) - synchronous, throws on failure
// 4. API: Case-insensitive dataset lookup uses .ilike() to respect LOWER(name) unique index
// 5. API: Unicode sentinels properly escaped (\u0001 becomes actual Unicode char at runtime)
// 6. Frontend: Dataset ID captured from first chunk response and displayed in completion UI
// 7. Frontend: Test send now passes dataset_id to /api/send/execute
// 8. Frontend: Error report CSV generation moved to useEffect for reliability
// 9. Frontend: Added CSV template download link
// 10. Added public/yff-content-template.csv with sample row
// 11. Documented email footer HTML for SendGrid template

// Hash strategy:
// - external_id = sha256(dataset_id + title + htmlNorm + geo_code) when external_id absent (scoped per dataset)
// - content_hash = sha256(title + htmlNorm + geo_code) for warnings/analytics only (no uniqueness constraint)

// Replace behavior:
// - Surgical (default): delete only rows whose external_ids are present in current chunk
// - Nuclear: delete all items in dataset on first chunk, then insert
// - None: pure upsert

// Unsubscribe:
// - Uses existing HMAC token implementation in @/lib/unsubscribe
// - Route at /api/unsubscribe already handles validation and DB writes

// Compliance:
// - Footer includes physical address (CAN-SPAM requirement)
// - Unsubscribe link generated via generateUnsubscribeUrl(email, 'general')
