/**
 * Create test profile for kevinjmireles@yahoo.com
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestProfile() {
  const email = 'kevinjmireles@yahoo.com';

  console.log(`🔍 Checking for profile: ${email}\n`);

  // Check if profile exists
  const { data: existing, error: checkError } = await supabase
    .from('profiles')
    .select('user_id, email, ocd_ids')
    .eq('email', email)
    .maybeSingle();

  if (checkError) {
    console.error('❌ Error checking profile:', checkError.message);
    process.exit(1);
  }

  if (existing) {
    console.log('✅ Profile already exists:');
    console.log('   User ID:', existing.user_id);
    console.log('   Email:', existing.email);
    console.log('   OCD IDs:', existing.ocd_ids || 'None');

    // Check if geo metrics exist
    const { data: geo, error: geoError } = await supabase
      .from('v_subscriber_geo')
      .select('state, county_fips, place')
      .eq('user_id', existing.user_id)
      .maybeSingle();

    if (geo) {
      console.log('\n✅ Geo metrics found:');
      console.log('   State:', geo.state || 'None');
      console.log('   County:', geo.county_fips || 'None');
      console.log('   Place:', geo.place || 'None');
    } else {
      console.log('\n⚠️  No geo metrics found. Creating Columbus, OH geo data...');

      // Create geo metrics
      const { error: geoInsertError } = await supabase
        .from('geo_metrics')
        .insert([
          {
            user_id: existing.user_id,
            metric_key: 'state',
            metric_value: 'OH',
            source: 'manual'
          },
          {
            user_id: existing.user_id,
            metric_key: 'county_fips',
            metric_value: '39049',
            source: 'manual'
          },
          {
            user_id: existing.user_id,
            metric_key: 'place',
            metric_value: 'columbus',
            source: 'manual'
          }
        ]);

      if (geoInsertError) {
        console.error('❌ Error creating geo metrics:', geoInsertError.message);
      } else {
        console.log('✅ Geo metrics created for Columbus, OH');
      }
    }

    // Update OCD IDs if missing
    if (!existing.ocd_ids || existing.ocd_ids.length === 0) {
      console.log('\n⚠️  No OCD IDs found. Adding Columbus, OH OCD IDs...');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          ocd_ids: [
            'ocd-division/country:us/state:oh',
            'ocd-division/country:us/state:oh/place:columbus',
            'ocd-division/country:us/state_fips:39/county_fips:39049'
          ]
        })
        .eq('user_id', existing.user_id);

      if (updateError) {
        console.error('❌ Error updating OCD IDs:', updateError.message);
      } else {
        console.log('✅ OCD IDs updated');
      }
    }

    console.log('\n🎉 Profile is ready for testing!');
    return;
  }

  // Create new profile
  console.log('📝 Creating new profile...');

  const { data: newProfile, error: createError } = await supabase
    .from('profiles')
    .insert({
      email: email,
      address: '123 Test St, Columbus, OH 43201',
      zipcode: '43201',
      ocd_ids: [
        'ocd-division/country:us/state:oh',
        'ocd-division/country:us/state:oh/place:columbus',
        'ocd-division/country:us/state_fips:39/county_fips:39049'
      ]
    })
    .select('user_id')
    .single();

  if (createError) {
    console.error('❌ Error creating profile:', createError.message);
    process.exit(1);
  }

  console.log('✅ Profile created:', newProfile.user_id);

  // Create geo metrics
  console.log('📍 Creating geo metrics...');

  const { error: geoError } = await supabase
    .from('geo_metrics')
    .insert([
      {
        user_id: newProfile.user_id,
        metric_key: 'state',
        metric_value: 'OH',
        source: 'manual'
      },
      {
        user_id: newProfile.user_id,
        metric_key: 'county_fips',
        metric_value: '39049',
        source: 'manual'
      },
      {
        user_id: newProfile.user_id,
        metric_key: 'place',
        metric_value: 'columbus',
        source: 'manual'
      }
    ]);

  if (geoError) {
    console.error('❌ Error creating geo metrics:', geoError.message);
  } else {
    console.log('✅ Geo metrics created');
  }

  console.log('\n🎉 Profile setup complete!');
  console.log('\nYou can now test the personalize API with:');
  console.log(`   Email: ${email}`);
  console.log(`   Location: Columbus, OH`);
}

createTestProfile();
