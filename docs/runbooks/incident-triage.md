### Incident Triage Runbook

Purpose: Fast, copy/paste checks to confirm service health, auth flows, and trace issues using requestId.

Prereqs
- Replace BASE with your environment URL (dev, preview, prod)
- Use a fresh shell (no cookies) for unauth checks

Health
```bash
BASE="https://yff-qrdnutwzl-kevinjmireles-projects.vercel.app" # prod
curl -s -i "$BASE/api/health" | sed -n '1,20p'
```
Expect: HTTP 200, JSON { ok:true }

Admin UI (unauth)
```bash
curl -s -i "$BASE/admin/send" | sed -n '1,20p'
```
Expect: 302/307 redirect to /admin/login. Header should include X-Request-Id.

Admin API (unauth)
```bash
curl -s -i -X POST "$BASE/api/send/start" -H 'content-type: application/json' -d '{}' | sed -n '1,60p'
```
Expect: 401 JSON { ok:false, code:"UNAUTHORIZED", message, requestId? }. Header includes X-Request-Id.

Invalid Login
```bash
curl -s -i -X POST "$BASE/api/admin/login" -H 'content-type: application/json' -d '{"password":"bad"}' | sed -n '1,60p'
```
Expect: 401 JSON { code:"INVALID_PASSWORD", message, requestId? }

Valid Login + Authenticated API
```bash
curl -s -c /tmp/c -b /tmp/c -X POST "$BASE/api/admin/login" -H 'content-type: application/json' -d '{"password":"<ADMIN_PASSWORD>"}' | sed -n '1,40p'

curl -s -i -b /tmp/c -X POST "$BASE/api/send/start" -H 'content-type: application/json' -d '{"dataset_id":"00000000-0000-0000-0000-000000000000"}' | sed -n '1,80p'
```
Expect: Non-401. If dataset is bogus, 404 JSON { code:"DATASET_NOT_FOUND", message, requestId? }

Manual requestId test
```bash
curl -s -i -X POST "$BASE/api/send/start" \
  -H 'content-type: application/json' \
  -H 'X-Request-Id: triage-123' \
  -d '{}' | sed -n '1,80p'
```
Expect: Body has requestId:"triage-123"; header may include X-Request-Id (from middleware in preview/prod).

Common Causes and Fixes
- 401 on Admin APIs (unauth): Login flow or cookie missing. Re-login, ensure yff_admin cookie present (HttpOnly, Secure, SameSite=Lax).
- 307/302 on APIs: Middleware matcher too broad. Our matcher excludes APIs; if seen, confirm production deploy is current.
- Stale page (x-nextjs-prerender: 1): Ensure admin pages are dynamic (`dynamic='force-dynamic'`, `revalidate=0`).
- 403 from Vercel: Security Checkpoint blocking scripted requests. Test via browser; allowlist IP/UA for CI.

When escalating
- Capture: endpoint, status, full headers, body, and requestId.
- Search logs by requestId in Vercel to correlate events.
- Include last merged commit (check X-Commit at "/").
