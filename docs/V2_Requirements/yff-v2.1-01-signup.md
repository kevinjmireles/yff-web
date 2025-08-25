# YFF V2.1 — Signup & Enrichment (Address → OCD IDs → Supabase)

**Goal:** Collect email + address/ZIP, resolve to **OCD IDs** using Google Civic *Divisions: `divisionsByAddress`*, and store them in Supabase so sends never call external APIs.

---

## Scope (MVP)

- One public **/signup** page (Next.js) that collects **email** and **address/ZIP** with consent.
- A small **Make.com scenario** (or Supabase Edge Function) that calls **Google Civic `divisionsByAddress`** and writes the resulting **OCD IDs** to Supabase.
- `profiles` is the single source of truth for a recipient's `ocd_ids[]`.

---

## Data Model (Supabase)

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
  user_id uuid references profiles(user_id) on delete cascade,
  list_key text not null default 'general',
  unsubscribed_at timestamptz
);

-- RLS Policies
alter table profiles enable row level security;
alter table subscriptions enable row level security;

-- Profiles: service role access only (no client exposure)
create policy "profiles_service_only" on profiles for all using (false);

-- Subscriptions: service role access only (no client exposure)  
create policy "subscriptions_service_only" on subscriptions for all using (false);

-- Indexes
create unique index if not exists idx_profiles_email_unique on profiles (email);
create unique index if not exists idx_subscriptions_unique on subscriptions (user_id, list_key);
```

**Notes**
- `profiles.ocd_ids` holds canonical **OCD IDs** as strings (e.g., `ocd-division/country:us/state:oh/place:upper_arlington`).
- `ocd_last_verified_at` lets us refresh stale data on a schedule.
- Service role (Edge/Make) bypasses RLS via service key.

---

## Google Civic — Divisions by Address

**HTTP (GET):**  
`https://www.googleapis.com/civicinfo/v2/divisionsByAddress?address=<URL_ENCODED>&key=<API_KEY>`

**Response (abridged):**
```json
{
  "normalizedInput": {"city":"Columbus","state":"OH","zip":"43221"},
  "divisions": {
    "ocd-division/country:us": {"name":"United States"},
    "ocd-division/country:us/state:oh": {"name":"Ohio"},
    "ocd-division/country:us/state:oh/county:franklin": {"name":"Franklin County"},
    "ocd-division/country:us/state:oh/cd:3": {"name":"Ohio's 3rd congressional district"},
    "ocd-division/country:us/state:oh/place:upper_arlington": {"name":"Upper Arlington"}
  }
}
```
**What to store:** the **keys** of `divisions` → array of OCD IDs.

---

## Make.com (MVP) — Signup → Enrichment

1) **Webhook trigger** from `/signup` form:
```json
{ "email": "a@b.com", "address": "123 Main St, Upper Arlington, OH 43221" }
```

2) **HTTP module** → GET `divisionsByAddress` with `address` + `API_KEY`.

3) **Map** `ocd_ids = keys($.divisions)` into an array.

4) **Supabase Upsert** into `profiles` by `email`:
```json
{ "email": "...", "address": "...", "zipcode": "43221",
  "ocd_ids": ["ocd-division/country:us", ".../state:oh", ".../place:upper_arlington"],
  "ocd_last_verified_at": "{{now}}" }
```

5) **Ensure subscription row** exists for `general` list.

---

## Next.js — /signup page (behavior spec)

- Form fields: **email**, **addressOrZip**, minimal consent checkbox.
- Zod validation; basic honeypot input.
- On submit: POST to `MAKE_SIGNUP_URL` (env var). Show success/fail message.
- No secrets in the client; only the Make URL is used.

---

## Request Validation & Error Handling

```typescript
const SignupPayload = z.object({
  email: z.string().email(),
  address: z.string().min(1),
  honeypot: z.string().max(0).optional() // Must be empty
});

// Standard error response
type ErrorResponse = {
  ok: false;
  code: 'VALIDATION_ERROR' | 'RATE_LIMITED' | 'UPSTREAM_ERROR';
  message: string;
  details?: Record<string, unknown>;
};
```

**Rate limiting:** Reject if attempts for (email or IP) ≥3 in last 10 minutes.

**Idempotency:** Upsert on email ensures safe retries.

---

## TDD — Acceptance Tests

### Core Functionality
- Valid OH address → `profiles.ocd_ids` contains `country:us`, `state:oh`, `county:franklin`, `cd:3`, `place:upper_arlington`.
- Re‑signup with same email updates the address and refreshes `ocd_ids`.
- Invalid address → error surfaced to UI; no DB write.

### Security & Rate Limiting
- Rate-limit: 4th submit in 10 minutes → 429 with error schema.
- Honeypot field must be empty or submission rejected.
- Duplicate email re-signup updates ocd_ids and leaves one subscriptions row.

### Error Handling
- Google 5xx/timeout → returns `{ok:false, code:"UPSTREAM_ERROR"}`.
- Validation failure → returns `{ok:false, code:"VALIDATION_ERROR"}` with field details.

---

## Privacy

- Store minimum PII (email, address). Mask address in logs. Honor unsubscribe flows.
- Show privacy text at signup and link to `/privacy-policy`.
