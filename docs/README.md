# Documentation Index

Welcome to the Your Friend Fido documentation. Everything you need to build, run, and maintain the system is organized here.

---

## 📑 Guides
- [Build Guide](./guides/build_guide.md)
- [Code Review Checklist](./guides/code_review_checklist.md)
- [LLM-Friendly Documentation Guide](./guides/llm_friendly_documentation.md)

## 🏛️ Architectural Decisions
- [ADR-001: Signup Enrichment in API Route](./adr/001-signup-enrichment-in-api-route.md)

## 🛠 Plans
- [Migration Plan](./plans/migration_plan.md)
- [Legal Compliance Runbook](./plans/legal_compliance.md)
- [Roadmap](./plans/roadmap.md) _(future)_

## ⚙️ Functional Docs
- [Requirements](./functional/requirements.md)
- [Product Requirements Document (PRD)](./functional/prd.md)
- [Handoff Notes](./functional/handoff.md)

## 🗄️ Schema Docs (V2.1)
- **Canonical**: [Data Dictionary](./functional/data_dictionary.md)
- **Inventory**: [Table Inventory](./functional/table_inventory.csv)
- **Excel export (generated)**: [YFF_V2.1_Data_Dictionary.xlsx](./exports/YFF_V2.1_Data_Dictionary.xlsx)

### Regenerate Excel
```bash
npm install
npm run build:dict
```

## 🧪 Test Data
- [Sample CSVs](./test-data/sample_csvs.md) _(future)_
- [Test Scenarios](./test-data/test_scenarios.md) _(future)_

## 🗂 Meta
- [Contributing to Docs](./CONTRIBUTING.md)

---

## ✅ Pre-Commit Checklist
Before committing changes to docs:
- [ ] Did you add new files to the correct folder?  
- [ ] Did you update `/docs/README.md` with a link?  
- [ ] Did you update `/docs/CONTRIBUTING.md` if process rules changed?
