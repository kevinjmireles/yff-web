---
## Editing Guidelines for This File
- Use plain Markdown (`#` headings, `|` pipe tables).
- Do **not** paste from Word/Google Docs; always "Paste and Match Style."
- Each table section starts with `## <table_name>` and includes:
  - Purpose (1–2 sentences)
  - Pipe table of columns (Column | Type | Null | Default | Description | PII | Example)
  - Constraints / Indexes (bulleted)
  - Notes (bulleted)
- When adding/removing a column in the database:
  - Update this file in the **same PR** as the migration.
  - Bump the “Last updated” date at the top.
- For a high-level overview of all tables and their status, see [table_inventory.csv](./table_inventory.csv).
---

# Data Dictionary — Your Friend Fido
Last updated: 2025-08-24
Owner: Kevin Mireles

PII levels: None / Low / High.  
Source schema: Postgres public.

See also: [Table Inventory](./table_inventory.csv)

---

## audience_members
Purpose: Targeting rows imported by Make for a specific campaign; used to build the send audience and apply OCD filters.

| Column       | Type        | Null | Default             | Description                               | PII  | Example                                           |
|--------------|-------------|------|---------------------|-------------------------------------------|------|---------------------------------------------------|
| id           | uuid (PK)   | NO   | gen_random_uuid()   | Row id                                    | None | 7a2e…                                             |
| email        | text        | NO   | —                   | Recipient email                           | High | alice@example.com                                 |
| first_name   | text        | YES  | —                   | Optional first name                       | Low  | Alice                                             |
| last_name    | text        | YES  | —                   | Optional last name                        | Low  | Lee                                               |
| address      | text        | YES  | —                   | Optional street address                   | High | 123 Main St                                       |
| zipcode      | text        | YES  | —                   | Optional ZIP                              | Low  | 43215                                             |
| ocd_id       | text        | YES  | —                   | Open Civic Data division id for targeting | None | ocd-division/country:us/state:oh                  |
| campaign_tag | text        | NO   | —                   | Logical campaign identifier               | None | medicaid-briefing-2025-08                         |

Constraints / Indexes
- UNIQUE (email, campaign_tag)  — idempotent upsert
- INDEX (ocd_id)                — audience filtering

Notes
- Populated by Make scenario “CSV Import → Upsert Audience”.
- Filter by `ocd_id` (or other attributes) when building the audience for a send.

---

## delivery_history
Purpose: One row per attempted send for audit/idempotency; used to dedupe and analyze sending.

| Column              | Type        | Null | Default           | Description                           | PII  | Example                      |
|---------------------|-------------|------|-------------------|---------------------------------------|------|------------------------------|
| id                  | uuid (PK)   | NO   | gen_random_uuid() | Row id                                | None | 1c8b…                         |
| email               | text        | NO   | —                 | Recipient email                       | High | alice@example.com            |
| campaign_tag        | text        | NO   | —                 | Campaign identifier                   | None | medicaid-briefing-2025-08    |
| send_batch_id       | text        | NO   | —                 | Idempotency token per batch           | None | e3a6f4d0-…                   |
| provider_message_id | text        | YES  | —                 | ESP message id (SendGrid)             | None | sg-message-id-123            |
| sent_at             | timestamptz | YES  | now()             | When send initiated                   | None | 2025-08-23T14:10Z            |

Constraints / Indexes
- PK (id)
- UNIQUE (provider_message_id) when available
- Consider INDEX (campaign_tag, email)

Notes
- Always generate a new `send_batch_id` per batch; if seen, skip (idempotent).
- Supports resend prevention and reporting.

---

## delivery_events
Purpose: Normalized events from ESP (delivered, open, click, bounce, spamreport, unsubscribe).

| Column              | Type        | Null | Default           | Description               | PII  | Example          |
|---------------------|-------------|------|-------------------|---------------------------|------|------------------|
| id                  | uuid (PK)   | NO   | gen_random_uuid() | Row id                    | None | 9b1e…            |
| email               | text        | NO   | —                 | Recipient email           | High | alice@example.com|
| event_type          | text        | NO   | —                 | Event kind                | None | unsubscribe      |
| provider_message_id | text        | YES  | —                 | ESP message id            | None | sg-abc123        |
| event_at            | timestamptz | YES  | now()             | Event time                | None | 2025-08-23       |

Constraints / Indexes
- PK (id)
- INDEX (email, event_type)

Notes
- Edge function `ingest-sendgrid` writes here.
- If a legacy `provider_events` table exists, keep it as legacy; all new writes go to `delivery_events`.

---

## subscribers (legacy)
Purpose: Legacy profile store from earlier implementation. Kept for reference; not required for MVP.

Important fields
- email, first_name, last_name, address, zipcode

Notes
- Treat `email` as High PII.
- Prefer `audience_members` for campaign targeting going forward.

---

## officials / official_contacts (legacy / optional)
Purpose: Existing civic officials data; not needed for Make‑First MVP.

Notes
- Keep for potential future use (content personalization, enrichment).
- Not included in MVP pipelines.

---

## content_items / content_blocks / content_datasets (legacy)
Purpose: Legacy content CMS artifacts; not needed for Make‑First MVP.

Notes
- Keep as legacy; document separately if reactivated later.

---

## Security / RLS overview
RLS enabled on: audience_members, delivery_events. Writes via service-role keys only. No anon read/write policies configured.

### Notes (for maintainers)
- Writes performed by Edge/Make using service‑role key (bypasses RLS).
- Anonymous clients should not have insert/update on these tables.

---

## Regenerating sections (quick SQL)
Columns
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='<table>'
order by ordinal_position;

Constraints


select tc.constraint_type, kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
where tc.table_schema='public' and tc.table_name='<table>';