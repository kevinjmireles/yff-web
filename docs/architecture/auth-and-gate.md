## Auth and Test-Access Gate (Overview)

This note describes how admin authentication and the production-only test-access gate work together.

### Admin Authentication

- Admin session is represented by cookie `yff_admin=1` (HttpOnly, Secure, SameSite=Lax).
- `src/lib/auth.ts` exposes:
  - `isAdminCookiePresent(req)` → boolean
  - `requireAdmin(req)` → `NextResponse | null`; returns 401 JSON when not authenticated.
- Protected APIs (e.g., `src/app/api/send/*`) call `requireAdmin` at the top of handlers.

### API Conventions

- Success: `{ ok: true, ...data }`
- Error: `{ ok: false, code, message, requestId? }`
- Helpers in `src/lib/api.ts` standardize responses and may include `requestId` in non-production.

### Middleware Responsibilities

File: `middleware.ts`

- Injects `X-Request-Id` for log correlation if missing.
- Scopes protection to:
  - `'/admin/*'` (UI)
  - `'/api/admin/*'`, `'/api/send/*'` (APIs)
- Excludes login endpoints:
  - `'/admin/login'`, `'/api/admin/login'`
- Allowlists helper endpoints:
  - `'/api/test-auth'`, `'/api/echo-ip'`, `'/api/health'`
- Behavior:
  - Unauthed Admin UI → redirect to `'/admin/login'`
  - Unauthed Admin APIs → 401 JSON

### Test-Access Gate (Production only by default)

- Purpose: allow automated tests to reach protected admin routes in Production without IP allowlisting.
- Controlled by env vars:
  - `TEST_ACCESS_TOKEN` (string). If set, enables token checks when enforced.
  - `TEST_ACCESS_ENFORCE_PROD_ONLY` (default `true`). If `true`, gate only enforced in Production.
- When enforced and token is set, grant access if either is present:
  - Header: `x-test-access: <token>`
  - Cookie: `test_access=<token>` (set via `GET /api/test-auth?token=...`)

### Operational Guidance

- Leave `TEST_ACCESS_TOKEN` unset in Production for normal operation. Set only when running automated Production tests, then unset after.
- Preview/Dev remain open when `TEST_ACCESS_ENFORCE_PROD_ONLY=true`.

### Related Files

- `src/lib/auth.ts` — centralized admin auth helpers
- `src/lib/api.ts` — standardized API response helpers
- `middleware.ts` — request-id injection, gate scope, auth enforcement
- `src/app/api/test-auth/route.ts` — sets `test_access` cookie for browser tests
- `src/app/api/echo-ip/route.ts` — IP debugging


