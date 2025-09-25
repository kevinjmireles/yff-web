#!/bin/bash

# Verification script for admin login fixes
HOST="https://yff-qrdnutwzl-kevinjmireles-projects.vercel.app"

echo "=== Testing Admin Login Fixes ==="
echo

echo "# 1. /admin/login (should NOT show x-nextjs-prerender)"
curl -I "$HOST/admin/login" | egrep -i "HTTP/|x-nextjs-prerender|x-nextjs-stale-time|x-vercel-cache"

echo
echo "# 2. /admin/login2 (test page, should also NOT be prerendered)"
curl -I "$HOST/admin/login2" | egrep -i "HTTP/|x-nextjs-prerender|x-nextjs-stale-time|x-vercel-cache"

echo
echo "# 3. /api/admin/login (should be JSON, not 307)"
curl -I "$HOST/api/admin/login" | egrep -i "HTTP/|location|content-type"

echo
echo "# 4. /api/health (should be JSON 200/401, never 307)"
curl -I "$HOST/api/health" | egrep -i "HTTP/|location|content-type"

echo
echo "# 5. Test login API with valid password"
curl -s -X POST "$HOST/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' \
  -w "\nHTTP Status: %{http_code}\n" | head -5

echo
echo "# 6. Test login API with invalid password"
curl -s -X POST "$HOST/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}' \
  -w "\nHTTP Status: %{http_code}\n" | head -5

echo
echo "=== Verification Complete ==="
