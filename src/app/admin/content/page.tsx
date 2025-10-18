/**
 * Admin Content Import Page
 *
 * Purpose: CSV upload interface with chunked streaming import
 *
 * Features:
 * - Papa Parse streaming (processes large CSVs without blocking UI)
 * - Chunked upload (500 rows per chunk, 3× concurrent)
 * - Case-insensitive dataset lookup
 * - Three replace modes: surgical, nuclear, none
 * - Progress tracking with visual progress bar
 * - Error reporting with downloadable CSV
 * - Test send integration with /api/send/execute
 * - Import completion summary
 *
 * Called by: Admin users via /admin/content
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'

const CHUNK_SIZE = 500
const CONCURRENCY = 3

type ImportResp = {
  dataset_id: string
  inserted_or_updated: number
  skipped: number
  errors: { row: number; reason: string }[]
}

export default function AdminContentPage() {
  const [datasetName, setDatasetName] = useState('')
  const [replaceMode, setReplaceMode] = useState<'none'|'surgical'|'nuclear'>('surgical')
  const [progress, setProgress] = useState({ total: 0, done: 0 })
  const [results, setResults] = useState<ImportResp[]>([])
  const [reportCsvUrl, setReportCsvUrl] = useState<string | null>(null)
  const [datasetId, setDatasetId] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const allRowsRef = useRef<any[]>([])

  // ✅ FIX #5: useEffect to build error CSV after all chunks complete
  useEffect(() => {
    if (progress.total > 0 && progress.done === progress.total) {
      const allErrors = results
        .flatMap(r => r.errors || [])  // Default to empty array if errors is undefined
        .filter(error => error && typeof error === 'object')  // Filter out undefined/null
        .sort((a,b)=>a.row-b.row)
      if (allErrors.length) {
        // ✅ FIX: Ensure only serializable data is passed to PapaParse
        const serializableErrors = allErrors.map(error => ({
          row: error.row || 0,
          reason: String(error.reason || 'Unknown error')
        }))
        const csv = Papa.unparse(serializableErrors)
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
    setDatasetId(null)

    Papa.parse(file, {
      header: true,
      worker: true,
      skipEmptyLines: true,
      step: (row) => {
        allRowsRef.current.push(row.data)
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
    const json = await res.json()
    return json.data as ImportResp
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
        setResults(prev => {
          // ✅ FIX #5: Capture dataset_id from first chunk response
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

  // ✅ FIX #5: Test send matches /api/send/execute contract: { mode:'test', emails:[...] }
  async function sendTestToMe() {
    if (!testEmail) {
      alert('Please enter a test email address')
      return
    }
    if (!datasetId) {
      alert('No dataset loaded yet - upload CSV first')
      return
    }

    // Split comma-separated emails and trim whitespace
    const emailArray = testEmail
      .split(',')
      .map(e => e.trim())
      .filter(e => e.length > 0)

    if (emailArray.length === 0) {
      alert('Please enter at least one valid email address')
      return
    }

    const res = await fetch('/api/send/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: crypto.randomUUID(),
        mode: 'test',
        emails: emailArray
      }),
    })

    if (res.ok) {
      const count = emailArray.length
      alert(`Test send triggered for ${count} recipient${count > 1 ? 's' : ''}! Check your email and delivery_history table.`)
    } else {
      alert(`Failed: ${await res.text()}`)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Content Import</h1>

      {/* ✅ FIX #5: Template download link */}
      <p className="text-sm mb-4">
        <a href="/yff-content-template.csv" download className="underline text-blue-600">
          Download CSV template
        </a>
      </p>

      <label className="block mb-2 text-sm font-medium">Dataset name</label>
      <input
        className="border rounded p-2 w-full mb-4"
        value={datasetName}
        onChange={e=>setDatasetName(e.target.value)}
        placeholder="e.g., October 2025 – Civic Updates"
      />

      <label className="block mb-2 text-sm font-medium">Replace mode</label>
      <select
        className="border rounded p-2 w-full mb-4"
        value={replaceMode}
        onChange={e=>setReplaceMode(e.target.value as any)}
      >
        <option value="surgical">Surgical (only rows present in CSV)</option>
        <option value="nuclear">Nuclear (delete all rows in dataset then load)</option>
        <option value="none">None (pure upsert)</option>
      </select>

      <label className="block mb-2 text-sm font-medium">Upload CSV</label>
      <input
        type="file"
        accept=".csv"
        onChange={e=>e.target.files && handleFile(e.target.files[0])}
        className="mb-4 block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded file:border-0
          file:text-sm file:font-semibold
          file:bg-blue-50 file:text-blue-700
          hover:file:bg-blue-100"
      />

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded overflow-hidden mb-2">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: progress.total ? `${Math.round(progress.done/progress.total*100)}%` : '0%' }}
        />
      </div>
      <div className="text-sm mb-4 text-gray-600">
        {progress.done} / {progress.total} rows
      </div>

      {/* ✅ FIX #5: Import completion summary */}
      {datasetId && progress.total > 0 && progress.done === progress.total && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          <h2 className="font-semibold text-green-900 mb-2">Import Complete ✓</h2>
          <p className="text-sm text-green-800">
            <strong>Dataset ID:</strong> <code className="bg-green-100 px-1 py-0.5 rounded">{datasetId}</code>
          </p>
          <p className="text-sm text-green-800">
            <strong>Total rows:</strong> {progress.total}
          </p>
          <p className="text-sm text-green-800">
            <strong>Errors:</strong> {results.flatMap(r => r.errors).length}
          </p>
          <div className="mt-3">
            <button
              className="border rounded px-3 py-2 bg-white text-green-900 hover:bg-green-100"
              onClick={async () => {
                if (!datasetId) return
                if (!confirm('Promote this dataset from staging to production?')) return
                try {
                  const res = await fetch('/api/admin/content/promote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataset_id: datasetId })
                  })
                  if (!res.ok) {
                    const text = await res.text()
                    alert(`Promotion failed: ${text}`)
                    return
                  }
                  const json = await res.json()
                  alert(`Promoted! Rows promoted: ${json.data?.promoted ?? 'n/a'}, cleared: ${json.data?.cleared ?? 'n/a'}`)
                } catch (error: any) {
                  alert(`Promotion failed: ${error?.message ?? String(error)}`)
                }
              }}
            >
              Promote to production
            </button>
          </div>
        </div>
      )}

      {/* ✅ FIX #5: Test email input field */}
      <div className="mb-4">
        <label className="block mb-2 text-sm font-medium">Test email(s) - comma separated for multiple</label>
        <input
          type="text"
          className="border rounded p-2 w-full"
          value={testEmail}
          onChange={e=>setTestEmail(e.target.value)}
          placeholder="your.email@example.com, another@example.com"
        />
      </div>

      <div className="flex gap-3">
        <button
          className="border rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={sendTestToMe}
          disabled={!datasetId || !testEmail}
        >
          Send test to me
        </button>
        {reportCsvUrl && (
          <a
            className="border rounded px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 inline-block"
            href={reportCsvUrl}
            download="import-errors.csv"
          >
            Download error report
          </a>
        )}
      </div>
    </div>
  )
}
