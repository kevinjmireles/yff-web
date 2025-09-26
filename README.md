
# YFF — MVP (v2.1)

This repo sends **personalized civic newsletters**. Editors write **one article**, and recipients get local context via tokens (ZIP + delegation).

## Quick Start
1. **Author an article** (row = complete email) → export CSV.  
2. **Upload ZIP metrics CSV** (one row per ZIP) with fields like `hazard_flag`, `hazard_notes`.  
3. Add tokens to your article body:  
   - `[[DELEGATION]]` → inserts Rep + Senators with contacts  
   - `[[ZIP_STATS]]` → compact snapshot from ZIP metrics  
   - `[[ZIP.<field>]]` → single field (e.g., `[[ZIP.hazard_notes]]`)  
4. **Preview** by subscriber → **Send** test → **Send** campaign.

## Docs & Specs
- PRD: `prd_updated.md`
- Requirements: `requirements_updated.md`
- Data Dictionary (canonical): `data_dictionary_canonical.md`
- Content Import Spec: `content_import_updated.md`
- Send Spec: `send_updated.md`
- Overall Plan: `overall_plan_updated.md`
- ZIP Explainer: `ZIP_Personalization_Explainer.md`
- ZIP Step-by-Step: `ZIP_Personalization_Step_by_Step.md`

## Runbooks
- Incident triage: `docs/runbooks/incident-triage.md`

## Migrations & Policies
- Schema migration (idempotent): `schema_migration_v2_1.sql`
- DB Migration Checklist: `db_migration_checklist.md`
- RLS policy stubs (Supabase): `rls_policy_stubs.sql`

## Design Principles
- **Simplest usable path**: row = complete email.  
- **Future-ready**: generic `geo_metrics` (ZIP now, counties/cities/districts later without schema change).  
- **Observable**: delivery history + provider events.  
- **Compliant**: unsubscribe and CAN-SPAM essentials.

## Roadmap (Next)
- Enable `geo_type=cd` metrics + `[[DISTRICT_*]]` tokens.  
- Add partner attribution (`partner_id`).  
- Light delivery summaries.  

## 🏗️ **Architecture**

- **Frontend**: Next.js 15 with App Router
- **Backend**: Supabase (PostgreSQL + RLS) and Next.js API Routes
- **Authentication**: Supabase Auth with RLS policies

**Targeting**
- Prefer `audience_rule` (string) stored in `content_items.metadata`.
- Rule → SQL on `v_subscriber_geo`; fallback to `ocd_scope` if rule is empty.

## 🔒 **Security Features**

- Row Level Security (RLS) on all tables
# Force redeploy Thu Sep 25 06:52:30 EDT 2025
