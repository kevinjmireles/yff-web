
# DB Migration Checklist — Move to Canonical Schema (v2.1)
_Last updated: 2025-09-22_

This checklist migrates from the mixed/legacy schema to the canonical model:
- Keep **profiles** as the single source of truth for people (drop `subscribers` concept if present).
- Replace `content_slices` with **content_items** (row = complete email).
- Add **geo_metrics**, **officials**, **official_contacts**.
- Ensure **delivery_history**, **provider_events**, **campaign_runs**, **dead_letters** exist with correct FKs.
- No destructive changes happen without a reversible backup.

---

## 0) Pre-flight
- [ ] Snapshot DB or create a restore point.
- [ ] Check for long-running transactions.
- [ ] Communicate brief maintenance window if needed.

---

## 1) People tables
### 1.1 Keep `profiles` (source of truth)
- Confirm columns: `user_id (uuid pk)`, `email unique`, `address`, `zipcode`, `ocd_ids text[]`, `ocd_last_verified_at`, `created_at`.
- Indexes: `(email)`, `(zipcode)`, `GIN(ocd_ids)`.

```sql
-- Ensure indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_zipcode ON public.profiles(zipcode);
CREATE INDEX IF NOT EXISTS idx_profiles_ocd_ids ON public.profiles USING GIN(ocd_ids);
```

### 1.2 If a `subscribers` table exists
- Map/merge into `profiles` if it holds unique data.
- Recommended: leave `subscribers` in place (read-only) for a release, then drop later.

```sql
-- Example: align delivery_history FK if it pointed to subscribers.id
-- Rename column to user_id and re-point to profiles.user_id

ALTER TABLE IF EXISTS public.delivery_history
  RENAME COLUMN subscriber_id TO user_id;

ALTER TABLE IF EXISTS public.delivery_history
  DROP CONSTRAINT IF EXISTS delivery_history_subscriber_id_fkey;

ALTER TABLE IF EXISTS public.delivery_history
  ADD CONSTRAINT delivery_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);
```

---

## 2) Content model
### 2.1 Create/ensure `content_items`
```sql
CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id text NOT NULL,
  email_subject text NOT NULL,
  title text NOT NULL,
  subtitle text,
  byline text,
  body_markdown text NOT NULL,
  scope_value text,
  send_after timestamptz,
  tags text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','archived','error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_items_content_id ON public.content_items(content_id);
CREATE INDEX IF NOT EXISTS idx_content_items_scope_value ON public.content_items(scope_value);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON public.content_items(status);
```

### 2.2 Deprecate `content_slices`
- [ ] If `content_slices` exists, freeze writes and plan deletion post-cutover.

```sql
-- Optional: keep for 1 release, then drop
-- DROP TABLE IF EXISTS public.content_slices;
```

---

## 3) Personalization data
### 3.1 Create `geo_metrics` (generic; MVP enables zip only)
```sql
CREATE TABLE IF NOT EXISTS public.geo_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geo_type text NOT NULL,
  geo_id text NOT NULL,
  as_of date NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_metrics_type_id_asof
  ON public.geo_metrics(geo_type, geo_id, as_of);

CREATE INDEX IF NOT EXISTS idx_geo_metrics_type_id
  ON public.geo_metrics(geo_type, geo_id);
```

### 3.2 Seed sanity data (optional)
```sql
-- Minimal demo row to validate tokens in non-prod
INSERT INTO public.geo_metrics(geo_type, geo_id, as_of, metrics)
VALUES ('zip','90604','2025-09-01','{"hazard_flag":"high","hazard_notes":"Demo row"}'::jsonb)
ON CONFLICT DO NOTHING;
```

---

## 4) Delegation data
### 4.1 Create `officials`
```sql
CREATE TABLE IF NOT EXISTS public.officials (
  official_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bioguide_id text UNIQUE,
  full_name text NOT NULL,
  party text,
  office_type text NOT NULL CHECK (office_type IN ('us_senate','us_house')),
  state text NOT NULL,
  district integer,
  ocd_division_id text,
  is_active boolean NOT NULL DEFAULT true,
  openstates_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_officials_div ON public.officials(ocd_division_id);
CREATE INDEX IF NOT EXISTS idx_officials_office_geo ON public.officials(office_type, state, district);
```

### 4.2 Create `official_contacts`
```sql
CREATE TABLE IF NOT EXISTS public.official_contacts (
  contact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_id uuid NOT NULL REFERENCES public.officials(official_id),
  method text NOT NULL CHECK (method IN ('display_header','phone','webform','email','twitter','facebook','address')),
  value text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_official_contacts_display
  ON public.official_contacts(official_id, is_active, display_order);
```

---

## 5) Sending & events
### 5.1 Ensure `delivery_history`
```sql
CREATE TABLE IF NOT EXISTS public.delivery_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id),
  content_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','web')),
  batch_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  provider_message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_history_user_content
  ON public.delivery_history(user_id, content_id);

CREATE INDEX IF NOT EXISTS idx_delivery_history_batch
  ON public.delivery_history(batch_id);
```

### 5.2 Provider events (webhook raw)
```sql
CREATE TABLE IF NOT EXISTS public.provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'sendgrid',
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);
```

### 5.3 Optional derived events
```sql
CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  event_type text NOT NULL,
  provider_message_id text,
  event_at timestamptz NOT NULL DEFAULT now()
);
```

### 5.4 Optional campaign runs
```sql
CREATE TABLE IF NOT EXISTS public.campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_tag text NOT NULL,
  article_key text NOT NULL,
  actor text NOT NULL,
  send_batch_id text NOT NULL,
  started_at timestamptz DEFAULT now()
);
```

---

## 6) Post-merge validation (run these checks)
- [ ] Can insert a `profiles` row and query by email/zipcode.
- [ ] Can import one `content_items` row and retrieve it.
- [ ] Can import one `geo_metrics` ZIP row and fetch it.
- [ ] Token dry-run expands `[[ZIP.hazard_notes]]` using demo zip.
- [ ] `delivery_history` insert succeeds for a dummy send.
- [ ] Webhook payload inserts into `provider_events`.

### Quick probes
```sql
SELECT full_name FROM public.officials LIMIT 1;
SELECT metrics FROM public.geo_metrics WHERE geo_type='zip' AND geo_id='90604' ORDER BY as_of DESC LIMIT 1;
SELECT content_id FROM public.content_items LIMIT 1;
```

---

## 7) Rollback
- [ ] Revert to snapshot if needed.
- [ ] Keep `content_slices` for one release before dropping.
- [ ] Do not drop `subscribers` until confirmed unused.
