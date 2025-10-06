# Release Notes — Send Loop Auth + Execute Refresh

## Code Changes
- Middleware (`middleware.ts`) now sets `X-Request-Id`/`Cache-Control: no-store` on protected routes and accepts `Authorization`/`X-Admin-Token` Bearer credentials in addition to the admin cookie.
- `src/lib/auth.ts` hardens `requireAdmin` with safe header access, Bearer token support, and consistent 401 errors via `jsonErrorWithId`.
- Rebuilt `POST /api/send/execute` (`src/app/api/send/execute/route.ts`):
  - Accepts both legacy (`test_emails[]` or `dataset_id`) and modern (`mode: 'test' | 'cohort'`) payloads.
  - Rejects empty test email arrays, normalizes addresses, generates `batch_id`, enforces `MAX_SEND_PER_RUN`, and dedupes against existing `delivery_history` records.
  - Dispatches to Make.com with propagated request-id and a 5s timeout.
- Provider callback (`src/app/api/provider/callback/route.ts`) supports batch or single payloads, requires `X-Shared-Token`, and guarantees idempotency through provider-message upserts or update/insert fallback when no provider ID is present.
- Unsubscribe API (`src/app/api/unsubscribe/route.ts`) remains API-only with HMAC validation; helper (`src/lib/unsubscribe.ts`) now falls back to `http://localhost:3000` for tests/dev while still erroring when `BASE_URL` is unset in production.
- Added Vitest setup (`vitest.setup.ts`) to seed `BASE_URL`, `ADMIN_API_TOKEN`, and `MAKE_SHARED_TOKEN`; smoke tests are skipped unless `E2E=1`, and unit tests dynamically import the unsubscribe helpers for deterministic env state.

## Documentation & Structure
- Moved `ENVIRONMENT_SETUP.md` into `docs/guides/` and expanded it to list `ADMIN_API_TOKEN`, `MAKE_SHARED_TOKEN`, and `BASE_URL` requirements.
- Created `docs/specs/send_execute_endpoint.md` detailing both modern and legacy request bodies, response fields, and error codes for `/api/send/execute`.
- Flattened review artifacts into `docs/review/`, splitting Send Loop and Small Fixes packets with filename prefixes (e.g., `SEND-LOOP-IMPLEMENTATION.md`, `SMALL-FIXES-PR-REVIEW.md`) and removed the obsolete `docs/review 2/` directory.
- Archived redundant top-level docs (`AGENTS.md`, etc.) in favor of `docs/meta/CLAUDE.md` and cleaned up review handoff duplicates; added `docs/review/SMALL-FIXES-*` and `docs/review/SEND-LOOP-*` handoff/test summaries for future reference.

## Testing
- `pnpm vitest run --reporter=verbose` — all suites pass (smoke suite skipped without `E2E=1`).
- Provides curl-based smokes for execute/cohort/callback flows in the handoff packet.

## Environment Checklist
- Set locally/in Vercel:
  - `ADMIN_API_TOKEN`
  - `MAKE_SHARED_TOKEN`
  - `MAKE_WEBHOOK_URL`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Optional: `MAX_SEND_PER_RUN`, `SENDGRID_TEMPLATE_ID`, `BASE_URL`

## Deploy Steps
1. Apply new migrations (`20251001_delivery_history.sql`, `20251001_provider_events.sql`, `20251001_unsubscribes.sql`).
2. Update env vars in Vercel and `.env.local` with the new admin token settings.
3. Deploy, then run the provided curl smokes (execute test/cohort and provider callback) plus `/api/health`.
