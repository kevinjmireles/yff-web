# YFF V2.1 Update – Admin, Import, and Send

This document captures the updates from the original **Starter Kit (Modular Monolith + Make Upload)** to what is now live in **V2.1**. It reflects what’s changed, what’s implemented, and what guardrails we need moving forward.

---

## ✅ What’s Now Live

- **Admin Send Interface**  
  - URL: `/admin/send`  
  - Two buttons: **Create Job** and **Run (Preview Only)**  
  - Displays counters (sent, skipped, errors)  

- **API Endpoints**  
  - `POST /api/admin/content/promote` → Promote dataset from staging  
  - `POST /api/send/start` → Create pending send job  
  - `POST /api/send/run` → Execute targeting + delivery attempts  

- **Audience Targeting**  
  - Uses `profiles` as the single source of truth  
  - Rules support `ocd_ids`, tags, flags  
  - Deduplication via unique index `(profile_id, content_item_id)`  

- **Database Schema V2**  
  - Consolidated to **profiles only** (no subscribers table)  
  - Staging + production dataset tables with `row_uid` for idempotency  
  - Promotion is atomic, replacing all prior rows for that dataset  

- **Deployment**  
  - PR → Vercel preview → checks → merge → auto-prod deploy  
  - `/api/health` live for smoke testing  

---

## 🔒 Guardrails (Required)

- **Feature Flags**  
  ```ts
  export const flags = {
    adminSend: process.env.FEATURE_ADMIN_SEND === '1',
    sendRun: process.env.FEATURE_SEND_RUN === '1',
  };
  ```
  - Default: Preview only in production  
  - Execution (`sendRun`) should require explicit opt-in  

- **Secrets & Access**  
  - `/api/send/*` requires shared-secret in headers  
  - `/admin/*` requires password/cookie (simple auth)  
  - Optional: IP allow list  

---

## 📊 Content Import Rules

- Upload CSV → staging via Make.com  
- Promote with `promote_dataset_v2`  
- Deduplication: `(dataset_id, row_uid)` unique index  
- Replace semantics: re-promoting a dataset ID overwrites all rows  

---

## 🚦 Required Checks Before Merge

- `/api/health` → 200  
- `/api/send/start` → 401 without secret; 200 with secret (preview mode)  
- `/admin/send` → 401 unauthenticated; 200 when logged in  

---

## 📝 Next Steps

- Harden admin + send with feature flags (default safe).  
- Expand smoke test coverage and make them required in CI.  
- Add staging Supabase for migration rehearsal.  
- Document rollback process:  
  - Tag releases (`v2.1.x`)  
  - Use revert commits if needed  

---

## 📌 Summary

The original Starter Kit remains the right baseline (modular monolith + Make upload).  
**V2.1 takes it live** with:
- A working admin send page  
- Audience targeting against profiles  
- Real endpoints for import and send  
- Deployment flow with Vercel previews  

The most important changes are **using `profiles` as SSoT**, **feature flags around send execution**, and **shared-secret protection for APIs**.  
