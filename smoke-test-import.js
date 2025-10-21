/**
 * Smoke Test for Content Import v2_content_items Alignment
 * 
 * Purpose: Validates the import functionality without requiring full test suite
 * 
 * Run with: node smoke-test-import.js
 */

const fs = require('fs');
const path = require('path');

// Test data that matches the CSV template
const testRows = [
  {
    external_id: 'smoke-test-001',
    title: 'Smoke Test Article 1',
    html: '<p>This is a smoke test article for validation</p>',
    geo_level: 'city',
    geo_code: 'Boise',
    topic: 'test',
    start_date: '2025-10-15',
    end_date: '2025-10-31',
    priority: 1,
    source_url: 'https://example.com/smoke-test'
  },
  {
    // No external_id - should auto-generate
    title: 'Smoke Test Article 2 - Auto Row UID',
    html: '<p>This article has no external_id and blank dates</p>',
    geo_level: 'state',
    geo_code: 'ID',
    topic: 'test',
    start_date: '', // blank → should become null
    end_date: '',   // blank → should become null
    priority: 2,
    source_url: ''
  }
];

// Create test CSV file
const csvContent = [
  'external_id,title,html,geo_level,geo_code,topic,start_date,end_date,priority,source_url',
  ...testRows.map(row => 
    `${row.external_id || ''},"${row.title}","${row.html}",${row.geo_level},${row.geo_code},${row.topic},${row.start_date},${row.end_date},${row.priority},${row.source_url}`
  )
].join('\n');

fs.writeFileSync('smoke-test.csv', csvContent);

console.log('✅ Created smoke-test.csv with test data');
console.log('📋 Test data includes:');
console.log('  - Row with external_id: "smoke-test-001"');
console.log('  - Row without external_id (should auto-generate row_uid)');
console.log('  - Blank dates (should become null in metadata)');
console.log('  - Different geo_level/geo_code combinations');
console.log('');
console.log('🧪 Next steps for manual testing:');
console.log('1. Start your dev server: npm run dev');
console.log('2. Navigate to: http://localhost:3000/admin/content');
console.log('3. Upload smoke-test.csv with dataset name: "Smoke Test Dataset"');
console.log('4. Check v2_content_items table for imported rows');
console.log('5. Verify field mapping: title→subject, html→body_md, geo→ocd_scope');
console.log('6. Check metadata contains: topic, dates, priority, source_url');
console.log('7. Test send functionality with imported content');
console.log('');
console.log('📊 Expected results:');
console.log('- 2 rows inserted into v2_content_items');
console.log('- subject: "Smoke Test Article 1", "Smoke Test Article 2 - Auto Row UID"');
console.log('- ocd_scope: "city:Boise", "state:ID"');
console.log('- metadata.start_date: "2025-10-15", null');
console.log('- metadata.end_date: "2025-10-31", null');
console.log('- row_uid: "smoke-test-001", auto-generated hash');
