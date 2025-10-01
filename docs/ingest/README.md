# YFF v2 – Content Upload via Make.com (Blueprint + Test Harness)

Purpose: make CSV → staging → promote **boring, predictable, and debuggable**. This document gives you a copy‑pasteable Make blueprint outline, field mappings, validations, fallback logic, and a local test harness so we’re never blocked if Make is finicky.

---

## 1) Canonical CSV (author‑friendly)

Save as UTF‑8 CSV (commas). Minimal columns:

```
dataset_name,row_uid,subject,body_md,ocd_scope,audience_rule
September-Launch,welcome-2025-ohio-1,"Welcome, Ohio!","## Hello Ohio\n\nThis is your intro.",state:oh,"state == 'OH'"
September-Launch,welcome-2025-us-1,"Welcome, USA!","## Hello USA\n\nNational note.",us,""
September-Launch,franklin-county-note-1,"Franklin update","- Schools\n- Parks",county:franklin,oh,"county_fips in ['39049']"
September-Launch,columbus-city-news-1,"Columbus news","Downtown updates.",place:columbus,oh,"place == 'columbus,oh'"
```

**Rules**

- `dataset_name` required for every row; identical rows belong to the same upload batch.
- `row_uid` recommended (stable slug). If missing, Make fills with `sha256(subject + body_md + dataset_name)`.
- `ocd_scope` accepted forms: `us` | `state:xx` | `county:<name>,xx` | `place:<name>,xx` (lowercase 2‑letter state).
- `audience_rule` optional. If present, stored in `metadata.audience_rule` and preferred for targeting. Fallback to `ocd_scope` if empty.
- `body_md` supports Markdown; do not include commas unquoted.

---

## 2) DB contracts (recap)

- **Staging:** `v2_content_items_staging`
- **Final:** `v2_content_items` (unique `(dataset_id,row_uid)`)
- **Datasets:** `content_datasets(status)`
- **Runs:** `ingest_runs`
- **Promotion:** `select promote_dataset_v2(:dataset_id)`
- **Geo attributes:** `geo_metrics` table + `v_subscriber_geo` view store flexible subscriber geography for audience rules.

Make **only** writes to `content_items_staging` and `ingest_runs`; the Admin **Promote** button calls the RPC.

---

## 3) Make.com Scenario (module‑by‑module)

### 3.1 Trigger

- **Webhook**: *Custom webhook* (rename `YFF Content Ingest`).
  - Expect **multipart/form‑data** with `file` field (CSV bytes).
  - Response immediately with `{ ok: true }` (don’t block UI).

### 3.2 Pre‑run setup (Tools → Set variables)

Create variables used across the flow:

- `dataset_name` (string)
- `dataset_id` (string)
- `run_id` (string)
- `rows_total`, `rows_inserted`, `rows_failed` (numbers, init 0)

### 3.3 Parse CSV

- **CSV → Parse CSV**
  - Source: map to `Webhook: file[1]` (binary) → *convert to text* UTF‑8 first if needed with *Tools → Binary to text*.
  - Header present: **Yes**
  - Delimiter: `,`

### 3.4 Determine/create dataset

- **Array aggregator** (first row only) or **Get first item**: read `dataset_name`.
- **HTTP → POST** to Supabase REST (service key stored in Make connection) to:
  1. Insert `content_datasets(name,status='loaded')` **if not exists**, else select existing by `name` created recently.
  2. Save returned `id` to `dataset_id`.
- **Insert** row into `ingest_runs(dataset_id,status='running')` → store `run_id`.

> If you prefer, expose a small serverless endpoint `/api/admin/datasets/init` that takes `dataset_name` and returns `{ dataset_id, run_id }`; this hides Supabase auth inside your app. (Recommended for easier key rotation.)

### 3.5 Iterate rows

- **Iterator** over parsed CSV rows.

- **Tools → Set variable** per row: `row_uid_final = if(row.row_uid != '' ? row.row_uid : sha256(row.subject + row.body_md + dataset_name))`.

- **Validators** (Routers):

  - Missing `subject` → increment `rows_failed`, push to an *errors array* (optional), **continue**.
  - Invalid `ocd_scope` pattern → same as above.

- **Upsert to staging** (HTTP → POST to Supabase REST):

  - Table: `v2_content_items_staging`
  - Body:
    ```json
    {
      "dataset_id": "{{dataset_id}}",
      "row_uid": "{{row_uid_final}}",
      "subject": "{{row.subject}}",
      "body_md": "{{row.body_md}}",
      "ocd_scope": "{{lower(row.ocd_scope)}}",
      "metadata": {
        "source": "make",
        "uploaded_at": "{{now}}",
        "audience_rule": "{{row.audience_rule}}"
      }
    }
    ```
  - On **201/200**: `rows_inserted++`. On **409/other**: `rows_failed++` and log.

### 3.6 Finish run

- **Update `ingest_runs`** with totals and `status='succeeded'|'failed'`.
- Optionally, **Update `content_datasets.status`** = `loaded`.
- Return a short summary payload to the webhook response (or log only).

---

## 4) Connections & Security in Make

- Prefer calling **your** Next.js API endpoints (service‑role key stays server‑side). In the Starter Kit, `/api/admin/content/ingest` forwards the CSV to Make; add `/api/admin/datasets/init` and `/api/admin/ingest/record` to abstract DB writes if you want zero direct Supabase calls from Make.
- If you do call Supabase directly from Make, create a **limited PostgREST role** and a key scoped to `content_items_staging` + `ingest_runs` only.

---

## 5) Local test harness (no‑Make fallback)

Use this Node script to simulate Make. It reads the CSV, computes `row_uid` if missing, and writes to `content_items_staging` and `ingest_runs` via Supabase JS. Drop into `scripts/ingest_local.ts`.

```ts
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error('usage: ts-node scripts/ingest_local.ts <file.csv>');
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true });

  const datasetName = rows[0].dataset_name;
  const { data: ds } = await supa.from('content_datasets').insert({ name: datasetName, status: 'loaded' }).select('*').single();
  const datasetId = ds.id;
  const { data: run } = await supa.from('ingest_runs').insert({ dataset_id: datasetId, status: 'running' }).select('*').single();

  let inserted = 0, failed = 0;
  for (const r of rows) {
    const uid = r.row_uid && r.row_uid.trim() !== '' ? r.row_uid : crypto.createHash('sha256').update(r.subject + r.body_md + datasetName).digest('hex');
    const { error } = await supa.from('content_items_staging').insert({
      dataset_id: datasetId,
      row_uid: uid,
      subject: r.subject,
      body_md: r.body_md,
      ocd_scope: String(r.ocd_scope||'').toLowerCase(),
      metadata: { source: 'local-script', audience_rule: r.audience_rule }
    });
    if (error) failed++; else inserted++;
  }

  await supa.from('ingest_runs').update({ status: failed ? 'failed' : 'succeeded', total_rows: rows.length, inserted, failed }).eq('id', run.id);
  console.log({ datasetId, inserted, failed });
})();
```

Run:

```
pnpm ts-node scripts/ingest_local.ts ./sample.csv
```

This lets you prove the DB + Promote path without Make. If Make misbehaves, you’re still unblocked.

---

## 6) Curl probes (black‑box testing)

- **Ping the Make webhook** (no file):

```
curl -i -X POST "${MAKE_INGEST_WEBHOOK_URL}" -F debug=1
```

- **Upload a CSV** via your app’s endpoint (recommended):

```
curl -i -X POST "${BASE_URL}/api/admin/content/ingest" \
  -H "Cookie: yff_admin=1" \
  -F file=@./sample.csv
```

- **Promote** once `status=loaded`:

```
curl -i -X POST "${BASE_URL}/api/admin/content/promote" \
  -H "Content-Type: application/json" \
  -d '{"dataset_id":"<uuid>"}'
```

---

## 7) Common Make gotchas (and fixes)

1. **Binary vs text CSV**: Many Make CSV parsers expect text. If your webhook gives you binary, add **Binary → Convert to text (UTF‑8)** before Parse CSV.
2. **Large files/timeouts**: Webhooks in Make can time out if you do heavy work before responding. **Respond immediately** and move heavy work after with *Webhook response* module or an *asynchronous route*.
3. **Header casing/whitespace**: Trim header names. Use a *Mapper* step to normalize keys: `row_uid` not `Row UID`.
4. **Rate limits**: Use Make’s *Queue* or *Sleep* modules when writing to Supabase REST. Batch inserts (e.g., 100 at a time) if you build a custom endpoint in your app.
5. **409 on unique index**: That’s expected on re‑ingest. Treat 409 as **update** or **success skip**; don’t fail the whole run.
6. **Stateful runs**: Keep counters in variables; always update `ingest_runs` even on partial failure so the UI shows clear status.
7. **Timezone**: Store all timestamps as UTC `now()`; avoid Make’s locale shifts.

---

## 8) Validation rules (quick and strict)

- `dataset_name`: non‑empty string (<= 80 chars)
- `row_uid`: slug `[a-z0-9-_.]{1,120}`; if absent, auto‑hash
- `subject`: non‑empty
- `body_md`: non‑empty
- `ocd_scope`: regex `^(us|state:[a-z]{2}|county:[a-z0-9\- ]+,[a-z]{2}|place:[a-z0-9\- ]+,[a-z]{2})$`
- `audience_rule`: optional string, if present must match v1 grammar (fields: `state|county_fips|place`, ops: `==|in`, allow `or`).

Rows failing validation are counted in `rows_failed` and logged; the run can still succeed if failures are <5% (tuneable).

---

## 9) Promote workflow (operator checklist)

1. Upload CSV in `/admin/content` → Make run starts
2. Watch **Ingest Run** counters update (rows, failed)
3. If status green, click **Promote** → RPC migrates staging → final
4. Verify: `content_items` count matches `inserted` (minus updates)
5. Proceed to **Send** preview

---

## 10) Rollback / Re-run

- **Re-run** the same CSV: safe due to `(dataset_id,row_uid)` unique index (will update existing).
- **Rollback a dataset**: `delete from v2_content_items where dataset_id = :id; update content_datasets set status='loaded' where id=:id;` Then promote again.

---

## 11) Optional: shrink Make surface area

Add two tiny endpoints so Make never touches Supabase directly:

- `POST /api/admin/datasets/init` → returns `{ dataset_id, run_id }`
- `POST /api/admin/staging/upsert` → accepts one row payload, performs server‑side upsert to `v2_content_items_staging`
- `POST /api/admin/ingest/finish` → updates `ingest_runs`

This way Make only calls **your** API; you can batch, validate, and log consistently in TypeScript.

---

## 12) Definition of Done (upload)

- ✅ CSV with 4 sample rows ingests to `v2_content_items_staging`
- ✅ `ingest_runs` shows totals & `succeeded`
- ✅ Promote moves rows to `v2_content_items` (idempotent)
- ✅ Re‑running the same CSV updates without duplicates
- ✅ Send preview can reference the just‑promoted `dataset_id`
- ✅ Content items with `audience_rule` target correctly based on `geo_metrics`

---

This blueprint eliminates the ‘Make mystery’ by keeping the logic explicit, with a local escape hatch and crisp contracts.

Related docs:
- Content import contract: `docs/ingest/content-import-contract.md`
