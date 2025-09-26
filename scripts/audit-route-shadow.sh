#!/usr/bin/env bash
set -euo pipefail

echo "Scanning for segments that contain both page.tsx and route.ts without GET handler..."
while IFS= read -r d; do
  if [ -f "$d/page.tsx" ] && [ -f "$d/route.ts" ]; then
    if ! grep -q "export[[:space:]]\+async[[:space:]]\+function[[:space:]]\+GET" "$d/route.ts"; then
      echo "⚠️  $d/route.ts shadows $d/page.tsx (no GET handler)"
    fi
  fi
done < <(find src/app -type d)



