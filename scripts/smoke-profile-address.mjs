#!/usr/bin/env node
// scripts/smoke-profile-address.mjs
// Smoke test for profile-address Edge Function

import fetch from 'node-fetch';

// Configuration
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'zeypnacddltdtedqxhix';
const EDGE_SECRET = process.env.EDGE_SHARED_SECRET;

if (!EDGE_SECRET) {
  console.error('❌ EDGE_SHARED_SECRET environment variable is required');
  console.error('Usage: EDGE_SHARED_SECRET=your_secret node scripts/smoke-profile-address.mjs');
  process.exit(1);
}

const url = `https://${PROJECT_REF}.functions.supabase.co/profile-address`;
const headers = {
  'content-type': 'application/json',
  'x-edge-secret': EDGE_SECRET,
};

// Test cases
const testCases = [
  {
    name: 'Clean Cleveland Address',
    body: { email: 'test@example.com', address: '601 Lakeside Ave E, Cleveland, OH 44114' }
  },
  {
    name: 'Address with Prefix',
    body: { email: 'test2@example.com', address: 'Address: 123 Main St, New York, NY 10001' }
  },
  {
    name: 'Minimal Address',
    body: { email: 'test3@example.com', address: '1600 Pennsylvania Avenue NW, Washington, DC 20500' }
  }
];

async function runSmokeTest() {
  console.log('🚀 Starting profile-address Edge Function smoke test...\n');
  
  for (const testCase of testCases) {
    console.log(`📋 Testing: ${testCase.name}`);
    console.log(`📍 Address: ${testCase.body.address}`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testCase.body)
      });
      
      console.log(`📊 Status: ${response.status}`);
      
      const responseText = await response.text();
      console.log(`📄 Response: ${responseText}`);
      
      if (response.ok) {
        try {
          const data = JSON.parse(responseText);
          if (data.ok && data.data) {
            console.log(`✅ Success: Found ${data.data.ocd_ids?.length || 0} OCD IDs, zipcode: ${data.data.zipcode || 'none'}`);
          } else {
            console.log(`⚠️  Response format unexpected: ${JSON.stringify(data)}`);
          }
        } catch (parseError) {
          console.log(`❌ Failed to parse response JSON: ${parseError.message}`);
        }
      } else {
        console.log(`❌ Request failed with status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`❌ Request error: ${error.message}`);
    }
    
    console.log('---\n');
  }
  
  console.log('🏁 Smoke test completed!');
}

// Run the test
runSmokeTest().catch(console.error);
