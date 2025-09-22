/**
 * Test Setup Script for V2.1 Functionality
 * 
 * This script creates test data to validate the send functionality
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupTestData() {
  console.log('🧪 Setting up test data for V2.1 functionality...\n');

  try {
    // 1. Create a test dataset
    console.log('1. Creating test dataset...');
    const { data: dataset, error: datasetError } = await supabase
      .from('content_datasets')
      .insert({ name: 'test-v2-smoke', status: 'active' })
      .select('id')
      .single();

    if (datasetError) {
      console.error('❌ Dataset creation failed:', datasetError);
      return;
    }

    console.log('✅ Dataset created:', dataset.id);

    // 2. Create test content in staging
    console.log('2. Creating test content in staging...');
    const { error: stagingError } = await supabase
      .from('v2_content_items_staging')
      .insert([
        {
          dataset_id: dataset.id,
          row_uid: 'oh-welcome-1',
          subject: 'Hello Ohio',
          body_md: 'Welcome to Ohio! This is a test message for Ohio residents.',
          ocd_scope: '',
          metadata: { audience_rule: "state == 'OH'" }
        },
        {
          dataset_id: dataset.id,
          row_uid: 'cbus-note-1',
          subject: 'Columbus update',
          body_md: 'Short update for Columbus residents. Local news here.',
          ocd_scope: 'place:columbus,oh',
          metadata: {}
        }
      ]);

    if (stagingError) {
      console.error('❌ Staging content creation failed:', stagingError);
      return;
    }

    console.log('✅ Staging content created');

    // 3. Create a test user
    console.log('3. Creating test user...');
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .insert({
        email: 'test+ohio@example.com',
        address: '123 Main St, Columbus, OH 43201',
        zipcode: '43201',
        ocd_ids: ['ocd-division/country:us/state:oh/place:columbus']
      })
      .select('user_id')
      .single();

    if (userError) {
      console.error('❌ User creation failed:', userError);
      return;
    }

    console.log('✅ Test user created:', user.user_id);

    // 4. Add geo metrics for the user
    console.log('4. Adding geo metrics...');
    const { error: geoError } = await supabase
      .from('geo_metrics')
      .insert([
        {
          user_id: user.user_id,
          metric_key: 'state',
          metric_value: 'OH',
          source: 'manual-test'
        },
        {
          user_id: user.user_id,
          metric_key: 'place',
          metric_value: 'columbus,oh',
          source: 'manual-test'
        }
      ]);

    if (geoError) {
      console.error('❌ Geo metrics creation failed:', geoError);
      return;
    }

    console.log('✅ Geo metrics added');

    // 5. Promote the content
    console.log('5. Promoting content...');
    const { error: promoteError } = await supabase.rpc('promote_dataset_v2', {
      p_dataset: dataset.id
    });

    if (promoteError) {
      console.error('❌ Content promotion failed:', promoteError);
      return;
    }

    console.log('✅ Content promoted');

    console.log('\n🎉 Test data setup complete!');
    console.log('\n📋 Test Information:');
    console.log(`Dataset ID: ${dataset.id}`);
    console.log(`User ID: ${user.user_id}`);
    console.log(`User Email: test+ohio@example.com`);
    console.log('\n🌐 Next Steps:');
    console.log('1. Go to http://localhost:3000/admin/send');
    console.log(`2. Enter dataset ID: ${dataset.id}`);
    console.log('3. Click "Create Job"');
    console.log('4. Click "Run (Preview Only)"');
    console.log('5. Check the results!');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupTestData();
