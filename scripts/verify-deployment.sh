#!/bin/bash

# Verification script for production deployment
# Run after deploying the authentication fixes

HOST="https://yff-qrdnutwzl-kevinjmireles-projects.vercel.app"

echo "=== DEPLOYMENT VERIFICATION ==="
echo "Testing: $HOST"
echo

echo "# /admin/login (should NOT show x-nextjs-prerender)"
curl -I "$HOST/admin/login" | egrep -i "HTTP/|x-nextjs-prerender|x-vercel-cache|cache-control|x-commit"

echo
echo "# /api/admin/login (should be JSON 200/4xx, but never 307)"
curl -I "$HOST/api/admin/login" | egrep -i "HTTP/|location|content-type|x-nextjs-prerender|cache-control"

echo
echo "# /api/health (should be 200 JSON, never 307)"
curl -I "$HOST/api/health" | egrep -i "HTTP/|location|content-type|x-nextjs-prerender|cache-control"

echo
echo "# Test login API with invalid password (should return JSON 400/401, not 307)"
curl -s -X POST "$HOST/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"wrongpassword"}' | jq .

echo
echo "=== EXPECTED RESULTS ==="
echo "✓ /admin/login: No x-nextjs-prerender: 1"
echo "✓ /api/admin/login: JSON response, no 307 redirects"
echo "✓ /api/health: JSON 200, no 307 redirects"
echo "✓ Login API: JSON error response, not redirect"
echo "✓ X-Commit header: Shows deployed commit SHA"
