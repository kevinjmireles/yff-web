/**
 * Fix malformed HTML in v2_content_items_staging
 *
 * Problem: body_md contains HTML but with orphaned closing tags
 * Solution: Move HTML content to body_html and ensure proper structure
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

const datasetId = '348fbb81-5b3a-48c6-b1c9-2e12804bc4be';

console.log('🔧 Fixing HTML content in dataset:', datasetId);

// Get all content items
const { data: items, error: fetchErr } = await sb
  .from('v2_content_items_staging')
  .select('*')
  .eq('dataset_id', datasetId);

if (fetchErr) {
  console.error('❌ Fetch error:', fetchErr);
  process.exit(1);
}

console.log(`\n📊 Found ${items.length} items to process\n`);

for (const item of items) {
  console.log(`Processing: ${item.subject}`);

  // If body_md contains HTML tags, move to body_html
  if (item.body_md && item.body_md.includes('<')) {
    console.log('  - Converting body_md HTML to body_html');

    const { error: updateErr } = await sb
      .from('v2_content_items_staging')
      .update({
        body_html: item.body_md,
        body_md: null
      })
      .eq('id', item.id);

    if (updateErr) {
      console.error('  ❌ Update error:', updateErr);
    } else {
      console.log('  ✅ Fixed');
    }
  } else {
    console.log('  - No HTML detected, skipping');
  }
}

console.log('\n✅ Done!');
