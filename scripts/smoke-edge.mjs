#!/usr/bin/env node

// Purpose: Smoke test script for Next.js API proxies to Edge Functions.
// Called by: Developers to verify integration before deployment.
// Usage: node scripts/smoke-edge.mjs

const BASE_URL = 'http://localhost:3000';

async function testEndpoint(endpoint, payload, description) {
  console.log(`\n🧪 Testing ${description}...`);
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ ${description}: Success (${response.status})`);
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`❌ ${description}: Failed (${response.status})`);
      console.log(`   Error:`, data);
    }
    
    return response.ok;
  } catch (error) {
    console.log(`❌ ${description}: Network error`);
    console.log(`   Error:`, error.message);
    return false;
  }
}

async function runSmokeTests() {
  console.log('🚀 Starting Edge Function Integration Smoke Tests\n');
  
  const tests = [
    {
      endpoint: '/api/profile-address',
      payload: { email: 'test@example.com', address: '123 Main St, City, State 12345' },
      description: 'Profile Address API'
    },
    {
      endpoint: '/api/subscriptions-toggle',
      payload: { email: 'test@example.com', action: 'unsubscribe' },
      description: 'Subscriptions Toggle API'
    },
    {
      endpoint: '/api/unsubscribe',
      payload: { token: 'test-token-123', list_key: 'general' },
      description: 'Unsubscribe API'
    }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const success = await testEndpoint(test.endpoint, test.payload, test.description);
    if (success) passed++;
  }
  
  console.log(`\n📊 Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Edge Function integration is working.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the logs above for details.');
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSmokeTests().catch(console.error);
}
