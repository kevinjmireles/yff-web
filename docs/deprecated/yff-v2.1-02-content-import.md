# YFF V2.1 — Content Authoring & Import (CSV → content_slices)

**Goal:** Authors create one CSV per **article** (identified by `article_key`). Each row is a **slice** scoped by an optional **OCD ID**. Import validates and upserts to Supabase.

---

## Table (Supabase)

```sql
create table if not exists content_slices (
  id uuid primary key default gen_random_uuid(),
  article_key text not null,                -- groups slices into one article
  section_order int not null default 1,     -- vertical order within article
  is_headline boolean default false,        -- scoped headline (optional, V2-friendly)
  title text,
  dek text,
  body_md text,                             -- markdown allowed
  link_url text,
  scope_ocd_id text,                        -- null = global (applies to everyone)
  tags text[] default '{}',
  publish_status text not null default 'draft',  -- draft|published|archived
  publish_at timestamptz,
  expires_at timestamptz,
  sort_index int default 0,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_content_slices_article_key on content_slices(article_key);
create index if not exists idx_content_slices_scope_ocd on content_slices(scope_ocd_id);

-- RLS: Service role access only (no public access)
alter table content_slices enable row level security;
create policy "content_service_only" on content_slices for all using (false);

-- Idempotent key for upserts
create unique index if not exists idx_content_key
  on content_slices (article_key, section_order, coalesce(scope_ocd_id,''), sort_index);
```

---

## CSV Columns (authoring)

```
article_key,section_order,is_headline,title,dek,body_md,link_url,scope_ocd_id,publish_status,publish_at,expires_at,sort_index,tags
```

### Data Dictionary (authoring-time)
- **article_key** *(text, required)*: ID of the article this slice belongs to (e.g., `funding-2025-08`).
- **section_order** *(int, required)*: vertical order of sections; lower numbers appear first.
- **is_headline** *(bool)*: if true, this slice's `title/dek` may override the article headline for recipients that match its scope.
- **title/dek/body_md** *(text)*: journalism fields; `body_md` supports Markdown.
- **link_url** *(text)*: optional CTA/read‑more; can be blank.
- **scope_ocd_id** *(text or empty)*: canonical OCD ID string (e.g., `ocd-division/country:us/state:oh/place:columbus`). Empty means global.
- **publish_status** *(enum)*: `draft|published|archived`.
- **publish_at/expires_at** *(timestamptz)*: visibility window; blank = always.
- **sort_index** *(int)*: tie‑breaker within same `section_order` and scope.
- **tags** *(array)*: freeform labels.

---

## Example CSV (Upper Arlington funding article)

```csv
article_key,section_order,is_headline,title,dek,body_md,link_url,scope_ocd_id,publish_status,publish_at,expires_at,sort_index,tags
funding-2025-08,1,TRUE,"Congress passed a new bill that gives $100,000 to Upper Arlington.",,"",,ocd-division/country:us/state:oh/place:upper_arlington,published,2025-08-24,,1,"{funding,oh-03}"
funding-2025-08,2,,,"","Ohio gets **$10,000,000**. The governor celebrates with filet mignon and tells everyone that it was all his doing.",,ocd-division/country:us/state:oh,published,2025-08-24,,1,"{ohio}"
funding-2025-08,3,,,"","Franklin County gets **$1,000,000** which the county says will be used to **repair** roads.",,ocd-division/country:us/state:oh/county:franklin,published,2025-08-24,,1,"{franklin}"
funding-2025-08,4,,,"","Upper Arlington gets **$100,000** which will be used for a new parking lot.",,ocd-division/country:us/state:oh/place:upper_arlington,published,2025-08-24,,1,"{ua}"
funding-2025-08,5,,,"","**Contact your congressional reps to give them feedback:**",,ocd-division/country:us,published,2025-08-24,,1,"{contact}"
funding-2025-08,6,,,"","**Senator John Husted**\n[www.johnhusted.com](https://www.johnhusted.com)\n415-333-3333",,ocd-division/country:us/state:oh,published,2025-08-24,,1,"{contact,oh}"
funding-2025-08,6,,,"","**Senator Vivek Ramaswamy**\n[www.Vivek.com](https://www.vivek.com)\n415-999-0000",,ocd-division/country:us/state:oh,published,2025-08-24,,2,"{contact,oh}"
funding-2025-08,6,,,"","**Representative Joyce Beatty (OH-03)**\n[www.Rejoyce.com](https://www.rejoyce.com)\n415-121-3939",,ocd-division/country:us/state:oh/cd:3,published,2025-08-24,,3,"{contact,oh-03}"
```

---

## Importer (Make.com)

1) **Trigger**: Upload CSV from Drive/Sheets.
2) **Parse CSV** → normalize newlines and trim spaces.
3) **Validate** rows using rules below.
4) **Upsert** into `content_slices` using deterministic key:  
   `(article_key, section_order, scope_ocd_id, sort_index)`.
5) **Emit errors** to sidecar CSV for author fixes.

---

## Validation Rules

### Required Fields
- **article_key**: non-empty string; `^[a-z0-9-]+$` (lowercase kebab)
- **section_order**: integer ≥1
- **publish_status**: `∈ {draft, published, archived}`

### Optional Fields
- **scope_ocd_id**: empty OR starts with `ocd-division/`
- **title**: ≤180 characters
- **dek**: ≤280 characters  
- **body_md**: ≤10,000 characters

### Error Response Format
```typescript
type ImportError = {
  row_number: number;
  error_code: 'VALIDATION_ERROR' | 'PARSE_ERROR';
  error_message: string;
  raw_row_json: string;
};
```

---

## TDD — Acceptance Tests

### Core Functionality
- Re-import same CSV → no duplicates (idempotent key holds).
- Bad `scope_ocd_id` → row rejected and listed in error CSV.
- Filtering by `article_key` returns all the slices just authored.

### Import Behavior
- Re-import same CSV → no row count change.
- Tombstone row switches a previously published slice to archived.

### Idempotency
- Upsert on `(article_key, section_order, scope_ocd_id, sort_index)`.
- If a slice should be removed, authors provide a "tombstone CSV":
  `publish_status=archived` for the exact key.

### Error Handling
- Error CSV shape: `row_number,error_code,error_message,raw_row_json`.
- Example: `12,VALIDATION_ERROR,"scope_ocd_id must start with ocd-division/",{...}`.
