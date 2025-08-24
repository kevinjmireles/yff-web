# YFF V2.1 — Overall Plan (Simple, Testable, Split)

**North Star:** Keep each piece tiny and independently deployable. Everything meets in **Supabase**. No runtime external lookups during sends.

---

## Modules

1) **Signup & Enrichment** — Next.js form → Make calls Google Civic `divisionsByAddress` → Supabase `profiles.ocd_ids[]` (source of truth).  
2) **Content Importer** — Author CSV → Make validates & upserts `content_slices`.  
3) **Assembly & Send** — Make queries recipients from `profiles`, assembles one article from `content_slices`, sends via SendGrid, logs to `delivery_*`.  
4) **Edge Functions (service-only)** — `/log-delivery`, `/ingest-sendgrid`, `/unsubscribe`.

---

## Architecture

```mermaid
flowchart LR
  A[Signup App (Next.js)] -->|address| B(Make: divisionsByAddress)
  B -->|ocd_ids[]| S[(Supabase)]
  C[Author CSV] --> D(Make: Importer)
  D -->|content_slices| S
  E[Admin Trigger] --> F(Make: Campaign Send)
  S --> F
  F -->|assembled email| G[SendGrid]
  G --> H(Make: Webhook Ingest)
  H -->|delivery_events| S
```

---

## Contracts (canonical)

### Standard error schema (all endpoints)
```json
// success
{ "ok": true, "data": { } }

// failure
{ "ok": false, "code": "VALIDATION_ERROR", "message": "Bad address", "details": { "field": "address" } }
```

### Signup → Make (enrichment)
```json
{ "email":"a@b.com", "address":"123 Main, Upper Arlington, OH 43221", "honeypot":"" }
```

### Make → Supabase (profiles upsert)
```json
{ "email":"a@b.com", "address":"...", "zipcode":"43221",
  "ocd_ids":["ocd-division/country:us",".../state:oh",".../place:upper_arlington"],
  "ocd_last_verified_at":"{{now}}"
}
```

### Admin → Send scenario
```json
{ "campaign_tag":"funding-2025-08", "article_key":"funding-2025-08",
  "audience_filter":{"state":"OH"}, "send_batch_id":"<uuid>" }
```

### Unsubscribe (HMAC token)
- Link: `/unsubscribe?token=<base64url(payload)>.<base64url(hmac)>`  
- Payload: `{ "email":"user@example.com", "list_key":"general" }`  
- Signature: `HMAC-SHA256(payload, UNSUB_SECRET)`

---

## Data Model (pointers)
- **Profiles/Subs**: See `yff-v2.1_sql_patch.sql` (RLS owner-only; service role bypasses).  
- **Content**: `content_slices` is service-only (RLS `using(false)`).  
- **Delivery**: `delivery_history` (unique `email+campaign_tag+send_batch_id`) and `delivery_events` are service-only.

---

## Cross-Cutting Requirements

- **RLS**: Enabled; public tables owner-only, ops tables service-only.  
- **Idempotency**: signup upsert on `email`; importer composite key; send requires `send_batch_id`.  
- **Rate limits**: signup ≤3 attempts/10min by email/IP + honeypot.  
- **Retries**: exponential backoff for SendGrid; dead letters on permanent failure.  
- **Monitoring**: Next.js `/api/health`; Make heartbeat writes `health_pings`; alert on consecutive failures.  
- **Privacy**: PII minimization, retention (redact address after 12 months inactivity), delete endpoint.

---

## Milestones

1) **M1 – Signup working**: form live, divisionsByAddress → `ocd_ids` saved.  
2) **M2 – Importer working**: CSV validated/upserted to `content_slices`.  
3) **M3 – Send (test)**: assemble & send to 1–2 testers; events ingested.  
4) **M4 – Pilot**: 10–50 recipients; confirm unsub/suppression; simple admin trigger.

---

## Test Strategy

- **Unit**: renderer unhappy paths; CSV validators.  
- **Contract**: schemas between Next.js ↔ Make ↔ Supabase.  
- **E2E**: address → ocd_ids saved; send → delivery_history + events; idempotency on replay.

---

## Ops Runbook

- Before send: generate `send_batch_id`; test to self; verify logs.  
- After send: review `delivery_events` for bounces/complaints; suppress.  
- Weekly: refresh `profiles` where `ocd_last_verified_at` > 6 months; rotate API keys quarterly.
