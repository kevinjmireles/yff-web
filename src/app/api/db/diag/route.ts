import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const GET = async () => {
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const job = crypto.randomUUID()
  const batch = crypto.randomUUID()
  const pmid = `diag-${crypto.randomUUID()}`
  const email = `diag+${pmid}@example.com`

  // Attempt an upsert that relies on onConflict: 'provider_message_id'
  const { error: upsertErr } = await sb
    .from('delivery_history')
    .upsert(
      [{ job_id: job, batch_id: batch, email, status: 'queued', provider_message_id: pmid }],
      { onConflict: 'provider_message_id' }
    )

  // Best-effort cleanup (even if upsertErr exists)
  await sb.from('delivery_history').delete().eq('provider_message_id', pmid)

  const lacksUniqueIndex = !!(upsertErr && /no unique or exclusion constraint/i.test(upsertErr.message))
  const hasProviderMsgIdUnique = !lacksUniqueIndex

  return NextResponse.json({
    supabaseUrl_fingerprint: url.replace(/^https?:\/\//, '').slice(-16),
    has_provider_message_id_unique: hasProviderMsgIdUnique,
    upsert_error: upsertErr?.message ?? null,
  })
}
