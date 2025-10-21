/**
 * Backfill geo_metrics from profiles.ocd_ids
 *
 * This script populates geo_metrics table for existing users who signed up
 * before geo_metrics population was added to the signup flow.
 *
 * Usage:
 *   node scripts/backfill/backfill-geo-metrics.mjs
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL env var
 *   - SUPABASE_SERVICE_ROLE_KEY env var
 */

import { createClient } from '@supabase/supabase-js';

// Helper function - duplicated from src/lib/geo/fromOcd.ts for standalone execution
function metricRowsFromOcdIds(ocd_ids) {
  if (!Array.isArray(ocd_ids) || !ocd_ids.length) return []

  let state
  let county_fips
  let place

  for (const id of ocd_ids) {
    const s = id.toLowerCase()

    const mState = s.match(/\/state:([a-z]{2})(\/|$)/)
    if (mState) state = mState[1]

    const mCountyFips = s.match(/\/county_fips:(\d{5})(\/|$)/)
    if (mCountyFips) county_fips = mCountyFips[1]

    const mPlace = s.match(/\/place:([a-z0-9_\-]+)(\/|$)/)
    if (mPlace) place = mPlace[1]
  }

  const rows = []

  if (state) {
    rows.push({ metric_key: 'state', metric_value: state.toUpperCase() })
  }

  if (county_fips) {
    rows.push({ metric_key: 'county_fips', metric_value: county_fips })
  }

  if (place && state) {
    rows.push({ metric_key: 'place', metric_value: `${place},${state}` })
  }

  return rows
}

async function backfillGeoMetrics() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  console.log('🔄 Starting geo_metrics backfill...\n');

  // Fetch all profiles
  const { data: profiles, error: profilesError } = await sb
    .from('profiles')
    .select('user_id, email, ocd_ids');

  if (profilesError) {
    console.error('❌ Error fetching profiles:', profilesError.message);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.log('ℹ️  No profiles found to backfill');
    return;
  }

  console.log(`📊 Found ${profiles.length} profiles to process\n`);

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of profiles) {
    processed++;

    if (processed % 10 === 0) {
      console.log(`   Progress: ${processed}/${profiles.length}`);
    }

    const rows = metricRowsFromOcdIds(profile.ocd_ids);

    if (!rows.length) {
      skipped++;
      continue;
    }

    const keys = ['state', 'county_fips', 'place'];

    // Delete existing metrics to ensure canonical values
    const { error: delErr } = await sb
      .from('geo_metrics')
      .delete()
      .eq('user_id', profile.user_id)
      .in('metric_key', keys);

    if (delErr) {
      console.error(`   ⚠️  Delete failed for ${profile.email}:`, delErr.message);
      errors++;
      continue;
    }

    // Insert fresh canonical set
    const { error: insertErr } = await sb
      .from('geo_metrics')
      .insert(rows.map(r => ({
        user_id: profile.user_id,
        metric_key: r.metric_key,
        metric_value: r.metric_value,
        source: 'backfill'
      })));

    if (insertErr) {
      console.error(`   ⚠️  Insert failed for ${profile.email}:`, insertErr.message);
      errors++;
    } else {
      created += rows.length;
    }
  }

  console.log('\n✅ Backfill complete!\n');
  console.log('📊 Summary:');
  console.log(`   Total profiles: ${profiles.length}`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Metrics created: ${created}`);
  console.log(`   Skipped (no OCD IDs): ${skipped}`);
  console.log(`   Errors: ${errors}`);
}

backfillGeoMetrics().catch(err => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
