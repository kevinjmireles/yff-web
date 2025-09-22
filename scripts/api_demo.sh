#!/usr/bin/env bash
# api_demo.sh — Quick demo for YFF MVP endpoints
# Usage:
#   BASE_URL="http://localhost:3000" TOKEN="YOUR_BEARER_TOKEN" bash api_demo.sh

set -euo pipefail

: "${BASE_URL:?Set BASE_URL}"
: "${TOKEN:?Set TOKEN}"

echo "Uploading ZIP metrics..."
curl -s -S -X POST "$BASE_URL/api/metrics/import?geo_type=zip"   -H "Authorization: Bearer $TOKEN"   -F "file=@demo_zip_metrics.csv"   -o /dev/stdout | jq . || true

echo "Uploading content rows..."
curl -s -S -X POST "$BASE_URL/api/content/import"   -H "Authorization: Bearer $TOKEN"   -F "file=@demo_content.csv"   -o /dev/stdout | jq . || true

# Optional: preview as a specific subscriber (by email) — adjust endpoint if different
echo "Preview as demo+90604@example.com..."
curl -s -S -X POST "$BASE_URL/api/send/preview"   -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json"   -d '{"email":"demo+90604@example.com","content_id":"demo-zip-001"}'   -o /dev/stdout | jq . || true

# Optional: test send (to yourself), rendering as that subscriber
echo "Send a test (render as demo+90604@example.com, deliver to TEST_TO)..."
: "${TEST_TO:=demo+90604@example.com}"
curl -s -S -X POST "$BASE_URL/api/send/test"   -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json"   -d '{"render_as":"demo+90604@example.com","to":["'${TEST_TO}'"],"content_id":"demo-zip-001"}'   -o /dev/stdout | jq . || true

echo "Done."
