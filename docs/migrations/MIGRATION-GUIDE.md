# Send Loop MVP - Migration & Testing Guide

**Date:** October 1, 2025  
**Status:** Ready for Migration

---

## 🗄️ **Step 1: Apply Database Migrations**

### **Via Supabase Dashboard**

1. Go to your Supabase project: SQL Editor
2. Run migrations in this exact order:

**Migration 1: `20251001_delivery_history.sql`**
```sql
-- delivery_history: dedupe + delivery status
create table if not exists public.delivery_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.send_jobs(id) on delete set null,
  dataset_id uuid references public.content_datasets(id) on delete set null,
  batch_id uuid,
  email text not null,
  status text not null check (status in ('queued','delivered','failed','bounced','opened','clicked')),
  provider_message_id text null,
  error text null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

-- One dataset per recipient, ever (MVP rule)
create unique index if not exists idx_delivery_history_dataset_email
  on public.delivery_history (dataset_id, email);

-- Idempotency for provider callbacks
create unique index if not exists idx_delivery_history_provider_msg
  on public.delivery_history (provider_message_id)
  where provider_message_id is not null;

create unique index if not exists idx_delivery_history_composite
  on public.delivery_history (job_id, batch_id, email, status)
  where provider_message_id is null;

create index if not exists idx_delivery_history_job on public.delivery_history (job_id);
create index if not exists idx_delivery_history_email on public.delivery_history (email);
```

**Migration 2: `20251001_provider_events.sql`**
```sql
-- Provider events for idempotent callbacks
create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.send_jobs(id) on delete set null,
  batch_id uuid,
  email text not null,
  status text not null check (status in ('delivered','failed')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

-- Idempotency
create unique index if not exists uq_provider_events_msg
  on public.provider_events (provider_message_id)
  where provider_message_id is not null;

create unique index if not exists uq_provider_events_fallback
  on public.provider_events (job_id, batch_id, email, status)
  where provider_message_id is null;

create index if not exists idx_provider_events_job on public.provider_events (job_id);
create index if not exists idx_provider_events_email on public.provider_events (email);
```

**Migration 3: `20251001_unsubscribes.sql`**
```sql
create table if not exists public.unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  list_key text not null default 'general',
  reason text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_unsubscribes_email_list
  on public.unsubscribes (email, list_key);
```

### **Via Supabase CLI**

```bash
cd /Users/kevinmireles/Documents/yff-web
supabase db push
```

---

## 🧪 **Step 2: Test Execute Endpoint**

### **Prerequisites**
- Admin session (login via `/admin/login`)
- Migrations applied
- Optional: Set `MAKE_WEBHOOK_URL` (or use request bin for testing)

### **Test Mode** (Explicit Emails)

**Correct API shape (no `mode` parameter):**

```bash
curl -i -X POST http://localhost:3001/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{
    "job_id": "00000000-0000-0000-0000-0000000000aa",
    "test_emails": ["a@example.com", "b@example.com", "a@example.com"]
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "job_id": "00000000-0000-0000-0000-0000000000aa",
    "dataset_id": null,
    "queued": 2,
    "deduped": 1
  }
}
```

**Verify in Database:**
```sql
SELECT * FROM delivery_history WHERE job_id = '00000000-0000-0000-0000-0000000000aa';
-- Should show 2 rows: a@example.com, b@example.com (deduped the duplicate)
```

### **Cohort Mode** (Dataset-based)

**Correct API shape:**

```bash
curl -i -X POST http://localhost:3001/api/send/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: admin=<your-cookie>' \
  -d '{
    "job_id": "00000000-0000-0000-0000-0000000000bb",
    "dataset_id": "your-existing-dataset-uuid"
  }'
```

**Prerequisites:**
- A row must exist in `send_jobs` table with the `job_id`
- The `dataset_id` must exist in `content_datasets`
- Profiles must exist with matching `dataset_id`

---

## 🔄 **Step 3: Test Provider Callback**

**Correct API shape:**

```bash
curl -i -X POST http://localhost:3001/api/provider/callback \
  -H 'Content-Type: application/json' \
  -H "X-Shared-Token: $MAKE_SHARED_TOKEN" \
  -d '{
    "job_id": "00000000-0000-0000-0000-0000000000aa",
    "batch_id": "00000000-0000-0000-0000-0000000000cc",
    "email": "a@example.com",
    "status": "delivered",
    "provider_message_id": "SG-123",
    "meta": {"send_at": "2025-10-01T12:00:00Z"}
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "ok": true
  }
}
```

**Verify in Database:**
```sql
SELECT provider_message_id, status, meta 
FROM delivery_history 
WHERE email = 'a@example.com';
-- Should show updated status and meta
```

---

## 🔑 **API Shape Reference**

### **`/api/send/execute`**

**No `mode` parameter** - mode is auto-detected:

- **Test mode:** Provide `test_emails[]`
- **Cohort mode:** Provide `dataset_id`

```json
// Test mode
{
  "job_id": "uuid",
  "test_emails": ["email@example.com"]
}

// Cohort mode
{
  "job_id": "uuid",
  "dataset_id": "uuid"
}
```

### **`/api/provider/callback`**

```json
{
  "job_id": "uuid",
  "batch_id": "uuid",
  "email": "email@example.com",
  "status": "delivered|failed|bounced|opened|clicked",
  "provider_message_id": "optional-sg-id",
  "meta": { /* optional additional data */ }
}
```

---

## 📋 **Smoke Test Checklist**

After migrations:

- [ ] ✅ `/api/send/execute` (test mode) returns 200 with `queued` count
- [ ] ✅ Database shows rows in `delivery_history`
- [ ] ✅ Duplicate emails are deduped (check `deduped` count)
- [ ] ✅ `/api/provider/callback` returns 200 with valid token
- [ ] ✅ `delivery_history` status updates to `delivered`
- [ ] ✅ Idempotency works (repeat callback = no duplicate rows)

---

## 🚨 **Common Issues**

### **Error: "column delivery_history.email does not exist"**
**Solution:** Migrations not applied. Run all 3 migrations in order.

### **Error: "INVALID_BODY" with test_emails**
**Solution:** Remove `mode` parameter from body. API auto-detects mode.

### **Error: 401 on `/api/send/execute`**
**Solution:** Get admin cookie via `/admin/login` first.

### **Error: 401 on `/api/provider/callback`**
**Solution:** Include `X-Shared-Token` header with correct value.

### **Make.com dispatch fails**
**Solution:** 
- Set `MAKE_WEBHOOK_URL` in environment
- Use request bin (e.g., webhook.site) for testing
- Check 5-second timeout isn't exceeded

---

## 📚 **Documentation Reference**

- **Complete API Spec:** `docs/specs/send_execute_endpoint.md`
- **Smoke Tests:** `docs/review/SEND-LOOP-SMOKE-TESTS.md`
- **Review Fixes:** `docs/review/SEND-LOOP-CODE-REVIEW-FIXES.md`
- **Final Summary:** `docs/review/SEND-LOOP-FINAL-REVIEW.md`

---

**Ready to proceed with production deployment after local validation!** ✅





