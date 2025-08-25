# DEPRECATED – YFF V2 — Article/Newsletter Assembly & Send

> **⚠️ DEPRECATED** - This document has been superseded by YFF V2.1. See `docs/V2_Requirements/` for current specifications.

---

**Goal:** For each recipient, assemble **one personalized article** from slices (by `article_key`) using their stored **OCD IDs**, then send via SendGrid. No external lookups at send time.

---

## Delivery Tables (Supabase)

```sql
create table if not exists delivery_history (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  campaign_tag text not null,
  send_batch_id text not null,              -- idempotency token
  provider_message_id text,                 -- from SendGrid
  sent_at timestamptz default now()
);

create table if not exists delivery_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event_type text not null,                 -- delivered|open|click|bounce|spamreport|unsubscribe
  provider_message_id text,
  event_at timestamptz default now()
);

-- RLS: Service role access only (no public access)
alter table delivery_history enable row level security;
alter table delivery_events enable row level security;
create policy "delivery_service_only_history" on delivery_history for all using (false);
create policy "delivery_service_only_events" on delivery_events for all using (false);

-- Indexes
create unique index if not exists idx_delivery_dedupe
  on delivery_history (email, campaign_tag, send_batch_id);
create index if not exists idx_delivery_events_email_type
  on delivery_events (email, event_type);
```

---

## Inputs

- `campaign_tag`: label for the send (e.g., `funding-2025-08`).
- `article_key`: the article to assemble.
- `audience_filter`: optional (e.g., `state=OH`); otherwise send to whole list.
- `send_batch_id`: UUID generated per run (prevents duplicates).

---

## Audience Query (examples)

**Whole list:**
```sql
select email, ocd_ids from profiles
where coalesce(array_length(ocd_ids,1),0) > 0;
```

**Filter by state (example OH):**
```sql
select email, ocd_ids from profiles
where ocd_ids @> array['ocd-division/country:us/state:oh'];
```

---

## Assembly Rules (deterministic, easy to test)

1) Load **published** slices for `article_key` within time window.
2) Keep slice if `scope_ocd_id is null` **or** `scope_ocd_id ∈ recipient.ocd_ids`.
3) **Headline**: choose the most specific matching slice with `is_headline=true`;  
   if none, fall back to the first matching slice that has a `title/dek`.
4) **Body order**: sort kept body slices by  
   `section_order ASC`, then **broad→narrow** (shorter `scope_ocd_id` first), then `sort_index ASC`.
5) Concatenate `body_md` blocks with `\n\n` into **one Markdown/HTML blob**.
6) Inject into a single SendGrid template (no extra URLs unless provided in copy).

---

## Pseudo-code (renderer)

```typescript
type Slice = { 
  article_key: string; 
  section_order: number; 
  is_headline?: boolean;
  title?: string; 
  dek?: string; 
  body_md?: string; 
  scope_ocd_id?: string | null;
  publish_status: 'draft' | 'published' | 'archived'; 
  publish_at?: string | null; 
  expires_at?: string | null; 
  sort_index?: number 
}

type Recipient = { email: string; ocd_ids: string[] }

export function assembleArticle(slices: Slice[], user: Recipient) {
  const now = new Date()
  const live = slices.filter(s =>
    s.publish_status === 'published' &&
    (!s.publish_at || new Date(s.publish_at) <= now) &&
    (!s.expires_at || new Date(s.expires_at) > now)
  )
  const matches = live.filter(s => !s.scope_ocd_id || user.ocd_ids.includes(s.scope_ocd_id))

  // headline: pick most specific matching headline
  const headline = matches
    .filter(s => s.is_headline && s.title)
    .sort((a,b) => (b.scope_ocd_id?.length ?? 0) - (a.scope_ocd_id?.length ?? 0))[0]

  const title = headline?.title ?? (matches.find(s => s.title)?.title ?? '')
  const dek = headline?.dek ?? (matches.find(s => s.dek)?.dek ?? '')

  const body = matches
    .filter(s => s.body_md)
    .sort((a,b) =>
      a.section_order - b.section_order ||
      (a.scope_ocd_id?.length ?? 0) - (b.scope_ocd_id?.length ?? 0) ||
      (a.sort_index ?? 0) - (b.sort_index ?? 0)
    )
    .map(s => s.body_md!).join("\n\n")

  return { title, dek, body }
}
```

---

## Make.com — Campaign Send (scenario outline)

1) **Trigger** (admin form/manual): payload with `campaign_tag`, `article_key`, `audience_filter`, `send_batch_id`.
2) **Query Supabase** for recipients (`email, ocd_ids`) using the filter.
3) **Fetch slices** for `article_key` once; cache in a variable.
4) For each recipient:
   - Run **renderer** (Code module) to produce `{title, dek, body}`.
   - **SendGrid**: send message with those fields injected.
   - **Supabase**: write `delivery_history` with `send_batch_id` + `provider_message_id`.
5) Separate scenario: **SendGrid Webhook** → map events → upsert `delivery_events`.

**Idempotency:** if a `send_batch_id` is replayed, skip recipients already present in `delivery_history` for that `campaign_tag`.

---

## Input Schema & Validation

### Send Input Schema
```typescript
type SendInput = {
  campaign_tag: string;           // required
  article_key: string;            // required
  audience_filter?: {              // optional
    state?: string;
    county?: string;
    place?: string;
  };
  send_batch_id: string;          // required UUID
};
```

### Error Response Format
```typescript
type SendError = {
  ok: false;
  code: 'VALIDATION_ERROR' | 'NO_RECIPIENTS' | 'SENDGRID_ERROR';
  message: string;
  details?: Record<string, unknown>;
};
```

---

## TDD — Acceptance Tests

### Core Functionality
- UA recipient sees headline + US/OH/Franklin/UA slices merged into **one** block.
- Cleveland recipient sees US/OH only.
- Replay same `send_batch_id` → no duplicate `delivery_history` rows.
- Webhook generates events for opens/clicks/bounces.

### Admin Authentication
- **Option A (MVP)**: Admin password (env `ADMIN_PASSWORD`) checked server-side on trigger form.
- **Option B**: Supabase Auth w/ role claim `admin=true` gate on `/admin`.

### Error Handling
- If any required field missing → 400 `VALIDATION_ERROR`.
- If no recipients resolved → 200 `{ ok: true, data: { sent: 0, skipped: "NO_RECIPIENTS" } }`.
- If SendGrid fails → log to `delivery_history` with null `provider_message_id`, return partial success + error details.

### Retry Model
- Make scenario wraps SendGrid step with exponential backoff (1s, 4s, 10s).
- After 3 failures, write to `dead_letters` table:

```sql
create table if not exists dead_letters (
  id uuid primary key default gen_random_uuid(),
  topic text not null,           -- e.g., 'send'
  payload jsonb not null,
  error text not null,
  created_at timestamptz default now()
);
```

### Audit Trail
```sql
create table if not exists campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_tag text not null,
  article_key text not null,
  actor text not null,           -- email/subject of admin
  send_batch_id text not null,
  started_at timestamptz default now()
);
```

Log one row per run at trigger time.

### Additional Tests
- Invalid trigger secret/password → 401 with error schema.
- Replay same `send_batch_id` → `delivery_history` count unchanged.
- Simulated SendGrid 5xx → backoff attempts; then one `dead_letters` row.