// tests/tokens/delegation.smoke.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !service) {
  console.error('❌ FAIL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, service, { auth: { persistSession: false } })

const email = 'delegation-test@example.com'
const batch_id = '00000000-0000-0000-0000-000000000001'
const job_id = '00000000-0000-0000-0000-0000000000aa'

const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
const link = `${baseUrl}/delegate?job_id=${job_id}&batch_id=${batch_id}&email=${encodeURIComponent(email)}`

console.log('🧪 Testing delegation link creation and retrieval...')

// 1. Insert a delegation link
console.log('📝 Inserting delegation link...')
const { error: upsertErr } = await admin
  .from('delegation_links')
  .upsert(
    { email, url: link, batch_id, job_id },
    { onConflict: 'email,job_id', ignoreDuplicates: true }
  )

if (upsertErr) {
  console.error('❌ FAIL: Upsert error', upsertErr)
  process.exit(1)
}

// 2. Retrieve the link
console.log('🔍 Retrieving delegation link...')
const { data, error } = await admin
  .from('delegation_links')
  .select('url')
  .eq('email', email)
  .order('created_at', { ascending: false })
  .limit(1)

if (error) {
  console.error('❌ FAIL: Query error', error)
  process.exit(1)
}

if (!data?.[0]?.url) {
  console.error('❌ FAIL: No link found for email')
  process.exit(1)
}

if (data[0].url !== link) {
  console.error('❌ FAIL: URL mismatch')
  console.error('Expected:', link)
  console.error('Got:', data[0].url)
  process.exit(1)
}

console.log('✅ PASS: Delegation link inserted and retrieved successfully')
console.log('   URL:', data[0].url)

// 3. Test idempotency - insert again
console.log('🔄 Testing idempotency...')
const { error: upsert2Err } = await admin
  .from('delegation_links')
  .upsert(
    { email, url: link, batch_id, job_id },
    { onConflict: 'email,job_id', ignoreDuplicates: true }
  )

if (upsert2Err) {
  console.error('❌ FAIL: Second upsert failed', upsert2Err)
  process.exit(1)
}

console.log('✅ PASS: Idempotent upsert works correctly')

// 4. Clean up
console.log('🧹 Cleaning up test data...')
await admin
  .from('delegation_links')
  .delete()
  .eq('email', email)
  .eq('job_id', job_id)

console.log('✅ All delegation link tests passed!')
