
# YFF — 48‑Hour Launch: Cursor Prompt Backlog (v1)

**Purpose:** Small, testable prompts you can paste into Cursor. Each prompt stands alone. Run in order unless a later one is needed to debug.

---

## Prompt 1 — `/api/send/execute` (batching + dedup + enqueue)
**Goal:** Create a server route that selects the next send batch, dedupes against delivery history, and POSTs to Make webhook (or returns counts in preview).  
**Files:** `src/app/api/send/execute/route.ts`, `src/lib/server/supabaseAdmin.ts` (if not present), `src/lib/types.ts`  
**Env:** `MAX_SEND_PER_RUN`, `MAKE_WEBHOOK_URL`, `MAKE_SHARED_TOKEN`  
**Acceptance:** Returns `{selected,deduped,queued}`, never exceeds `MAX_SEND_PER_RUN`, preview mode does not write DB.

**Cursor Instruction:**

```
Implement `src/app/api/send/execute/route.ts` using Node runtime.

Requirements:
- POST body: { job_id: string; mode: 'test'|'cohort'; emails?: string[] }
- Select recipients:
  - mode 'test': use `emails` only (look up or create profiles by email).
  - mode 'cohort': select first N = parseInt(process.env.MAX_SEND_PER_RUN ?? '100') active profiles.
- Deduplicate against `delivery_history` for the same `job_id` or same dataset/content if provided. Skip already 'queued' or 'delivered'.
- Build payload:
  { job_id, batch_id: uuid, template_id: process.env.SENDGRID_TEMPLATE_ID, recipients: [{ email, first_name, unsubscribe_url, body_html }] }
- If mode='test': do not write `delivery_history` (preview-only counters).
- Else: insert `delivery_history` rows with status='queued' for recipients being enqueued.
- POST payload to process.env.MAKE_WEBHOOK_URL with header `X-Shared-Token: ${process.env.MAKE_SHARED_TOKEN}`.
- Response: { selected, deduped, queued, batch_id }

Implementation notes:
- `export const runtime = 'nodejs'`
- Use service-role Supabase client in the route only.
- Keep SQL simple and index-friendly; rely on existing v2 tables.
```
---

## Prompt 2 — `/api/provider/callback` (delivery events + history update)
**Goal:** Receive Make/SendGrid callbacks, upsert `provider_events`, update `delivery_history` from `queued` → `delivered|failed`.  
**Files:** `src/app/api/provider/callback/route.ts`  
**Acceptance:** Idempotent upserts; safe if retried; correlates by `{job_id,batch_id,email}` or `provider_message_id`.

**Cursor Instruction:**

```
Create `src/app/api/provider/callback/route.ts` (Node runtime).

- Accept POST with shape: { job_id, batch_id, results: [{ email, status: 'delivered'|'failed', provider_message_id?: string, error?: string }] }
- For each result:
  - Upsert into `provider_events` (use a deterministic key on provider_message_id or (job_id,batch_id,email,status)).
  - Update `delivery_history` where (job_id AND email AND batch_id) set status accordingly; store provider_message_id and error if present.
- Return { ok: true, updated: n }.
- Make handler idempotent: ON CONFLICT DO UPDATE.
- Basic validation + logging with requestId header.
```
---

## Prompt 3 — Admin Send UI: wire to `/api/send/execute`
**Goal:** On `/admin/send`, add controls for `mode` ('test'|'cohort') and test emails (comma-separated). Show counters from the execute endpoint.  
**Files:** `src/app/admin/send/page.tsx`, `src/app/admin/send/actions.ts`  
**Acceptance:** Run (test) → counters with no DB writes; Run (cohort) → enqueues and returns batch_id.

**Cursor Instruction:**

```
Enhance /admin/send page:
- Form fields: job_id (uuid), mode (radio), test_emails (textarea).
- On submit, call `/api/send/execute` and display response counters and batch_id.
- Add simple status panel that polls `/api/jobs/{job_id}` if available, otherwise omit.
- Keep it minimal; no styling required beyond what's present.
```
---

## Prompt 4 — DB indexes for dedupe & speed
**Goal:** Ensure dedupe and lookups are fast.  
**Files:** `supabase/migrations/<timestamp>_send_indexes.sql`  
**Acceptance:** Migration applies cleanly; re-running is idempotent.

**Cursor Instruction:**

```
Create SQL migration with:
- create unique index if not exists idx_delivery_dedupe on delivery_history (email, job_id);
- create index if not exists idx_delivery_job on delivery_history (job_id);
- (optional) create index if not exists idx_profiles_email on profiles (email);
Explain in migration comment why these are safe.
```
---

## Prompt 5 — Make.com webhook contract (doc)
**Goal:** Add a small contract doc in repo for Make mapping.  
**Files:** `docs/contracts/make_send_contract.md`  
**Acceptance:** Document shows payload, headers, and callback shape.

**Cursor Instruction:**

```
Write docs/contracts/make_send_contract.md describing:
- POST to MAKE_WEBHOOK_URL with header X-Shared-Token.
- Payload shape sent by /api/send/execute.
- Expected callback to /api/provider/callback.
Provide examples for test and cohort modes.
```
---

## Prompt 6 — Signup polish (privacy + OCD IDs)
**Goal:** Ensure /signup stores `ocd_ids` and shows privacy text + /privacy-policy route.  
**Files:** `src/app/signup/page.tsx`, `src/app/privacy-policy/page.mdx` (or .tsx), `src/app/api/profile-address/route.ts`  
**Acceptance:** E2E: submit address → profile row has email+ocd_ids; privacy link visible.

**Cursor Instruction:**

```
- Add inline privacy text to /signup and link to /privacy-policy.
- If missing, create /privacy-policy static route with simple Markdown content stub.
- Confirm /api/profile-address takes { user_id, address } and writes ocd_ids to profiles.
```
---

## Prompt 7 — Feature flags & caps
**Goal:** Safer rollout.  
**Files:** `.env.example`, `src/lib/flags.ts`  
**Acceptance:** Test mode is on by default; full send behind explicit flag.

**Cursor Instruction:**

```
Add a tiny flags helper:
export const FEATURE_TEST_SEND = process.env.FEATURE_TEST_SEND === 'on';
export const FEATURE_FULL_SEND = process.env.FEATURE_FULL_SEND === 'on';
export const MAX_SEND_PER_RUN = parseInt(process.env.MAX_SEND_PER_RUN ?? '100');

Use in /api/send/execute to guard modes and cap batch size.
Update .env.example with FEATURE_TEST_SEND=on, FEATURE_FULL_SEND=off, MAX_SEND_PER_RUN=100, MAKE_WEBHOOK_URL=, MAKE_SHARED_TOKEN=.
```
---

## Prompt 8 — (Parallel, non-blocking) Edge Functions decommission
**Goal:** One deploy surface; remove `EDGE_SHARED_SECRET`.  
**Files:** per `yff_decommission_supabase_edge_functions_migration_pack.md`  
**Acceptance:** Repo has no `supabase/functions/*`; env var removed.

**Cursor Instruction:**

```
Follow the migration pack:
- Remove supabase/functions/* folders listed.
- Add API routes replacements if not already present.
- Clean .env.example of EDGE_SHARED_SECRET.
- Commit with message "chore: decommission edge functions".
```
---

## Prompt 9 — Health & Canary
**Goal:** Quick end-to-end sanity checks.  
**Files:** `src/app/api/health/route.ts`, add headers in login endpoints  
**Acceptance:** Health returns 200 + canary headers; no-store cache control.

**Cursor Instruction:**

```
Add /api/health returning { ok: true, time: new Date().toISOString() } with headers:
- 'Cache-Control': 'no-store'
- 'X-Canary': 'health:ok'
Ensure admin login APIs also set canary headers as previously discussed.
```
---

**End of Backlog v1**
