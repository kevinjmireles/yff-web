#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://localhost:3000}"

echo "== UI without cookie: /admin/send =="
curl -s -I "$BASE/admin/send" | egrep -i "HTTP/|location" || true

echo "\n== API invalid login =="
curl -s -i -X POST "$BASE/api/admin/login" -H 'content-type: application/json' --data '{"password":"wrong"}' | egrep -i "HTTP/|content-type|x-login-handler" || true



