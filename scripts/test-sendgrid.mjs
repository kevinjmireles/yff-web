/**
 * Test SendGrid API with actual personalized content
 *
 * This script:
 * 1. Calls personalize API to get HTML + text
 * 2. Sends to SendGrid with BOTH content types
 * 3. Reports success or detailed error
 *
 * Usage:
 *   SENDGRID_API_KEY='your-key' node scripts/test-sendgrid.mjs
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const PERSONALIZE_API_URL = 'https://yff-web.vercel.app/api/send/personalize';

if (!SENDGRID_API_KEY) {
  console.error('❌ Missing SENDGRID_API_KEY environment variable');
  console.error('Usage: SENDGRID_API_KEY="your-key" node scripts/test-sendgrid.mjs');
  process.exit(1);
}

// Step 1: Get personalized content
console.log('📞 Calling personalize API...\n');

const jobId = crypto.randomUUID();
const batchId = crypto.randomUUID();
const email = 'kevinjmireles@yahoo.com';
const datasetId = '348fbb81-5b3a-48c6-b1c9-2e12804bc4be';

const personalizeUrl = `${PERSONALIZE_API_URL}?email=${email}&dataset_id=${datasetId}&job_id=${jobId}&batch_id=${batchId}`;

const personalizeRes = await fetch(personalizeUrl);
const personalizeData = await personalizeRes.json();

if (!personalizeData.ok) {
  console.error('❌ Personalize API error:', personalizeData);
  process.exit(1);
}

console.log('✅ Personalize API response:');
console.log('   Subject:', personalizeData.subject);
console.log('   HTML length:', personalizeData.html.length, 'chars');
console.log('   Text length:', personalizeData.text.length, 'chars');
console.log('');

// Step 2: Test SendGrid with HTML only (current approach)
console.log('🧪 Test 1: SendGrid with HTML only (current approach)...\n');

const payload1 = {
  personalizations: [
    { to: [{ email }] }
  ],
  from: {
    email: 'fido@myrepresentatives.com',
    name: 'Your Friend Fido'
  },
  subject: `[Test HTML Only] ${personalizeData.subject}`,
  content: [
    { type: 'text/html', value: personalizeData.html }
  ]
};

const res1 = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload1)
});

console.log('   Status:', res1.status, res1.statusText);
if (!res1.ok) {
  const error1 = await res1.text();
  console.log('   ❌ Error:', error1);
} else {
  console.log('   ✅ Success!');
}
console.log('');

// Step 3: Test SendGrid with BOTH HTML and text (recommended approach)
console.log('🧪 Test 2: SendGrid with BOTH HTML and plain text...\n');

const payload2 = {
  personalizations: [
    { to: [{ email }] }
  ],
  from: {
    email: 'fido@myrepresentatives.com',
    name: 'Your Friend Fido'
  },
  subject: `[Test HTML + Text] ${personalizeData.subject}`,
  content: [
    { type: 'text/plain', value: personalizeData.text },
    { type: 'text/html', value: personalizeData.html }
  ]
};

const res2 = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload2)
});

console.log('   Status:', res2.status, res2.statusText);
if (!res2.ok) {
  const error2 = await res2.text();
  console.log('   ❌ Error:', error2);
} else {
  console.log('   ✅ Success!');
}
console.log('');

// Summary
console.log('📊 Summary:');
console.log('   Test 1 (HTML only):', res1.ok ? '✅ PASSED' : '❌ FAILED');
console.log('   Test 2 (HTML + text):', res2.ok ? '✅ PASSED' : '❌ FAILED');
console.log('');

if (res1.ok && res2.ok) {
  console.log('✅ Both tests passed! The issue is elsewhere.');
} else if (!res1.ok && res2.ok) {
  console.log('🎯 FOUND IT! SendGrid requires BOTH plain text and HTML.');
  console.log('   → Update Make.com to include text field in SendGrid payload');
} else if (res1.ok && !res2.ok) {
  console.log('⚠️  Unexpected: HTML only works, but HTML+text fails');
} else {
  console.log('❌ Both tests failed. The issue is not about text vs HTML.');
  console.log('   → Check sender verification, content policy, or other SendGrid settings');
}
