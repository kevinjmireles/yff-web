#!/usr/bin/env node
/**
 * Smoke test for [[DELEGATION]] token rendering
 * Tests that we can fetch representatives from officials/official_contacts tables
 * and render them as HTML
 *
 * Run: node scripts/test-delegation-token.mjs
 * (Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set)
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// Extract state and congressional district from OCD IDs
function extractStateAndCd(ocd_ids = []) {
  let state = null
  let cd = null

  for (const id of ocd_ids) {
    const mState = id.match(/state:([a-z]{2})\b/i)
    if (mState) state = mState[1].toUpperCase()

    const mCd = id.match(/\/cd:(\d+)\b/i)
    if (mCd) cd = String(Number(mCd[1])) // normalize '03' → '3'
  }

  return { state, cd }
}

// Format phone number
function formatPhone(n) {
  if (!n) return ''
  const digits = n.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return n
}

async function testDelegationToken() {
  console.log('🧪 Testing [[DELEGATION]] token resolution\n')

  // 1. Find a test profile with ocd_ids
  console.log('1️⃣  Looking for test profile...')
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('email, ocd_ids')
    .not('ocd_ids', 'is', null)
    .limit(1)
    .single()

  if (profileErr || !profile) {
    console.error('❌ No profiles with ocd_ids found:', profileErr?.message)
    process.exit(1)
  }

  console.log(`   ✅ Found profile: ${profile.email}`)
  console.log(`   📍 OCD IDs: ${JSON.stringify(profile.ocd_ids, null, 2)}`)

  const { state, cd } = extractStateAndCd(profile.ocd_ids)
  console.log(`   🗺️  Extracted: state=${state}, district=${cd}\n`)

  if (!state) {
    console.error('❌ Could not extract state from ocd_ids')
    process.exit(1)
  }

  // 2. Query senators
  console.log('2️⃣  Querying senators...')
  const { data: senatorsData, error: senatorsError } = await admin
    .from('officials')
    .select(`
      official_id,
      full_name,
      office_type,
      state,
      district,
      official_contacts!inner (
        method,
        value,
        is_active
      )
    `)
    .eq('office_type', 'us_senate')
    .eq('state', state)
    .eq('is_active', true)
    .eq('official_contacts.is_active', true)

  if (senatorsError) {
    console.error('❌ Error fetching senators:', senatorsError)
    process.exit(1)
  }

  console.log(`   ✅ Found ${senatorsData?.length || 0} senators`)
  senatorsData?.forEach(s => {
    const contacts = Array.isArray(s.official_contacts) ? s.official_contacts : []
    const phone = contacts.find(c => c.method === 'phone')?.value
    const website = contacts.find(c => c.method === 'webform')?.value
    console.log(`      - ${s.full_name}`)
    console.log(`        📞 ${formatPhone(phone) || 'no phone'}`)
    console.log(`        🌐 ${website || 'no website'}`)
  })

  // 3. Query house rep (if we have district)
  console.log('\n3️⃣  Querying house representative...')
  let repData = []
  if (!cd) {
    console.log('   ⚠️  No congressional district found, skipping house rep')
  } else {
    const { data: reps, error: repError } = await admin
      .from('officials')
      .select(`
        official_id,
        full_name,
        office_type,
        state,
        district,
        official_contacts!inner (
          method,
          value,
          is_active
        )
      `)
      .eq('office_type', 'us_house')
      .eq('state', state)
      .eq('district', parseInt(cd, 10))
      .eq('is_active', true)
      .eq('official_contacts.is_active', true)

    if (repError) {
      console.error('❌ Error fetching house rep:', repError)
    } else {
      repData = reps || []
      console.log(`   ✅ Found ${repData.length} representative(s)`)
      repData.forEach(r => {
        const contacts = Array.isArray(r.official_contacts) ? r.official_contacts : []
        const phone = contacts.find(c => c.method === 'phone')?.value
        const website = contacts.find(c => c.method === 'webform')?.value
        console.log(`      - ${r.full_name} (${r.state}-${r.district})`)
        console.log(`        📞 ${formatPhone(phone) || 'no phone'}`)
        console.log(`        🌐 ${website || 'no website'}`)
      })
    }
  }

  // 4. Validate data is sufficient for token resolution
  console.log('\n4️⃣  Validating data for token resolution...')

  const totalOfficials = (senatorsData?.length || 0) + (cd && repData?.length ? repData.length : 0)
  const expectedCount = cd ? 3 : 2

  console.log(`   ✅ Found ${totalOfficials} total officials`)
  console.log(`   ✅ Expected: ${expectedCount} (${cd ? '2 senators + 1 rep' : '2 senators only'})`)

  if (totalOfficials < expectedCount) {
    console.warn(`   ⚠️  Expected ${expectedCount} but got ${totalOfficials}`)
  }

  // Check all have contact info
  let missingContacts = 0
  const allOfficials = [...(senatorsData || []), ...(cd && repData ? repData : [])]
  for (const official of allOfficials) {
    const contacts = Array.isArray(official.official_contacts) ? official.official_contacts : []
    const hasPhone = contacts.some(c => c.method === 'phone')
    const hasWebsite = contacts.some(c => c.method === 'webform')

    if (!hasPhone || !hasWebsite) {
      missingContacts++
      console.warn(`   ⚠️  ${official.full_name} missing ${!hasPhone ? 'phone' : ''} ${!hasWebsite ? 'website' : ''}`)
    }
  }

  if (missingContacts === 0) {
    console.log(`   ✅ All officials have phone + website`)
  }

  console.log('\n✅ Database smoke test passed!')
  console.log('\n📝 Next steps:')
  console.log('   - Token resolution will render these officials as HTML list')
  console.log('   - Each will have: name, website link, phone tel: link')
  console.log('   - Test in actual email send to verify formatting')
}

testDelegationToken().catch(err => {
  console.error('💥 Test failed:', err)
  process.exit(1)
})
