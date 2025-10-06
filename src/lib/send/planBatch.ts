export type Recipient = { email: string; first_name?: string | null }
export type HistoryRow = { email: string; dataset_id?: string | null; job_id?: string | null; status: 'queued'|'delivered'|'failed' }
export type PlanInput = {
  mode: 'test'|'cohort',
  requested: Recipient[],
  maxPerRun: number,
  dataset_id?: string | null,
  existing: HistoryRow[]
}
export type PlanResult = {
  selected: number,
  deduped: number,
  queued: number,
  toEnqueue: Recipient[]
}
export function planBatch(input: PlanInput): PlanResult {
  const { requested, maxPerRun, dataset_id, existing } = input
  const cap = Math.max(1, Math.floor(maxPerRun || 100))
  const trimmed = requested.slice(0, cap)
  const sentKey = new Set<string>()
  for (const row of existing) {
    const key = (dataset_id ? `${dataset_id}|${row.email}` : `${row.job_id ?? ''}|${row.email}`)
    if (row.status === 'queued' || row.status === 'delivered') sentKey.add(key)
  }
  const toEnqueue: Recipient[] = []
  for (const r of trimmed) {
    const key = (dataset_id ? `${dataset_id}|${r.email}` : `job|${r.email}`)
    if (!sentKey.has(key)) toEnqueue.push(r)
  }
  return { selected: trimmed.length, deduped: trimmed.length - toEnqueue.length, queued: toEnqueue.length, toEnqueue }
}
