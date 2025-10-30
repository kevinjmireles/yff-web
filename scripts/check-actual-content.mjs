import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

// Check what dataset_id is associated with the job_id from Make.com
const jobId = '38070227-e4d3-482c-91ab-bed9e6aa0828';

const { data: job, error: jobErr } = await sb
  .from('send_jobs')
  .select('dataset_id')
  .eq('id', jobId)
  .single();

if (jobErr) {
  console.error('Job lookup error:', jobErr);
  process.exit(1);
}

console.log('Job dataset_id:', job.dataset_id);

// Now get the content for that dataset
const { data: content, error: contentErr } = await sb
  .from('v2_content_items_staging')
  .select('subject, body_html, body_md, ocd_scope, metadata')
  .eq('dataset_id', job.dataset_id)
  .order('created_at', { ascending: false });

if (contentErr) {
  console.error('Content lookup error:', contentErr);
  process.exit(1);
}

console.log('\nContent items:');
content.forEach((item, i) => {
  console.log(`\n--- Item ${i + 1} ---`);
  console.log('Subject:', item.subject);
  console.log('Body HTML:', item.body_html);
  console.log('Body MD:', item.body_md);
  console.log('OCD Scope:', item.ocd_scope);
  console.log('Metadata:', item.metadata);
});
