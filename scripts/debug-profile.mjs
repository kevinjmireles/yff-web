/**
 * Debug profile lookup and personalization
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

// Test 1: Check if Gahanna profile exists
console.log('🔍 Test 1: Looking for Gahanna profile...\n');

const { data: profiles, error: profileErr } = await sb
  .from('profiles')
  .select('user_id, email, address, ocd_ids')
  .or('email.eq.gahanna@myrepresentatives.com,email.eq.Gahanna@myrepresentatives.com');

if (profileErr) {
  console.error('Error:', profileErr);
} else {
  console.log('Found profiles:', profiles);
  if (profiles.length === 0) {
    console.log('❌ No profile found for gahanna@myrepresentatives.com');
  } else {
    console.log('✅ Profile exists');
    console.log('   Email:', profiles[0].email);
    console.log('   User ID:', profiles[0].user_id);
    console.log('   OCD IDs:', profiles[0].ocd_ids);
  }
}

console.log('\n---\n');

// Test 2: Check personalize API for kevinjmireles
console.log('🔍 Test 2: Testing personalize API for kevinjmireles@yahoo.com...\n');

const testUrl = 'https://yff-web.vercel.app/api/send/personalize?' + new URLSearchParams({
  email: 'kevinjmireles@yahoo.com',
  dataset_id: '68519a17-b164-462f-9370-671e50417882',
  job_id: crypto.randomUUID(),
  batch_id: crypto.randomUUID()
});

const res = await fetch(testUrl);
const data = await res.json();

console.log('Status:', res.status);
console.log('Response:', JSON.stringify(data, null, 2));

if (data.ok && data.html) {
  console.log('\n📧 Email preview:');
  console.log('Subject:', data.subject);
  console.log('HTML length:', data.html.length);
  console.log('HTML snippet:', data.html.substring(0, 200) + '...');

  // Check for personalization
  console.log('\n🎯 Personalization check:');
  console.log('Contains delegation link:', data.html.includes('delegate?'));
  console.log('Contains job_id:', data.html.includes(data.job_id));
  console.log('Contains email:', data.html.includes('kevinjmireles'));
}

console.log('\n---\n');

// Test 3: Check what content is in the dataset
console.log('🔍 Test 3: Checking content in dataset 68519a17-b164-462f-9370-671e50417882...\n');

const { data: content, error: contentErr } = await sb
  .from('v2_content_items_staging')
  .select('subject, body_html, body_md, ocd_scope, metadata')
  .eq('dataset_id', '68519a17-b164-462f-9370-671e50417882')
  .order('created_at', { ascending: false });

if (contentErr) {
  console.error('Error:', contentErr);
} else {
  console.log(`Found ${content.length} content items:`);
  content.forEach((item, i) => {
    console.log(`\n--- Item ${i + 1} ---`);
    console.log('Subject:', item.subject);
    console.log('OCD Scope:', item.ocd_scope);
    console.log('Body HTML:', item.body_html ? `${item.body_html.length} chars` : 'null');
    console.log('Body MD:', item.body_md ? `${item.body_md.substring(0, 100)}...` : 'null');
    console.log('Metadata:', item.metadata);
  });
}
