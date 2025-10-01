# 📄 YFF v2.1 — Content Import (MVP Contract)

**Status:** ✅ Current (as of v2.1, September 2025)  
**Scope:** Defines how CSV content is imported and promoted for use in campaigns.  
**Note:** The `content_slices` table exists in schema but is **not used** in the current pipeline. This doc reflects the actual live flow (Option A).  

---

## 1. Import Flow

1. **Upload CSV**  
   - Imported into `v2_content_items_staging`.  
   - Validated for required headers.  

2. **Promote Dataset**  
   - Call RPC `promote_dataset_v2`.  
   - Moves items from `v2_content_items_staging` into `v2_content_items`.  
   - Creates/updates entry in `content_datasets`.  

3. **Activate Dataset**  
   - Admin UI sets active dataset for sending.  
   - Only one dataset should be active at a time.  

4. **Send Campaign**  
   - `/api/send/start` → writes to `send_jobs`.  
   - `/api/send/run` → reads from `v2_content_items` and delivers via `delivery_attempts`.  

---

## 2. CSV Contract (MVP)

| Column            | Type     | Required | Notes                                                                 |
|-------------------|----------|----------|-----------------------------------------------------------------------|
| `dataset_key`     | string   | ✅        | Unique identifier for the dataset (e.g., `september-2025-news`).      |
| `content_item_key`| string   | ✅        | Unique per dataset. Used for idempotency.                             |
| `title`           | string   | ✅        | Article title.                                                        |
| `dek`             | string   | optional | Subheading or teaser.                                                 |
| `body_html`       | string   | optional | Raw HTML body. Either this or `body_md` is required.                  |
| `body_md`         | string   | optional | Markdown body. Either this or `body_html` is required.                |
| `link_url`        | string   | optional | External link.                                                         |
| `scope_ocd_id`    | string   | optional | Geographic scope (OCD ID). Empty = general content.                   |
| `tags`            | string[] | optional | Comma-separated tags (e.g., `transportation,schools`).                |

---

## 3. Promotion Rules
- **Idempotency:** Re-importing with the same `dataset_key + content_item_key` overwrites existing rows.  
- **Staging Safety:** Only promoted items are available for sending.  
- **One Active Dataset:** Admin UI ensures only one dataset is active to avoid mixing.  

---

## 4. Acceptance Checklist
- ✅ CSV validates with required headers.  
- ✅ Import inserts/updates idempotently (rerun doesn’t duplicate).  
- ✅ Promote shows expected counts (`staging → main`).  
- ✅ Active dataset is correctly marked in `content_datasets`.  
- ✅ `/admin/send` preview displays content from active dataset.  
- ✅ Test send renders `title`, `body_html`/`body_md`, and `link_url`.  

---

## 5. Deprecated (Not in Use)
- `content_slices` table is **not referenced** by current pipeline.  
- Migration to slices may be considered post-MVP for finer-grained personalization.  
- For now: treat as experimental and do not import data into it.  

---

✅ **Use this contract for all content imports until further notice.**
