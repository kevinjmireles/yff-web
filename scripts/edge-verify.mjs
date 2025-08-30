#!/usr/bin/env node

/**
 * Edge Function Authentication Verification Script
 * 
 * Purpose: Verify that Edge Function authentication works end-to-end after deployment
 * Called by: Developers and CI to validate authentication implementation
 * 
 * Tests:
 * 1. Next.js API routes (should work without client secrets)
 * 2. Direct Edge Function calls (should require x-edge-secret header)
 */

// Environment configuration
const BASE_URL = process.env.BASE_URL || 'https://yff-web.vercel.app';
const FN_BASE = process.env.FN_BASE || 'https://zeypnacddltdtedqxhix.functions.supabase.co';
const EDGE_SHARED_SECRET = process.env.EDGE_SHARED_SECRET;

console.log('🔐 Edge Function Authentication Verification');
console.log('==========================================');
console.log(`Base URL: ${BASE_URL}`);
console.log(`Function Base: ${FN_BASE}`);
console.log(`EDGE_SHARED_SECRET: ${EDGE_SHARED_SECRET ? '[SET]' : '[NOT SET]'}`);
console.log('');

// Test results tracking
const results = {
  nextjs: {},
  direct: {}
};

// Helper function to make HTTP requests and capture results
async function testEndpoint(name, url, options = {}) {
  try {
    const start = Date.now();
    const response = await fetch(url, options);
    const duration = Date.now() - start;
    
    let body = '';
    try {
      body = await response.text();
    } catch (e) {
      body = '[Could not read response body]';
    }
    
    const status = response.status;
    const bodyPreview = body.length > 200 ? body.substring(0, 200) + '...' : body;
    
    return {
      name,
      url,
      status,
      duration,
      bodyPreview,
      success: status >= 200 && status < 300
    };
  } catch (error) {
    return {
      name,
      url,
      status: 'ERROR',
      duration: 0,
      bodyPreview: `Request failed: ${error.message}`,
      success: false
    };
  }
}

// Test Next.js API routes (no secret required from client)
async function testNextJsRoutes() {
  console.log('🧪 Testing Next.js API Routes (should work without client secrets)');
  console.log('----------------------------------------------------------------');
  
  const tests = [
    {
      name: 'POST /api/profile-address',
      url: `${BASE_URL}/api/profile-address`,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'qa+verify@example.com',
          address: '123 Main St, Upper Arlington, OH 43221'
        })
      }
    },
    {
      name: 'POST /api/subscriptions-toggle',
      url: `${BASE_URL}/api/subscriptions-toggle`,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'qa+verify@example.com',
          list_key: 'general',
          action: 'subscribe'
        })
      }
    },
    {
      name: 'GET /api/unsubscribe',
      url: `${BASE_URL}/api/unsubscribe?token=fake&email=qa+verify@example.com&list_key=general`,
      options: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
    }
  ];
  
  for (const test of tests) {
    const result = await testEndpoint(test.name, test.url, test.options);
    results.nextjs[test.name] = result;
    
    const status = result.status;
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${test.name}: ${status} (${result.duration}ms)`);
    console.log(`   Body: ${result.bodyPreview}`);
    console.log('');
  }
}

// Test direct Edge Function calls (should require x-edge-secret header)
async function testDirectEdgeFunctions() {
  if (!EDGE_SHARED_SECRET) {
    console.log('⏭️  Skipping direct Edge Function tests: EDGE_SHARED_SECRET not set');
    console.log('');
    return;
  }
  
  console.log('🔒 Testing Direct Edge Function Calls (should require x-edge-secret header)');
  console.log('------------------------------------------------------------------------');
  
  const tests = [
    {
      name: 'POST /profile-address (no header)',
      url: `${FN_BASE}/profile-address`,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'qa+verify@example.com',
          address: '123 Main St, Upper Arlington, OH 43221'
        })
      }
    },
    {
      name: 'POST /profile-address (with header)',
      url: `${FN_BASE}/profile-address`,
      options: {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-edge-secret': EDGE_SHARED_SECRET
        },
        body: JSON.stringify({
          email: 'qa+verify@example.com',
          address: '123 Main St, Upper Arlington, OH 43221'
        })
      }
    },
    {
      name: 'POST /subscriptions-toggle (no header)',
      url: `${FN_BASE}/subscriptions-toggle`,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'qa+verify@example.com',
          list_key: 'general',
          action: 'subscribe'
        })
      }
    },
    {
      name: 'POST /subscriptions-toggle (with header)',
      url: `${FN_BASE}/subscriptions-toggle`,
      options: {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-edge-secret': EDGE_SHARED_SECRET
        },
        body: JSON.stringify({
          email: 'qa+verify@example.com',
          list_key: 'general',
          action: 'subscribe'
        })
      }
    },
    {
      name: 'GET /unsubscribe (no header)',
      url: `${FN_BASE}/unsubscribe?token=fake&email=qa+verify@example.com&list_key=general`,
      options: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
    },
    {
      name: 'GET /unsubscribe (with header)',
      url: `${FN_BASE}/unsubscribe?token=fake&email=qa+verify@example.com&list_key=general`,
      options: {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'x-edge-secret': EDGE_SHARED_SECRET
        }
      }
    }
  ];
  
  for (const test of tests) {
    const result = await testEndpoint(test.name, test.url, test.options);
    results.direct[test.name] = result;
    
    const status = result.status;
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${test.name}: ${status} (${result.duration}ms)`);
    console.log(`   Body: ${result.bodyPreview}`);
    console.log('');
  }
}

// Generate summary report
function generateSummary() {
  console.log('📊 Test Summary');
  console.log('===============');
  
  // Next.js API routes summary
  console.log('\n🌐 Next.js API Routes:');
  const nextjsResults = Object.values(results.nextjs);
  const nextjsPass = nextjsResults.filter(r => r.success).length;
  const nextjsTotal = nextjsResults.length;
  console.log(`   ${nextjsPass}/${nextjsTotal} endpoints working`);
  
  // Direct Edge Function summary
  if (EDGE_SHARED_SECRET) {
    console.log('\n🔒 Direct Edge Functions:');
    const directResults = Object.values(results.direct);
    const directPass = directResults.filter(r => r.success).length;
    const directTotal = directResults.length;
    console.log(`   ${directPass}/${directTotal} endpoints working`);
    
    // Check authentication behavior
    const noHeaderTests = directResults.filter(r => r.name.includes('(no header)'));
    const withHeaderTests = directResults.filter(r => r.name.includes('(with header)'));
    
    const noHeader401 = noHeaderTests.filter(r => r.status === 401).length;
    const withHeaderSuccess = withHeaderTests.filter(r => r.success).length;
    
    console.log(`   Authentication: ${noHeader401}/${noHeaderTests.length} no-header requests properly rejected (401)`);
    console.log(`   Authentication: ${withHeaderSuccess}/${withHeaderTests.length} with-header requests succeeded`);
  } else {
    console.log('\n⏭️  Direct Edge Functions: Skipped (EDGE_SHARED_SECRET not set)');
  }
  
  // Overall assessment
  console.log('\n🎯 Overall Assessment:');
  const allResults = [...Object.values(results.nextjs), ...Object.values(results.direct)];
  const totalPass = allResults.filter(r => r.success).length;
  const totalTests = allResults.length;
  
  if (totalPass === totalTests) {
    console.log('   ✅ ALL TESTS PASSED - Edge Function authentication working correctly!');
  } else {
    console.log(`   ⚠️  ${totalPass}/${totalTests} tests passed - Some issues detected`);
    
    // Identify specific failures
    const failures = allResults.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('\n   🔍 Failed Tests:');
      failures.forEach(f => {
        console.log(`      ❌ ${f.name}: ${f.status} - ${f.bodyPreview}`);
      });
    }
  }
}

// Main execution
async function main() {
  try {
    await testNextJsRoutes();
    await testDirectEdgeFunctions();
    generateSummary();
    
    // Exit with appropriate code
    const allResults = [...Object.values(results.nextjs), ...Object.values(results.direct)];
    const allPassed = allResults.every(r => r.success);
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Verification script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
