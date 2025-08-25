# YFF V2.1 — Article/Newsletter Assembly & Send

**Goal:** For each recipient, assemble **one personalized article** from slices (by `article_key`) using their stored **OCD IDs**, then send via SendGrid. No external lookups at send time.

---

## ✅ Changes in v2.1
- Added **admin auth** (env password) and strict input schema.
- Clarified **idempotency** and **dead-letter** handling.
- Added **audit trail** table.
- Documented **unsubscribe token** (HMAC) flow.

---

## Delivery tables

```sql
create table if not exists delivery_history (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  campaign_tag text not null,
  send_batch_id text not null,              -- idempotency
  provider_message_id text,                 -- from SendGrid
  sent_at timestamptz default now(),
  unique(provider_message_id),
  unique(email, campaign_tag, send_batch_id)
);

create table if not exists delivery_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event_type text not null,                 -- delivered|open|click|bounce|spamreport|unsubscribe
  provider_message_id text,
  event_at timestamptz default now()
);

-- service-only
alter table delivery_history enable row level security;
alter table delivery_events  enable row level security;
create policy hist_service_only on delivery_history for all using (false);
create policy ev_service_only   on delivery_events  for all using (false);
```

### Audit & dead letters
```sql
create table if not exists campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_tag text not null,
  article_key text not null,
  actor text not null,
  send_batch_id text not null,
  started_at timestamptz default now()
);

create table if not exists dead_letters (
  id uuid primary key default gen_random_uuid(),
  topic text not null,           -- e.g., 'send'
  payload jsonb not null,
  error text not null,
  created_at timestamptz default now()
);
```

---

## Admin trigger (MVP)
- **Auth**: server checks `ADMIN_PASSWORD` against submitted value.
- **Input schema (Zod)**:
```ts
const SendInput = z.object({
  campaign_tag: z.string().regex(/^[a-z0-9-]+$/),
  article_key: z.string().regex(/^[a-z0-9-]+$/),
  audience_filter: z.record(z.string()).optional(), // e.g., { state: "OH" }
  send_batch_id: z.string().uuid()
});
```

---

## Assembly rules (deterministic)
1) Load **published** slices for `article_key` within time window.
2) Keep slice if `scope_ocd_id is null` **or** `scope_ocd_id ∈ recipient.ocd_ids`.
3) **Headline**: most specific matching `is_headline=true`, else first with `title/dek`.
4) **Body order**: `section_order ASC`, then **broad→narrow** (shorter `scope_ocd_id` first), then `sort_index ASC`.
5) Join `body_md` with `\n\n` into **one HTML/Markdown block**.

---

## Unsubscribe (HMAC token)

**Link**: `/unsubscribe?token=<signed>`

**Token payload (JSON string)**: `{ "email": "<user>", "list_key": "general" }`  
**Signature**: `HMAC-SHA256(payload, SECRET)` → base64url.

**Verify & apply (Edge function pseudo-code):**
```ts
import crypto from "node:crypto";
function verify(token: string, secret: string) {
  const [payloadB64, sigB64] = token.split(".");
  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (expected !== sigB64) throw new Error("bad token");
  return JSON.parse(payload);
}

// on request:
const { email, list_key } = verify(token, process.env.UNSUB_SECRET!);
// set subscriptions.unsubscribed_at = now() for (email→user_id, list_key)
```

**Idempotent**: if already unsubscribed, return `{ ok:true }`.

---

## Make — Campaign Send (outline)
1) Validate input & admin auth.
2) Insert one `campaign_runs` row.
3) Query recipients from `profiles` (optionally filter by state, list).
4) Fetch & cache slices for `article_key`.
5) For each recipient:
   - Build `{ title, dek, body }`.
   - Send via SendGrid with exponential backoff (1s, 4s, 10s).
   - Upsert `delivery_history` with `(email, campaign_tag, send_batch_id)`.
   - On permanent failure → write to `dead_letters`.

---

## Acceptance tests
- Replay same `send_batch_id` → `delivery_history` count unchanged.
- UA recipient: headline + US/OH/Franklin/UA merged → one block.
- Cleveland recipient: US + OH slices only.
- Invalid admin password → 401.
- Simulated SendGrid 5xx → backoff & dead letter row created.
