# Functional Requirements — Your Friend Fido
Last updated: 2025-08-23  
Owner: Kevin Mireles  

This document is the **living truth** of what the system must do.  
- ✅ = completed  
- 🕒 = planned/next  
- ⏳ = future (not yet prioritized)  

---

## Core User Flows
- ✅ User signup with email + address → stored in Supabase
- ✅ Preferences + unsubscribe flow → linked in emails
- ✅ Admin campaign trigger → posts to Make webhook
- 🕒 Personalized content by OCD ID (audience_filter using ocd_id)
- 🕒 CSV import via Make scenario (deduping + upsert)
- 🕒 Delivery tracking + event logging
- ⏳ Admin UI for content templates

## Database Requirements
- ✅ `profiles` table with email/address/consent
- ✅ `subscriptions` table with list_key + unsubscribed_at
- ✅ `delivery_history` + `delivery_events` tables
- 🕒 `audience_members` table (Make import; unique email+campaign_tag)

## Security & Compliance
- ✅ RLS enabled on Supabase
- ✅ reCAPTCHA on signup
- 🕒 Suppression sync with SendGrid
- 🕒 CAN-SPAM footer: mailing address in email template
- ⏳ GDPR/CCPA user export + deletion

## Admin & Ops
- ✅ Healthcheck endpoint
- ✅ Minimal admin page (campaign send trigger)
- 🕒 Delivery summary reporting
- ⏳ Multi-tenant support
