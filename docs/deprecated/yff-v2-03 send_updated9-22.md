# Send Specification (v2.1)

_Last updated: 2025-09-22_

## Purpose
Define how the system builds and delivers personalized newsletters at send time. Each subscriber should receive **one complete email**, with content and metrics expanded according to their location (ZIP + OCD IDs).

---

## 1. Inputs
- **Subscribers**: from `subscribers` table (must include email, address, ocd_ids[], zip).  
- **Content rows**: from `content_items` import (row = full email).  
- **Geo metrics**: from `geo_metrics` table (MVP only uses `geo_type=zip`).  
- **Officials + contacts**: from `officials` and `official_contacts` for `[[DELEGATION]]`.  

---

## 2. Preprocessing
1. Collect **unique subscriber IDs** in batch.  
2. For each subscriber, derive:  
   - ZIP (for geo metrics)  
   - OCD IDs (for delegation + scoped content matching)  
3. Prefetch all **unique ZIP metrics** needed for batch from `geo_metrics`.  
4. Prefetch all **delegation contacts** needed for OCD IDs in batch.  

---

## 3. Content Selection
For each subscriber:
1. Identify all candidate rows where `scope_value` matches subscriber’s `ocd_ids`.  
2. Apply fallback hierarchy if multiple candidates:  
   - Exact district/city/county match → state → country → global (blank `scope_value`).  
3. Select the **best match** row for that subscriber.  

---

## 4. Token Expansion
Within the chosen content row’s `body_markdown`, expand tokens.

### MVP tokens
- `[[DELEGATION]]`  
  - Insert subscriber’s congressional delegation (US Rep + 2 Senators) from `officials` + `official_contacts`.  
  - Format: name, title, contact links (webform/email/phone).  

- `[[ZIP_STATS]]`  
  - Insert compact summary of subscriber’s ZIP metrics.  
  - Renderer includes only fields present in `metrics`.  
  - Example:  
    ```
    Hazard: High  
    Crime: 22.7 per 1k  
    Income: $118,500  
    ```

- `[[ZIP.<field>]]`  
  - Insert specific field value from `geo_metrics.metrics`.  
  - Example: `[[ZIP.hazard_notes]]` → "High hazard due to multiple toxic waste dumps".  

### Future tokens
- `[[COUNTY_STATS]]`, `[[DISTRICT_STATS]]`, `[[CITY_STATS]]`  
- `[[COUNTY.population]]`, etc.  

---

## 5. Rendering
1. Merge expanded body with email subject/title.  
2. Apply standard email template (header, footer, unsubscribe link).  
3. Output complete HTML + plain-text email.  

---

## 6. Sending
- Use SendGrid API (or provider).  
- Record send attempt in `delivery_history`:  
  - `subscriber_id`  
  - `content_id`  
  - `channel=email`  
  - `status=queued|sent|failed`  
  - `batch_id`  
  - `provider_message_id` (when available)  
- Ensure idempotency: do not re-send the same `content_id + subscriber_id` within batch.  

---

## 7. Test Sends
- Admin can trigger a test send:  
  - To specific email(s).  
  - As if subscriber = X (simulate token expansion).  

---

## 8. Fallback Rules
- If no matching content row found → use global fallback (blank `scope_value`).  
- If token cannot be expanded (missing metric) → omit gracefully or show neutral fallback (configurable).  

---

## 9. Logging & Monitoring
- Log counts: total queued, sent, failed.  
- Log expansion errors (dead letters queue).  
- Ensure unsubscribe + bounce compliance.  

---

## 10. Future Extensions
- Add `geo_type` beyond ZIP in `geo_metrics` (county, city, districts).  
- Add new tokens per geography.  
- Add per-partner attribution (partner_id).  
- Add delivery summaries + dashboards.  
