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


Perfect — here’s a **ready-to-paste section** for `/docs/CONTRIBUTING.md` that will give you (and any future collaborator) a clear, repeatable way to commit + tag milestones.

---

```md
## Milestone Tagging

We use **annotated Git tags** to mark stable milestones (schema checkpoints, integration steps, release candidates).  
This provides clear rollback points and makes it easy to communicate project status.

### Tag Naming Convention
Tags follow the pattern:  
`vX.Y.Z-scope`

- `X` = major phase  
- `Y` = feature milestone within that phase  
- `Z` = patch/fix (rarely used for milestones)  
- `scope` = short description of what’s complete  

Examples:
- `v0.1.0-schema-mvp` → baseline schema locked  
- `v0.2.0-make-import` → Make.com CSV import working  
- `v0.3.0-sendgrid-events` → SendGrid → delivery_events working  
- `v0.4.0-campaign-send` → Admin campaign send working end-to-end  
- `v1.0.0-launch` → production launch  

### Commit + Tag Template
Use this Cursor prompt whenever you reach a milestone:

```

You are my pair engineer. Please stage and commit all current changes, then create a milestone tag.

Steps:

1. Stage all changes:
   git add .

2. Verify staging:
   git status

   * All modified/added files should appear as staged.

3. Commit with this message (replace text as needed):
   "docs+db: <short summary of changes>"

   Include bullet points for clarity:

   * What was added/changed
   * Any docs updated
   * Any migrations added
   * Any policies enabled

4. Create an annotated tag (replace TAG\_NAME and TAG\_MESSAGE):
   git tag -a TAG\_NAME -m "TAG\_MESSAGE"

   Example:
   git tag -a v0.2.0-make-import -m "CSV import via Make.com into audience\_members; dedupe with (email,campaign\_tag)"

5. Push both commits and tags:
   git push
   git push --tags

6. Return the final `git log --oneline -5` so I can confirm the commit and tag exist.

```

---

### Rules of Thumb
- Every **milestone = one commit + one tag**.  
- **Never overwrite tags**. If you redo something, bump the version (e.g., from `v0.2.0` to `v0.2.1`).  
- Always **push tags** so they exist on GitHub (`git push --tags`).  
- Keep commit messages clear and scoped to the milestone.  

--
