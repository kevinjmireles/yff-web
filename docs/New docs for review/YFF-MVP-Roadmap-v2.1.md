# Your Friend Fido — MVP Roadmap (v2.1)
**Date:** 2025-09-22  
**Owner:** Kevin J. Mireles  
**Editors:** Architect (GPT‑5 Thinking), Reviewer, Implementer (Cursor)

---

## 1) Purpose & Scope
This document is the single source of truth for what remains to launch the **YFF MVP**. It focuses on:
- A smallest‑first implementation plan you can run in Cursor.
- Eliminating **Edge Functions** and **EDGE_SHARED_SECRET** in favor of **Next.js API routes**.
- Locking down **Supabase security** (RLS, policies, no `SECURITY DEFINER` views).
- Getting to **first real sends** with deduplication, test sends, and dataset lifecycle.

---

## 2) Guiding Principles
1. **Simplicity beats cleverness.** Choose the most maintainable option every time.
2. **Domain‑Driven Slices.** Keep features small and independently testable.
3. **Test‑Driven Development.** Each task comes with a Done Definition and tests.
4. **Monolith first.** Next.js App Router + Supabase + Make.com for integration; no microservices.
5. **Security by default.** Server‑only secrets, RLS‑first Postgres, principle of least privilege.

---

## 3) Current State (Grounded)
- **Works:** `/admin/send` page; dataset promote; audience targeting; preview run; v2 schema.
- **APIs:** `/api/send/start`, `/api/send/run`, `/api/admin/content/promote`.
- **Gaps:** Admin auth, production delivery wiring (Make → SendGrid), dedup + test sends, dataset replace, token rendering tests, signup polish + privacy.
- **Security Finding:** Supabase linter flagged a **`SECURITY DEFINER`** view: `public.v_subscriber_geo`. We must remediate.

---

## 4) MVP Objectives
1. Send a **real campaign** end‑to‑end (CSV → dataset → targeting → MAKE → SendGrid → delivered).
2. Prevent duplicates and support **test sends**.
3. Harden **signup** (address enrichment) and **admin auth**.
4. Eliminate **Edge Functions/EDGE_SHARED_SECRET**.
5. Ship **Supabase security** hardening: RLS, policies, no `SECURITY DEFINER` views, secrets locked to server.  

---

## 5) Architecture Decisions (MVP)
### 5.1 Eliminate Edge Functions & EDGE_SHARED_SECRET
- **Move all server logic** to **Next.js API routes** (`/app/api/**/route.ts`) running **Node** (not edge runtimes).
- **Do not** call Supabase with service‑role on the client; restrict to API routes.
- **Remove** `EDGE_SHARED_SECRET` usage. Replace with:
  - **Internal API auth** using a single `INTERNAL_API_TOKEN` (random UUID) **validated in API routes only** via `Authorization: Bearer ...` header (if needed for server‑to‑server).
  - Prefer **session‑based** auth (Supabase Auth) for admin UI.
- **Delete/Archive** unused Edge Functions and their env vars.

**Minimum changes:**
- Set all API routes to `export const runtime = 'nodejs'` (App Router) to avoid edge runtime.
- Centralize Supabase client creation in `lib/server/supabaseAdmin.ts` (service role) and `lib/server/supabase.ts` (user session). **Never export service key to client**.

**Removal checklist:**
- [ ] Identify Edge Functions in repo and Supabase dashboard.
- [ ] Inline or port logic into `/app/api/...` routes.
- [ ] Remove `EDGE_SHARED_SECRET` from Vercel/Supabase envs.
- [ ] Delete function code + references; update docs.
- [ ] Add smoke tests for each replaced route.

### 5.2 Supabase Security Hardening
- **RLS:** Must be **enabled** on all user‑reachable tables.
- **Policies:** Create minimal **allow‑listed** policies per role (anonymous, authenticated, admin). Prefer **`auth.uid()`** comparisons.
- **No `SECURITY DEFINER` views.** Replace `public.v_subscriber_geo` with one of:
  - **Security Invoker View** (default) reading only RLS‑protected base tables; or
  - **Materialized view** refreshed via a scheduled job, exposed via **secure RPC** that applies auth checks; or
  - **Server‑only query** executed in API route (simplest).
- **Secrets:** Keep **service role** and **provider keys** only in server env (Vercel). Never ship to browser.
- **RPC:** If used, **wrap** with RLS inside the function; prefer plain table access if simpler.

**Security checklist:**
- [ ] Confirm RLS **ON** for: `profiles`, `subscriptions`, `content_items`, `content_datasets`, `delivery_history`, `send_jobs`, `provider_events`.
- [ ] Add/select policies that cover: read‑own, write‑own, admin elevate via role claim.
- [ ] Remove/replace `SECURITY DEFINER` view(s).
- [ ] Validate no API returns sensitive PII without auth.
- [ ] Add security smoke tests (unauthenticated/other‑user cannot access).

---

## 6) Implementation Plan (Smallest Testable Chunks)

### Phase A — Access & Security (Day 1–2)
**A1. Admin Auth (Supabase Auth)**
- Create `/admin/login` with email link or password auth.
- Protect `/admin/**` using a server component that checks `getUser()`.
- Add `is_admin` boolean in `profiles` (or JWT claim) and gate UI/actions.

**Done:** Non‑admin users receive 403 on `/admin/**`. Admin can reach `/admin/send`.

**Tests:**
- Unit: auth guard returns 403 when no session.
- E2E: non‑admin cannot access `/admin/send`.

**A2. Remove Edge Functions & Secrets**
- Port any remaining logic into API routes.
- Delete `EDGE_SHARED_SECRET` from environments.
- Replace any server‑to‑server with `INTERNAL_API_TOKEN` (if still needed).

**Done:** No Edge Functions deployed. No code references to `EDGE_SHARED_SECRET`.

**Tests:** API smoke tests still pass; linter reports **0** edge functions in use.

**A3. Supabase: RLS & View Remediation**
- Turn on RLS for missing tables.
- Replace `public.v_subscriber_geo`:
  - Option **SIMPLE**: drop the view; compute geo fields in API route `GET /api/subscriber/{id}/geo` using row‑scoped queries.
- Re‑run linter; expect **no SECURITY DEFINER** findings.

**Done:** Linter clean; RLS on; policies pass smoke tests.

---

### Phase B — Sending & Safety (Day 2–4)
**B1. Delivery Wiring (Make → SendGrid)**
- Create `/api/send/execute` to fetch next batch (e.g., 500) unsent recipients for a `send_job_id`, expand tokens, and **enqueue** to Make webhook.
- In **Make.com**:
  - Webhook receives payload `{ job_id, batch_id, recipients: [ {email, name, tokens...} ], template_id }`.
  - Map to **SendGrid** “dynamic template data” and send.
  - Post back delivery results to `/api/provider/callback` (status, provider_id, errors).

**Done:** Hitting “Run (Send All)” dispatches to SendGrid via Make and records results.

**Tests:**
- Unit: token expansion function.
- Integration: stub Make webhook; assert payload shape.
- E2E: single recipient receives email in sandbox.

**B2. Deduplication & Test Sends**
- **Dedup rule:** Before enqueue, filter recipients with `delivery_history where content_dataset_id = ? and profile_id = ? and status in ('delivered','queued')`.
- **Test mode:** Add UI control for “Test send” with a list of emails; route uses only those recipients and **does not** update global delivery history.

**Done:** Same subscriber never receives the same dataset twice. Test mode sends only to test emails.

**Tests:** Insert duplicate data; verify only one delivery is recorded/sent. Test mode doesn’t touch prod history.

**B3. Dataset Replace**
- Add admin action “Replace dataset” → marks old dataset **archived** and logically detaches it from future sends. Optionally soft‑delete rows or cascade replace with transaction.

**Done:** New dataset becomes **active**; old is excluded from targeting.

**Tests:** Ensure only active dataset IDs are considered by targeting queries.

---

### Phase C — Signup & Tokens (Day 4–5)
**C1. Signup polish**
- Confirm single source of truth = `profiles` (no `subscribers` table).
- Address → OCD enrichment in API route; store on profile row.
- Add **privacy/disclaimer** to form and `/privacy-policy` route (markdown‑driven).

**Done:** New users can sign up; profiles populated; policy visible.

**Tests:** E2E signup creates profile + ocd_ids; policy route renders.

**C2. Token Rendering**
- Add server function `renderTemplate(html, tokens)`.
- Example tokens: `[[FIRST_NAME]]`, `[[CITY]]`, `[[DELEGATION]]`, `[[UNSUBSCRIBE_URL]]`.
- Snapshot tests for template rendering.

**Done:** Preview in `/admin/send` shows rendered sample; Make payload includes `dynamic_template_data` equivalent.

**Tests:** Token replacement snapshot; HTML sanitizer keeps allowed tags only.

---

### Phase D — Observability & Rollout (Day 5–7)
**D1. Instrumentation**
- Add counters: queued, delivered, bounced, blocked, errors per job.
- Store provider events in `provider_events` with `provider_message_id`.

**D2. Operational Runbook**
- Playbook for: creating dataset, test send, full send, rollback (archive dataset), and re‑send policy.

**D3. Rollout**
- Feature flags: `FEATURE_TEST_SEND`, `FEATURE_FULL_SEND`.
- Dry‑run job with 5 users → verify metrics → expand gradually.

---

## 7) Make.com — Minimal Scenario
1. **Trigger:** Custom webhook (Secure it with a shared token parameter validated server‑side in API route).
2. **Steps:**
   - Map incoming fields → SendGrid “Send an Email (v3)” module using a **dynamic template**.
   - On success/failure, **HTTP call back** to `/api/provider/callback`.
3. **Error Handling:** Auto‑retry up to 3x; move failed recipients to a “dead letter” array and callback with `status=failed` and `error` message.

**Why Make for MVP?** It offloads rate limiting and provider retries while we validate business flows. Replace later with direct SendGrid SDK if needed.

---

## 8) Supabase Security Reference (Quick Snippets)

**Enable RLS (example):**
```sql
alter table public.profiles enable row level security;
```

**Basic policy (read own profile):**
```sql
create policy "profiles_read_own"
on public.profiles for select
using (auth.uid() = id);
```

**Admin policy via JWT claim:**
```sql
create policy "admin_all"
on public.profiles for all
using (coalesce((current_setting('request.jwt.claims', true)::jsonb)->>'role','') = 'admin');
```

**Drop SECURITY DEFINER view (example):**
```sql
drop view if exists public.v_subscriber_geo;
```

**Replace with server query (simplest):**
- Implement `/api/subscriber/[id]/geo/route.ts` that queries `profiles` + related geo tables under RLS; only admin can call for other users.

---

## 9) Acceptance Criteria (MVP Definition of Done)
- ✅ Admin‑only access to `/admin/**` (403 otherwise).
- ✅ No Edge Functions in use; `EDGE_SHARED_SECRET` removed from envs.
- ✅ Supabase linter has **no** `SECURITY DEFINER` findings.
- ✅ RLS enabled on all user‑reachable tables with passing auth tests.
- ✅ A real dataset is sent to a pilot cohort, with **zero duplicates**.
- ✅ Test‑send mode works (no production history updates).
- ✅ Provider events recorded and visible on job detail page.
- ✅ Signup flow creates `profiles` with OCD IDs; privacy is published.

---

## 10) Backlog (Post‑MVP Nice‑to‑Haves)
- Retry/Backoff orchestration in‑app (replacing Make).
- Rich audience rules UI.
- Link tracking + per‑link analytics.
- Webhooks signing + rotation.
- Per‑tenant multi‑brand theming.
- Content version diffing + approvals.

---

## 11) Task Board (Copy into Cursor)
**Labels:** `security`, `send`, `signup`, `dataset`, `tokens`, `infra`

- **A1 – Admin Auth (security)**
  - Guard `/admin/**`, add `is_admin`, tests.

- **A2 – Remove Edge Functions (infra, security)**
  - Port logic → API routes; delete secrets; tests.

- **A3 – RLS & View (security)**
  - Enable RLS, policies, drop `SECURITY DEFINER`, tests.

- **B1 – Delivery Wiring (send)**
  - `/api/send/execute`, Make webhook, callback, tests.

- **B2 – Dedup + Test Sends (send)**
  - Pre‑enqueue filter; test‑mode path; tests.

- **B3 – Dataset Replace (dataset)**
  - Archive old; activate new; queries respect `is_active`.

- **C1 – Signup Polish (signup)**
  - Profiles as SSoT; privacy; tests.

- **C2 – Token Rendering (tokens)**
  - Template engine; preview; sanitizer; tests.

- **D1 – Telemetry (infra)**
  - Counters, events, job details UI.

---

## 12) Quick Code Patterns (Node/Next.js)

**Force Node runtime for API routes**
```ts
export const runtime = 'nodejs';
```

**Server‑only Supabase clients**
```ts
// lib/server/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server only
  { auth: { persistSession: false, autoRefreshToken: false } }
);
```

**Auth guard in server component**
```ts
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export async function requireAdmin() { /* fetch user, check claim, throw 403 */ }
```

**Token rendering (pure function)**
```ts
export function renderTemplate(html: string, map: Record<string,string>) {
  return html.replace(/\[\[(.+?)\]\]/g, (_, k) => map[k] ?? '');
}
```

---

## 13) Rollback Plan
- If send errors spike: **disable FEATURE_FULL_SEND**, keep FEATURE_TEST_SEND.
- Archive problematic dataset; re‑promote after fix.
- Revert policies with migration history if needed.

---

## 14) Open Questions (Track in Issues)
- Do we need per‑tenant admin vs global admin now or later?
- Do we want to keep Make.com for first 3 campaigns before replacing?
- What’s the minimal dataset payload we standardize for templates?

---

**End of Document**
