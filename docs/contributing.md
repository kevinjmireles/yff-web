# Contributing to Documentation

## Folder Structure
- /docs/guides → how we work (build guides, checklists, LLM docs)
- /docs/plans → project direction (migration, legal, roadmap)
- /docs/functional → what the system does (requirements, PRD, handoff)
- /docs/test-data → sample CSVs and test scenarios
- /docs/README.md → master index (table of contents)

## File Naming
- Use lower_snake_case.md for file names
  - Good: build_guide.md
  - Bad: BuildGuide.md or Build-Guide.MD
- Keep names short (2–4 words)
- Append _draft.md if not finalized

## Linking Between Docs
- Use relative links:
  [Migration Plan](../plans/migration_plan.md)
- Update /docs/README.md when you add a new doc

## Writing Style
- Be concise; focus on clarity
- Use ## for sections, ### for subsections
- Prefer bullet points and checklists
- Make docs LLM-friendly: avoid long prose, keep structure

## Workflow
1. Create or edit your .md file in the right folder
2. Add a link to it in /docs/README.md
3. Commit with a clear message, e.g.:
   docs: add legal_compliance runbook
4. Have another LLM or teammate review for clarity


## Database Docs Policy

- Any DB change (CREATE/ALTER/DROP/INDEX/RLS) must ship in the **same PR** with:
  1) a migration file under `/supabase/migrations/`
  2) updates to `/docs/functional/data_dictionary.md`
  3) (if new/removed tables) an update to `/docs/functional/table_inventory.csv`

- Data Dictionary rules:
  - Plain Markdown only (pipe `|` tables; no HTML).
  - Each table section includes Purpose, Columns table, Constraints/Indexes, Notes.
  - Bump “Last updated” date when you change anything.
  - PII: mark `email`/`address` as High; names/zip as Low.

- Links:
  - Use **relative links**. Example: `[Table Inventory](./table_inventory.csv)`
  - From repo root README → docs index: `/docs/README.md`.

- Review checklist (for PRs that touch DB):
  - [ ] Migration runs clean in Supabase
  - [ ] Data dictionary updated for all affected tables
  - [ ] table_inventory.csv updated if table set changed
  - [ ] RLS/permissions noted in “Notes” where relevant
