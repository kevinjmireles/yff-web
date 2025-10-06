## PR Review Packet — Admin/Send Hardening

### Summary
Refactor to harden admin/send flows: idempotent send/run, standardized API errors, centralized auth, safer middleware matchers, observability via request IDs, happy-path tests, and docs/runbook updates.

### Key Changes
- Idempotency: `send/run` treats duplicate `uniq_delivery_once` inserts as success.
- API shape: `{ ok: false, code, message, requestId? }` for errors; `{ ok: true, data }` for success.
- Centralized auth: `src/lib/auth.ts` (`isAdminCookiePresent`, `requireAdmin`).
- Middleware scope: Protect only `'/admin/*'`, `'/api/admin/*'`, `'/api/send/*'`; exclude login; allowlist helpers.
- Observability: Inject `X-Request-Id` and propagate to error responses (non-prod).
- Tests: Vitest coverage for helpers, login, and middleware behavior; flaky smoke excluded.
- Docs: Incident triage runbook; auth-and-gate overview; README updates.

### Files Touched
- `src/lib/api.ts` — response helpers + docstrings
- `src/lib/auth.ts` — auth helpers + docstrings
- `middleware.ts` — header injection, gate, auth; header comment
- `src/app/api/send/start/route.ts` — requireAdmin + error shape
- `src/app/api/send/run/route.ts` — idempotent upsert + requireAdmin + error shape
- `src/app/api/test-auth/route.ts` — set `test_access` cookie
- `src/app/api/echo-ip/route.ts` — IP echo
- `README.md` — API conventions, env vars, API index, examples
- `docs/architecture/auth-and-gate.md` — overview
- CI: `.github/workflows/ci.yml` — pnpm setup; run tests (smoke excluded)

### Review Checklist
- Middleware
  - [ ] Matchers scope only admin and send APIs
  - [ ] Login endpoints excluded; helpers allowlisted
  - [ ] 401 JSON for unauth APIs; redirect for unauth UI
  - [ ] `X-Request-Id` injected
- APIs
  - [ ] `requireAdmin` at top of protected handlers
  - [ ] Error shape conforms; success shape uses `{ ok: true, data }`
  - [ ] `send/run` is idempotent on unique conflicts
- Auth
  - [ ] Cookie name `yff_admin=1`; httpOnly/secure/lax
- Tests
  - [ ] Vitest passes locally and in CI; smoke excluded
- Docs
  - [ ] README sections present; runbook updated; architecture note present

### Test Plan
```bash
pnpm install
ADMIN_PASSWORD=test pnpm build && pnpm vitest run --reporter=verbose

# Local unauth behavior
curl -i http://localhost:3000/api/send/start

# Gate header (only relevant when gate is enabled with token)
curl -i -H "x-test-access: $TEST_ACCESS_TOKEN" http://localhost:3000/api/send/start

# Cookie flow (when gate enabled)
curl -i "http://localhost:3000/api/test-auth?token=$TEST_ACCESS_TOKEN"
```

### Acceptance Criteria
- Public pages and public APIs are accessible
- Admin UI redirects to login when unauth
- Protected APIs return 401 JSON when unauth
- With gate enabled (prod-only) and valid token, protected routes succeed
- Idempotent behavior verified on duplicate `delivery_attempts`

### Rollout Notes
- Keep `TEST_ACCESS_TOKEN` unset in Production by default; set temporarily for automation only
- `TEST_ACCESS_ENFORCE_PROD_ONLY=true` by default keeps Preview/Dev open

### Risks & Mitigations
- Middleware scope regression → limited matcher and explicit exclusions
- CI flakiness → smoke tests excluded; unit tests deterministic
- Token leakage → set gate token only for short testing windows; then remove


