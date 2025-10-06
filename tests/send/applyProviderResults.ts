export type HistoryUpdate = {
  email: string
  status: 'delivered'|'failed'
  provider_message_id?: string | null
  error?: string | null
}

export function applyProviderResults(existing: Record<string, any>, job_id: string, batch_id: string, updates: HistoryUpdate[]) {
  let updated = 0
  for (const u of updates) {
    const key = `${job_id}|${batch_id}|${u.email}`
    if (!existing[key]) {
      existing[key] = { status: 'queued', provider_message_id: null, error: null }
    }
    existing[key].status = u.status
    existing[key].provider_message_id = u.provider_message_id ?? existing[key].provider_message_id
    existing[key].error = u.error ?? null
    updated++
  }
  return { updated }
}
