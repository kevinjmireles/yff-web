import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

const { data, error } = await sb
  .from('v2_content_items_staging')
  .select('body_html, body_md, subject')
  .eq('dataset_id', '348fbb81-5b3a-48c6-b1c9-2e12804bc4be')
  .limit(1);

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('Content from database:');
console.log(JSON.stringify(data, null, 2));
