// tests/rls/profiles.anon.test.mjs
import { createClient } from '@supabase/supabase-js'

// Load environment variables
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, anon)

console.log('\n🧪 RLS QA: profiles.anon.test.mjs')
console.log('→ Expect anon user to receive no rows ([])')

try {
  const { data, error } = await supabase.from('profiles').select('*').limit(3)
  if (error) throw error

  if (Array.isArray(data) && data.length === 0) {
    console.log('✅ PASS – RLS blocked anon access as expected.')
  } else {
    console.error('❌ FAIL – Anon user received data:', data)
    process.exitCode = 1
  }
} catch (err) {
  console.error('❌ FAIL – Query threw an error:', err.message)
  process.exitCode = 1
}
