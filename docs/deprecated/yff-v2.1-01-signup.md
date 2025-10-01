# YFF V2.1 — Signup & Enrichment (API Route-First)

**Goal:** Collect email + address/ZIP, resolve to **OCD IDs** using Google Civic's `divisionsByAddress` API, and store them directly in Supabase. This entire flow is handled by a single, robust Next.js API route.

---

## Scope (Current Implementation)

- One public `/signup` page (Next.js) that collects **email** and **address/ZIP** with consent.
- A single, consolidated **API route** (`/api/signup`) that performs all backend logic:
  - Validates user input and reCAPTCHA tokens.
  - Calls the **Google Civic `divisionsByAddress` API** directly for address enrichment.
  - Creates or updates the user profile in the `profiles` table using an `upsert` operation.
  - Ensures a default subscription exists in the `subscriptions` table.
- The `profiles` table is the single source of truth for a recipient's `ocd_ids[]`.
- The Supabase Edge Function `/profile-address` is **DEPRECATED** for this flow and is no longer called.

---

## Data Model (Supabase)

The data model remains unchanged.

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
- The API route uses the **Supabase Admin Client** (with the service role key) to bypass RLS for writes.

---

## Signup & Enrichment Flow (Consolidated)

The process has been simplified to remove the need for an intermediate Edge Function.

1.  **API Route `/api/signup`** receives form data from the client:
    ```json
    { "email": "a@b.com", "address": "123 Main St, Columbus, OH 43221", "recaptchaToken": "..." }
    ```

2.  **Server-Side Validation**:
    - The API route validates the input against a Zod schema.
    - It verifies the reCAPTCHA token with Google's API (if `RECAPTCHA_SECRET_KEY` is configured).
    - It enforces rate limiting.

3.  **Direct Google Civic API Call**:
    - The API route directly calls the Google Civic `divisionsByAddress` endpoint with the user's address and the `CIVIC_API_KEY`.
    - It parses the response to extract the array of OCD ID strings from the `divisions` object keys.

4.  **Database Write (Upsert)**:
    - The API route connects to Supabase using the Admin client.
    - It performs an **`upsert`** on the `profiles` table, matching on the unique `email` field. This single operation either creates a new profile or updates an existing one with the new address and OCD IDs.
    - It then performs another `upsert` on the `subscriptions` table to ensure the user has a default, active subscription.

This consolidated approach is simpler, faster, and easier to maintain and debug.

---

## Next.js — /signup page (behavior spec)

- Form fields: **email**, **address** (full address), minimal consent checkbox.
- Zod validation; basic honeypot input.
- On submit: POST to `/api/signup` (internal API route). Show success/fail message.
- No secrets in the client; reCAPTCHA validation handled server-side.

---

## Environment Variables

The `EDGE_SHARED_SECRET` is no longer required for the signup flow but may be used by other Edge Functions.

### Required (Vercel Project Settings)
- `SUPABASE_URL` - Supabase project URL (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database writes (server-side)
- `CIVIC_API_KEY` - Google Civic API key for address enrichment.

### Optional
- `RECAPTCHA_SECRET_KEY` - reCAPTCHA validation (if not set, skips validation)

### Client-Side (Next.js)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (client-side)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous key for client operations
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` - reCAPTCHA site key (client-side)

---

## Privacy

- Store minimum PII (email, address). Mask address in logs. Honor unsubscribe flows.
- Show privacy text at signup and link to `/privacy-policy`.
