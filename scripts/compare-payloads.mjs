/**
 * Compare Make.com payload vs our successful test payload
 * to identify what's different
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

if (!SENDGRID_API_KEY) {
  console.error('❌ Missing SENDGRID_API_KEY');
  process.exit(1);
}

// This is the EXACT payload from Make.com that's failing
const makecomPayload = {
  "personalizations": [
    { "to": [ { "email": "kevinjmireles@yahoo.com" } ] }
  ],
  "from": {
    "email": "fido@myrepresentatives.com",
    "name": "Your Friend Fido"
  },
  "subject": "Government Shutdown Impact",
  "content": [
    {
      "type": "text/plain",
      "value": "The current government shutdown is impacting working families who are struggling to get by. Even worse, the cuts to Obamacare will send millions of families into the poor house, as they have to choose between health insurance and rent or food. Reach out to Your current congressional delegation: If you can't email right now, you can delegate this action ."
    },
    {
      "type": "text/html",
      "value": "<p>The current government shutdown is impacting working families who are struggling to get by. Even worse, the cuts to Obamacare will send millions of families into the poor house, as they have to choose between health insurance and rent or food.</p><p>Reach out to Your current congressional delegation:</p><p>If you can't email right now, you can <a href=\"https://yff-gpq8edryf-kevinjmireles-projects.vercel.app/delegate?job_id=38070227-e4d3-482c-91ab-bed9e6aa0828&batch_id=e7aa3f6a-00fa-4f37-803c-3dd64ebe5b72&email=kevinjmireles%40yahoo.com\" target=\"_blank\" rel=\"noopener noreferrer\">delegate this action</a>.</p>"
    }
  ]
};

console.log('🧪 Testing EXACT Make.com payload that failed...\n');

const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(makecomPayload)
});

console.log('Status:', res.status, res.statusText);

if (!res.ok) {
  const error = await res.text();
  console.log('❌ Error:', error);
  console.log('\n🔍 Analyzing payload...\n');

  // Check for potential issues
  const html = makecomPayload.content[1].value;
  const text = makecomPayload.content[0].value;

  console.log('HTML length:', html.length);
  console.log('Text length:', text.length);
  console.log('HTML starts with:', html.substring(0, 50));
  console.log('HTML ends with:', html.substring(html.length - 50));
  console.log('Text starts with:', text.substring(0, 50));
  console.log('Text ends with:', text.substring(text.length - 50));

  // Check for invalid characters
  console.log('\nChecking for issues:');
  console.log('- Contains null bytes:', html.includes('\0') || text.includes('\0'));
  console.log('- HTML has unmatched tags:', !html.match(/<p>/g) || html.match(/<p>/g).length !== html.match(/<\/p>/g).length);

} else {
  console.log('✅ Success! The payload works fine.');
  console.log('\n🤔 This means the issue is NOT in the payload content.');
  console.log('The problem must be in how Make.com is sending it.');
}
