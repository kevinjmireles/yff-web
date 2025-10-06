import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const GET = async () => {
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // list indexes on delivery_history
  const { data: idxData, error: idxErr } = await sb
    .from('pg_indexes' as any)
    .select('indexname')
    .eq('schemaname', 'public')
    .eq('tablename', 'delivery_history')

  // show a short fingerprint of which project we’re hitting
  const fingerprint = url?.replace(/^https?:\/\//, '').slice(-16)

  return NextResponse.json({
    supabaseUrl_fingerprint: fingerprint, // last chars only
    has_provider_message_id_unique: (idxData || []).some((i: any) => i.indexname === 'ux_delivery_history_provider_message_id'),
    indexes: (idxData || []).map((i: any) => i.indexname),
    error: (idxErr as any)?.message || null
  })
}
