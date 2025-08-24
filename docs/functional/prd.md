# Product Requirements Document (PRD) — MVP
Last updated: 2025-08-23  
Owner: Kevin Mireles  

_Note: This PRD captures the intent for the MVP build. For live system state, see [requirements.md](./requirements.md)._

---

## 1. Problem Statement
Civic content is fragmented and generic. People don’t receive personalized updates about how policies, funding, and issues affect *their* community.

## 2. Goals
- Deliver personalized newsletters tied to recipient’s location (OCD ID).
- Provide journalists/organizations a turnkey way to send civic updates.
- Ensure compliance (unsubscribe, privacy, delivery logging).

## 3. Users & Personas
- **Subscribers**: Individuals signing up with email + address.  
- **Journalists/Organizations**: Partners embedding signup forms.  
- **Admins**: Internal staff triggering campaigns.  

## 4. User Stories
- As a subscriber, I want to sign up with my email + address so I get local updates.  
- As a subscriber, I want to unsubscribe easily so I don’t get unwanted emails.  
- As an admin, I want to trigger a campaign send with one form.  
- As a partner, I want to embed signup on my site in minutes.  

## 5. Scope

### Must-Haves
- Signup, unsubscribe, preferences  
- Admin send trigger → Make webhook  
- Email delivery via SendGrid  
- Delivery logging + unsubscribe compliance  
- OCD-based personalization  
- CSV import pipeline  

### Nice-to-Haves
- Test sends to small list  
- Delivery summary reporting  
- Admin UI for template management  

### Out of Scope (for MVP)
- Full content management system  
- Complex analytics dashboards  
- Multi-tenant customer accounts  

## 6. Success Metrics
- Working pilot campaign with ≥10 test recipients  
- Unsubscribe works end-to-end  
- Duplicate sends prevented (idempotency with send_batch_id)  
- Audience selection by OCD ID verified in one pilot send  
- CSV import scenario dedupes and upserts correctly; idempotency verified  
