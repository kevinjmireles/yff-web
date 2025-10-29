// tests/rls/profiles.service.test.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !service) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, service, { auth: { persistSession: false } })

console.log('\n🧪 RLS QA: profiles.service.test.mjs')
console.log('→ Expect service role to bypass RLS and return rows')

try {
  const { data, error } = await supabase.from('profiles').select('user_id, email').limit(3)
  if (error) throw error

  if (Array.isArray(data) && data.length > 0) {
    console.log(`✅ PASS – Service role returned ${data.length} rows.`)
  } else {
    console.error('❌ FAIL – Service role returned no rows.')
    process.exitCode = 1
  }
} catch (err) {
  console.error('❌ FAIL – Query threw an error:', err.message)
  process.exitCode = 1
}
