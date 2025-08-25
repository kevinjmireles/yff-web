# YFF V2.1 — Signup & Enrichment (Address → OCD IDs → Supabase)

**Goal:** Collect email + address/ZIP, resolve to **OCD IDs** via Google Civic *Divisions: `divisionsByAddress`*, and persist to Supabase so sends never call external APIs.

---

## ✅ Changes in v2.1 (from review)
- Added **standard error schema** + executable Zod validation.
- Added **rate limiting** & honeypot guidance.
- Fixed **data model consistency** (`profiles.user_id` + `subscriptions` FK).
- Added **RLS policies** (owner-only when exposed, service-only inserts).
- Clarified **idempotent upsert** on email (no duplicate profiles).

---

## Data model (Supabase)

```sql
create table if not exists profiles (
  user_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  address text,
  zipcode text,
  ocd_ids text[] default '{}',
  ocd_last_verified_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  list_key text not null default 'general',
  unsubscribed_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, list_key)
);

-- RLS (owner-only if ever queried from client; service key bypasses)
alter table profiles enable row level security;
alter table subscriptions enable row level security;

create policy profiles_owner_read on profiles
for select using (auth.uid() = user_id);
create policy profiles_owner_update on profiles
for update using (auth.uid() = user_id);

create policy subscriptions_owner_read on subscriptions
for select using (auth.uid() = user_id);
create policy subscriptions_owner_upsert on subscriptions
for insert with check (auth.uid() = user_id);

-- Operational access is via service role (Edge/Make), which bypasses RLS.
```

---

## API Contract (error schema)

```jsonc
// success
{ "ok": true, "data": { /* ... */ } }

// failure
{ "ok": false, "code": "VALIDATION_ERROR", "message": "Bad address", "details": { "field": "address" } }
```

---

## Next.js — /signup form (client behavior)
- Fields: **email**, **addressOrZip**, hidden **honeypot**.
- Zod validation; show server error messages verbatim (from schema above).
- On submit: POST payload → `MAKE_SIGNUP_URL` (env).

### Executable Zod (client)
```ts
import { z } from "zod";
export const SignupSchema = z.object({
  email: z.string().email(),
  address: z.string().min(5, "Enter street/city/ZIP"),
  honeypot: z.string().max(0).optional().transform(v => (v ?? "").trim())
});
```

---

## Make.com — divisionsByAddress enrichment (MVP)

**Input from form:**
```json
{ "email": "a@b.com", "address": "123 Main St, Upper Arlington, OH 43221" }
```

**Steps:**
1) **Rate limit** (router/JS): reject >3 attempts per 10 minutes per email OR IP → return `429` with error schema.
2) **Honeypot**: if non-empty → return `400 VALIDATION_ERROR`.
3) **HTTP GET** `civicinfo/v2/divisionsByAddress?address=...&key=API_KEY`.
4) **Map** `ocd_ids = Object.keys(response.divisions)`.
5) **Supabase upsert** into `profiles` by `email` (unique):
   - set `address`, `zipcode` (from normalizedInput), `ocd_ids`, `ocd_last_verified_at = now()`.
6) **Ensure** a `subscriptions` row exists for `(user_id, 'general')`.

**Retry/Errors:**
- Upstream timeout/5xx → return `{ ok: false, code: "UPSTREAM_ERROR", message: "Civic API unavailable" }`.
- Invalid/empty divisions → `{ ok: false, code: "VALIDATION_ERROR", details: { field: "address" } }`.

---

## Acceptance tests
- Valid OH address → `profiles.ocd_ids` contains `country:us`, `state:oh`, `county:franklin`, `cd:3`, `place:upper_arlington`.
- Re-signup same email updates address & `ocd_ids`; one `subscriptions` row remains.
- Honeypot non-empty → 400.
- 4th attempt in 10 minutes → 429.
- Civic 5xx → `UPSTREAM_ERROR`.
