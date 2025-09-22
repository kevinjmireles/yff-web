# V2.1 Smoke Test Instructions

## Overview
This document provides step-by-step instructions for testing the V2.1 ingest and send functionality.

## Prerequisites
- Database migration applied (`20250922105547_consolidated_v2_1_schema.sql`)
- Admin UI accessible at `/admin/send`
- Test data file: `smoke-test-v2.csv`

## Test Data
The smoke test uses a 2-row CSV with:
1. **Ohio rule**: `state == 'OH'` - tests audience rule parsing
2. **Columbus scope**: `place:columbus,oh` - tests ocd_scope fallback

## Step-by-Step Testing

### 1. Prepare Test Data
1. Create a test dataset in the database:
   ```sql
   INSERT INTO content_datasets (name, status) 
   VALUES ('pilot-sept', 'active') 
   RETURNING id;
   ```
   Note the returned `dataset_id` for use in the UI.

### 2. Upload Content to Staging
1. Use the provided `smoke-test-v2.csv` file
2. Upload via Make.com or direct database insert to `v2_content_items_staging`:
   ```sql
   INSERT INTO v2_content_items_staging (dataset_id, row_uid, subject, body_md, ocd_scope, metadata)
   VALUES 
   ('<DATASET_ID>', 'oh-welcome-1', 'Hello Ohio', 'Welcome to Ohio! This is a test message for Ohio residents. [[ZIP_STATS]]', '', '{"audience_rule": "state == ''OH''"}'),
   ('<DATASET_ID>', 'cbus-note-1', 'Columbus update', 'Short update for Columbus residents. Local news here.', 'place:columbus,oh', '{}');
   ```

### 3. Promote Content
1. Go to `/admin/send`
2. Enter the `dataset_id` from step 1
3. Click "Create Job" (this will also promote the content)
4. Verify the job is created successfully

### 4. Run Preview Send
1. Click "Run (Preview Only)"
2. Verify the job completes with results showing:
   - **Inserted**: Number of preview records created
   - **Parse Errors**: Should be 0 for valid rules
   - **Fallback Used**: Should be 1 (for Columbus row)
   - **Zero Audience**: May be > 0 if no Ohio users exist
   - **Skipped**: Should be 0

### 5. Verify Results
1. Check `delivery_attempts` table:
   ```sql
   SELECT da.*, ci.subject, ci.ocd_scope, ci.metadata
   FROM delivery_attempts da
   JOIN v2_content_items ci ON ci.id = da.content_item_id
   WHERE da.send_job_id = '<JOB_ID>'
   ORDER BY da.created_at;
   ```

2. Verify audience targeting:
   - Ohio rule should match users with `geo_metrics(state='OH')`
   - Columbus scope should match users with `ocd_ids` containing `place:columbus,oh`

### 6. Test Error Handling
1. Upload content with invalid audience rules
2. Verify graceful fallback to `ocd_scope`
3. Check error counters in job totals

## Expected Results

### Success Criteria
- ✅ Content promotes from staging to final tables
- ✅ Audience rules parse correctly
- ✅ Fallback to ocd_scope works
- ✅ Preview records created in `delivery_attempts`
- ✅ Job totals accurately reflect processing
- ✅ No duplicate sends (unique constraint works)

### Troubleshooting

#### No Users Found
If `zero_audience` is high, seed test user data:
```sql
-- Create test user
INSERT INTO profiles (email, address, zipcode, ocd_ids)
VALUES ('test+oh@example.com', '123 Main St, Columbus, OH 43201', '43201', '{"ocd-division/country:us/state:oh/place:columbus"}')
ON CONFLICT (email) DO NOTHING;

-- Add geo metrics
INSERT INTO geo_metrics (user_id, metric_key, metric_value, source)
SELECT user_id, 'state', 'OH', 'manual-test'
FROM profiles WHERE email = 'test+oh@example.com'
ON CONFLICT (user_id, metric_key, metric_value) DO NOTHING;
```

#### Parse Errors
Check audience rule format:
- Valid: `state == 'OH'`
- Valid: `county_fips in ['39049','39041']`
- Invalid: `state = OH` (missing quotes)
- Invalid: `invalid_field == 'value'` (unsupported field)

## Cleanup
After testing, clean up test data:
```sql
-- Delete test delivery attempts
DELETE FROM delivery_attempts WHERE send_job_id IN (
  SELECT id FROM send_jobs WHERE dataset_id = '<DATASET_ID>'
);

-- Delete test job
DELETE FROM send_jobs WHERE dataset_id = '<DATASET_ID>';

-- Delete test content
DELETE FROM v2_content_items WHERE dataset_id = '<DATASET_ID>';
DELETE FROM v2_content_items_staging WHERE dataset_id = '<DATASET_ID>';

-- Delete test dataset
DELETE FROM content_datasets WHERE id = '<DATASET_ID>';
```
