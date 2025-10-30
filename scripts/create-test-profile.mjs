/**
 * Create test profile for gahanna@myrepresentatives.com
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const civicApiKey = process.env.CIVIC_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

const email = 'gahanna@myrepresentatives.com';
const address = '123 Main St, Gahanna, OH 43230';

console.log(`📝 Creating profile for ${email}...`);
console.log(`   Address: ${address}\n`);

// Step 1: Get OCD IDs from Civic API
let ocdIds = [];
let zipcode = '43230';

if (civicApiKey) {
  console.log('🔍 Calling Google Civic API...');

  const url = new URL('https://www.googleapis.com/civicinfo/v2/divisionsByAddress');
  url.searchParams.set('address', address);
  url.searchParams.set('key', civicApiKey);

  try {
    const res = await fetch(url.toString());
    if (res.ok) {
      const civic = await res.json();
      const divisions = civic?.divisions ?? {};
      ocdIds = Object.keys(divisions);
      zipcode = civic?.normalizedInput?.zip ?? zipcode;
      console.log(`✅ Got ${ocdIds.length} OCD IDs`);
    } else {
      console.log(`⚠️  Civic API failed: ${res.status}`);
    }
  } catch (err) {
    console.error('⚠️  Civic API error:', err.message);
  }
} else {
  console.log('⚠️  CIVIC_API_KEY not set, using fallback OCD IDs');
  // Fallback OCD IDs for Gahanna, OH
  ocdIds = [
    'ocd-division/country:us',
    'ocd-division/country:us/state:oh',
    'ocd-division/country:us/state:oh/county:franklin',
    'ocd-division/country:us/state:oh/place:gahanna'
  ];
}

console.log('\n📊 OCD IDs:', ocdIds);

// Step 2: Create profile
console.log('\n💾 Creating profile...');

const nowIso = new Date().toISOString();

const { data: profRow, error: profErr } = await sb
  .from('profiles')
  .upsert(
    {
      email,
      address,
      zipcode,
      ocd_ids: ocdIds,
      ocd_last_verified_at: nowIso,
      created_at: nowIso,
    },
    { onConflict: 'email' }
  )
  .select('user_id')
  .single();

if (profErr) {
  console.error('❌ Profile creation failed:', profErr);
  process.exit(1);
}

console.log(`✅ Profile created! User ID: ${profRow.user_id}`);

// Step 3: Create subscription
console.log('\n📬 Creating subscription...');

const { error: subErr } = await sb
  .from('subscriptions')
  .upsert(
    {
      user_id: profRow.user_id,
      list_key: 'general',
      unsubscribed_at: null,
      created_at: nowIso,
    },
    { onConflict: 'user_id,list_key' }
  );

if (subErr) {
  console.error('❌ Subscription creation failed:', subErr);
} else {
  console.log('✅ Subscription created!');
}

// Step 4: Create geo_metrics
console.log('\n🌍 Creating geo_metrics...');

// Extract metrics from OCD IDs
const metrics = [];
for (const id of ocdIds) {
  const s = id.toLowerCase();

  const mState = s.match(/\/state:([a-z]{2})(\\/|$)/);
  if (mState && !metrics.find(m => m.metric_key === 'state')) {
    metrics.push({ metric_key: 'state', metric_value: mState[1].toUpperCase() });
  }

  const mCountyFips = s.match(/\/county_fips:(\\d{5})(\\/|$)/);
  if (mCountyFips && !metrics.find(m => m.metric_key === 'county_fips')) {
    metrics.push({ metric_key: 'county_fips', metric_value: mCountyFips[1] });
  }

  const mPlace = s.match(/\/place:([a-z0-9_\\-]+)(\\/|$)/);
  if (mPlace && !metrics.find(m => m.metric_key === 'place')) {
    const state = metrics.find(m => m.metric_key === 'state')?.metric_value || 'OH';
    metrics.push({ metric_key: 'place', metric_value: `${mPlace[1]},${state}` });
  }
}

if (metrics.length > 0) {
  // Delete existing
  await sb
    .from('geo_metrics')
    .delete()
    .eq('user_id', profRow.user_id)
    .in('metric_key', ['state', 'county_fips', 'place']);

  // Insert new
  const { error: geoErr } = await sb
    .from('geo_metrics')
    .insert(metrics.map(m => ({
      user_id: profRow.user_id,
      metric_key: m.metric_key,
      metric_value: m.metric_value,
      source: 'manual'
    })));

  if (geoErr) {
    console.error('❌ Geo metrics creation failed:', geoErr);
  } else {
    console.log(`✅ Created ${metrics.length} geo metrics:`, metrics);
  }
}

console.log('\n🎉 Done! Profile ready for testing.');
