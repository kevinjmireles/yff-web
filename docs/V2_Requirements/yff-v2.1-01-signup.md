# YFF V2.1 — Signup & Enrichment (Address → OCD IDs → Supabase)

**Goal:** Collect email + address/ZIP, resolve to **OCD IDs** using Google Civic *Divisions: `divisionsByAddress`*, and store them in Supabase so sends never call external APIs.

---

## Scope (MVP)

- One public **/signup** page (Next.js) that collects **email** and **address/ZIP** with consent.
- **Supabase Edge Function** `/profile-address` that calls **Google Civic `divisionsByAddress`** and writes the resulting **OCD IDs** to Supabase.
- **Enhanced API route** `/api/signup` that handles reCAPTCHA validation, calls Edge Function for enrichment, and writes to database.
- `profiles` is the single source of truth for a recipient's `ocd_ids[]`.

---

## Data Model (Supabase)

```sql
create table if not exists profiles (
  user_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  address text,
  zipcode text,
  ocd_ids text[] default '{}'::text[],
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
- Service role (Edge Functions) bypasses RLS via service key.
- `subscriptions` table has FK constraint to `profiles.user_id` and unique constraint on `(user_id, list_key)`.

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

## Supabase Edge Functions — Signup → Enrichment

1) **API Route** `/api/signup` receives form data:
```json
{ "email": "a@b.com", "address": "123 Main St, Upper Arlington, OH 43221", "recaptchaToken": "..." }
```

2) **reCAPTCHA validation** (if configured) using `RECAPTCHA_SECRET_KEY`.

3) **Edge Function call** `/profile-address` with authentication header:
```typescript
const { data, error } = await supabaseAdmin.functions.invoke('profile-address', {
  body: { email, address },
  headers: { 'x-edge-secret': process.env.EDGE_SHARED_SECRET! }
});
```

4) **Edge Function** calls Google Civic `divisionsByAddress` and returns:
```json
{ "ok": true, "data": { "zipcode": "43221", "ocd_ids": ["ocd-division/country:us", ".../state:oh", ".../place:upper_arlington"] } }
```

5) **Database writes** (if `profiles.user_id` exists):
   - Update `profiles` with address data and OCD IDs
   - Upsert `subscriptions` row for `general` list

---

## Next.js — /signup page (behavior spec)

- Form fields: **email**, **address** (full address), minimal consent checkbox.
- Zod validation; basic honeypot input.
- On submit: POST to `/api/signup` (internal API route). Show success/fail message.
- No secrets in the client; reCAPTCHA validation handled server-side.

---

## Request Validation & Error Handling

```typescript
const SignupPayload = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  address: z.string().min(6, 'Address seems too short'),
  recaptchaToken: z.string().nullable().optional()
});

// Standard error response
type ErrorResponse = {
  success: false;
  error: string;
};

// Success response
type SuccessResponse = {
  success: true;
  message: string;
  data: {
    districtsFound: number;
    email: string;
    zipcode: string | null;
    hasSubscription: boolean;
  };
};
```

**Rate limiting:** Reject if attempts for IP ≥5 in last 60 seconds.

**reCAPTCHA:** Optional validation if `RECAPTCHA_SECRET_KEY` is configured.

**Idempotency:** Upsert on email ensures safe retries.

---

## TDD — Acceptance Tests

### Core Functionality
- Valid OH address → `profiles.ocd_ids` contains `country:us`, `state:oh`, `county:franklin`, `cd:3`, `place:upper_arlington`.
- Re‑signup with same email updates the address and refreshes `ocd_ids`.
- Invalid address → error surfaced to UI; no DB write.
- Edge Function enrichment → returns `{success: true, data: {districtsFound: N}}`.

### Security & Rate Limiting
- Rate-limit: 6th submit in 60 seconds → 429 with error schema.
- reCAPTCHA validation → fails if token invalid (when configured).
- Edge Function authentication → requires `x-edge-secret` header.
- Duplicate email re-signup updates ocd_ids and leaves one subscriptions row.

### Error Handling
- Google 5xx/timeout → Edge Function continues without enrichment.
- Validation failure → returns `{success: false, error: "Invalid input"}`.
- reCAPTCHA failure → returns `{success: false, error: "reCAPTCHA verification failed"}`.

---

## Environment Variables

### Required (Vercel Project Settings)
- `SUPABASE_URL` - Supabase project URL (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database writes (server-side)
- `EDGE_SHARED_SECRET` - Secret for Edge Function authentication

### Optional
- `RECAPTCHA_SECRET_KEY` - reCAPTCHA validation (if not set, skips validation)
- `CIVIC_API_KEY` - Google Civic API key (for address enrichment)

### Client-Side (Next.js)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (client-side)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous key for client operations
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` - reCAPTCHA site key (client-side)

---

## Privacy

- Store minimum PII (email, address). Mask address in logs. Honor unsubscribe flows.
- Show privacy text at signup and link to `/privacy-policy`.
