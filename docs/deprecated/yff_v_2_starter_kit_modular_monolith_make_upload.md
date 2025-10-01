# YFF v2 – Starter Kit (Modular Monolith + Make Upload)

A minimal, testable scaffold to protect **Signup**, add **Content Upload (via Make.com)**, and build a tiny **Send** engine inside one Next.js repo. Copy/paste these into Cursor as-is. Keep PRs small and behind flags.

---

## 0) TL;DR answers to Cursor’s questions

**Q1. `row_uid` source?** Use a **user-provided slug** (e.g., `welcome-2025-ohio-1`). It’s stable across re-uploads and easiest to reason about. Make.com can still compute and fill one if missing: `row_uid = sha256(subject + body_md + dataset_id)`.

**Q2. “Same lightweight admin gate”?** A single **password gate** for all `/admin/*` routes using `ADMIN_PASSWORD`. There’s a `/admin/login` that sets an httpOnly cookie; a root `middleware.ts` blocks `/admin/*` without that cookie. No OAuth needed yet.

**Q3. Vercel Cron frequency?** Start **manual only** via `/admin/send`. After confidence, add **Vercel Cron every 10 minutes** to sweep pending jobs. Keep the cron idempotent and bounded (e.g., max 200 attempts per run).

---

## 1) Env vars (add to `.env.local` and Vercel)

```bash
# Core
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Admin gate
ADMIN_PASSWORD=replace-me

# Feature flags
FEATURE_CONTENT_UPLOAD=true
FEATURE_SEND_ENGINE=true

# Make.com ingest webhook (admin/content will hit this)
MAKE_INGEST_WEBHOOK_URL=https://hook.integromat.com/replace-me

# Supabase (existing)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
```

---

## 2) Database: minimal tables, indexes, and RPCs

> Run these as forward-only SQL migrations in Supabase. Adjust schema name as needed (default `public`).

### 2.1 Content ingest contracts (idempotency + staging)

```sql
-- A dataset represents one CSV upload batch
create table if not exists content_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'created', -- created|validating|loaded|ready|failed
  created_by uuid,
  created_at timestamptz not null default now(),
  notes text
);

-- Final table for items used by the send engine (simplified)
create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references content_datasets(id) on delete cascade,
  row_uid text not null, -- idempotency key provided by author or backfilled
  subject text,
  body_md text,
  ocd_scope text, -- e.g., 'us' | 'state:oh' | 'county:franklin,oh' | 'place:columbus,oh'
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Enforce idempotent upserts within a dataset
create unique index if not exists uniq_content_row on content_items(dataset_id, row_uid);

-- Staging mirror for Make.com ingest (safe to truncate per dataset)
create table if not exists content_items_staging (like content_items including all);

-- Optional: record of ingest runs (for admin/status)
create table if not exists ingest_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references content_datasets(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running|succeeded|failed
  total_rows int default 0,
  inserted int default 0,
  updated int default 0,
  failed int default 0,
  error_sample text
);
```

### 2.2 Promotion RPC (staging → final) – idempotent

```sql
create or replace function promote_dataset(p_dataset uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Mark dataset validating
  update content_datasets set status = 'validating' where id = p_dataset;

  -- Upsert all rows from staging for this dataset
  insert into content_items as ci (id, dataset_id, row_uid, subject, body_md, ocd_scope, metadata, created_at)
  select gen_random_uuid(), s.dataset_id, s.row_uid, s.subject, s.body_md, s.ocd_scope, coalesce(s.metadata,'{}'::jsonb), now()
  from content_items_staging s
  where s.dataset_id = p_dataset
  on conflict (dataset_id, row_uid) do update set
    subject = excluded.subject,
    body_md = excluded.body_md,
    ocd_scope = excluded.ocd_scope,
    metadata = excluded.metadata;

  -- Mark dataset ready
  update content_datasets set status = 'ready' where id = p_dataset;
end;$$;
```

> **RLS note:** You can keep RLS ON and grant execute on `promote_dataset` to a role your server uses. The Make scenario only writes to `content_items_staging` and `ingest_runs`.

### 2.3 Send engine tables (tiny and safe)

```sql
create table if not exists send_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references content_datasets(id) on delete restrict,
  created_by uuid,
  status text not null default 'pending', -- pending|running|completed|failed
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  totals jsonb default '{}'
);

create table if not exists delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  send_job_id uuid not null references send_jobs(id) on delete cascade,
  subscriber_id uuid not null,
  content_item_id uuid not null references content_items(id) on delete restrict,
  status text not null default 'queued', -- preview|queued|sent|bounced|failed|skipped
  message_id text,
  error text,
  dedupe_key text generated always as (sha256((subscriber_id::text || ':' || content_item_id::text)::bytea)) stored,
  created_at timestamptz not null default now()
);

-- Never send the same content item to the same subscriber twice
create unique index if not exists uniq_delivery_once on delivery_attempts(subscriber_id, content_item_id);

-- Useful for dashboards
create index if not exists idx_delivery_status on delivery_attempts(status);
```

> If your Postgres doesn’t have `sha256(bytea)` built in, replace with `encode(digest(subscriber_id::text || ':' || content_item_id::text,'sha256'),'hex')` from `pgcrypto` and store as `text`.

---

## 3) Next.js admin gate

### 3.1 `middleware.ts` (root)

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const cookie = req.cookies.get('yff_admin');
    if (!cookie || cookie.value !== '1') {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
```

### 3.2 `/app/admin/login/page.tsx`

```tsx
'use client';
import { useState } from 'react';

export default function AdminLogin() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ pw }) });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get('next') || '/admin';
      window.location.href = next;
    } else {
      setErr('Invalid password');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Admin Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="border p-2 w-full" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Admin password" />
        <button className="bg-black text-white px-3 py-2 rounded" type="submit">Login</button>
        {err && <p className="text-red-600 text-sm">{err}</p>}
      </form>
    </div>
  );
}
```

### 3.3 `/app/api/admin/login/route.ts`

```ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { pw } = await req.json().catch(()=>({ pw: '' }));
  if (!process.env.ADMIN_PASSWORD) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  if (pw !== process.env.ADMIN_PASSWORD) return NextResponse.json({ ok: false }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set('yff_admin', '1', { httpOnly: true, path: '/', sameSite: 'lax', secure: true, maxAge: 60*60*8 });
  return res;
}
```

---

## 4) Admin – Content page (upload + status)

> Minimal page that POSTs to Make and lists recent datasets.

### 4.1 `/app/admin/content/page.tsx`

```tsx
'use client';
import { useEffect, useState } from 'react';

export default function ContentAdmin() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [datasets, setDatasets] = useState<any[]>([]);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    const res = await fetch('/api/admin/datasets');
    const json = await res.json();
    setDatasets(json.datasets || []);
  }

  async function sendToMake() {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/admin/content/ingest', { method: 'POST', body: form });
    setBusy(false);
    if (res.ok) {
      alert('Ingest started');
      await refresh();
    } else {
      alert('Failed to start ingest');
    }
  }

  async function promote(id: string) {
    const res = await fetch('/api/admin/content/promote', { method: 'POST', body: JSON.stringify({ dataset_id: id }) });
    if (res.ok) { await refresh(); }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Content Upload</h1>
      <div className="border p-4 rounded space-y-3">
        <input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0]||null)} />
        <button disabled={!file||busy} className="bg-black text-white px-3 py-2 rounded" onClick={sendToMake}>Upload to Make</button>
      </div>
      <h2 className="font-semibold">Datasets</h2>
      <ul className="divide-y">
        {datasets.map(d => (
          <li key={d.id} className="py-2 flex items-center gap-3">
            <span className="text-sm">{d.name}</span>
            <span className="text-xs px-2 py-1 rounded bg-gray-100">{d.status}</span>
            <button className="text-sm underline" onClick={()=>promote(d.id)}>Promote</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 4.2 API routes called by the page

```ts
// /app/api/admin/datasets/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supa = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const { data, error } = await supa().from('content_datasets').select('*').order('created_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ datasets: data })
}
```

```ts
// /app/api/admin/content/ingest/route.ts
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  if (!process.env.MAKE_INGEST_WEBHOOK_URL) return NextResponse.json({ error: 'Missing MAKE_INGEST_WEBHOOK_URL' }, { status: 500 })
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  // Forward the file to Make as multipart
  const boundary = '----yffmake' + Math.random().toString(16).slice(2)
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`),
    Buffer.from('Content-Type: text/csv\r\n\r\n'),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const res = await fetch(process.env.MAKE_INGEST_WEBHOOK_URL!, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body })
  if (!res.ok) return NextResponse.json({ error: 'Make returned non-200' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
```

```ts
// /app/api/admin/content/promote/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supa = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: Request) {
  const { dataset_id } = await req.json()
  const { error } = await supa().rpc('promote_dataset', { p_dataset: dataset_id })
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

---

## 5) Send engine (manual first, cron-ready)

### 5.1 `/app/admin/send/page.tsx`

```tsx
'use client';
import { useState } from 'react';

export default function SendAdmin() {
  const [datasetId, setDatasetId] = useState('');
  const [busy, setBusy] = useState(false);
  async function startJob() {
    setBusy(true);
    const res = await fetch('/api/send/start', { method: 'POST', body: JSON.stringify({ dataset_id: datasetId }) });
    setBusy(false);
    alert(res.ok ? 'Job created' : 'Failed');
  }
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Send</h1>
      <input className="border p-2" placeholder="dataset_id" value={datasetId} onChange={e=>setDatasetId(e.target.value)} />
      <button disabled={!datasetId||busy} className="bg-black text-white px-3 py-2 rounded" onClick={startJob}>Create Send Job</button>
      <p className="text-sm text-gray-600">This only creates a job; processing is done by /api/send/run (manual or cron).</p>
    </div>
  );
}
```

### 5.2 `/app/api/send/start/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supa = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: Request) {
  const { dataset_id } = await req.json()
  const { data, error } = await supa().from('send_jobs').insert({ dataset_id, status: 'pending' }).select('id').single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true, job_id: data.id })
}
```

### 5.3 `/app/api/send/run/route.ts` (bounded, idempotent)

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BATCH = 200; // max delivery attempts per run
const supa = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST() {
  const s = supa();

  // Pick one pending job
  const { data: job } = await s.from('send_jobs').select('*').eq('status','pending').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!job) return NextResponse.json({ ok: true, message: 'no-pending' })

  await s.from('send_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', job.id)

  // TODO replace with your real subscriber query + personalization
  // For now, create N preview attempts against a small test list
  const { data: items } = await s.from('content_items').select('id').eq('dataset_id', job.dataset_id).limit(10)
  const testSubscribers = ['00000000-0000-0000-0000-000000000001']; // replace with actual test user ids

  const attempts = [] as any[];
  for (const it of (items || [])) {
    for (const sub of testSubscribers) {
      attempts.push({ send_job_id: job.id, subscriber_id: sub, content_item_id: it.id, status: 'preview' })
      if (attempts.length >= BATCH) break;
    }
    if (attempts.length >= BATCH) break;
  }
  if (attempts.length) await s.from('delivery_attempts').insert(attempts)

  await s.from('send_jobs').update({ status: 'completed', finished_at: new Date().toISOString(), totals: { inserted: attempts.length } }).eq('id', job.id)
  return NextResponse.json({ ok: true, job_id: job.id, inserted: attempts.length })
}
```

> Later swap the test list with a real query and integrate SendGrid. The **unique index** on `(subscriber_id, content_item_id)` enforces “no duplicates ever”.

### 5.4 (Optional) Vercel Cron once stable

Add in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/send/run", "schedule": "*/10 * * * *" }
  ]
}
```

---

## 6) Playwright smoke test for Signup (protect regressions)

```ts
// tests/signup.spec.ts
import { test, expect } from '@playwright/test'

test('signup happy path', async ({ page }) => {
  await page.goto('/')
  await page.click('text=Sign up')
  await page.fill('input[name=email]', `test+${Date.now()}@example.com`)
  await page.fill('input[name=address]', '2529 N Star 43221')
  // If recaptcha present, use test bypass or flag off in CI
  await page.click('button:has-text("Create account")')
  await expect(page.getByText('Thanks for signing up')).toBeVisible()
})
```

> Run in CI on every PR. This is your regression canary.

---

## 7) CSV contract (simple & stable)

**Columns (minimum):**
- `dataset_name` – human label (Make creates `content_datasets` row).
- `row_uid` – human slug (stable). If missing, Make computes it.
- `subject` – string
- `body_md` – markdown (full email body if you’re using “one row = one email”).
- `ocd_scope` – `us` | `state:oh` | `county:franklin,oh` | `place:upper_arlington,oh`

> Make validates presence, writes to `content_items_staging`, starts an `ingest_run`, and returns counts. You press **Promote** when green.

---

## 8) Make.com scenario (outline)

1) **Trigger:** webhook (from `/admin/content/ingest`).
2) **Parse CSV:** Google Drive/Dropbox → CSV iterator.
3) **Normalize:** fill `row_uid` if empty; trim; basic required fields.
4) **Upsert to `content_items_staging`:** `dataset_id` from/after creating `content_datasets` (`status = 'loaded'`).
5) **Record `ingest_runs`:** insert row at start; update counts as you go; close with `succeeded`/`failed`.

---

## 9) Policy & safety checklist

- RLS ON for all tables; server uses service role only in API routes under `/api/admin/*` and `/api/send/*`.
- Feature flags gate pages and routes; default them to `false` in prod until ready.
- Promotion is the only path from staging → final; no direct writes to `content_items` from Make.
- All send logic must tolerate re-runs; dedupe index guarantees safety.

---

## 10) Roadmap to replace Make later

When ready, build a Node worker that:
- Accepts the same CSV.
- Writes to `content_items_staging`.
- Calls `promote_dataset()`.
- Writes `ingest_runs`—**so no UI or DB changes are required**.

---

**Done.** This is the smallest set of moving parts that’s easy to test, hard to break, and safe to iterate.

