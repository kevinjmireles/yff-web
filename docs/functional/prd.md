# Product Requirements Document (PRD) — MVP
Last updated: 2025-09-22  
Owner: Kevin Mireles  

_Note: This PRD captures the intent for the MVP build. For live system state, see [requirements.md](./requirements.md)._

---

## 1. Problem Statement
Civic content is fragmented and generic. People don’t receive personalized updates about how policies, funding, and issues affect *their* community. Newsrooms and organizations lack a turnkey way to deliver location-aware, personalized newsletters at scale.

---

## 2. Goals
- Deliver **personalized newsletters** tailored to recipient’s location (ZIP, OCD IDs).  
- Enable journalists/organizations to **create one newsletter** that is personalized automatically at send time.  
- Ensure compliance (unsubscribe, privacy, CAN-SPAM logging).  
- Build a pipeline that is **MVP-usable now**, but can easily extend to counties, districts, cities, and other geographies later.

---

## 3. Users & Personas
- **Subscribers**: Individuals signing up with email + address → get personalized civic updates.  
- **Journalists/Organizations**: Partners embedding signup forms to grow lists.  
- **Admins**: Internal staff importing content, uploading ZIP metrics, and triggering campaigns.  

---

## 4. User Stories

### Subscribers
- As a subscriber, I want to sign up with my email + address so I can receive local updates.  
- As a subscriber, I want to unsubscribe easily so I don’t get unwanted emails.  

### Admins
- As an admin, I want to upload an article (row = full email) so each recipient gets the right personalized variant.  
- As an admin, I want to upload a ZIP metrics CSV (e.g., hazards, income) so I can drop tokens like `[[ZIP_STATS]]` or `[[ZIP.hazard_notes]]` into my article.  
- As an admin, I want to trigger a campaign send so the system builds and sends personalized emails to subscribers.  
- As an admin, I want to send a test to myself/others before a full campaign.  
- As an admin, I want the system to avoid duplicates (idempotent by `content_id` + `send_batch_id`).  

### Phase 1 scope:
- Accept CSV with optional `audience_rule` column.
- If `audience_rule` present, store as `metadata.audience_rule` without parsing in Make.
- Send engine resolves recipients via `geo_metrics` when a rule exists; otherwise uses `ocd_scope`.

### Partners
- As a partner, I want to embed a signup form on my site with minimal setup.  

---

## 5. Scope

### Must-Haves
- **Signup, unsubscribe, preferences**  
- **Admin send trigger** (manual for MVP; cron optional later)  
- **Email delivery** via SendGrid  
- **Delivery logging** (history, events)  
- **Personalization** via OCD IDs (delegation) and ZIP metrics (tokens)  
- **CSV import pipeline**  
  - Content import: row = complete email  
  - Metrics import: generic `geo_metrics` table (MVP only enables `geo_type=zip`)  
- **Token expansion**  
  - `[[DELEGATION]]` inserts congressional contacts  
  - `[[ZIP_STATS]]` block  
  - `[[ZIP.<field>]]` tokens from metrics  

### Nice-to-Haves
- **Test sends** to small lists  
- **Delivery summary reporting** (basic counts)  
- **Admin UI** for uploads and triggering sends (lightweight gate only for MVP)  

### Out of Scope (MVP)
- Full CMS with multi-article layout  
- Advanced analytics dashboards  
- Multi-tenant customer accounts  
- Non-ZIP metrics (counties, cities, districts) — schema supports them, but disabled in MVP  

---

## 6. Success Metrics
- Working pilot campaign with ≥10 test recipients  
- Unsubscribe works end-to-end  
- Duplicate sends prevented (idempotency with send_batch_id)  
- Audience selection by OCD ID verified in one pilot send  
- CSV import scenario dedupes and upserts correctly; idempotency verified  
- Upload a CSV containing both `audience_rule` and `ocd_scope` rows.
- Promote → `content_items.metadata.audience_rule` is present when provided.
- Send preview shows that:
  - `state == 'OH'` selects only OH subscribers (sample).
  - `ocd_scope = place:columbus,oh` reaches Columbus when rule absent.
