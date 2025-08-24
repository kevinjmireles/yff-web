# YFF V2.1 — Content Authoring & Import (CSV → content_slices)

**Goal:** One CSV per **article** (`article_key`). Each row is a **slice** scoped by optional **OCD ID**. Import validates and upserts to Supabase.

---

## ✅ Changes in v2.1
- Added explicit **validation rules** + size limits.
- Defined **idempotent key** & upsert strategy.
- Locked down **RLS (service-only)**.
- Added **error CSV** output format.

---

## Table

```sql
create table if not exists content_slices (
  id uuid primary key default gen_random_uuid(),
  article_key text not null,                -- groups slices
  section_order int not null default 1,     -- vertical order
  is_headline boolean default false,        -- scoped headline (optional)
  title text,
  dek text,
  body_md text,                             -- Markdown
  link_url text,
  scope_ocd_id text,                        -- null = global
  tags text[] default '{}',
  publish_status text not null default 'draft',  -- draft|published|archived
  publish_at timestamptz,
  expires_at timestamptz,
  sort_index int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_slices_article on content_slices(article_key);
create index if not exists idx_slices_scope  on content_slices(scope_ocd_id);

-- RLS: service-only (Edge/Make)
alter table content_slices enable row level security;
create policy content_service_only on content_slices for all using (false);

-- Idempotency composite key
create unique index if not exists idx_slice_dedupe
  on content_slices (article_key, section_order, coalesce(scope_ocd_id,''), sort_index);
```

---

## CSV Columns
```
article_key,section_order,is_headline,title,dek,body_md,link_url,scope_ocd_id,publish_status,publish_at,expires_at,sort_index,tags
```

### Validation rules
- `article_key`: required; `^[a-z0-9-]+$` (lowercase kebab).
- `section_order`: integer ≥ 1.
- `is_headline`: boolean (`true/false/1/0` accepted).
- `publish_status`: in `{draft,published,archived}`.
- `scope_ocd_id`: empty or starts with `ocd-division/`.
- Size limits: `title ≤ 180`, `dek ≤ 280`, `body_md ≤ 10000` chars.
- Normalize: collapse CRLF to `\n`; trim surrounding whitespace.

### Error CSV (sidecar)
```csv
row_number,error_code,error_message,raw_row_json
12,VALIDATION_ERROR,"scope_ocd_id must start with ocd-division/",{"article_key":"funding-2025-08",...}
```

### Upsert strategy (Make → Supabase)
- Use the composite key `(article_key, section_order, scope_ocd_id, sort_index)` to **upsert**.
- To remove a slice, import a **tombstone** row with `publish_status=archived` for that same key.

---

## Acceptance tests
- Re-import same CSV → no duplicate rows.
- Bad `scope_ocd_id` → row rejected; appears in error CSV.
- Tombstone flips a published slice to archived.
- Query by `article_key` returns exactly the authored set.
